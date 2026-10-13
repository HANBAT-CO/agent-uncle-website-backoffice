import { trust } from "@/content/copy";
import { BEATS } from "@/content/story";

/**
 * S8 equation board rules (spec S8, 6.4 "refusing steppers: the numbers
 * cannot contradict each other"). Pure and test-first (ledger-rules.test.ts).
 *
 * The board starts from the 08:49 record (요청 6, 확보 2, 전달 2, 수령 2) and
 * keeps 수령 ≤ 전달 ≤ 확보 ≤ 요청. Cumulative numbers only grow: a lower count
 * is a correction or a problem report in the app, never a stepper press, so
 * every − press is refused with the app's own string, and every + press that
 * would pass the number it depends on is refused too. Nothing here writes to
 * the story store: the board is a labelled sample (예시).
 */

export type LedgerField = "secured" | "delivered" | "received";
export type StepDir = "up" | "down";
export type BoardStep = { field: LedgerField; dir: StepDir };

export type BoardLedger = Readonly<{ requested: number; secured: number; delivered: number; received: number }>;

export type RefusalId = keyof typeof trust.refusals;
export type Refusal = { id: RefusalId; message: string };
export type StepResult = { state: BoardLedger; refusal?: Refusal };

/** Board columns in reading order: 수령 ≤ 전달 ≤ 확보. */
export const BOARD_FIELDS = ["received", "delivered", "secured"] as const satisfies readonly LedgerField[];

const { requested, secured, delivered, received } = BEATS.b0849.ledger;

/** The 08:49 record the reset link returns to. */
export const RECORDED_LEDGER: BoardLedger = Object.freeze({ requested, secured, delivered, received });

/** The number a field may not pass: 확보 ≤ 요청, 전달 ≤ 확보, 수령 ≤ 전달. */
function ceilingOf(state: BoardLedger, field: LedgerField): number {
  if (field === "secured") return state.requested;
  if (field === "delivered") return state.secured;
  return state.delivered;
}

function refusalFor(field: LedgerField, dir: StepDir): Refusal {
  const id = `${field}${dir === "up" ? "Up" : "Down"}` as RefusalId;
  return { id, message: trust.refusals[id] };
}

/** One stepper press. A refused press returns the same state object and the app's refusal. */
export function reduce(state: BoardLedger, { field, dir }: BoardStep): StepResult {
  if (dir === "down") return { state, refusal: refusalFor(field, dir) };
  if (state[field] + 1 > ceilingOf(state, field)) return { state, refusal: refusalFor(field, dir) };
  return { state: { ...state, [field]: state[field] + 1 } };
}

/** 남은 미송 = 요청 - 확보. */
export function backorder(state: BoardLedger): number {
  return state.requested - state.secured;
}

/** Which ≤ has both sides equal (a reached limit takes the bright stroke). */
export function atLimit(state: BoardLedger): { receivedDelivered: boolean; deliveredSecured: boolean } {
  return {
    receivedDelivered: state.received === state.delivered,
    deliveredSecured: state.delivered === state.secured,
  };
}

/** 0 ≤ 수령 ≤ 전달 ≤ 확보 ≤ 요청. */
export function holds(state: BoardLedger): boolean {
  return 0 <= state.received && state.received <= state.delivered && state.delivered <= state.secured && state.secured <= state.requested;
}
