import { describe, expect, it, vi } from "vitest";

import {
  createLeadDraftStore,
  draftLines,
  EMPTY_LEAD_DRAFT,
  isEmptyLeadDraft,
  LEAD_DRAFT_DELAY_MS,
  LEAD_DRAFT_KEY,
  parseLeadDraft,
  type DraftStorage,
  type DraftTimer,
  type LeadDraft,
} from "./lead-draft";

/** In-memory sessionStorage stand-in that records every call. */
function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage: DraftStorage & { data: Map<string, string>; writes: number } = {
    data,
    writes: 0,
    getItem: (key) => data.get(key) ?? null,
    setItem(key, value) {
      storage.writes += 1;
      data.set(key, value);
    },
    removeItem(key) {
      data.delete(key);
    },
  };
  return storage;
}

/** A manual clock: callbacks run only when advance() passes their due time. */
function manualTimer() {
  let now = 0;
  let nextId = 1;
  const pending = new Map<number, { due: number; fn: () => void }>();
  const timer: DraftTimer & { advance(ms: number): void; pendingCount(): number } = {
    set(fn, ms) {
      const id = nextId++;
      pending.set(id, { due: now + ms, fn });
      return id;
    },
    clear(handle) {
      pending.delete(handle as number);
    },
    advance(ms) {
      now += ms;
      for (const [id, entry] of [...pending]) {
        if (entry.due <= now) {
          pending.delete(id);
          entry.fn();
        }
      }
    },
    pendingCount: () => pending.size,
  };
  return timer;
}

const FILLED: LeadDraft = {
  role: "uncle",
  name: "박상훈",
  business_name: "청평화 박삼촌",
  contact: "010-2847-1928",
  contactMode: "tel",
  market: "동대문",
  message: "도입 시기가 궁금해요.",
};

describe("parseLeadDraft", () => {
  it("returns the empty draft for missing or invalid JSON", () => {
    expect(parseLeadDraft(null)).toEqual(EMPTY_LEAD_DRAFT);
    expect(parseLeadDraft("{")).toEqual(EMPTY_LEAD_DRAFT);
    expect(parseLeadDraft("[]")).toEqual(EMPTY_LEAD_DRAFT);
    expect(parseLeadDraft("null")).toEqual(EMPTY_LEAD_DRAFT);
    expect(parseLeadDraft('"text"')).toEqual(EMPTY_LEAD_DRAFT);
  });

  it("restores every known field", () => {
    expect(parseLeadDraft(JSON.stringify(FILLED))).toEqual(FILLED);
  });

  it("falls back per field when a value has the wrong type or an unknown option", () => {
    const parsed = parseLeadDraft(
      JSON.stringify({ ...FILLED, name: 42, role: "admin", market: "부산", contactMode: "fax" }),
    );
    expect(parsed).toEqual({ ...FILLED, name: "", role: "", market: "", contactMode: "tel" });
  });

  it("never restores consent, even if storage holds it", () => {
    const parsed = parseLeadDraft(JSON.stringify({ ...FILLED, consent: true }));
    expect(parsed).not.toHaveProperty("consent");
  });
});

describe("isEmptyLeadDraft", () => {
  it("ignores the contact mode, which is a preference rather than input", () => {
    expect(isEmptyLeadDraft(EMPTY_LEAD_DRAFT)).toBe(true);
    expect(isEmptyLeadDraft({ ...EMPTY_LEAD_DRAFT, contactMode: "email" })).toBe(true);
  });

  it("treats whitespace-only text as empty", () => {
    expect(isEmptyLeadDraft({ ...EMPTY_LEAD_DRAFT, name: "   " })).toBe(true);
    expect(isEmptyLeadDraft({ ...EMPTY_LEAD_DRAFT, name: "가" })).toBe(false);
    expect(isEmptyLeadDraft({ ...EMPTY_LEAD_DRAFT, role: "other" })).toBe(false);
  });
});

