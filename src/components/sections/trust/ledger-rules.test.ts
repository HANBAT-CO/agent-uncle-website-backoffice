import { describe, expect, it } from "vitest";

import { trust } from "@/content/copy";
import { BEATS } from "@/content/story";

import {
  BOARD_FIELDS,
  RECORDED_LEDGER,
  atLimit,
  backorder,
  holds,
  reduce,
  type BoardLedger,
  type BoardStep,
  type LedgerField,
  type StepDir,
} from "./ledger-rules";

/**
 * S8 equation board rules (spec S8): 수령 ≤ 전달 ≤ 확보 ≤ 요청. Every refusal is
 * the app's own string and appears only for its one illegal move.
 */

const at = (patch: Partial<BoardLedger>): BoardLedger => ({ ...RECORDED_LEDGER, ...patch });

const press = (state: BoardLedger, field: LedgerField, dir: StepDir) => reduce(state, { field, dir });

/** Apply allowed steps in order; fails the test if any is refused. */
function run(state: BoardLedger, steps: readonly BoardStep[]): BoardLedger {
  return steps.reduce((current, step) => {
    const result = reduce(current, step);
    expect(result.refusal).toBeUndefined();
    return result.state;
  }, state);
}

describe("recorded ledger", () => {
  it("starts from the 08:49 record: 요청 6, 확보 2, 전달 2, 수령 2", () => {
    expect(RECORDED_LEDGER).toEqual({ requested: 6, secured: 2, delivered: 2, received: 2 });
  });

  it("is the story's b0849 ledger, not a copy that can drift", () => {
    const { requested, secured, delivered, received } = BEATS.b0849.ledger;
    expect(RECORDED_LEDGER).toEqual({ requested, secured, delivered, received });
  });

  it("lists the board's fields in reading order 수령, 전달, 확보", () => {
    expect(BOARD_FIELDS).toEqual(["received", "delivered", "secured"]);
  });
});

describe("refusals (verbatim app strings, one per illegal move)", () => {
  it("refuses 확보 + beyond 요청 6", () => {
    const full = at({ secured: 6 });
    const result = press(full, "secured", "up");
    expect(result.refusal).toEqual({ id: "securedUp", message: "확보·전달·수령·취소 수량을 다시 확인해 주세요." });
    expect(result.state).toBe(full);
  });

  it("refuses 확보 −", () => {
    const result = press(RECORDED_LEDGER, "secured", "down");
    expect(result.refusal).toEqual({ id: "securedDown", message: "누적 확보 수량을 줄이려면 오류 정정을 이용해 주세요." });
    expect(result.state).toBe(RECORDED_LEDGER);
  });

  it("refuses 확보 − even when 전달 is below 확보", () => {
    const state = at({ secured: 5 });
    expect(press(state, "secured", "down").refusal?.id).toBe("securedDown");
  });

  it("refuses 전달 + beyond 확보", () => {
    const result = press(RECORDED_LEDGER, "delivered", "up");
    expect(result.refusal).toEqual({ id: "deliveredUp", message: "전달 가능한 수량을 넘을 수 없어요." });
    expect(result.state).toBe(RECORDED_LEDGER);
  });

  it("refuses 전달 −", () => {
    const result = press(RECORDED_LEDGER, "delivered", "down");
    expect(result.refusal).toEqual({
      id: "deliveredDown",
      message: "원래 기록과 정정 사유를 남기고 상대방이 확인한 뒤 반영해요.",
    });
    expect(result.state).toBe(RECORDED_LEDGER);
  });

  it("refuses 수령 + beyond 전달", () => {
    const result = press(RECORDED_LEDGER, "received", "up");
    expect(result.refusal).toEqual({ id: "receivedUp", message: "수령 수량은 전달 수량보다 클 수 없어요." });
    expect(result.state).toBe(RECORDED_LEDGER);
  });

  it("refuses 수령 −", () => {
    const result = press(RECORDED_LEDGER, "received", "down");
    expect(result.refusal).toEqual({
      id: "receivedDown",
      message: "이미 확인한 전달분이에요. 차이는 문제 알리기를 이용해 주세요.",
    });
    expect(result.state).toBe(RECORDED_LEDGER);
  });

  it("takes every message from the copy file", () => {
    const refused: Array<[LedgerField, StepDir, BoardLedger]> = [
      ["secured", "up", at({ secured: 6 })],
      ["secured", "down", RECORDED_LEDGER],
      ["delivered", "up", RECORDED_LEDGER],
      ["delivered", "down", RECORDED_LEDGER],
      ["received", "up", RECORDED_LEDGER],
      ["received", "down", RECORDED_LEDGER],
    ];
    for (const [field, dir, state] of refused) {
      const refusal = press(state, field, dir).refusal;
      expect(refusal).toBeDefined();
      expect(refusal?.message).toBe(trust.refusals[refusal!.id]);
    }
  });
});

