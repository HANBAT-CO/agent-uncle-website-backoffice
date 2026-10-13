import type { BeatId, SectionId } from "@/content/story";

/**
 * The page's story store: which section holds the viewport's centre line, the
 * beat each section last reported, the visitor's own records and the draft of
 * their 사전 신청. Everything the chrome shows is derived from this state by
 * the pure functions in ./derive.ts, so scrolling back rewinds it exactly.
 *
 * Sections write only through setActive (SectionActivity) and reportBeat
 * (useStoryBeats); the chrome only reads (useStorySelector). Subscribers are
 * notified once per microtask, however many writes happened in that tick.
 */

export type VisitorRecord = {
  id: string;
  kind: "answer-wait" | "signup";
  /** HH:MM in the visitor's local time. */
  time: string;
  /** Card meta line, e.g. 업무 기록 · 09:52 or 신청 기록 · 09:58. */
  meta: string;
  title: string;
  tag?: "예시";
};

export type VisitorDraft = { lines: string[] } | null;

export type StoryState = {
  active: SectionId;
  beats: Partial<Record<SectionId, BeatId>>;
  visitor: VisitorRecord[];
  draft: VisitorDraft;
};

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type Story = {
  getState(): StoryState;
  getServerState(): StoryState;
  subscribe(fn: () => void): () => void;
  setActive(id: SectionId): void;
  reportBeat(section: SectionId, beat: BeatId): void;
  addVisitorRecord(input: Omit<VisitorRecord, "id">): void;
  setDraft(draft: VisitorDraft): void;
  resetVisitor(): void;
};

export const VISITOR_STORAGE_KEY = "au:visitor";

const SERVER_STATE: StoryState = Object.freeze({
  active: "hero",
  beats: Object.freeze({}),
  visitor: Object.freeze([]) as unknown as VisitorRecord[],
  draft: null,
}) as StoryState;

function isVisitorRecord(value: unknown): value is VisitorRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    (record.kind === "answer-wait" || record.kind === "signup") &&
    typeof record.time === "string" &&
    typeof record.meta === "string" &&
    typeof record.title === "string" &&
    (record.tag === undefined || record.tag === "예시")
  );
}

function readVisitor(storage: StorageLike | null): VisitorRecord[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(VISITOR_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every(isVisitorRecord) ? parsed : [];
  } catch {
    return [];
  }
}

function writeVisitor(storage: StorageLike | null, visitor: VisitorRecord[]): void {
  if (!storage) return;
  try {
    if (visitor.length === 0) storage.removeItem(VISITOR_STORAGE_KEY);
    else storage.setItem(VISITOR_STORAGE_KEY, JSON.stringify(visitor));
  } catch {
    // Private mode or quota: the records still live for this page view.
  }
}

function sameLines(a: VisitorDraft, b: VisitorDraft): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return a.lines.length === b.lines.length && a.lines.every((line, i) => line === b.lines[i]);
}

export type StoryOptions = {
  /** Resolved lazily (sessionStorage access can throw). null disables persistence. */
  storage: () => StorageLike | null;
};

export function createStory({ storage }: StoryOptions): Story {
  let state: StoryState = SERVER_STATE;
  let loaded = false;
  let scheduled = false;
  let sequence = 0;
  const listeners = new Set<() => void>();

  function storageOrNull(): StorageLike | null {
    try {
      return storage();
    } catch {
      return null;
    }
  }

  function notify(): void {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      for (const listener of [...listeners]) listener();
    });
  }

  function commit(next: StoryState): void {
    if (next === state) return;
    state = next;
    notify();
  }

  function ensureLoaded(): void {
    if (loaded) return;
    loaded = true;
    const stored = readVisitor(storageOrNull());
    if (stored.length > 0) commit({ ...state, visitor: [...stored, ...state.visitor] });
  }

  return {
    getState: () => state,
    getServerState: () => SERVER_STATE,

    subscribe(fn) {
      listeners.add(fn);
      ensureLoaded();
      return () => {
        listeners.delete(fn);
      };
    },

    setActive(id) {
      if (state.active === id) return;
      commit({ ...state, active: id });
    },

    reportBeat(section, beat) {
      if (state.beats[section] === beat) return;
      commit({ ...state, beats: { ...state.beats, [section]: beat } });
    },

    addVisitorRecord(input) {
      ensureLoaded();
      // A backorder answer is a decision: the sample records it once.
      if (input.kind === "answer-wait" && state.visitor.some((record) => record.kind === "answer-wait")) return;
      sequence += 1;
      const record: VisitorRecord = { ...input, id: `${input.kind}-${Date.now().toString(36)}-${sequence}` };
      const visitor = [...state.visitor, record];
      writeVisitor(storageOrNull(), visitor);
      commit({ ...state, visitor });
    },

    setDraft(draft) {
      if (sameLines(state.draft, draft)) return;
      commit({ ...state, draft: draft === null ? null : { lines: [...draft.lines] } });
    },

    resetVisitor() {
      loaded = true;
      writeVisitor(storageOrNull(), []);
      if (state.visitor.length === 0 && state.draft === null) return;
      commit({ ...state, visitor: [], draft: null });
    },
  };
}

function browserSessionStorage(): StorageLike | null {
  return typeof window === "undefined" ? null : window.sessionStorage;
}

/** The page's single store. Import from client components only through use-story.ts hooks or event handlers. */
export const story: Story = createStory({ storage: browserSessionStorage });

// Development diagnostics only (never in production builds): inspect the
// store from the console or a Playwright run against `next dev`.
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  (window as Window & { __auStory?: Story }).__auStory = story;
}
