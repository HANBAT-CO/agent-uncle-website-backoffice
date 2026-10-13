"use client";

import { useCallback, useEffect, useId, useMemo, useReducer, useRef, type ReactNode } from "react";

import { story } from "@/lib/story/store";

import { ReceiptContext, type ReceiptContextValue } from "./receipt-context";
import { beatFor, initialReceiptState, receiptReducer, type TearSource } from "./receipt-state";
import { SLIP } from "./slip-geometry";

/**
 * Where the auto-tear fires (a deliberate refinement of spec S6's "once the
 * slip's bottom leaves the top of the viewport"): early enough that the tear,
 * the 08:49 clock, 수령 0→2 and the r0849 record all play on screen while the
 * receipt is still the active section, late enough that a reader who stops at
 * the slip (section top at the viewport top, or a rail jump) finds it whole.
 *
 * - Wide slip (stub on the right, it spans the whole slip): when the slip's top
 *   reaches 104px, so its title row and the 수령 확인 badge are still below the
 *   72px nav. On a viewport shorter than the slip, once the slip has been
 *   scrolled through (its bottom 24px above the viewport bottom).
 * - Phone-width slip (stub under the body): when the slip's bottom reaches 60%
 *   of the viewport (spec 18.1). The 2장 수령 확인 button is fully clear of
 *   the record pill for about a third of a viewport of scroll before that
 *   (about 290px on a 390x844 phone; at 80% it was 120px, one flick), so the
 *   receipt stays the shop's own act. receipt.css adds bottom room to the
 *   section on phones, so the 08:49 beat still holds for about as long after
 *   the tear before roles takes the centre line.
 */
const WIDE_TEAR_TOP = 104;
const NARROW_TEAR_BOTTOM = 0.6;
/** A closed sample's hold lifts after this much deliberate forward scroll (Lenis eases a few px after a wheel stop). */
const HOLD_SLACK = 48;
/** Where the what-if sample opens beside the slip instead of under it (receipt.css). */
const SIDE_SAMPLE = "(min-width: 1024px)";

type ScrollTriggerInstance = {
  progress: number;
  scroll: () => number;
  kill: () => void;
};

type ScrollTriggerStatic = {
  isRefreshing?: boolean;
  create: (vars: Record<string, unknown>) => ScrollTriggerInstance;
};

/** ScrollTrigger.isRefreshing (GSAP 3.15 runtime; missing from its type definitions). */
function isRefreshing(ScrollTrigger: ScrollTriggerStatic): boolean {
  return ScrollTrigger.isRefreshing === true;
}

function tearStart(slip: HTMLElement): string {
  const vh = window.innerHeight;
  if (slip.clientWidth >= SLIP.wideFrom) {
    return `top ${Math.round(Math.min(WIDE_TEAR_TOP, vh - slip.offsetHeight - 24))}px`;
  }
  return `bottom ${Math.round(vh * NARROW_TEAR_BOTTOM)}px`;
}

function pastTearLine(slip: HTMLElement): boolean {
  const box = slip.getBoundingClientRect();
  const vh = window.innerHeight;
  if (slip.clientWidth >= SLIP.wideFrom) {
    return box.top <= Math.round(Math.min(WIDE_TEAR_TOP, vh - slip.offsetHeight - 24));
  }
  return box.bottom <= Math.round(vh * NARROW_TEAR_BOTTOM);
}