describe("draftLines", () => {
  it("shows 역할: 선택 전 before a role is chosen", () => {
    expect(draftLines(EMPTY_LEAD_DRAFT)).toEqual(["역할: 선택 전"]);
  });

  it("uses the business label of the chosen role", () => {
    expect(draftLines({ ...EMPTY_LEAD_DRAFT, role: "retailer", business_name: "망원 셀렉트샵" })).toEqual([
      "역할: 소매업자",
      "매장명·쇼핑몰명: 망원 셀렉트샵",
    ]);
    expect(draftLines({ ...EMPTY_LEAD_DRAFT, role: "other", business_name: "한밭상회" })).toEqual([
      "역할: 기타",
      "회사·단체명: 한밭상회",
    ]);
  });

  it("lists role, business, contact and market in order, skipping empty fields", () => {
    expect(draftLines(FILLED)).toEqual([
      "역할: 사입삼촌",
      "활동명·업체명: 청평화 박삼촌",
      "연락처: 010-2847-1928",
      "사입 시장: 동대문",
    ]);
    expect(draftLines({ ...EMPTY_LEAD_DRAFT, contact: "  hello@samchun.kr " })).toEqual([
      "역할: 선택 전",
      "연락처: hello@samchun.kr",
    ]);
  });
});

describe("createLeadDraftStore", () => {
  it("loads the stored draft lazily on first read", () => {
    const storage = memoryStorage({ [LEAD_DRAFT_KEY]: JSON.stringify(FILLED) });
    const store = createLeadDraftStore({ storage: () => storage, timer: manualTimer() });
    expect(store.getSnapshot()).toEqual(FILLED);
    expect(store.getServerSnapshot()).toEqual(EMPTY_LEAD_DRAFT);
  });

  it("returns the same snapshot object until something changes", () => {
    const store = createLeadDraftStore({ storage: () => memoryStorage(), timer: manualTimer() });
    const first = store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);
    store.update({ name: "가" });
    expect(store.getSnapshot()).not.toBe(first);
  });

  it("notifies subscribers synchronously on update (controlled inputs need it)", () => {
    const store = createLeadDraftStore({ storage: () => memoryStorage(), timer: manualTimer() });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.update({ name: "가" });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.update({ name: "가나" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it(`debounces saves by ${LEAD_DRAFT_DELAY_MS}ms and writes only the latest draft`, () => {
    const storage = memoryStorage();
    const timer = manualTimer();
    const store = createLeadDraftStore({ storage: () => storage, timer });

    store.update({ name: "박" });
    timer.advance(200);
    store.update({ name: "박상" });
    timer.advance(399);
    expect(storage.writes).toBe(0);

    timer.advance(1);
    expect(storage.writes).toBe(1);
    expect(JSON.parse(storage.data.get(LEAD_DRAFT_KEY) ?? "{}")).toMatchObject({ name: "박상" });
  });

  it("never persists consent, whatever the caller passes", () => {
    const storage = memoryStorage();
    const timer = manualTimer();
    const store = createLeadDraftStore({ storage: () => storage, timer });
    store.update({ name: "가", consent: true } as Partial<LeadDraft>);
    timer.advance(LEAD_DRAFT_DELAY_MS);
    expect(storage.data.get(LEAD_DRAFT_KEY)).not.toContain("consent");
  });

  it("removes the key instead of storing an empty draft", () => {
    const storage = memoryStorage({ [LEAD_DRAFT_KEY]: JSON.stringify(FILLED) });
    const timer = manualTimer();
    const store = createLeadDraftStore({ storage: () => storage, timer });
    store.update({ ...EMPTY_LEAD_DRAFT });
    timer.advance(LEAD_DRAFT_DELAY_MS);
    expect(storage.data.has(LEAD_DRAFT_KEY)).toBe(false);
  });

  it("flush writes a pending save immediately", () => {
    const storage = memoryStorage();
    const timer = manualTimer();
    const store = createLeadDraftStore({ storage: () => storage, timer });
    store.update({ contact: "01028471928" });
    store.flush();
    expect(storage.writes).toBe(1);
    expect(timer.pendingCount()).toBe(0);
  });

  it("clear empties the draft, removes the key and cancels a pending save", () => {
    const storage = memoryStorage({ [LEAD_DRAFT_KEY]: JSON.stringify(FILLED) });
    const timer = manualTimer();
    const store = createLeadDraftStore({ storage: () => storage, timer });
    store.update({ name: "나중에 저장될 이름" });
    store.clear();
    timer.advance(LEAD_DRAFT_DELAY_MS * 2);

    expect(store.getSnapshot()).toEqual(EMPTY_LEAD_DRAFT);
    expect(storage.data.has(LEAD_DRAFT_KEY)).toBe(false);
    expect(storage.writes).toBe(0);
  });

  it("keeps working when storage is unavailable or throws", () => {
    const throwing: DraftStorage = {
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
    const timer = manualTimer();
    const store = createLeadDraftStore({ storage: () => throwing, timer });
    expect(store.getSnapshot()).toEqual(EMPTY_LEAD_DRAFT);
    store.update({ name: "가" });
    expect(() => timer.advance(LEAD_DRAFT_DELAY_MS)).not.toThrow();
    expect(() => store.clear()).not.toThrow();

    const none = createLeadDraftStore({ storage: () => null, timer: manualTimer() });
    none.update({ name: "가" });
    expect(none.getSnapshot().name).toBe("가");
  });
});

/*
 * The bot check's fill clock (LeadFormGuards): it must start at the visitor's
 * first edit and survive a reload with the draft. Otherwise a visitor whose
 * draft was restored ticks consent, sends within 2.5s of the reload and is
 * silently dropped as a bot.
 */
describe("createLeadDraftStore first edit clock", () => {
  const T0 = 1_760_000_000_000;

  function clock(start = T0) {
    let now = start;
    return { now: () => now, set: (value: number) => (now = value) };
  }

  it("is null before any edit and stamps the first edit only", () => {
    const time = clock();
    const store = createLeadDraftStore({ storage: () => memoryStorage(), timer: manualTimer(), now: time.now });
    expect(store.firstEditAt()).toBeNull();
    store.update({ name: "박" });
    expect(store.firstEditAt()).toBe(T0);
    time.set(T0 + 5000);
    store.update({ name: "박상훈" });
    expect(store.firstEditAt()).toBe(T0);
  });

  it("is saved with the draft and restored by the next page view", () => {
    const storage = memoryStorage();
    const timer = manualTimer();
    const first = createLeadDraftStore({ storage: () => storage, timer, now: clock().now });
    first.update({ name: "박상훈" });
    timer.advance(LEAD_DRAFT_DELAY_MS);

    const later = clock(T0 + 60_000);
    const reloaded = createLeadDraftStore({ storage: () => storage, timer: manualTimer(), now: later.now });
    expect(reloaded.firstEditAt()).toBe(T0);
    // A restored draft keeps its original stamp when the visitor edits again.
    reloaded.update({ name: "박상훈님" });
    expect(reloaded.firstEditAt()).toBe(T0);
    // The stamp never leaks into the field values.
    expect(reloaded.getSnapshot()).not.toHaveProperty("firstEditAt");
  });

  it("restarts after clear (a sent draft starts a new clock)", () => {
    const storage = memoryStorage();
    const time = clock();
    const store = createLeadDraftStore({ storage: () => storage, timer: manualTimer(), now: time.now });
    store.update({ name: "박상훈" });
    store.flush();
    store.clear();
    expect(store.firstEditAt()).toBeNull();
    time.set(T0 + 9000);
    store.update({ name: "김하늘" });
    expect(store.firstEditAt()).toBe(T0 + 9000);
  });

  it("ignores a stored stamp that is malformed or in the future", () => {
    for (const firstEditAt of ["yesterday", -1, 0, T0 + 1, null]) {
      const storage = memoryStorage({ [LEAD_DRAFT_KEY]: JSON.stringify({ ...FILLED, firstEditAt }) });
      const store = createLeadDraftStore({ storage: () => storage, timer: manualTimer(), now: clock().now });
      expect(store.getSnapshot()).toEqual(FILLED);
      expect(store.firstEditAt()).toBeNull();
    }
  });
});
