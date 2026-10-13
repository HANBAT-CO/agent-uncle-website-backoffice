import { fill, signup } from "@/content/copy";
import { LEAD_MARKETS, LEAD_ROLES, type LeadMarket, type LeadRole } from "@/lib/supabase/types";

/**
 * The 사전 신청 draft (spec 10): what the visitor has typed, autosaved to
 * sessionStorage so a reload, an error or React's form handling never loses
 * input, which makes the autosave note (입력한 정보는 자동으로 저장돼요.) true.
 *
 * - key au:lead-draft, saves debounced by 400ms (the timer is injectable)
 * - consent is never persisted: it is a fresh decision every visit
 * - invalid or foreign JSON restores the empty draft, field by field
 * - the first edit's time (firstEditAt, epoch ms) is saved beside the fields:
 *   the bot check's fill clock runs from it (src/lib/lead/fill-time.ts), so a
 *   restored draft sent right after a reload is not dropped as a bot
 *
 * The store is an external store for useSyncExternalStore: updates notify
 * synchronously, which controlled inputs (and Korean IME composition) need,
 * and the server snapshot is the empty draft, so hydration never mismatches.
 */

export const LEAD_DRAFT_KEY = "au:lead-draft";
export const LEAD_DRAFT_DELAY_MS = 400;

export type ContactMode = "tel" | "email";

export type LeadDraft = {
  role: LeadRole | "";
  name: string;
  business_name: string;
  contact: string;
  contactMode: ContactMode;
  market: LeadMarket | "";
  message: string;
};

export const EMPTY_LEAD_DRAFT: LeadDraft = Object.freeze({
  role: "",
  name: "",
  business_name: "",
  contact: "",
  contactMode: "tel",
  market: "",
  message: "",
});

export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type DraftTimer = {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
};

const TEXT_FIELDS = ["name", "business_name", "contact", "message"] as const;

function pick<T extends string>(options: readonly T[], value: unknown): T | "" {
  return typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : "";
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Only the known keys, with known values; anything else falls back to the empty draft's value. */
function sanitize(source: Record<string, unknown>): LeadDraft {
  return {
    role: pick(LEAD_ROLES, source.role),
    name: textOf(source.name),
    business_name: textOf(source.business_name),
    contact: textOf(source.contact),
    contactMode: source.contactMode === "email" ? "email" : "tel",
    market: pick(LEAD_MARKETS, source.market),
    message: textOf(source.message),
  };
}

type StoredDraft = { draft: LeadDraft; firstEditAt: number | null };

/** A first edit stamp: a positive epoch ms that is not in the future (a device clock moved back is ignored). */
function stampOf(value: unknown, now: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= now ? value : null;
}

function parseStored(raw: string | null, now: number): StoredDraft {
  const empty: StoredDraft = { draft: EMPTY_LEAD_DRAFT, firstEditAt: null };
  if (!raw) return empty;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return empty;
    const source = parsed as Record<string, unknown>;
    return { draft: sanitize(source), firstEditAt: stampOf(source.firstEditAt, now) };
  } catch {
    return empty;
  }
}

export function parseLeadDraft(raw: string | null): LeadDraft {
  return parseStored(raw, Date.now()).draft;
}

/** True when nothing worth saving was entered (the contact mode alone is a preference). */
export function isEmptyLeadDraft(draft: LeadDraft): boolean {
  return draft.role === "" && draft.market === "" && TEXT_FIELDS.every((field) => draft[field].trim() === "");
}

/**
 * The draft card's lines (spec S10): 역할, the role's business label, 연락처,
 * 사입 시장. 역할 always shows (선택 전 before a choice); other lines appear
 * once they have a value. 이름 and 문의 내용 stay out of the record card.
 */
