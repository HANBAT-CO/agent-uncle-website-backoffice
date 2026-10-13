import { describe, expect, it } from "vitest";

import {
  INITIAL_PROPOSAL,
  REPLAY_STEP_COUNT,
  formatClock,
  initialProposal,
  proposalView,
  replayAll,
  transition,
  type ProposalEvent,
  type ProposalPhase,
  type ProposalState,
} from "./proposal-machine";

/**
 * S8 proposal block (spec S8): 미송 기다리기 is the visitor's own decision and
 * writes one record; a cancel is only a proposal until the counterpart
 * confirms it, which the page shows as a replay of 동대문 박삼촌's screen.
 */

const WAIT: ProposalEvent = { type: "wait", time: "09:52" };

function drive(state: ProposalState, events: readonly ProposalEvent[]) {
  const effects = [];
  let current = state;
  for (const event of events) {
    const result = transition(current, event);
    effects.push(...result.effects);
    current = result.state;
  }
  return { state: current, effects };
}

const cancelPending = () => drive(INITIAL_PROPOSAL, [{ type: "requestCancel" }]).state;

describe("initial state", () => {
  it("asks the question and has written nothing", () => {
    expect(INITIAL_PROPOSAL).toEqual({ phase: "ask", step: 0, recorded: false });
    expect(initialProposal(false)).toBe(INITIAL_PROPOSAL);
  });

  it("opens on the answer the tab already recorded (a reload), never on the question", () => {
    const state = initialProposal(true);
    expect(state).toEqual({ phase: "waitConfirmed", step: 0, recorded: true });
    const view = proposalView(state);
    expect(view.badge).toBe("확정");
    expect(view.proposalStatus).toBeNull();
  });

  it("a restored answer still returns to the question, and never writes a second record", () => {
    const { state, effects } = drive(initialProposal(true), [{ type: "reset" }, WAIT, { type: "reset" }, WAIT]);
    expect(state).toEqual({ phase: "waitConfirmed", step: 0, recorded: true });
    expect(effects).toEqual([]);
    expect(transition(initialProposal(true), { type: "reset" }).state).toEqual({ phase: "ask", step: 0, recorded: true });
  });
});

describe("wait (the visitor's own answer)", () => {
  it("ask + wait → waitConfirmed with one addVisitor effect stamped with the local time", () => {
    const { state, effects } = transition(INITIAL_PROPOSAL, WAIT);
    expect(state.phase).toBe("waitConfirmed");
    expect(state.recorded).toBe(true);
    expect(effects).toEqual([
      {
        addVisitor: {
          kind: "answer-wait",
          time: "09:52",
          meta: "업무 기록 · 09:52",
          title: "미송을 기다리기로 했어요",
          tag: "예시",
        },
      },
    ]);
  });

  it("writes the record exactly once, even after 처음으로 and a second wait", () => {
    const { state, effects } = drive(INITIAL_PROPOSAL, [WAIT, { type: "reset" }, { type: "wait", time: "09:58" }]);
    expect(state.phase).toBe("waitConfirmed");
    expect(effects).toHaveLength(1);
  });

  it("starts already recorded when the visitor answered earlier in this tab", () => {
    const { effects } = transition({ ...INITIAL_PROPOSAL, recorded: true }, WAIT);
    expect(effects).toEqual([]);
  });

  it("waitConfirmed + reset → ask (the record stays)", () => {
    const { state } = drive(INITIAL_PROPOSAL, [WAIT, { type: "reset" }]);
    expect(state).toEqual({ phase: "ask", step: 0, recorded: true });
  });

  it("shows the badge 확정 and no cancel ledger while waiting", () => {
    const view = proposalView(transition(INITIAL_PROPOSAL, WAIT).state);
    expect(view.badge).toBe("확정");
    expect(view.proposalStatus).toBeNull();
    expect(view.requestStatus).toBeNull();
  });
});