describe("allowed moves", () => {
  it("lets 확보 grow one at a time up to 요청 6", () => {
    let state = RECORDED_LEDGER;
    for (const expected of [3, 4, 5, 6]) {
      const result = press(state, "secured", "up");
      expect(result.refusal).toBeUndefined();
      expect(result.state.secured).toBe(expected);
      state = result.state;
    }
    expect(press(state, "secured", "up").refusal?.id).toBe("securedUp");
  });

  it("lets 전달 grow up to 확보 and no further", () => {
    let state = run(RECORDED_LEDGER, [
      { field: "secured", dir: "up" },
      { field: "secured", dir: "up" },
    ]);
    state = run(state, [
      { field: "delivered", dir: "up" },
      { field: "delivered", dir: "up" },
    ]);
    expect(state.delivered).toBe(4);
    expect(press(state, "delivered", "up").refusal?.id).toBe("deliveredUp");
  });

  it("lets 수령 grow up to 전달 and no further", () => {
    let state = run(RECORDED_LEDGER, [
      { field: "secured", dir: "up" },
      { field: "delivered", dir: "up" },
      { field: "received", dir: "up" },
    ]);
    expect(state).toEqual({ requested: 6, secured: 3, delivered: 3, received: 3 });
    expect(press(state, "received", "up").refusal?.id).toBe("receivedUp");
    state = run(state, [{ field: "secured", dir: "up" }]);
    expect(press(state, "received", "up").refusal?.id).toBe("receivedUp");
  });

  it("returns a new object for an allowed move and never mutates the input", () => {
    const before = { ...RECORDED_LEDGER };
    const result = press(RECORDED_LEDGER, "secured", "up");
    expect(result.state).not.toBe(RECORDED_LEDGER);
    expect(RECORDED_LEDGER).toEqual(before);
  });

  it("never changes 요청", () => {
    const state = run(RECORDED_LEDGER, [
      { field: "secured", dir: "up" },
      { field: "secured", dir: "up" },
      { field: "secured", dir: "up" },
      { field: "secured", dir: "up" },
    ]);
    expect(state.requested).toBe(6);
  });
});

describe("derived values", () => {
  it("남은 미송 = 요청 - 확보", () => {
    expect(backorder(RECORDED_LEDGER)).toBe(4);
    expect(backorder(at({ secured: 3 }))).toBe(3);
    expect(backorder(at({ secured: 6 }))).toBe(0);
  });

  it("marks a ≤ as a reached limit when both sides are equal", () => {
    expect(atLimit(RECORDED_LEDGER)).toEqual({ receivedDelivered: true, deliveredSecured: true });
    expect(atLimit(at({ secured: 3 }))).toEqual({ receivedDelivered: true, deliveredSecured: false });
    expect(atLimit(at({ secured: 3, delivered: 3 }))).toEqual({ receivedDelivered: false, deliveredSecured: true });
  });

  it("holds() accepts 수령 ≤ 전달 ≤ 확보 ≤ 요청 and rejects anything else", () => {
    expect(holds(RECORDED_LEDGER)).toBe(true);
    expect(holds(at({ received: 3 }))).toBe(false);
    expect(holds(at({ delivered: 3 }))).toBe(false);
    expect(holds(at({ secured: 7 }))).toBe(false);
    expect(holds(at({ received: -1 }))).toBe(false);
  });
});

describe("invariants under any sequence of presses", () => {
  /** Deterministic PRNG (mulberry32) so a failure is reproducible. */
  function random(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it("keeps 수령 ≤ 전달 ≤ 확보 ≤ 요청 and refuses exactly the moves that would break it", () => {
    const fields: readonly LedgerField[] = ["secured", "delivered", "received"];
    for (const seed of [1, 7, 42, 2026, 9411]) {
      const next = random(seed);
      let state = RECORDED_LEDGER;
      for (let i = 0; i < 400; i += 1) {
        const field = fields[Math.floor(next() * fields.length)];
        const dir: StepDir = next() < 0.6 ? "up" : "down";
        const result = reduce(state, { field, dir });
        expect(holds(result.state)).toBe(true);
        if (result.refusal) {
          expect(result.state).toBe(state);
          expect(result.refusal.id).toBe(`${field}${dir === "up" ? "Up" : "Down"}`);
        } else {
          expect(dir).toBe("up");
          expect(result.state[field]).toBe(state[field] + 1);
        }
        state = result.state;
      }
    }
  });
});
