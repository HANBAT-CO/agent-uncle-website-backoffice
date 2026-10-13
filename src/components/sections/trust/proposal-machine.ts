import { fill, plate, trust } from "@/content/copy";
import type { VisitorRecord } from "@/lib/story/store";

/**
 * S8 proposal block state machine (spec S8, 6.4 "proposal replay: a change
 * counts only when the other side confirms"). Pure and test-first
 * (proposal-machine.test.ts).
 *
 *   ask ── wait ──────────> waitConfirmed ── reset ──> ask
 *    │                                  (writes the visitor's record, once)
 *    └── requestCancel ──> cancelPending ── withdraw / reset ──> ask
 *                               │
 *                          startReplay
 *                               v
 *                 replay step 0 → 1 → 2 ── replayStep ──> completed ── reset ──> ask
 *
 * - wait is the visitor's own decision as the retailer: it emits one
 *   addVisitor effect (업무 기록 · HH:MM / 미송을 기다리기로 했어요, chip 예시).
 *   `recorded` survives reset, so a second wait never writes again. A block
 *   mounting after that answer (a reload) starts in waitConfirmed
 *   (initialProposal).
 * - A cancel is only a proposal. 완료 is reachable only through the replay of
 *   동대문 박삼촌's screen; the replay never emits store effects, so neither the
 *   rail nor the plate ever hears about it.
 * - Events that do not apply in a phase return the same state object.
 */

export type ProposalPhase = "ask" | "waitConfirmed" | "cancelPending" | "replay" | "completed";
export type ReplayStep = 0 | 1 | 2;

export type ProposalState = Readonly<{
  phase: ProposalPhase;
  /** Replay step: 0 the counterpart's pane, 1 confirm pressed and the sheet open, 2 취소 · 확정. */
  step: ReplayStep;
  /** The visitor's wait answer has been written (this page view or earlier in the tab). */
  recorded: boolean;
}>;

export type ProposalEvent =
  | { type: "wait"; time: string }
  | { type: "requestCancel" }
  | { type: "withdraw" }
  | { type: "startReplay" }
  | { type: "replayStep" }
  | { type: "reset" };

export type ProposalEffect = { addVisitor: Omit<VisitorRecord, "id"> };

export type ProposalTransition = { state: ProposalState; effects: readonly ProposalEffect[] };

/** Timed steps after startReplay (spec S8: about 1.1s each). */
export const REPLAY_STEP_COUNT = 3;
export const REPLAY_STEP_MS = 1100;

export const INITIAL_PROPOSAL: ProposalState = Object.freeze({ phase: "ask", step: 0, recorded: false });

/** The visitor's 기다리기 answer, already in the tab's record. */
const ANSWERED: ProposalState = Object.freeze({ phase: "waitConfirmed", step: 0, recorded: true });

/**
 * The state the block mounts in. After a reload the store still holds the
 * visitor's 기다리기 record (sessionStorage), so the sheet opens on that answer
 * (확정 and its record), never on the question beside a log that says it was
 * answered. `recorded` is already true: 처음으로 and a second 기다리기 never
 * write again.
 */
export function initialProposal(answered: boolean): ProposalState {
  return answered ? ANSWERED : INITIAL_PROPOSAL;
}

const NONE: readonly ProposalEffect[] = Object.freeze([]);

const { proposal } = trust;

/** The visitor's local time, HH:MM (the record joins the log at real local time). */
export function formatClock(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function waitRecord(time: string): ProposalEffect {
  return {
    addVisitor: {
      kind: "answer-wait",
      time,
      meta: fill(plate.recordMeta, { time }),
      title: proposal.waitOutcome.title,
      tag: proposal.waitOutcome.chip,
    },
  };
}

function to(state: ProposalState, phase: ProposalPhase, step: ReplayStep = 0): ProposalState {
  return { phase, step, recorded: state.recorded };
}

export function transition(state: ProposalState, event: ProposalEvent): ProposalTransition {
  const same: ProposalTransition = { state, effects: NONE };

  if (event.type === "reset") {
    return state.phase === "ask" ? same : { state: to(state, "ask"), effects: NONE };
  }

  switch (state.phase) {
    case "ask":
      if (event.type === "wait") {
        const next: ProposalState = { phase: "waitConfirmed", step: 0, recorded: true };
        return { state: next, effects: state.recorded ? NONE : [waitRecord(event.time)] };
      }
      if (event.type === "requestCancel") return { state: to(state, "cancelPending"), effects: NONE };
      return same;

    case "cancelPending":
      if (event.type === "withdraw") return { state: to(state, "ask"), effects: NONE };
      if (event.type === "startReplay") return { state: to(state, "replay", 0), effects: NONE };
      return same;

    case "replay":
      if (event.type !== "replayStep") return same;
      if (state.step === 2) return { state: to(state, "completed"), effects: NONE };
      return { state: to(state, "replay", (state.step + 1) as ReplayStep), effects: NONE };

    case "waitConfirmed":
    case "completed":
      return same;
  }
}

/** Reduced motion: the replay's final state at once (the steps are listed instead of played). */
export function replayAll(state: ProposalState): ProposalTransition {
  if (state.phase !== "cancelPending") return { state, effects: NONE };
  let current = transition(state, { type: "startReplay" }).state;
  for (let i = 0; i < REPLAY_STEP_COUNT; i += 1) current = transition(current, { type: "replayStep" }).state;
  return { state: current, effects: NONE };
}

export type ProposalView = {
  /** 확정 after the wait answer. */
  badge: string | null;
  /** The cancel proposal's status: 취소 · 상대 확인 대기, then 취소 · 확정. */
  proposalStatus: string | null;
  /** 취소 in the ledger line: 0 until the counterpart confirms, then 4. */
  cancelled: number;
  ledgerLine: string;
  /** The request's own status once the counterpart confirmed: 완료. */
  requestStatus: string | null;
  doneLine: string | null;
  logLine: string | null;
  /** The counterpart's confirm button. */
  counterpart: "idle" | "pressed" | "done";
  sheetOpen: boolean;
};

const CANCELLED_ON_CONFIRM = 4;

export function proposalView(state: ProposalState): ProposalView {
  const confirmed = (state.phase === "replay" && state.step === 2) || state.phase === "completed";
  const cancelled = confirmed ? CANCELLED_ON_CONFIRM : 0;
  const cancelFlow = state.phase === "cancelPending" || state.phase === "replay" || state.phase === "completed";
  const completed = state.phase === "completed";
  return {
    badge: state.phase === "waitConfirmed" ? proposal.waitOutcome.badge : null,
    proposalStatus: cancelFlow ? (confirmed ? proposal.replay.status : proposal.cancelOutcome.status) : null,
    cancelled,
    ledgerLine: fill(proposal.cancelOutcome.ledger, { cancelled }),
    requestStatus: completed ? proposal.replay.done : null,
    doneLine: completed ? proposal.replay.doneLine : null,
    logLine: completed ? proposal.replay.log : null,
    counterpart: confirmed ? "done" : state.phase === "replay" && state.step === 1 ? "pressed" : "idle",
    sheetOpen: state.phase === "replay" && state.step === 1,
  };
}
