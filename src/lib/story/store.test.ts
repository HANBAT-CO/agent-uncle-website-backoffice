import { describe, expect, it, vi } from "vitest";

import { createStory, VISITOR_STORAGE_KEY, type StorageLike, type VisitorRecord } from "./store";

class MemoryStorage implements StorageLike {
  values = new Map<string, string>();
  reads = 0;
  getItem(key: string) {
    this.reads += 1;
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve));

const sample: Omit<VisitorRecord, "id"> = {
  kind: "answer-wait",
  time: "09:52",
  meta: "업무 기록 · 09:52",
  title: "미송을 기다리기로 했어요",
  tag: "예시",
};

function setup(storage: StorageLike | null = new MemoryStorage()) {
  const story = createStory({ storage: () => storage });
  const listener = vi.fn();
  return { story, listener, storage };
}

describe("server state", () => {
  it("starts at the hero with nothing reported", () => {
    const { story } = setup();
    expect(story.getServerState()).toEqual({ active: "hero", beats: {}, visitor: [], draft: null });
    expect(story.getState()).toBe(story.getServerState());
  });

  it("keeps the server snapshot stable after client changes", () => {
    const { story } = setup();
    const server = story.getServerState();
    story.setActive("cart");
    expect(story.getServerState()).toBe(server);
    expect(story.getServerState().active).toBe("hero");
  });
});

describe("notifications", () => {
  it("batches several changes in one tick into one notification", async () => {
    const { story, listener } = setup();
    story.subscribe(listener);
    await flush();
    listener.mockClear();
    story.setActive("route");
    story.reportBeat("route", "b0216");
    story.reportBeat("route", "b0306");
    expect(listener).not.toHaveBeenCalled();
    await flush();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(story.getState()).toMatchObject({ active: "route", beats: { route: "b0306" } });
  });

  it("ignores a beat the section already reported", async () => {
    const { story, listener } = setup();
    story.subscribe(listener);
    story.reportBeat("words", "b2330");
    await flush();
    listener.mockClear();
    const before = story.getState();
    story.reportBeat("words", "b2330");
    await flush();
    expect(listener).not.toHaveBeenCalled();
    expect(story.getState()).toBe(before);
  });

  it("ignores setting the section that is already active", async () => {
    const { story, listener } = setup();
    story.subscribe(listener);
    await flush();
    listener.mockClear();
    const before = story.getState();
    story.setActive("hero");
    await flush();
    expect(listener).not.toHaveBeenCalled();
    expect(story.getState()).toBe(before);
  });

  it("stops notifying after unsubscribe", async () => {
    const { story, listener } = setup();
    const unsubscribe = story.subscribe(listener);
    unsubscribe();
    story.setActive("film");
    await flush();
    expect(listener).not.toHaveBeenCalled();
  });

  it("returns a new state object on every change (useSyncExternalStore snapshots)", () => {
    const { story } = setup();
    const before = story.getState();
    story.setActive("dawn");
    expect(story.getState()).not.toBe(before);
  });
});

