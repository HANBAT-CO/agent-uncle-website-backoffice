"use client";

import { AnimatePresence, LazyMotion, domAnimation, m, useIsPresent, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";

import { useSmoothScroll } from "@/components/motion/SmoothScroll";
import { fill, plate, receipt, trust } from "@/content/copy";
import { ScrollTrigger } from "@/lib/gsap";
import { requestScrollRefresh } from "@/lib/gsap-plugins";
import { duration, easing } from "@/lib/motion";

import { useReceipt } from "./receipt-context";
import { RECEIPT_DELIVERED, whatIfGap } from "./receipt-state";

/**
 * The labelled what-if sample (spec S6; Motion leaf, lazy). Opened by the
 * slip's 상품이나 수량이 달라요 row: what the app does when fewer pieces
 * arrived than were delivered. It opens one short (실제 1개 · 기록 2개), so
 * the consequence is on screen at once. It is an exploration surface only: it
 * reads and writes the section's local state and never touches the story
 * store, so no rail entry, plate number or beat ever changes here.
 *
 * The fields follow the app's expansion: 실제 받은 수량 (stepper 0-2), then
 * the 수량 차이 설명 (일치하면 선택) field as a static sample outline. With a
 * difference the app requires the reason (수량 차이의 상황을 입력해 주세요.)
 * and opens a problem: the ghost record, its status chain and the note.
 *
 * Desktop (1024px up): the sheet takes the copy column's place beside the slip
 * (receipt.css). Below: it opens under the slip. Once open, the page brings
 * its bottom into view, clear of the record chrome, as far as the sheet's own
 * top (and, where both fit, the issue row) can stay below the nav.
 *
 * Motion (LazyMotion, domAnimation): AnimatePresence opens and closes the
 * sheet and the difference block by animating their real height (700ms on the
 * record curve); the stepper's number rolls in its digit cell. After any
 * height change settles, ScrollTrigger re-measures the pins below.
 * Reduced motion: every change is instant.
 *
 * Status labels are outlined ink pills; nothing here is ever red.
 */

const { whatIf } = receipt;
/** The ghost record sits where the real 08:49 receipt would be written. */
const GHOST_TIME = "08:49";
/** Clearance under the fixed nav (16px + 56px) and above the mobile record pill. */
const NAV_CLEAR = 88;
const FOCUS_OFFSET = 96;
/** Air kept above the fixed record chrome at the bottom (the mobile pill, the compact plate). */
const CHROME_AIR = 16;

/**
 * The top of the fixed record chrome resting at the viewport's bottom over the
 * sheet's columns: the mobile record pill below 1024px, the compact plate from
 * 1024px to 1279px. Null when none covers them (the rail plate from 1280px
 * stands in its own column).
 */
function bottomChromeTop(sheet: DOMRect): number | null {
  let top: number | null = null;
  for (const node of document.querySelectorAll("[data-record-pill][data-visible], [data-plate]")) {
    const rect = node.getBoundingClientRect();
    if (rect.height === 0 || rect.top >= window.innerHeight || rect.top < window.innerHeight / 2) continue;
    if (rect.right <= sheet.left || rect.left >= sheet.right) continue;
    top = Math.min(top ?? Infinity, rect.top);
  }
  return top;
}

/**
 * The sheet itself. Once it starts to close (its 700ms exit, the height going
 * to 0 under overflow hidden) its controls are inert, so Tab never lands on a
 * stepper or 돌아가기 that is collapsing out of sight.
 */
function Sheet({ sheetRef, labelId, children }: { sheetRef: RefObject<HTMLDivElement | null>; labelId: string; children: ReactNode }) {
  const present = useIsPresent();
  return (
    <div ref={sheetRef} className="whatif-sheet" role="group" aria-labelledby={labelId} inert={!present || undefined}>
      {children}
    </div>
  );
}

/** "수령 수량 차이를 알렸어요:" and "실제 1개 · 기록 2개", so the count pair never breaks. */
function splitGhost(text: string): [string, string] {
  const cut = text.indexOf(": ");
  return cut < 0 ? [text, ""] : [text.slice(0, cut + 1), text.slice(cut + 2)];
}

export default function WhatIfPanel() {
  const { state, dispatch, issueRef } = useReceipt();
  const { scrollTo } = useSmoothScroll();
  const reduce = useReducedMotion();
  const labelId = useId();
  const fieldId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const gapRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealed = useRef(false);
  /** Live open state: the exiting sheet keeps the callbacks of its last open render. */
  const openNow = useRef(false);
  const [direction, setDirection] = useState<1 | -1>(-1);

  const { open, actual } = state.whatIf;
  const gap = whatIfGap(state);
  const record = reduce ? { duration: 0 } : { duration: duration.record, ease: easing.snap };
  const roll = reduce ? { duration: 0 } : { duration: duration.roll, ease: easing.outExpo };
  const decrementLabel = fill(trust.equation.decrement, { label: whatIf.field });
  const incrementLabel = fill(trust.equation.increment, { label: whatIf.field });
  const [ghostLead, ghostPair] = splitGhost(fill(whatIf.ghost, { actual }));

  useEffect(() => {
    openNow.current = open;
    if (!open) revealed.current = false;
  }, [open]);

  useEffect(
    () => () => {
      if (gapRefreshTimer.current !== null) clearTimeout(gapRefreshTimer.current);
    },
    [],
  );

  /**
   * Once per opening: bring the sheet's bottom into view, clear of the nav and
   * of the record pill or plate resting over it. The row that opened it stays
   * below the nav too when both fit; on a phone they do not (the slip's stub
   * sits between them), so the whole sheet wins, its 예시 label first. On a
   * viewport too short even for that, 돌아가기 never comes to rest half under
   * that chrome.
   */
  const revealSheet = () => {
    requestScrollRefresh();
    if (!openNow.current || revealed.current) return;
    revealed.current = true;
    // Measure the settled layout only: the completion can land before the
    // height is applied (reduced motion) or while it is still growing.
    let frames = 0;
    const measure = () => {
      const sheet = sheetRef.current;
      const box = sheet?.parentElement;
      if (!sheet || !box || !openNow.current) return;
      if (box.getBoundingClientRect().bottom < sheet.getBoundingClientRect().bottom - 1 && frames++ < 90) {
        requestAnimationFrame(measure);
        return;
      }
      // Re-measure every ScrollTrigger with the sheet open before scrolling.
      // The section-activity ranges still end where the closed section did, so
      // below 1024px (the sheet grows the section by about 600px) the reveal
      // scroll handed the beat to roles (09:41, 기록 7) until the debounced
      // refresh after it.
      ScrollTrigger.refresh();
      if (!openNow.current) return;
      const sheetRect = sheet.getBoundingClientRect();
      const chrome = bottomChromeTop(sheetRect);
      const floor = Math.min(window.innerHeight - NAV_CLEAR, chrome === null ? Infinity : chrome - CHROME_AIR);
      const overflow = sheetRect.bottom - floor;
      if (overflow <= 1) return;
      const issueTop = issueRef.current?.getBoundingClientRect().top ?? sheetRect.top;
      let delta = Math.min(overflow, Math.min(issueTop, sheetRect.top) - FOCUS_OFFSET);
      if (delta < overflow) {
        delta = Math.min(overflow, sheetRect.top - FOCUS_OFFSET);
        const back = backRef.current?.getBoundingClientRect();
        if (chrome !== null && back && back.bottom - delta > floor && back.top - delta < window.innerHeight) {
          const belowFold = back.top - window.innerHeight;
          delta = belowFold > 0 ? belowFold : back.bottom - floor;
        }
      }
      if (delta > 1) scrollTo(window.scrollY + delta);
    };
    requestAnimationFrame(measure);
  };

  const step = (delta: 1 | -1) => {
    setDirection(delta);
    dispatch({ type: "setActual", actual: actual + delta });
  };

  const scheduleGapRefresh = () => {
    if (gapRefreshTimer.current !== null) clearTimeout(gapRefreshTimer.current);
    gapRefreshTimer.current = setTimeout(() => {
      gapRefreshTimer.current = null;
      requestScrollRefresh();
    }, 1200);
  };

  const close = () => {
    dispatch({ type: "closeWhatIf" });
    const issue = issueRef.current;
    if (!issue) return;
    issue.focus({ preventScroll: true });
    // Back up to the row if the reader read the sample below it. Only ever
    // backwards: a forward scroll is the reader's cue for the auto-tear.
    if (issue.getBoundingClientRect().top < NAV_CLEAR) {
      scrollTo(issue, { offset: -Math.round(window.innerHeight * 0.45) });
    }
  };

  return (
    <LazyMotion features={domAnimation} strict>
      <AnimatePresence initial onExitComplete={requestScrollRefresh}>
        {open ? (
          <m.div
            key="whatif"
            className="whatif"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={record}
            onAnimationComplete={revealSheet}
          >
            <Sheet sheetRef={sheetRef} labelId={labelId}>
              <p id={labelId} className="whatif-label">
                {whatIf.label}
              </p>

              <div className="whatif-field">
                <span id={fieldId} className="whatif-field-label">
                  {whatIf.field}
                </span>
                <div className="whatif-stepper" role="group" aria-labelledby={fieldId}>
                  <button
                    type="button"
                    className="whatif-step"
                    aria-label={decrementLabel}
                    aria-disabled={actual <= 0 || undefined}
                    onClick={() => step(-1)}
                  >
                    −
                  </button>
                  <output className="whatif-value" aria-live="polite">
                    <span className="whatif-digit digit-cell">
                      <AnimatePresence initial={false} mode="popLayout" custom={direction}>
                        <m.span
                          key={actual}
                          className="whatif-digit-face"
                          custom={direction}
                          variants={{
                            enter: (dir: number) => ({ y: dir > 0 ? "60%" : "-60%", opacity: 0 }),
                            rest: { y: "0%", opacity: 1 },
                            leave: (dir: number) => ({ y: dir > 0 ? "-60%" : "60%", opacity: 0 }),
                          }}
                          initial="enter"
                          animate="rest"
                          exit="leave"
                          transition={roll}
                        >
                          {actual}
                        </m.span>
                      </AnimatePresence>
                    </span>
                    <span className="whatif-unit">{plate.unit}</span>
                  </output>
                  <button
                    type="button"
                    className="whatif-step"
                    aria-label={incrementLabel}
                    aria-disabled={actual >= RECEIPT_DELIVERED || undefined}
                    onClick={() => step(1)}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* The app's optional reason field, as a sample outline (nothing to type here). */}
              <div className="whatif-reason">
                <p className="whatif-helper">{whatIf.helper}</p>
                <div className="whatif-input" aria-hidden="true" />
              </div>

              <AnimatePresence initial={false}>
                {gap > 0 ? (
                  <m.div
                    key="gap"
                    className="whatif-gap"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={record}
                    onAnimationComplete={scheduleGapRefresh}
                  >
                    <div className="whatif-gap-inner">
                      <p className="whatif-required">{whatIf.reasonRequired}</p>

                      <div className="whatif-ghost">
                        <p className="whatif-ghost-meta">
                          <span>{fill(plate.recordMeta, { time: GHOST_TIME })}</span>
                          <span className="whatif-chip">{plate.sampleChip}</span>
                        </p>
                        <p className="whatif-ghost-title">
                          {ghostLead}
                          {ghostPair ? (
                            <>
                              {" "}
                              <span className="whitespace-nowrap">{ghostPair}</span>
                            </>
                          ) : null}
                        </p>
                      </div>

                      <ol className="whatif-steps">
                        {whatIf.steps.map((label, index) => (
                          <li key={label} className="whatif-step-item">
                            <span className="whatif-pill">{label}</span>
                            {index < whatIf.steps.length - 1 ? (
                              <span className="whatif-arrow" aria-hidden="true">
                                {whatIf.stepArrow}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ol>

                      <p className="whatif-resolver">{whatIf.resolver}</p>
                      <p className="whatif-note">{whatIf.note}</p>
                    </div>
                  </m.div>
                ) : null}
              </AnimatePresence>

              <button ref={backRef} type="button" className="whatif-back" onClick={close}>
                {whatIf.back}
              </button>
            </Sheet>
          </m.div>
        ) : null}
      </AnimatePresence>
    </LazyMotion>
  );
}