export function draftLines(draft: LeadDraft): string[] {
  const { labels, empty, line } = signup.draft;
  const business = signup.fields.business[draft.role === "" ? "retailer" : draft.role];
  const rows: Array<readonly [string, string]> = [
    [labels.role, draft.role === "" ? empty : signup.roles[draft.role].title],
    [business.short, draft.business_name.trim()],
    [labels.contact, draft.contact.trim()],
    [labels.market, draft.market],
  ];
  return rows
    .filter(([label, value]) => label === labels.role || value !== "")
    .map(([label, value]) => fill(line, { label, value }));
}

export type LeadDraftStore = {
  getSnapshot(): LeadDraft;
  getServerSnapshot(): LeadDraft;
  subscribe(listener: () => void): () => void;
  /** Merge a change, notify synchronously, save after the debounce. The first one stamps firstEditAt. */
  update(patch: Partial<LeadDraft>): void;
  /**
   * Epoch ms of the visitor's first edit of this draft (restored with it after
   * a reload), or null before any edit. Read at submit time for the fill clock.
   */
  firstEditAt(): number | null;
  /** Write a pending save now (e.g. before the page hides). */
  flush(): void;
  /** Empty the draft and its storage (after a successful send). */
  clear(): void;
};

const defaultTimer: DraftTimer = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createLeadDraftStore({
  storage,
  timer = defaultTimer,
  delay = LEAD_DRAFT_DELAY_MS,
  now = Date.now,
}: {
  /** Resolved lazily: sessionStorage access can throw (privacy modes). null disables persistence. */
  storage: () => DraftStorage | null;
  timer?: DraftTimer;
  delay?: number;
  /** Epoch ms (injectable for tests). */
  now?: () => number;
}): LeadDraftStore {
  let current: LeadDraft = EMPTY_LEAD_DRAFT;
  let editedAt: number | null = null;
  let loaded = false;
  let pendingSave: unknown = null;
  const listeners = new Set<() => void>();

  function resolveStorage(): DraftStorage | null {
    try {
      return storage();
    } catch {
      return null;
    }
  }

  function ensureLoaded(): void {
    if (loaded) return;
    loaded = true;
    try {
      ({ draft: current, firstEditAt: editedAt } = parseStored(resolveStorage()?.getItem(LEAD_DRAFT_KEY) ?? null, now()));
    } catch {
      current = EMPTY_LEAD_DRAFT;
      editedAt = null;
    }
  }

  function write(): void {
    pendingSave = null;
    const target = resolveStorage();
    if (!target) return;
    try {
      if (isEmptyLeadDraft(current)) target.removeItem(LEAD_DRAFT_KEY);
      // sanitize() drops anything that is not a draft field, consent included.
      else target.setItem(LEAD_DRAFT_KEY, JSON.stringify({ ...sanitize(current), firstEditAt: editedAt }));
    } catch {
      // Quota or privacy mode: the draft still lives for this page view.
    }
  }

  function cancelSave(): void {
    if (pendingSave === null) return;
    timer.clear(pendingSave);
    pendingSave = null;
  }

  function notify(): void {
    for (const listener of [...listeners]) listener();
  }

  return {
    getSnapshot() {
      ensureLoaded();
      return current;
    },
    getServerSnapshot: () => EMPTY_LEAD_DRAFT,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update(patch) {
      ensureLoaded();
      editedAt ??= now();
      current = sanitize({ ...current, ...patch });
      notify();
      cancelSave();
      pendingSave = timer.set(write, delay);
    },
    firstEditAt() {
      ensureLoaded();
      return editedAt;
    },
    flush() {
      if (pendingSave === null) return;
      cancelSave();
      write();
    },
    clear() {
      loaded = true;
      cancelSave();
      current = EMPTY_LEAD_DRAFT;
      editedAt = null;
      try {
        resolveStorage()?.removeItem(LEAD_DRAFT_KEY);
      } catch {
        // Nothing to clear when storage is unavailable.
      }
      notify();
    },
  };
}

function browserSessionStorage(): DraftStorage | null {
  return typeof window === "undefined" ? null : window.sessionStorage;
}

/** The page's draft store (client components only, via useSyncExternalStore). */
export const leadDraftStore: LeadDraftStore = createLeadDraftStore({ storage: browserSessionStorage });
