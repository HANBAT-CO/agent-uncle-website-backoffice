"use client";

import { AnimatePresence, MotionConfig, motion, useReducedMotion, type Transition } from "motion/react";
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { RecordCard } from "@/components/chrome/RecordCard";
import { AppIcon } from "@/components/icons/AppIcon";
import { useSmoothScroll } from "@/components/motion/SmoothScroll";
import StatusMark from "@/components/rb/StatusMark";
import { trust } from "@/content/copy";
import { cn } from "@/lib/cn";
import { duration, easing } from "@/lib/motion";
import { story } from "@/lib/story/store";
import { useStorySelector } from "@/lib/story/use-story";

import {
  REPLAY_STEP_MS,
  formatClock,
  initialProposal,
  proposalView,
  replayAll,
  transition,
  type ProposalEvent,
  type ProposalState,
  type ProposalView,
} from "./proposal-machine";
import { AskContent, BUTTON_PRIMARY, BUTTON_TEXT, BUTTON_WEAK, CounterpartIdle, Pane, ProposalDetail, ProposalSheet } from "./proposal-parts";
import { PhraseSpans } from "./lines";

/**
 * S8 proposal block, the Motion leaf (spec S8; motive 6.4: a change counts
 * only when the other side confirms). Loaded one viewport early by
 * ProposalSlot; GSAP never touches this tree.
 *
 * The visitor acts only as 망원 셀렉트샵 (the left pane):
 * - 미송 4장 기다리기 확정: the badge 확정 and the visitor's own record
 *   (업무 기록 · HH:MM / 미송을 기다리기로 했어요, chip 예시), written once to the
 *   story store, so the rail, the plate (미송 대기) and the footer log show it.
 *   After a reload in the same tab the block opens on that answer (the store
 *   keeps the record), and 처음으로 still returns to the question.
 * - Until a cancel, the counterpart pane (dashed, never operated) shows
 *   동대문 박삼촌's 09:41 home card for the denim (CounterpartIdle).
 * - 미송 취소 요청: the proposal waits for the counterpart (취소 · 상대 확인
 *   대기, 취소 0); the confirm is disabled on this side.
 * - 확정되는 과정 보기: a replay of 동대문 박삼촌's screen (right pane, no
 *   controls): the confirm is pressed and its sheet opens, the status turns
 *   취소 · 확정 and 취소 rolls 0 → 4 on both sides, then the request reads 완료.
 *   Three timed steps, 1.1s each; nothing is written to the store.
 *
 * The state machine is proposal-machine.ts (test-first). Reduced motion: no
 * movement, and the replay jumps to its final state with its steps listed.
 */

const { proposal } = trust;

const ENTER: Transition = { duration: duration.record, ease: easing.snap };
const ROLL: Transition = { duration: duration.roll, ease: easing.outExpo };
const INSTANT: Transition = { duration: 0 };

/** Frames to wait for a focus target that mounts after an exit animation (the swap's 160ms exit). */
const FOCUS_FRAMES = 40;

type FocusKey = "question" | "wait-status" | "cancel-status" | "replay" | "completion";

/** The ledger line around its {cancelled} slot. */
const [LEDGER_BEFORE, LEDGER_AFTER] = (() => {
  const [before = "", after = ""] = proposal.cancelOutcome.ledger.split("{cancelled}");
  return [before, after];
})();

