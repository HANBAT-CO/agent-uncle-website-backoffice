import { describe, expect, it } from "vitest";

import { plate, signup } from "@/content/copy";
import { BEAT_ORDER, BEATS, RECORDS, type Ledger } from "@/content/story";
import { railEntries } from "@/lib/story/derive";
import type { StoryState, VisitorRecord } from "@/lib/story/store";

import {
  announcementFor,
  CLOCK_FLAP_DIGITS,
  clockMotion,
  clockSteps,
  dropExited,
  entryDetail,
  entryJump,
  entryKey,
  entryMeta,
  entryTarget,
  entryTitle,
  formatClock,
  ledgerRest,
  msToNextMinute,
  newestAddedEntry,
  pillLead,
  pillSummary,
  plateSummary,
  reconcilePresence,
  recordCount,
  shouldCloseSheet,
  SWIPE_CLOSE_PX,
  toChromeEntries,
  type ChromeEntry,
  type Presence,
} from "./chrome-model";

function state(partial: Partial<StoryState> = {}): StoryState {
  return { active: "hero", beats: {}, visitor: [], draft: null, ...partial };
}

const wait: VisitorRecord = {
  id: "answer-wait-1",
  kind: "answer-wait",
  time: "09:52",
  meta: "업무 기록 · 09:52",
  title: "미송을 기다리기로 했어요",
  tag: "예시",
};

const sent: VisitorRecord = {
  id: "signup-1",
  kind: "signup",
  time: "09:58",
  meta: "신청 기록 · 09:58",
  title: "사전 신청을 보냈어요",
};

type Item = { key: string };
const item = (key: string): Item => ({ key });
const keysOf = (list: readonly Presence<Item>[]) => list.map((entry) => `${entry.item.key}${entry.exiting ? "~" : ""}`);

describe("chrome entries", () => {
  it("maps story, visitor and draft entries to stable keys", () => {
    const s = state({ active: "signup", visitor: [wait], draft: { lines: ["역할: 선택 전"] } });
    const entries = toChromeEntries(railEntries(s), s.draft, true);
    expect(entries.map(entryKey)).toEqual(["r2005", "r2031", "r0216", "r0306", "m0307", "r0553a", "r0553b", "r0849", "answer-wait-1", "draft"]);
  });

  it("adds the draft only when asked and only when one exists", () => {
    const s = state({ active: "signup", draft: { lines: ["역할: 선택 전"] } });
    expect(toChromeEntries(railEntries(s), s.draft, false).some((entry) => entry.kind === "draft")).toBe(false);
    expect(toChromeEntries(railEntries(s), null, true).some((entry) => entry.kind === "draft")).toBe(false);
  });

  it("reads app-format meta lines", () => {
    const [first] = toChromeEntries(railEntries(state()), null, false);
    expect(entryMeta(first)).toBe("업무 기록 · 20:05");
    const visitor: ChromeEntry = { kind: "visitor", key: wait.id, record: wait };
    expect(entryMeta(visitor)).toBe("업무 기록 · 09:52");
    const draft: ChromeEntry = { kind: "draft", key: "draft", lines: [] };
    expect(entryMeta(draft)).toBe(signup.draft.meta);
    expect(entryTitle(draft)).toBe(signup.draft.title);
  });

  it("gives the signup record the success line and story records their detail", () => {
    expect(entryDetail({ kind: "visitor", key: sent.id, record: sent })).toBe(signup.success.line);
    expect(entryDetail({ kind: "visitor", key: wait.id, record: wait })).toBeUndefined();
    expect(entryDetail({ kind: "story", key: "r0306", record: RECORDS.r0306 })).toBe("연청 27은 월요일 재입고 예정이에요.");
  });

  it("scrolls each entry to the section where it happened", () => {
    expect(entryTarget({ kind: "story", key: "r0849", record: RECORDS.r0849 })).toBe("receipt");
    expect(entryTarget({ kind: "story", key: "r0553a", record: RECORDS.r0553a })).toBe("dawn");
    expect(entryTarget({ kind: "visitor", key: wait.id, record: wait })).toBe("trust");
    expect(entryTarget({ kind: "visitor", key: sent.id, record: sent })).toBe("signup");
    expect(entryTarget({ kind: "draft", key: "draft", lines: [] })).toBe("signup");
  });

  it("lands a record after its beat when the section's default beat comes before it", () => {
    const story = (key: keyof typeof RECORDS): ChromeEntry => ({ kind: "story", key, record: RECORDS[key] });
    // The hero's default beat (22:00) already holds 20:05 and 20:31.
    expect(entryJump(story("r2005"))).toEqual({ section: "hero", at: "start" });
    expect(entryJump(story("r2031"))).toEqual({ section: "hero", at: "start" });
    // Route opens at 23:30: 02:16, 03:06 and the 03:07 message only exist once the round has run.
    expect(entryJump(story("r0216"))).toEqual({ section: "route", at: "end" });
    expect(entryJump(story("r0306"))).toEqual({ section: "route", at: "end" });
    expect(entryJump(story("m0307"))).toEqual({ section: "route", at: "end" });
    expect(entryJump(story("r0553a"))).toEqual({ section: "dawn", at: "end" });
    expect(entryJump(story("r0849"))).toEqual({ section: "receipt", at: "end" });
    expect(entryJump({ kind: "visitor", key: wait.id, record: wait })).toEqual({ section: "trust", at: "start" });
    expect(entryJump({ kind: "draft", key: "draft", lines: [] })).toEqual({ section: "signup", at: "start" });
  });

  it("counts 업무 기록 only: the 03:07 message is not a record", () => {
    const night = state({ active: "cart" });
    expect(recordCount(railEntries(night))).toBe(4);
    const morning = state({ active: "footer", visitor: [wait, sent] });
    expect(railEntries(morning)).toHaveLength(10);
    expect(recordCount(railEntries(morning))).toBe(9);
    expect(recordCount(railEntries(state()))).toBe(2);
  });
});

