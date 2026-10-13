import { describe, expect, it } from "vitest";

import {
  BEAT_ORDER,
  BEATS,
  RECORDS,
  SECTION_CHROME,
  SECTION_DEFAULT_BEAT,
  SECTION_ORDER,
  type BeatId,
  type RecordId,
  type SectionId,
} from "@/content/story";

import { beatForProgress, beatIndex, chromeFor, currentBeatId, currentLedger, railEntries } from "./derive";
import type { StoryState, VisitorRecord } from "./store";

function state(partial: Partial<StoryState> = {}): StoryState {
  return { active: "hero", beats: {}, visitor: [], draft: null, ...partial };
}

/** A state whose current beat is `beat`, reported by a section that can own it. */
function at(beat: BeatId, extra: Partial<StoryState> = {}): StoryState {
  return state({ active: "route", beats: { route: beat }, ...extra });
}

const wait: VisitorRecord = {
  id: "v1",
  kind: "answer-wait",
  time: "09:52",
  meta: "업무 기록 · 09:52",
  title: "미송을 기다리기로 했어요",
  tag: "예시",
};

const signup: VisitorRecord = {
  id: "v2",
  kind: "signup",
  time: "09:58",
  meta: "신청 기록 · 09:58",
  title: "사전 신청을 보냈어요",
};

function storyIds(entries: ReturnType<typeof railEntries>): RecordId[] {
  return entries.flatMap((entry) => (entry.type === "story" ? [entry.record.id] : []));
}

describe("beat order", () => {
  it("follows the spec's night: 22:00 to now", () => {
    expect(BEAT_ORDER).toEqual(["b2200", "b2330", "b0216", "b0306", "b0307", "b0553", "b0553d", "b0849", "b0941", "bnow"]);
  });

  it("indexes every beat by its position", () => {
    BEAT_ORDER.forEach((id, index) => expect(beatIndex(id)).toBe(index));
  });

  it("adds every record exactly once, in chronological order", () => {
    const added = BEAT_ORDER.flatMap((id) => BEATS[id].adds);
    expect(new Set(added).size).toBe(added.length);
    expect([...added].sort()).toEqual(Object.keys(RECORDS).sort());
    const stamps = added.map((id) => `${RECORDS[id].day === "10월 10일" ? 0 : 1} ${RECORDS[id].time}`);
    expect(stamps).toEqual([...stamps].sort());
  });

  it("never lowers a ledger number from one beat to the next", () => {
    for (let i = 1; i < BEAT_ORDER.length; i += 1) {
      const before = BEATS[BEAT_ORDER[i - 1]].ledger;
      const after = BEATS[BEAT_ORDER[i]].ledger;
      expect(after.secured).toBeGreaterThanOrEqual(before.secured);
      expect(after.delivered).toBeGreaterThanOrEqual(before.delivered);
      expect(after.received).toBeGreaterThanOrEqual(before.received);
    }
  });

  it("grows the rail monotonically as the beat advances", () => {
    let previous: RecordId[] = [];
    for (const beat of BEAT_ORDER) {
      const ids = storyIds(railEntries(at(beat)));
      expect(ids.slice(0, previous.length)).toEqual(previous);
      previous = ids;
    }
    expect(previous).toHaveLength(Object.keys(RECORDS).length);
  });
});

describe("ledger invariants", () => {
  it.each(BEAT_ORDER)("received <= delivered <= secured <= requested at %s", (beat) => {
    const { requested, secured, delivered, received } = BEATS[beat].ledger;
    expect(received).toBeLessThanOrEqual(delivered);
    expect(delivered).toBeLessThanOrEqual(secured);
    expect(secured).toBeLessThanOrEqual(requested);
  });

  it.each(BEAT_ORDER)("shows exactly one of 미확인 or 남은 미송, equal to 요청 - 확보, at %s", (beat) => {
    const { requested, secured, unconfirmed, backorder } = BEATS[beat].ledger;
    expect((unconfirmed === null) !== (backorder === null)).toBe(true);
    expect(unconfirmed ?? backorder).toBe(requested - secured);
  });

  it("moves only on the records flagged movesLedger", () => {
    const moving = BEAT_ORDER.filter((beat, i) => {
      if (i === 0) return false;
      const a = BEATS[BEAT_ORDER[i - 1]].ledger;
      const b = BEATS[beat].ledger;
      return a.secured !== b.secured || a.delivered !== b.delivered || a.received !== b.received;
    });
    expect(moving).toEqual(["b0306", "b0553", "b0849"]);
    for (const beat of moving) {
      expect(BEATS[beat].adds.some((id) => RECORDS[id].movesLedger)).toBe(true);
    }
    for (const id of Object.keys(RECORDS) as RecordId[]) {
      const record = RECORDS[id];
      if (record.request === "cardigan" || record.kind === "message") expect(record.movesLedger).toBe(false);
    }
  });
});