export default function ProposalBlock({ takeFocusKey }: { takeFocusKey: () => string | null }) {
  const reduce = useReducedMotion() ?? false;
  // The chrome subscribed to the store at hydration, so a 기다리기 record from earlier in the
  // tab is already loaded when this lazy leaf mounts: a reload reopens on that answer.
  const waitRecord = useStorySelector((s) => s.visitor.find((record) => record.kind === "answer-wait") ?? null);
  const [state, setState] = useState<ProposalState>(() => initialProposal(waitRecord !== null));
  const current = useRef<ProposalState>(state);
  const focusNext = useRef<FocusKey | null>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const { scrollTo } = useSmoothScroll();

  const apply = (next: ProposalState, focus?: FocusKey) => {
    current.current = next;
    if (focus) focusNext.current = focus;
    setState(next);
  };

  const dispatch = (event: ProposalEvent, focus?: FocusKey) => {
    const result = transition(current.current, event);
    for (const effect of result.effects) story.addVisitorRecord(effect.addVisitor);
    apply(result.state, focus);
  };

  const startReplay = () => {
    if (reduce) apply(replayAll(current.current).state, "completion");
    else dispatch({ type: "startReplay" }, "replay");
  };

  const tick = useEffectEvent(() => {
    const next = transition(current.current, { type: "replayStep" }).state;
    apply(next, next.phase === "completed" ? "completion" : undefined);
  });

  /** Scrolls an element into the middle of the viewport when part of it is outside. */
  const reveal = useEffectEvent((node: HTMLElement) => {
    const box = node.getBoundingClientRect();
    const top = 88;
    if (box.top >= top && box.bottom <= window.innerHeight - 16) return;
    const spare = window.innerHeight - box.height;
    scrollTo(node, { offset: spare > top * 2 ? -spare / 2 : -top });
  });

  // The replay's three timed steps.
  useEffect(() => {
    if (state.phase !== "replay") return;
    const id = setTimeout(tick, REPLAY_STEP_MS);
    return () => clearTimeout(id);
  }, [state]);

  // Focus follows the visitor's action when the control they used disappears.
  // The new pane body mounts after the old one's exit, so wait for it.
  useEffect(() => {
    const key = focusNext.current;
    focusNext.current = null;
    if (!key) return;
    let frame = 0;
    let handle = 0;
    const attempt = () => {
      const target = sheet.current?.querySelector<HTMLElement>(`[data-focus-key="${key}"]`);
      if (target) {
        target.focus({ preventScroll: true });
        // Stacked layouts (below 768px): the counterpart's pane and the completion sit below the
        // control that started them, so bring what happens next into view.
        if (key === "replay" || key === "completion") reveal(target.closest<HTMLElement>("[data-pane], [data-completion]") ?? target);
        // 처음으로 and 제안 철회 collapse a tall stacked sheet: when the question ends up out of
        // view, bring the sheet back (its top under the nav when it is taller than the viewport).
        else if (key === "question" && sheet.current) {
          const box = target.getBoundingClientRect();
          if (box.top < 88 || box.bottom > window.innerHeight - 16) reveal(sheet.current);
        }
        return;
      }
      frame += 1;
      if (frame < FOCUS_FRAMES) handle = requestAnimationFrame(attempt);
    };
    attempt();
    return () => cancelAnimationFrame(handle);
  }, [state.phase]);

  // Took over from the static first paint (same markup unless a restored answer replaces the
  // question; then focus moves to its status): restore focus. Height changes (a restored answer,
  // a phase that grows the sheet past the device column) are ProposalSlot's to report.
  useLayoutEffect(() => {
    const key = takeFocusKey();
    if (!key) return;
    const root = sheet.current;
    const target =
      root?.querySelector<HTMLElement>(`[data-focus-key="${key}"]`) ?? root?.querySelector<HTMLElement>('[data-focus-key="wait-status"]');
    target?.focus({ preventScroll: true });
  }, [takeFocusKey]);

  const enter = reduce ? INSTANT : ENTER;
  const roll = reduce ? INSTANT : ROLL;
  const view = proposalView(state);
  const cancelFlow = state.phase === "cancelPending" || state.phase === "replay" || state.phase === "completed";
  const confirmed = view.counterpart === "done";

  const ledger = (
    <>
      {LEDGER_BEFORE}
      <span className="relative inline-flex h-[1.5em] overflow-hidden align-bottom digit-cell" data-cancelled={view.cancelled}>
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={view.cancelled}
            className="block font-bold text-ink"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "-100%" }}
            transition={roll}
          >
            {view.cancelled}
          </motion.span>
        </AnimatePresence>
      </span>
      {LEDGER_AFTER}
    </>
  );

  const statusMark = (focusKey?: FocusKey) => (
    <span tabIndex={focusKey ? -1 : undefined} data-focus-key={focusKey} className="outline-none" data-proposal-status="">
      <StatusMark
        status={confirmed ? "done" : "pending"}
        label={view.proposalStatus}
        size={20}
        fontSize={14}
        strike={false}
        color="#101010"
        doneColor="#0C483E"
        className="font-bold"
      />
    </span>
  );

  const retailerBody = (() => {
    if (state.phase === "ask") {
      return (
        <Swap key="ask" id="ask" transition={enter}>
          <AskContent
            onWait={() => dispatch({ type: "wait", time: formatClock(new Date()) }, "wait-status")}
            onCancel={() => dispatch({ type: "requestCancel" }, "cancel-status")}
          />
        </Swap>
      );
    }
    if (state.phase === "waitConfirmed") {
      return (
        <Swap key="wait" id="wait" transition={enter}>
          <div className="flex flex-1 flex-col gap-4" data-wait-outcome="">
            <span tabIndex={-1} data-focus-key="wait-status" className="self-start outline-none">
              <span className="inline-flex h-8 items-center gap-1.5 rounded-pill bg-accent-weak pr-3 pl-2 text-[14px] leading-none font-bold text-green-800">
                <StatusMark status="done" size={18} color="#0C483E" />
                {view.badge}
              </span>
            </span>
            {waitRecord ? (
              <RecordCard meta={waitRecord.meta} title={waitRecord.title} sample={waitRecord.tag === "예시"} />
            ) : null}
            <div className="mt-auto">
              <button type="button" className={BUTTON_TEXT} onClick={() => dispatch({ type: "reset" }, "question")}>
                {proposal.replay.restart}
              </button>
            </div>
          </div>
        </Swap>
      );
    }
    return (
      <Swap key="cancel" id="cancel" transition={enter}>
        <div className="flex flex-1 flex-col gap-4" data-cancel-outcome="">
          <ProposalDetail status={statusMark("cancel-status")} ledger={ledger} />
          {state.phase !== "completed" ? (
            <div className="flex flex-col gap-2">
              <button type="button" disabled className="inline-flex h-[52px] w-full cursor-not-allowed items-center justify-center rounded-pill bg-grey-100 px-5 text-[15px] leading-none font-bold text-grey-600" aria-describedby="trust-confirm-help">
                {proposal.replay.confirm}
              </button>
              <p id="trust-confirm-help" className="text-[13px] leading-[1.5] text-grey-700">
                <PhraseSpans text={proposal.cancelOutcome.confirmDisabled} />
              </p>
            </div>
          ) : null}
          {state.phase === "cancelPending" ? (
            <div className="mt-auto flex flex-col gap-2.5 pt-1">
              <button type="button" className={BUTTON_WEAK} onClick={() => dispatch({ type: "withdraw" }, "question")} data-action="withdraw">
                {proposal.cancelOutcome.withdraw}
              </button>
              <button type="button" className={BUTTON_PRIMARY} onClick={startReplay} data-action="startReplay">
                {proposal.cancelOutcome.showReplay}
              </button>
            </div>
          ) : null}
        </div>
      </Swap>
    );
  })();

  const counterpart = cancelFlow ? (
    <Pane
      side="counterpart"
      live={<ReplayAnnouncer view={view} phase={state.phase} />}
    >
      <Swap id="counterpart" transition={enter}>
        <div
          className="flex flex-1 flex-col gap-4"
          tabIndex={-1}
          data-focus-key="replay"
          data-counterpart={view.counterpart}
          data-replay-step={state.phase === "replay" ? state.step : state.phase === "completed" ? "done" : "idle"}
          style={{ outline: "none" }}
        >
          <ProposalDetail status={statusMark()} ledger={ledger} />
          <AnimatePresence initial={false}>
            {confirmed ? null : (
              <motion.div
                key="counterpart-actions"
                className="mt-auto flex flex-col gap-2.5 pt-1"
                aria-hidden="true"
                initial={false}
                animate={{ opacity: state.phase === "cancelPending" ? 0.45 : 1 }}
                exit={{ opacity: 0, y: 6 }}
                transition={enter}
              >
                <span className={cn(BUTTON_PRIMARY, "pointer-events-none", view.counterpart === "pressed" && "trust-pressed")}>
                  {proposal.replay.confirm}
                </span>
                <span className={cn(BUTTON_WEAK, "pointer-events-none")}>{proposal.replay.reject}</span>
              </motion.div>
            )}
          </AnimatePresence>
          {reduce && state.phase === "completed" ? <ReplaySteps /> : null}
        </div>
      </Swap>
      <AnimatePresence>
        {view.sheetOpen ? (
          <motion.div key="confirm-sheet" className="absolute inset-0 flex flex-col justify-end" data-confirm-sheet="">
            <motion.span
              aria-hidden="true"
              className="absolute inset-0 bg-[rgb(16_16_16/0.28)]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={enter}
            />
            <motion.div
              className="relative flex flex-col gap-2 rounded-t-[20px] bg-surface px-5 pt-5 pb-6"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={enter}
            >
              <span aria-hidden="true" className="mx-auto mb-2 h-1 w-9 rounded-pill bg-grey-300" />
              <p className="text-[17px] leading-[1.4] font-bold text-ink">{proposal.replay.sheetTitle}</p>
              <p className="text-[14px] leading-[1.55] text-grey-700">{proposal.replay.sheetBody}</p>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Pane>
  ) : (
    <Pane side="counterpart" ghost>
      <CounterpartIdle answered={state.phase === "waitConfirmed"} />
    </Pane>
  );

  const footer =
    state.phase === "completed" ? (
      <motion.div
        className="mt-5 flex flex-col gap-4 rounded-[20px] bg-paper p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={enter}
        data-completion=""
      >
        <div className="flex flex-col gap-2" tabIndex={-1} data-focus-key="completion" style={{ outline: "none" }}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="flex items-center gap-2 text-[16px] leading-none font-bold text-green-800">
              <StatusMark status="done" size={20} color="#0C483E" />
              {view.requestStatus}
            </p>
            <p className="text-[15px] font-bold text-ink">{view.doneLine}</p>
          </div>
          <p className="flex items-center gap-1.5 text-[14px] leading-[1.5] text-grey-800" data-log-line="">
            <AppIcon name="check" size={16} className="shrink-0 text-green-800" />
            {view.logLine}
          </p>
        </div>
        <button type="button" className={cn(BUTTON_TEXT, "self-start sm:self-auto")} onClick={() => dispatch({ type: "reset" }, "question")}>
          {proposal.replay.restart}
        </button>
      </motion.div>
    ) : null;

  return (
    <MotionConfig reducedMotion="user">
      <ProposalSheet
        sheetRef={sheet}
        phase={state.phase}
        retailer={
          <Pane side="retailer">
            <AnimatePresence mode="wait" initial={false}>
              {retailerBody}
            </AnimatePresence>
          </Pane>
        }
        counterpart={counterpart}
        footer={footer}
      />
    </MotionConfig>
  );
}

/** A pane body that rises in on a state change (record token) and steps aside on exit. */
function Swap({ id, children, transition }: { id: string; children: ReactNode; transition: Transition }) {
  const exit: Transition = transition.duration === 0 ? transition : { duration: duration.fast, ease: easing.snap };
  return (
    <motion.div
      key={id}
      className="flex flex-1 flex-col"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4, transition: exit }}
      transition={transition}
    >
      {children}
    </motion.div>
  );
}

/** Reduced motion: the replay's steps as a list instead of a performance. */
function ReplaySteps() {
  const { replay } = proposal;
  return (
    <ol className="flex list-decimal flex-col gap-1 pl-5 text-[14px] leading-[1.5] text-grey-800 marker:text-grey-600" data-replay-steps="">
      <li>{replay.confirm}</li>
      <li>{replay.sheetTitle}</li>
      <li>{replay.status}</li>
    </ol>
  );
}

/** What the counterpart just did, for screen readers (polite). */
function ReplayAnnouncer({ view, phase }: { view: ProposalView; phase: ProposalState["phase"] }) {
  const { replay } = proposal;
  let text = "";
  if (phase === "completed") text = `${view.requestStatus ?? ""} ${view.doneLine ?? ""}`;
  else if (view.counterpart === "done") text = replay.status;
  else if (view.sheetOpen) text = `${replay.sheetTitle} ${replay.sheetBody}`;
  return (
    <p className="sr-only" aria-live="polite">
      {text}
    </p>
  );
}
