import type { BeatId } from "@/content/story";

/**
 * S6 receipt state (spec S6): the 수령 stub and the labelled what-if sample.
 *
 * - torn: the shop confirmed this delivery (08:49, 2개 수령을 확인했어요).
 *   Tearing is idempotent; reset only happens when the reader scrolls back
 *   above the section.
 * - by: what tore it (set with torn, kept by a repeat tear). The leaf plays a
 *   drag's own physics and a contained drop for the rest; the copy beside a
 *   wide slip glides after a reader's tear but holds still on an auto-tear.
 * - whatIf: an exploration surface (예시예요. 실제 기록에는 남지 않아요.). It
 *   never reaches the story store, so beatFor() ignores it. It follows the
 *   app's rules (product brief 4.9): a delivery is confirmed only once, so the
 *   tear closes an open sample and a torn slip cannot open one.
 *
 * Pure: shared by the section's client components and unit-tested.
 */

/** The quantity of this 전달 회차 (1차 · 10월 11일 05:53, 2장 · 이번 확인). */
export const RECEIPT_DELIVERED = 2;

/**
 * The sample opens one short (실제 1개 · 기록 2개, the spec's example), so
 * the reader who said "the quantity is different" sees the consequence at once.
 */
export const WHAT_IF_START = RECEIPT_DELIVERED - 1;

/** A drag or swipe on the stub, its 2장 수령 확인 button (click, Enter, Space), or the scroll. */
export type TearSource = "drag" | "button" | "auto";

export type ReceiptState = {
  torn: boolean;
  /** Set only while torn. */
  by?: TearSource;
  whatIf: { open: boolean; actual: number };
};

export type ReceiptAction =
  | { type: "tear"; by?: TearSource }
  | { type: "reset" }
  | { type: "openWhatIf" }
  | { type: "setActual"; actual: number }
  | { type: "closeWhatIf" };

export const initialReceiptState: ReceiptState = Object.freeze({
  torn: false,
  whatIf: Object.freeze({ open: false, actual: RECEIPT_DELIVERED }),
}) as ReceiptState;

function clampActual(value: number): number {
  return Math.min(RECEIPT_DELIVERED, Math.max(0, Math.round(value)));
}

export function receiptReducer(state: ReceiptState, action: ReceiptAction): ReceiptState {
  switch (action.type) {
    case "tear":
      return state.torn
        ? state
        : { torn: true, by: action.by ?? "button", whatIf: { open: false, actual: state.whatIf.actual } };
    case "reset":
      return state === initialReceiptState ? state : initialReceiptState;
    case "openWhatIf":
      if (state.torn) return state;
      return state.whatIf.open && state.whatIf.actual === WHAT_IF_START
        ? state
        : { ...state, whatIf: { open: true, actual: WHAT_IF_START } };
    case "setActual": {
      if (!state.whatIf.open || !Number.isFinite(action.actual)) return state;
      const actual = clampActual(action.actual);
      return actual === state.whatIf.actual ? state : { ...state, whatIf: { open: true, actual } };
    }
    case "closeWhatIf":
      return state.whatIf.open ? { ...state, whatIf: { ...state.whatIf, open: false } } : state;
  }
}

/** The beat the receipt section reports: 08:49 once the stub is torn, else the 05:53 morning. */
export function beatFor(state: ReceiptState): BeatId {
  return state.torn ? "b0849" : "b0553d";
}

/** Pieces missing in the what-if sample (0 when it matches or is closed). */
export function whatIfGap(state: ReceiptState): number {
  return state.whatIf.open ? RECEIPT_DELIVERED - state.whatIf.actual : 0;
}