describe("presence (exit fades)", () => {
  it("keeps removed entries in place as exiting", () => {
    const prev = reconcilePresence([], [item("a"), item("b"), item("c")], true);
    const next = reconcilePresence(prev, [item("a"), item("b")], true);
    expect(keysOf(next)).toEqual(["a", "b", "c~"]);
  });

  it("drops removed entries at once when exits are not animated", () => {
    const prev = reconcilePresence([], [item("a"), item("b"), item("c")], true);
    expect(keysOf(reconcilePresence(prev, [item("a")], false))).toEqual(["a"]);
  });

  it("revives an exiting entry that comes back, without duplicating it", () => {
    const shown = reconcilePresence([], [item("a"), item("b"), item("c")], true);
    const leaving = reconcilePresence(shown, [item("a")], true);
    expect(keysOf(leaving)).toEqual(["a", "b~", "c~"]);
    const back = reconcilePresence(leaving, [item("a"), item("b"), item("c"), item("d")], true);
    expect(keysOf(back)).toEqual(["a", "b", "c", "d"]);
  });

  it("puts new entries after the exiting ones they follow", () => {
    const shown = reconcilePresence([], [item("a"), item("draft")], true);
    const swapped = reconcilePresence(shown, [item("a"), item("signup")], true);
    expect(keysOf(swapped)).toEqual(["a", "draft~", "signup"]);
  });

  it("never yields a key twice under any sequence", () => {
    const sequences = [["a", "b", "c", "d"], ["a"], ["a", "b", "c", "d", "e", "f"], ["a", "b"], [], ["a", "b", "c"], ["a", "c"]];
    let list: Presence<Item>[] = [];
    for (const keys of sequences) {
      list = reconcilePresence(list, keys.map(item), true);
      const all = list.map((entry) => entry.item.key);
      expect(new Set(all).size).toBe(all.length);
      expect(list.filter((entry) => !entry.exiting).map((entry) => entry.item.key)).toEqual(keys);
    }
  });

  it("removes an entry once its exit has finished, but not a revived one", () => {
    const shown = reconcilePresence([], [item("a"), item("b")], true);
    const leaving = reconcilePresence(shown, [item("a")], true);
    expect(keysOf(dropExited(leaving, "b"))).toEqual(["a"]);
    const back = reconcilePresence(leaving, [item("a"), item("b")], true);
    expect(dropExited(back, "b")).toBe(back);
  });
});

describe("announcements", () => {
  it("announces the newest added entry", () => {
    const before = toChromeEntries(railEntries(state({ active: "words" })), null, false);
    const after = toChromeEntries(railEntries(state({ active: "route", beats: { route: "b0307" } })), null, false);
    expect(announcementFor(before.map(entryKey), after)).toBe(RECORDS.m0307.title);
  });

  it("stays silent on removals and on unchanged lists", () => {
    const more = toChromeEntries(railEntries(state({ active: "route", beats: { route: "b0306" } })), null, false);
    const less = toChromeEntries(railEntries(state()), null, false);
    expect(announcementFor(more.map(entryKey), less)).toBeNull();
    expect(announcementFor(less.map(entryKey), less)).toBeNull();
  });

  it("hands back the added entry itself, so a stale announcement can be dropped", () => {
    const before = toChromeEntries(railEntries(state({ active: "route", beats: { route: "b0216" } })), null, false);
    const after = toChromeEntries(railEntries(state({ active: "route", beats: { route: "b0306" } })), null, false);
    expect(newestAddedEntry(before.map(entryKey), after)?.key).toBe("r0306");
    expect(newestAddedEntry(after.map(entryKey), before)).toBeNull();
  });

  it("never announces the draft", () => {
    const base = toChromeEntries(railEntries(state({ active: "signup" })), null, false);
    const withDraft = toChromeEntries(railEntries(state({ active: "signup" })), { lines: ["역할: 선택 전"] }, true);
    expect(announcementFor(base.map(entryKey), withDraft)).toBeNull();
  });
});