describe("phase", () => {
  it("flips from night to day exactly once, at b0553d", () => {
    const flips = BEAT_ORDER.filter((beat, i) => i > 0 && BEATS[beat].phase !== BEATS[BEAT_ORDER[i - 1]].phase);
    expect(flips).toEqual(["b0553d"]);
    expect(BEATS.b2200.phase).toBe("night");
    expect(BEATS.bnow.phase).toBe("day");
  });
});

describe("currentBeatId", () => {
  it("uses the beat the active section reported", () => {
    expect(currentBeatId(state({ active: "route", beats: { route: "b0306" } }))).toBe("b0306");
  });

  it.each(SECTION_ORDER)("falls back to the default beat of %s when it reported nothing", (section) => {
    expect(currentBeatId(state({ active: section }))).toBe(SECTION_DEFAULT_BEAT[section]);
  });

  it("ignores beats reported by sections that are not active", () => {
    const s = state({ active: "cart", beats: { route: "b0216", dawn: "b0553d" } });
    expect(currentBeatId(s)).toBe("b0307");
  });

  it("rewinds exactly when scrolling back into an earlier section", () => {
    const forward = state({ active: "receipt", beats: { route: "b0307", dawn: "b0553d", receipt: "b0849" } });
    expect(currentBeatId(forward)).toBe("b0849");
    expect(currentBeatId({ ...forward, active: "route" })).toBe("b0307");
    expect(currentBeatId({ ...forward, active: "hero" })).toBe("b2200");
  });
});

describe("railEntries", () => {
  it("shows the two 20:00 records at 22:00", () => {
    expect(storyIds(railEntries(state()))).toEqual(["r2005", "r2031"]);
  });

  it("is cumulative up to the current beat", () => {
    expect(storyIds(railEntries(at("b0216")))).toEqual(["r2005", "r2031", "r0216"]);
    expect(storyIds(railEntries(at("b0307")))).toEqual(["r2005", "r2031", "r0216", "r0306", "m0307"]);
    expect(storyIds(railEntries(state({ active: "receipt", beats: { receipt: "b0849" } })))).toEqual([
      "r2005",
      "r2031",
      "r0216",
      "r0306",
      "m0307",
      "r0553a",
      "r0553b",
      "r0849",
    ]);
  });

  it("drops later records when the beat goes back (no orphans)", () => {
    const later = state({ active: "route", beats: { route: "b0307" } });
    const earlier = { ...later, beats: { route: "b0216" as BeatId } };
    expect(storyIds(railEntries(earlier))).toEqual(["r2005", "r2031", "r0216"]);
  });

  it("hides visitor records before b0941", () => {
    const s = state({ active: "receipt", beats: { receipt: "b0849" }, visitor: [wait] });
    expect(railEntries(s).some((entry) => entry.type === "visitor")).toBe(false);
  });

  it("appends visitor records, oldest first, at b0941 and later", () => {
    const roles = state({ active: "roles", visitor: [wait, signup] });
    const tail = railEntries(roles).slice(-2);
    expect(tail).toEqual([
      { type: "visitor", record: wait },
      { type: "visitor", record: signup },
    ]);
    expect(railEntries({ ...roles, active: "signup" }).filter((entry) => entry.type === "visitor")).toHaveLength(2);
  });

  it("returns the same entries for the same state (stable snapshots)", () => {
    const night = at("b0307");
    expect(railEntries(night)).toBe(railEntries({ ...night }));
    const day = state({ active: "signup", visitor: [wait, signup] });
    const first = railEntries(day);
    const second = railEntries({ ...day });
    expect(second).toHaveLength(first.length);
    second.forEach((entry, i) => expect(entry).toBe(first[i]));
  });

  it("returns the full story under the visitor records", () => {
    const entries = railEntries(state({ active: "footer", visitor: [signup] }));
    expect(storyIds(entries)).toHaveLength(Object.keys(RECORDS).length);
    expect(entries.at(-1)).toEqual({ type: "visitor", record: signup });
  });
});

