import { describe, expect, it } from "vitest";

import {
  RECEIPT_DELIVERED,
  WHAT_IF_START,
  beatFor,
  initialReceiptState,
  receiptReducer,
  whatIfGap,
  type ReceiptAction,
  type ReceiptState,
} from "./receipt-state";

function run(actions: readonly ReceiptAction[], from: ReceiptState = initialReceiptState): ReceiptState {
  return actions.reduce(receiptReducer, from);
}

describe("receipt state", () => {
  it("starts untorn with the what-if sample closed at the delivered quantity", () => {
    expect(initialReceiptState).toEqual({ torn: false, whatIf: { open: false, actual: RECEIPT_DELIVERED } });
    expect(RECEIPT_DELIVERED).toBe(2);
  });

  it("tears the stub", () => {
    expect(run([{ type: "tear" }]).torn).toBe(true);
  });

  it("treats a second tear as a no-op that keeps the same state object", () => {
    const torn = run([{ type: "tear" }]);
    expect(receiptReducer(torn, { type: "tear" })).toBe(torn);
  });

  it("remembers what tore the stub: the first source wins, a reset clears it", () => {
    expect(run([{ type: "tear" }]).by).toBe("button");
    expect(run([{ type: "tear", by: "auto" }]).by).toBe("auto");
    // The leaf reports a finished drop as a tear too; it must not relabel an auto-tear.
    expect(run([{ type: "tear", by: "auto" }, { type: "tear", by: "drag" }]).by).toBe("auto");
    expect(run([{ type: "tear", by: "drag" }, { type: "reset" }]).by).toBeUndefined();
    expect(initialReceiptState.by).toBeUndefined();
  });

  it("resets to the untorn initial state", () => {
    const state = run([{ type: "openWhatIf" }, { type: "setActual", actual: 0 }, { type: "tear" }, { type: "reset" }]);
    expect(state).toEqual(initialReceiptState);
  });

  it("keeps the same state object when resetting an untouched slip", () => {
    expect(receiptReducer(initialReceiptState, { type: "reset" })).toBe(initialReceiptState);
  });

  it("opens the sample one short (실제 1개 · 기록 2개) every time", () => {
    expect(WHAT_IF_START).toBe(1);
    expect(run([{ type: "openWhatIf" }]).whatIf).toEqual({ open: true, actual: 1 });
    const reopened = run([{ type: "openWhatIf" }, { type: "setActual", actual: 0 }, { type: "closeWhatIf" }, { type: "openWhatIf" }]);
    expect(reopened.whatIf).toEqual({ open: true, actual: WHAT_IF_START });
  });

  it("keeps the same state object when opening an already fresh sample", () => {
    const open = run([{ type: "openWhatIf" }]);
    expect(receiptReducer(open, { type: "openWhatIf" })).toBe(open);
  });

  it("clamps the actual quantity to 0..2 and rounds it to whole pieces", () => {
    const open = run([{ type: "openWhatIf" }]);
    expect(receiptReducer(open, { type: "setActual", actual: -3 }).whatIf.actual).toBe(0);
    expect(receiptReducer(open, { type: "setActual", actual: 7 }).whatIf.actual).toBe(2);
    expect(receiptReducer(open, { type: "setActual", actual: 1.4 }).whatIf.actual).toBe(1);
  });

  it("ignores a non-finite actual quantity", () => {
    const open = run([{ type: "openWhatIf" }, { type: "setActual", actual: 0 }]);
    expect(receiptReducer(open, { type: "setActual", actual: Number.NaN })).toBe(open);
  });

  it("ignores setActual while the sample is closed", () => {
    expect(receiptReducer(initialReceiptState, { type: "setActual", actual: 0 })).toBe(initialReceiptState);
  });

  it("closes the sample without tearing", () => {
    const state = run([{ type: "openWhatIf" }, { type: "setActual", actual: 0 }, { type: "closeWhatIf" }]);
    expect(state.torn).toBe(false);
    expect(state.whatIf.open).toBe(false);
  });

  it("never lets the what-if sample tear the stub", () => {
    const untorn = run([{ type: "openWhatIf" }, { type: "setActual", actual: 0 }, { type: "setActual", actual: 2 }, { type: "closeWhatIf" }]);
    expect(untorn.torn).toBe(false);
  });

  it("closes an open sample when the stub tears (a delivery is confirmed only once)", () => {
    const state = run([{ type: "openWhatIf" }, { type: "setActual", actual: 0 }, { type: "tear" }]);
    expect(state.torn).toBe(true);
    expect(state.whatIf.open).toBe(false);
    expect(whatIfGap(state)).toBe(0);
  });

  it("does not open the sample once the stub is torn", () => {
    const torn = run([{ type: "tear" }]);
    expect(receiptReducer(torn, { type: "openWhatIf" })).toBe(torn);
    expect(receiptReducer(torn, { type: "setActual", actual: 0 })).toBe(torn);
  });
});

describe("beatFor", () => {
  it("reports 05:53 (day) before the tear and 08:49 after it", () => {
    expect(beatFor(initialReceiptState)).toBe("b0553d");
    expect(beatFor(run([{ type: "tear" }]))).toBe("b0849");
    expect(beatFor(run([{ type: "tear" }, { type: "reset" }]))).toBe("b0553d");
  });

  it("does not move when the what-if sample opens or changes", () => {
    for (const torn of [false, true]) {
      const base = torn ? run([{ type: "tear" }]) : initialReceiptState;
      const expected = beatFor(base);
      for (const actual of [0, 1, 2]) {
        expect(beatFor(run([{ type: "openWhatIf" }, { type: "setActual", actual }], base))).toBe(expected);
      }
    }
  });
});

describe("whatIfGap", () => {
  it("is the missing quantity while the sample is open and short", () => {
    const open = run([{ type: "openWhatIf" }]);
    expect(whatIfGap(open)).toBe(1);
    expect(whatIfGap(receiptReducer(open, { type: "setActual", actual: 2 }))).toBe(0);
    expect(whatIfGap(receiptReducer(open, { type: "setActual", actual: 0 }))).toBe(2);
  });

  it("is zero while the sample is closed", () => {
    expect(whatIfGap(initialReceiptState)).toBe(0);
  });
});