describe("plate strings", () => {
  it("reads 미확인 before any result is shared and 남은 미송 after", () => {
    expect(ledgerRest(BEATS.b2200.ledger)).toEqual({ field: "unconfirmed", value: 6 });
    expect(ledgerRest(BEATS.b0306.ledger)).toEqual({ field: "backorder", value: 4 });
  });

  it("builds the visually hidden summary from the spec template", () => {
    expect(plateSummary(BEATS.b0849.ledger)).toBe("와이드 데님 팬츠 기록: 요청 6장, 확보 2장, 전달 2장, 수령 2장, 남은 미송 4장.");
    expect(plateSummary(BEATS.b2200.ledger)).toBe("와이드 데님 팬츠 기록: 요청 6장, 확보 0장, 전달 0장, 수령 0장, 미확인 6장.");
  });

  it("builds the pill summary with the same rest label as the plate", () => {
    expect(pillSummary(BEATS.b0306.ledger)).toBe("확보 2 · 남은 미송 4");
    expect(pillSummary(BEATS.b2330.ledger)).toBe(`확보 0 · ${plate.labels.unconfirmed} 6`);
  });

  it("leads the pill with the latest ledger change: 확보 at 03:06, 전달 at 05:53, 수령 at 08:49", () => {
    expect(pillLead(BEATS.b2200.ledger)).toBe("secured");
    expect(pillLead(BEATS.b0307.ledger)).toBe("secured");
    expect(pillLead(BEATS.b0553.ledger)).toBe("delivered");
    expect(pillLead(BEATS.b0553d.ledger)).toBe("delivered");
    expect(pillLead(BEATS.b0849.ledger)).toBe("received");
    expect(pillLead(BEATS.bnow.ledger)).toBe("received");
    expect(pillSummary(BEATS.b0553.ledger)).toBe("전달 2 · 남은 미송 4");
    expect(pillSummary(BEATS.b0849.ledger)).toBe("수령 2 · 남은 미송 4");
    expect(pillSummary(BEATS.b0941.ledger)).toBe("수령 2 · 남은 미송 4");
  });

  it("keeps the pill summary the same length once the lead moves on (no reflow at 05:53 or 08:49)", () => {
    const shared = BEAT_ORDER.slice(BEAT_ORDER.indexOf("b0306"));
    const lengths = new Set(shared.map((beat) => pillSummary(BEATS[beat].ledger).length));
    expect(lengths.size).toBe(1);
  });

  it("falls back to 요청 - 확보 when a ledger carries neither rest value", () => {
    const odd: Ledger = { ...BEATS.b2200.ledger, unconfirmed: null, backorder: null };
    expect(ledgerRest(odd)).toEqual({ field: "unconfirmed", value: 6 });
  });
});

describe("clock", () => {
  it("formats local time as HH:MM on a 24-hour clock", () => {
    expect(formatClock(new Date(2026, 9, 12, 9, 5, 30))).toBe("09:05");
    expect(formatClock(new Date(2026, 9, 12, 23, 59, 59))).toBe("23:59");
  });

  it("counts story steps between beat clocks (now is the last step)", () => {
    expect(clockSteps("22:00", "23:30")).toBe(1);
    expect(clockSteps("03:06", "03:07")).toBe(1);
    expect(clockSteps("03:07", "05:53")).toBe(1);
    expect(clockSteps("09:41", "now")).toBe(1);
    expect(clockSteps("now", "now")).toBe(0);
    expect(clockSteps("05:53", "22:00")).toBe(5);
    expect(clockSteps("22:00", "03:07")).toBe(4);
    expect(clockSteps("12:34", "22:00")).toBe(Number.POSITIVE_INFINITY);
  });

  it("flaps one step at rest and snaps on jumps and while a flap still runs", () => {
    expect(clockMotion("22:00", "23:30", false)).toBe("flap");
    expect(clockMotion("23:30", "22:00", false)).toBe("flap");
    expect(clockMotion("now", "now", false)).toBe("flap");
    expect(clockMotion("05:53", "22:00", false)).toBe("snap");
    expect(clockMotion("03:06", "02:16", true)).toBe("snap");
  });

  it("flaps only through digits that keep every tile a valid time", () => {
    for (const digit of CLOCK_FLAP_DIGITS) expect(Number(digit)).toBeLessThanOrEqual(2);
    expect(CLOCK_FLAP_DIGITS.length).toBeGreaterThan(1);
  });

  it("waits until the next minute boundary", () => {
    expect(msToNextMinute(new Date(2026, 9, 12, 9, 5, 30, 250))).toBe(29_750);
    expect(msToNextMinute(new Date(2026, 9, 12, 9, 5, 0, 0))).toBe(60_000);
  });
});

describe("sheet swipe", () => {
  it("closes on an 80px downward swipe and not before", () => {
    expect(SWIPE_CLOSE_PX).toBe(80);
    expect(shouldCloseSheet(79)).toBe(false);
    expect(shouldCloseSheet(80)).toBe(true);
    expect(shouldCloseSheet(-200)).toBe(false);
  });
});