describe("cancel proposal", () => {
  it("ask + requestCancel → cancelPending without effects", () => {
    const { state, effects } = transition(INITIAL_PROPOSAL, { type: "requestCancel" });
    expect(state).toEqual({ phase: "cancelPending", step: 0, recorded: false });
    expect(effects).toEqual([]);
  });

  it("cancelPending shows 취소 · 상대 확인 대기 with 취소 0 in the ledger line", () => {
    const view = proposalView(cancelPending());
    expect(view.proposalStatus).toBe("취소 · 상대 확인 대기");
    expect(view.cancelled).toBe(0);
    expect(view.ledgerLine).toBe("요청 6 · 확보 2 · 전달 2 · 수령 2 · 취소 0");
    expect(view.requestStatus).toBeNull();
    expect(view.counterpart).toBe("idle");
  });

  it("cancelPending + withdraw (제안 철회) → ask", () => {
    const { state, effects } = transition(cancelPending(), { type: "withdraw" });
    expect(state.phase).toBe("ask");
    expect(effects).toEqual([]);
  });

  it("cancelPending + reset → ask", () => {
    expect(transition(cancelPending(), { type: "reset" }).state.phase).toBe("ask");
  });
});

describe("counterpart replay (never the visitor acting as the uncle)", () => {
  it("cancelPending + startReplay → replay step 0 (the counterpart's pane, not yet pressed)", () => {
    const { state, effects } = transition(cancelPending(), { type: "startReplay" });
    expect(state).toEqual({ phase: "replay", step: 0, recorded: false });
    expect(effects).toEqual([]);
    const view = proposalView(state);
    expect(view.counterpart).toBe("idle");
    expect(view.sheetOpen).toBe(false);
    expect(view.proposalStatus).toBe("취소 · 상대 확인 대기");
  });

  it("step 1: the confirm button is pressed and the confirm sheet opens", () => {
    const { state } = drive(cancelPending(), [{ type: "startReplay" }, { type: "replayStep" }]);
    expect(state.step).toBe(1);
    const view = proposalView(state);
    expect(view.counterpart).toBe("pressed");
    expect(view.sheetOpen).toBe(true);
    expect(view.cancelled).toBe(0);
  });

  it("step 2: the status reads 취소 · 확정 and the ledger rolls 취소 0 → 4", () => {
    const { state } = drive(cancelPending(), [{ type: "startReplay" }, { type: "replayStep" }, { type: "replayStep" }]);
    expect(state.step).toBe(2);
    const view = proposalView(state);
    expect(view.sheetOpen).toBe(false);
    expect(view.proposalStatus).toBe("취소 · 확정");
    expect(view.cancelled).toBe(4);
    expect(view.ledgerLine).toBe("요청 6 · 확보 2 · 전달 2 · 수령 2 · 취소 4");
    expect(view.requestStatus).toBeNull();
  });

  it(`the ${REPLAY_STEP_COUNT}rd step completes the request: 완료, 요청 처리를 마쳤어요., and the log line`, () => {
    expect(REPLAY_STEP_COUNT).toBe(3);
    const { state, effects } = drive(cancelPending(), [
      { type: "startReplay" },
      { type: "replayStep" },
      { type: "replayStep" },
      { type: "replayStep" },
    ]);
    expect(state.phase).toBe("completed");
    expect(effects).toEqual([]);
    const view = proposalView(state);
    expect(view.ledgerLine).toBe("요청 6 · 확보 2 · 전달 2 · 수령 2 · 취소 4");
    expect(view.requestStatus).toBe("완료");
    expect(view.doneLine).toBe("요청 처리를 마쳤어요.");
    expect(view.logLine).toBe("협의한 변경·취소·정정을 확정했어요");
    expect(view.proposalStatus).toBe("취소 · 확정");
  });

  it("replayAll jumps straight to completed (reduced motion) without effects", () => {
    const { state, effects } = replayAll(cancelPending());
    expect(state.phase).toBe("completed");
    expect(effects).toEqual([]);
  });

  it("replayAll from any phase other than cancelPending changes nothing", () => {
    expect(replayAll(INITIAL_PROPOSAL).state).toBe(INITIAL_PROPOSAL);
  });

  it("completed + reset (처음으로) → ask", () => {
    const { state } = replayAll(cancelPending());
    expect(transition(state, { type: "reset" }).state).toEqual({ phase: "ask", step: 0, recorded: false });
  });

  it("replay + reset → ask (leaving mid-replay)", () => {
    const { state } = drive(cancelPending(), [{ type: "startReplay" }, { type: "replayStep" }]);
    expect(transition(state, { type: "reset" }).state.phase).toBe("ask");
  });

  it("completion is reachable only through the replay", () => {
    const events: ProposalEvent[] = [WAIT, { type: "requestCancel" }, { type: "withdraw" }, { type: "replayStep" }, { type: "reset" }];
    for (const phase of ["ask", "waitConfirmed", "cancelPending"] as const) {
      const state: ProposalState = { phase, step: 0, recorded: false };
      for (const event of events) {
        if (phase === "cancelPending" && event.type === "requestCancel") continue;
        expect(transition(state, event).state.phase).not.toBe("completed");
      }
    }
  });
});