/**
 * The receipt section's state and its only link to the story store (spec S6).
 * Always loaded (small, no Motion), so the story stays true even before the
 * TearTicket leaf has loaded or when the reader jumps past the section:
 *
 * - Beat: reports beatFor(state) to the store whenever the state changes, and
 *   re-asserts it if the store drifts (under reduced motion SectionActivity
 *   reports the section default on every activation).
 * - Auto-tear: once the slip passes the tear line (above) untorn, the same
 *   tear plays, so scroll-only readers keep a true story. Never while the
 *   what-if sample is open (the sample says the quantity differs; the app
 *   confirms a delivery only once), nor while keyboard focus is inside the
 *   section (each Tab stop is centred by the browser, which alone can cross
 *   the line). Closing the sample past the line does not tear by itself: the
 *   reader's next deliberate forward scroll does (48px on from the highest
 *   point since, as closing scrolls back up to the row), as does the first
 *   forward scroll once keyboard focus has moved on.
 * - Moving on with the sample open (1024px up, where it sits beside the
 *   slip): once the section's bottom passes the viewport's centre line, roles
 *   takes the beat and its ledger already says 수령 2, while the untorn slip
 *   and the sample are still on screen above it. The hold ends there: the
 *   tear plays (and closes the sample, the sheet being only a few dozen px
 *   taller than the slip), so the slip agrees with the plate and the rail.
 *   Below 1024px the sample sits under the slip, which is off screen by then;
 *   closing it would pull the page up under the reader, so it stays held.
 * - Reset: once the section's top drops below the viewport bottom (the reader
 *   went back above it), the slip is whole again.
 *
 * All three are ScrollTriggers on scroll position rather than intersection
 * events, so a jump (End, Home, a deep link) that skips the section entirely
 * still tears or resets it.
 */