describe("currentLedger", () => {
  it("returns the beat's ledger", () => {
    expect(currentLedger(state())).toEqual(BEATS.b2200.ledger);
    expect(currentLedger(at("b0306"))).toEqual(BEATS.b0306.ledger);
  });

  it("reads 미송 대기 after the visitor's sample answer, from b0941 on", () => {
    expect(currentLedger(state({ active: "trust", visitor: [wait] })).status).toBe("미송 대기");
    expect(currentLedger(state({ active: "signup", visitor: [wait] })).status).toBe("미송 대기");
  });

  it("keeps 답변 필요 before b0941 even when the answer exists", () => {
    expect(currentLedger(state({ active: "receipt", beats: { receipt: "b0849" }, visitor: [wait] })).status).toBe(
      "답변 필요",
    );
    expect(currentLedger(state({ active: "hero", visitor: [wait] })).status).toBe("진행 중");
  });

  it("ignores a signup record", () => {
    expect(currentLedger(state({ active: "signup", visitor: [signup] })).status).toBe("답변 필요");
  });

  it("never changes the numbers, only the status", () => {
    const withAnswer = currentLedger(state({ active: "trust", visitor: [wait] }));
    expect({ ...withAnswer, status: BEATS.b0941.ledger.status }).toEqual(BEATS.b0941.ledger);
  });
});

describe("chromeFor", () => {
  it.each(SECTION_ORDER)("returns the chrome mode of %s", (section: SectionId) => {
    const chrome = chromeFor(state({ active: section }));
    expect({ rail: chrome.rail, plate: chrome.plate, pill: chrome.pill }).toEqual(SECTION_CHROME[section]);
  });

  it("takes phase and clock from the current beat", () => {
    expect(chromeFor(state())).toMatchObject({ phase: "night", clock: "22:00" });
    expect(chromeFor(state({ active: "dawn", beats: { dawn: "b0553" } }))).toMatchObject({ phase: "night", clock: "05:53" });
    expect(chromeFor(state({ active: "dawn", beats: { dawn: "b0553d" } }))).toMatchObject({ phase: "day", clock: "05:53" });
  });

  it("leaves 'now' formatting to the consumer", () => {
    expect(chromeFor(state({ active: "signup" })).clock).toBe("now");
  });
});

describe("beatForProgress", () => {
  const markers = [
    [0, "b2330"],
    [0.32, "b0216"],
    [0.66, "b0306"],
    [0.9, "b0307"],
  ] as const;

  it("maps progress to the last marker at or below it", () => {
    expect(beatForProgress(markers, 0)).toBe("b2330");
    expect(beatForProgress(markers, 0.31)).toBe("b2330");
    expect(beatForProgress(markers, 0.32)).toBe("b0216");
    expect(beatForProgress(markers, 0.659)).toBe("b0216");
    expect(beatForProgress(markers, 0.66)).toBe("b0306");
    expect(beatForProgress(markers, 1)).toBe("b0307");
  });

  it("does not depend on marker order", () => {
    const shuffled = [markers[2], markers[0], markers[3], markers[1]] as const;
    expect(beatForProgress(shuffled, 0.7)).toBe("b0306");
  });

  it("clamps progress below the first marker to the first beat", () => {
    expect(beatForProgress(markers, -0.2)).toBe("b2330");
  });

  it("returns null without markers", () => {
    expect(beatForProgress([], 0.5)).toBeNull();
  });
});