describe("visitor records", () => {
  it("reads sessionStorage lazily, on the first subscribe", async () => {
    const storage = new MemoryStorage();
    const stored: VisitorRecord = { id: "v-old", ...sample };
    storage.values.set(VISITOR_STORAGE_KEY, JSON.stringify([stored]));
    const { story, listener } = setup(storage);
    expect(storage.reads).toBe(0);
    expect(story.getState().visitor).toEqual([]);
    story.subscribe(listener);
    expect(story.getState().visitor).toEqual([stored]);
    await flush();
    expect(listener).toHaveBeenCalledTimes(1);
    story.subscribe(vi.fn());
    expect(storage.reads).toBe(1);
  });

  it("adds a record with an id and persists it", () => {
    const storage = new MemoryStorage();
    const { story } = setup(storage);
    story.addVisitorRecord(sample);
    const [record] = story.getState().visitor;
    expect(record).toMatchObject(sample);
    expect(record.id).toMatch(/\S+/);
    expect(JSON.parse(storage.values.get(VISITOR_STORAGE_KEY) ?? "[]")).toEqual([record]);
  });

  it("does not drop stored records when adding before anything subscribed", () => {
    const storage = new MemoryStorage();
    const stored: VisitorRecord = {
      id: "v-old",
      kind: "signup",
      time: "09:58",
      meta: "신청 기록 · 09:58",
      title: "사전 신청을 보냈어요",
    };
    storage.values.set(VISITOR_STORAGE_KEY, JSON.stringify([stored]));
    const { story } = setup(storage);
    story.addVisitorRecord(sample);
    expect(story.getState().visitor.map((record) => record.id)[0]).toBe("v-old");
    expect(story.getState().visitor).toHaveLength(2);
  });

  it("keeps a single sample answer (the decision is recorded once)", () => {
    const { story } = setup();
    story.addVisitorRecord(sample);
    story.addVisitorRecord({ ...sample, time: "09:55", meta: "업무 기록 · 09:55" });
    expect(story.getState().visitor).toHaveLength(1);
    expect(story.getState().visitor[0].time).toBe("09:52");
  });

  it("allows more than one signup", () => {
    const { story } = setup();
    const lead = { kind: "signup" as const, time: "10:01", meta: "신청 기록 · 10:01", title: "사전 신청을 보냈어요" };
    story.addVisitorRecord(lead);
    story.addVisitorRecord({ ...lead, time: "10:07", meta: "신청 기록 · 10:07" });
    const ids = story.getState().visitor.map((record) => record.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it("ignores malformed storage", () => {
    const storage = new MemoryStorage();
    storage.values.set(VISITOR_STORAGE_KEY, "{not json");
    const { story } = setup(storage);
    story.subscribe(vi.fn());
    expect(story.getState().visitor).toEqual([]);
    storage.values.set(VISITOR_STORAGE_KEY, JSON.stringify([{ id: 1, kind: "spam" }]));
    const second = createStory({ storage: () => storage });
    second.subscribe(vi.fn());
    expect(second.getState().visitor).toEqual([]);
  });

  it("works without storage (private mode, SSR)", () => {
    const { story } = setup(null);
    story.subscribe(vi.fn());
    story.addVisitorRecord(sample);
    expect(story.getState().visitor).toHaveLength(1);
  });

  it("survives a storage that throws", () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    };
    const { story } = setup(throwing);
    expect(() => story.subscribe(vi.fn())).not.toThrow();
    expect(() => story.addVisitorRecord(sample)).not.toThrow();
    expect(() => story.resetVisitor()).not.toThrow();
  });

  it("resets visitor records, the draft and storage", () => {
    const storage = new MemoryStorage();
    const { story } = setup(storage);
    story.addVisitorRecord(sample);
    story.setDraft({ lines: ["역할: 소매업자"] });
    story.resetVisitor();
    expect(story.getState().visitor).toEqual([]);
    expect(story.getState().draft).toBeNull();
    expect(storage.values.has(VISITOR_STORAGE_KEY)).toBe(false);
  });
});

describe("draft", () => {
  it("sets and clears the draft", () => {
    const { story } = setup();
    story.setDraft({ lines: ["역할: 선택 전"] });
    expect(story.getState().draft).toEqual({ lines: ["역할: 선택 전"] });
    story.setDraft(null);
    expect(story.getState().draft).toBeNull();
  });

  it("ignores a draft with the same lines", async () => {
    const { story, listener } = setup();
    story.setDraft({ lines: ["역할: 소매업자", "연락처: 010"] });
    story.subscribe(listener);
    await flush();
    listener.mockClear();
    const before = story.getState();
    story.setDraft({ lines: ["역할: 소매업자", "연락처: 010"] });
    await flush();
    expect(story.getState()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it("never persists the draft", () => {
    const storage = new MemoryStorage();
    const { story } = setup(storage);
    story.setDraft({ lines: ["연락처: 010"] });
    expect([...storage.values.values()].join("")).not.toContain("010");
  });
});