export function ReceiptProvider({ announce, children }: { announce: string; children: ReactNode }) {
  const [state, dispatch] = useReducer(receiptReducer, initialReceiptState);
  const rootRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const issueRef = useRef<HTMLButtonElement>(null);
  const tearRef = useRef<ScrollTriggerInstance | null>(null);
  const openRef = useRef(false);
  /** Scroll position where the sample closed past the tear line; null when no hold. */
  const holdAt = useRef<number | null>(null);
  const panelId = useId();
  const beat = beatFor(state);
  const open = state.whatIf.open;

  const tear = useCallback(
    (by: TearSource = "drag") => {
      if (by === "auto") {
        const root = rootRef.current;
        const section = root?.closest<HTMLElement>('[data-section="receipt"]');
        const slip = root?.querySelector<HTMLElement>("[data-receipt-anchor]");
        const movedPastOpenSample =
          openRef.current && window.matchMedia(SIDE_SAMPLE).matches && (section?.getBoundingClientRect().bottom ?? Infinity) <= window.innerHeight / 2;
        if (!movedPastOpenSample && (!slip || !pastTearLine(slip))) return;
      }
      // The issue row turns into text and an open sample closes (inert as it
      // goes): focus in either moves to the title row first.
      const active = document.activeElement;
      const issue = issueRef.current;
      const sample = document.getElementById(panelId);
      if (active && (active === issue || sample?.contains(active))) statusRef.current?.focus({ preventScroll: true });
      dispatch({ type: "tear", by });
    },
    [panelId],
  );

  useEffect(() => {
    const assert = () => {
      if (story.getState().beats.receipt !== beat) story.reportBeat("receipt", beat);
    };
    assert();
    return story.subscribe(assert);
  }, [beat]);

  useEffect(() => {
    const wasOpen = openRef.current;
    openRef.current = open;
    const trigger = tearRef.current;
    if (wasOpen && !open && trigger && trigger.progress > 0) holdAt.current = trigger.scroll();
  }, [open]);

  useEffect(() => {
    const root = rootRef.current;
    const section = root?.closest<HTMLElement>('[data-section="receipt"]');
    const slip = root?.querySelector<HTMLElement>("[data-receipt-anchor]");
    if (!root || !section || !slip) return;
    let cancelled = false;
    let tearTrigger: ScrollTriggerInstance | null = null;
    let handoff: ScrollTriggerInstance | null = null;
    let reset: ScrollTriggerInstance | null = null;
    let scrollFrame = 0;
    let removeScrollFallback: (() => void) | null = null;

    void import("@/lib/gsap").then(({ ScrollTrigger }) => {
      if (cancelled) return;

      // A keyboard reader inside the slip is mid-interaction: the browser centres
      // each Tab stop, which alone can carry the slip past the line.
      const keyboardInside = () => {
        const active = document.activeElement;
        return active instanceof HTMLElement && root.contains(active) && active.matches(":focus-visible");
      };
      const passed = (self: ScrollTriggerInstance) => {
        if (self.progress > 0 && pastTearLine(slip) && !openRef.current && holdAt.current === null && !keyboardInside()) tear("auto");
      };
      // The reader moved on with the sample open beside the slip (see above).
      const movedOn = () => {
        if (openRef.current && window.matchMedia(SIDE_SAMPLE).matches) tear("auto");
      };
      const above = (self: ScrollTriggerInstance) => {
        if (self.progress !== 0) return;
        if (keyboardInside()) return;
        holdAt.current = null;
        dispatch({ type: "reset" });
      };

      const check = (self: ScrollTriggerInstance) => {
        if (self.progress === 0) {
          holdAt.current = null;
          return;
        }
        const held = holdAt.current;
        if (held !== null) {
          // The hold follows the reader back up (closing scrolls back to the
          // row), so the next forward scroll counts from where they are.
          const y = self.scroll();
          if (y < held) holdAt.current = y;
          if (y < Math.min(y, held) + HOLD_SLACK) return;
          holdAt.current = null;
        }
        passed(self);
      };
      const scrollPositionFallback = () => {
        if (openRef.current && window.matchMedia(SIDE_SAMPLE).matches && section.getBoundingClientRect().bottom <= window.innerHeight / 2) {
          movedOn();
          return;
        }
        if (pastTearLine(slip)) {
          check({ progress: 1, scroll: () => window.scrollY, kill: () => undefined });
          return;
        }
        if (section.getBoundingClientRect().top >= window.innerHeight) {
          above({ progress: 0, scroll: () => window.scrollY, kill: () => undefined });
        }
      };
      const scheduleScrollPositionFallback = () => {
        if (scrollFrame) return;
        scrollFrame = requestAnimationFrame(() => {
          scrollFrame = 0;
          if (!isRefreshing(ScrollTrigger)) scrollPositionFallback();
        });
      };
      tearTrigger = ScrollTrigger.create({
        trigger: slip,
        start: () => tearStart(slip),
        // Past the line the trigger stays live, so a held slip still sees the next scroll.
        end: "max",
        // A refresh re-measures with the scroll briefly at 0 and skips the scroll
        // that lands during it (the closing sample's refresh can meet the next
        // forward scroll); onRefresh runs the same check on the settled position.
        onUpdate: (self: ScrollTriggerInstance) => {
          if (!isRefreshing(ScrollTrigger)) check(self);
        },
        onRefresh: check,
      });
      tearRef.current = tearTrigger;
      // SectionActivity's line: receipt stops holding the viewport's centre here
      // (a forward scroll or a jump past it; never a refresh, so opening the
      // sample there with the keyboard does not tear at once).
      handoff = ScrollTrigger.create({
        trigger: section,
        start: "bottom center",
        end: "max",
        onEnter: movedOn,
      });
      reset = ScrollTrigger.create({
        trigger: section,
        start: "top bottom",
        end: "+=1",
        onUpdate: above,
        onRefresh: above,
      });
      window.addEventListener("scroll", scheduleScrollPositionFallback, { passive: true });
      window.addEventListener("resize", scheduleScrollPositionFallback);
      removeScrollFallback = () => {
        window.removeEventListener("scroll", scheduleScrollPositionFallback);
        window.removeEventListener("resize", scheduleScrollPositionFallback);
        if (scrollFrame) cancelAnimationFrame(scrollFrame);
        scrollFrame = 0;
      };
      root.dataset.receiptScrollReady = "";
      scheduleScrollPositionFallback();
    });

    return () => {
      cancelled = true;
      delete root.dataset.receiptScrollReady;
      tearRef.current = null;
      removeScrollFallback?.();
      tearTrigger?.kill();
      handoff?.kill();
      reset?.kill();
    };
  }, [tear]);

  const value = useMemo<ReceiptContextValue>(
    () => ({ state, dispatch, tear, panelId, statusRef, issueRef }),
    [state, tear, panelId],
  );

  return (
    <ReceiptContext value={value}>
      <div
        ref={rootRef}
        data-receipt-beat={beat}
        data-receipt-torn={state.torn ? (state.by ?? "") : undefined}
        data-whatif-open={open ? "" : undefined}
      >
        {children}
        <p role="status" className="sr-only">
          {state.torn ? announce : ""}
        </p>
      </div>
    </ReceiptContext>
  );
}