describe("events that do not apply leave the state untouched", () => {
  const cases: Array<[ProposalPhase, ProposalEvent]> = [
    ["ask", { type: "withdraw" }],
    ["ask", { type: "startReplay" }],
    ["ask", { type: "replayStep" }],
    ["waitConfirmed", WAIT],
    ["waitConfirmed", { type: "requestCancel" }],
    ["waitConfirmed", { type: "withdraw" }],
    ["waitConfirmed", { type: "startReplay" }],
    ["waitConfirmed", { type: "replayStep" }],
    ["cancelPending", WAIT],
    ["cancelPending", { type: "requestCancel" }],
    ["cancelPending", { type: "replayStep" }],
    ["replay", WAIT],
    ["replay", { type: "requestCancel" }],
    ["replay", { type: "withdraw" }],
    ["replay", { type: "startReplay" }],
    ["completed", WAIT],
    ["completed", { type: "requestCancel" }],
    ["completed", { type: "withdraw" }],
    ["completed", { type: "startReplay" }],
    ["completed", { type: "replayStep" }],
    ["ask", { type: "reset" }],
  ];

  it.each(cases)("%s ignores %o", (phase, event) => {
    const state: ProposalState = { phase, step: 0, recorded: false };
    const result = transition(state, event);
    expect(result.state).toBe(state);
    expect(result.effects).toEqual([]);
  });
});

describe("only wait ever writes a visitor record", () => {
  it("no path through cancel, withdraw, replay or reset emits an effect", () => {
    const { effects } = drive(INITIAL_PROPOSAL, [
      { type: "requestCancel" },
      { type: "withdraw" },
      { type: "requestCancel" },
      { type: "startReplay" },
      { type: "replayStep" },
      { type: "replayStep" },
      { type: "replayStep" },
      { type: "reset" },
      { type: "requestCancel" },
      { type: "startReplay" },
      { type: "reset" },
    ]);
    expect(effects).toEqual([]);
  });

  it("a full session with one wait among everything else writes exactly one record", () => {
    const { effects } = drive(INITIAL_PROPOSAL, [
      { type: "requestCancel" },
      { type: "startReplay" },
      { type: "replayStep" },
      { type: "replayStep" },
      { type: "replayStep" },
      { type: "reset" },
      WAIT,
      { type: "reset" },
      WAIT,
      { type: "reset" },
      { type: "requestCancel" },
      { type: "withdraw" },
      WAIT,
    ]);
    expect(effects).toHaveLength(1);
    expect(effects[0]?.addVisitor.kind).toBe("answer-wait");
  });
});

describe("formatClock", () => {
  it("formats the visitor's local time as zero-padded HH:MM", () => {
    expect(formatClock(new Date(2026, 9, 12, 9, 5))).toBe("09:05");
    expect(formatClock(new Date(2026, 9, 12, 23, 41))).toBe("23:41");
    expect(formatClock(new Date(2026, 9, 12, 0, 0))).toBe("00:00");
  });
});
