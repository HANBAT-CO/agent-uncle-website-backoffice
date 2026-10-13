"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import { ArrowCounterClockwiseIcon, MinusIcon, PlusIcon } from "@/components/icons/PhosphorLight";
import { useSmoothScroll } from "@/components/motion/SmoothScroll";
import { fill, trust } from "@/content/copy";
import { usePrefersReducedMotion } from "@/hooks/use-media-query";
import { cx } from "@/lib/cx";
import { gsapEase } from "@/lib/motion";

import { BOARD_FIELDS, RECORDED_LEDGER, atLimit, backorder, reduce, type BoardLedger, type LedgerField, type Refusal, type StepDir } from "./ledger-rules";
import { SentenceBlocks } from "./lines";
import { RollDigits } from "./RollDigits";

/**
 * S8 equation board (spec S8; motive 6.4: the numbers cannot contradict each
 * other). A client leaf on GSAP; Motion never touches it.
 *
 * 수령 ≤ 전달 ≤ 확보 in Paperlogy 900, each numeral with its role tag and an
 * app-style stepper (56px pill, 48px targets). The rules live in
 * ledger-rules.ts (test-first). An allowed press rolls the digit; a refused
 * press shakes the value pill on x [0,-6,6,-4,4,0] over 360ms, dims the
 * pressed control to 0.4 for 1.2s and shows the app's refusal under it (ink,
 * 2px #0C483E left rule, role alert, y 8 to 0 over 300ms). A ≤ between two
 * equal values takes the deep green: the limit is reached.
 *
 * Entry: the numerals and stepper values roll from 0 to the 08:49 record the
 * moment the equation's edge enters the viewport, 300ms each, 120ms apart.
 * Every armed value sits inside the equation, below its label (and above the
 * refusal row), so the roll is under way before any 0 can be read, from
 * either direction (ENTRY_MARGIN). The context line is never armed: its
 * 남은 미송 reads the recorded ledger (4 at 09:41, the number the chrome shows)
 * and rolls only on a press or the reset. Server HTML and the hydration pass
 * show the recorded numbers (the no-JS and reduced-motion state). Only when
 * the first observation finds the equation out of view does the board arm
 * its 0s (off screen, without animating); a board already in view on load (a
 * #trust deep link) keeps its numbers and never flickers. A press on an armed
 * board only reveals it.
 *
 * Screen readers: the stepper values are plain text; one polite line
 * announces each allowed press (누적 확보 3장) and the reset, never the entry.
 * Each refusal is its field's alert.
 *
 * Under the finger: each field keeps its own refusal. A refused press
 * replaces only its field's refusal and an allowed press clears only its own,
 * so a press never removes a refusal above the pressed control (below 768px
 * the stacked rows reserve no refusal height). The reset clears every
 * refusal above itself, so it scrolls by the height they took: the link stays
 * where it was pressed.
 *
 * Reduced motion: no roll, no shake; refusals appear at once.
 *
 * A sample surface: nothing here reaches the story store or the rail.
 */

const ZERO: BoardLedger = { ...RECORDED_LEDGER, secured: 0, delivered: 0, received: 0 };

const LABELS: Record<LedgerField, string> = {
  received: trust.equation.received,
  delivered: trust.equation.delivered,
  secured: trust.equation.secured,
};

const ENTRY_STAGGER = 0.12;
const SHAKE_X = [0, -6, 6, -4, 4, 0];
const DIM_HOLD = 1.2;

type Shown = { refusal: Refusal; seq: number };
type FieldRefusals = Readonly<Record<LedgerField, Shown | null>>;

const NO_REFUSALS: FieldRefusals = { received: null, delivered: null, secured: null };
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * The entry roll starts as the equation's top edge enters at the bottom of the
 * viewport (the numerals are still a label's height below it). From below, it
 * starts while the equation is still a quarter viewport above the top, so no
 * armed 0 slides out from under the nav.
 */
const ENTRY_MARGIN = "25% 0px 0px 0px";

/**
 * The context line in its app-format segments (와이드 데님 팬츠 / 연청 / 27 /
 * 요청 6장 / 남은 미송 {backorder}장). Each segment never breaks inside, so the
 * live 남은 미송 n장 never strands its number on a line of its own.
 */
const CONTEXT_SEGMENTS = trust.context.split(" · ").map((segment) => {
  const [before = "", after] = segment.split("{backorder}");
  return { text: segment, before, after, live: after !== undefined, request: segment.startsWith("요청") };
});

/** Before the first observation, out of view (0s armed), or entered. */
type Entry = "pending" | "armed" | "entered";

export function EquationBoard({ className }: { className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const equation = useRef<HTMLDivElement>(null);
  const [entry, setEntry] = useState<Entry>("pending");
  const [ledger, setLedger] = useState<BoardLedger>(RECORDED_LEDGER);
  const [touched, setTouched] = useState(false);
  const [shown, setShown] = useState<FieldRefusals>(NO_REFUSALS);
  const [announcement, setAnnouncement] = useState("");
  const seq = useRef(0);
  const resetLink = useRef<HTMLButtonElement>(null);
  /** The reset link's viewport top as it was pressed, until the reset commits. */
  const resetFrom = useRef<number | null>(null);
  const [resets, setResets] = useState(0);
  const { scrollTo } = useSmoothScroll();

  useEffect(() => {
    const node = equation.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const last = entries.at(-1);
        if (!last) return;
        if (last.isIntersecting) {
          setEntry("entered");
          observer.disconnect();
        } else {
          setEntry((current) => (current === "pending" ? "armed" : current));
        }
      },
      { rootMargin: ENTRY_MARGIN, threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const armed = entry === "armed" && !reduced && !touched;
  const values = armed ? ZERO : ledger;
  const limits = atLimit(values);
  const requestLimit = shown.secured?.refusal.id === "securedUp";

  const feedback = (pill: HTMLElement | null, control: HTMLElement) => {
    const still = window.matchMedia(REDUCED_MOTION_QUERY).matches;
    void import("@/lib/gsap").then(({ gsap }) => {
      if (!root.current?.contains(control)) return;
      if (pill && !still) {
        gsap.fromTo(
          pill,
          { x: 0 },
          { keyframes: { x: SHAKE_X, easeEach: gsapEase.inOutQuart }, duration: 0.36, ease: "none", overwrite: true },
        );
      }
      if (still) {
        gsap.set(control, { opacity: 0.4 });
        gsap.delayedCall(DIM_HOLD, () => gsap.set(control, { opacity: 1 }));
      } else {
        gsap.fromTo(control, { opacity: 0.4 }, { opacity: 1, duration: 0.3, delay: DIM_HOLD, ease: gsapEase.snap, overwrite: true });
      }
    });
  };

  const press = (field: LedgerField, dir: StepDir, control: HTMLButtonElement) => {
    setTouched(true);
    // A press on a board still showing its armed 0s only reveals the recorded numbers.
    if (armed) return;
    const result = reduce(ledger, { field, dir });
    if (result.refusal) {
      seq.current += 1;
      const next: Shown = { refusal: result.refusal, seq: seq.current };
      setShown((current) => ({ ...current, [field]: next }));
      feedback(control.closest<HTMLElement>("[data-pill]"), control);
      return;
    }
    setShown((current) => (current[field] ? { ...current, [field]: null } : current));
    setLedger(result.state);
    setAnnouncement(fill(trust.equation.announce, { label: trust.equation.steppers[field], count: result.state[field] }));
  };

  const resetBoard = () => {
    resetFrom.current = resetLink.current?.getBoundingClientRect().top ?? null;
    setResets((count) => count + 1);
    setTouched(true);
    setShown(NO_REFUSALS);
    setLedger(RECORDED_LEDGER);
    setAnnouncement(trust.equation.announceReset);
  };

  // After the reset commits (before paint): scroll by the height the cleared refusals took.
  useLayoutEffect(() => {
    const from = resetFrom.current;
    resetFrom.current = null;
    const link = resetLink.current;
    if (from === null || !link) return;
    const shift = link.getBoundingClientRect().top - from;
    if (Math.abs(shift) >= 1) scrollTo(window.scrollY + shift, { immediate: true });
  }, [resets, scrollTo]);

  return (
    <div ref={root} className={cx("trust-board", className)} data-trust-board="">
      <p className="text-body text-pretty text-grey-800 lg:text-body-lg" data-board-context="">
        {CONTEXT_SEGMENTS.map((segment, index) => (
          <Fragment key={segment.text}>
            {/* No-break space before the dot: a line never starts with it. */}
            {index > 0 ? "\u00a0· " : null}
            <span
              className={cx(
                "whitespace-nowrap transition-colors duration-(--duration-fast) ease-snap",
                segment.request && requestLimit && "font-bold text-green-800",
              )}
              data-context-request={segment.request ? "" : undefined}
              data-limit={segment.request && requestLimit ? "" : undefined}
            >
              {segment.live ? (
                <>
                  {segment.before}
                  {/* Never armed: the recorded ledger (4 at 09:41) until a press. */}
                  <RollDigits value={backorder(ledger)} className="font-bold text-ink" />
                  {segment.after}
                </>
              ) : (
                segment.text
              )}
            </span>
          </Fragment>
        ))}
      </p>

      <div ref={equation} className="trust-eq mt-8 md:mt-10 lg:mt-14" data-entered={armed ? undefined : ""}>
        {BOARD_FIELDS.map((field, index) => {
          const steppers = trust.equation.steppers[field];
          const refusal = shown[field];
          const leqLimit = index === 0 ? limits.receivedDelivered : limits.deliveredSecured;
          return (
            <Fragment key={field}>
              <div
                className="trust-eq-field"
                data-field={field}
                style={{ "--col": String(index * 2 + 1) } as CSSProperties}
              >
                <p className="trust-eq-label text-heading-md font-bold text-ink">{LABELS[field]}</p>
                <p className="trust-eq-numeral text-display-md font-black text-ink" data-numeral={field}>
                  <RollDigits value={values[field]} animate={!armed} introDelay={index * ENTRY_STAGGER} />
                  <span className="trust-eq-unit">장</span>
                </p>
                <p className="trust-eq-tag text-caption text-grey-600">{trust.equation.tags[field]}</p>

                <div className="trust-eq-stepper">
                  <p className="text-[13px] leading-[1.4] font-bold text-grey-700" id={`trust-stepper-${field}`}>
                    {steppers}
                  </p>
                  <div
                    data-pill=""
                    role="group"
                    aria-labelledby={`trust-stepper-${field}`}
                    className="mt-2 inline-flex h-14 items-center gap-1 rounded-pill bg-grey-100 p-1"
                  >
                    <StepButton
                      label={fill(trust.equation.decrement, { label: steppers })}
                      onPress={(button) => press(field, "down", button)}
                      dir="down"
                    />
                    <span
                      className="grid h-12 min-w-14 place-items-center rounded-pill bg-surface px-3 text-[20px] leading-none font-bold text-ink"
                      data-stepper-value={field}
                    >
                      <RollDigits value={values[field]} animate={!armed} introDelay={index * ENTRY_STAGGER} />
                    </span>
                    <StepButton
                      label={fill(trust.equation.increment, { label: steppers })}
                      onPress={(button) => press(field, "up", button)}
                      dir="up"
                    />
                  </div>
                </div>

                <div role="alert" aria-atomic="true" className="trust-eq-refusal" data-refusal-slot={field}>
                  {refusal ? (
                    <p key={refusal.seq} className="trust-refusal" data-refusal={refusal.refusal.id}>
                      <SentenceBlocks text={refusal.refusal.message} />
                    </p>
                  ) : null}
                </div>
              </div>
              {index < BOARD_FIELDS.length - 1 ? (
                <span
                  className="trust-eq-leq text-display-md font-black"
                  data-limit={leqLimit ? "" : undefined}
                  style={{ "--col": String(index * 2 + 2) } as CSSProperties}
                >
                  {trust.equation.leq}
                </span>
              ) : null}
            </Fragment>
          );
        })}
      </div>

      <p className="sr-only" aria-live="polite" aria-atomic="true" data-board-announce="">
        {announcement}
      </p>

      {/*
        24px at every width: from 768px the refusal row above already reserves 76px (88px below 1024px); below,
        the reset's own 44px target pads the stacked pair.
      */}
      <div className="mt-6 flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <p className="text-caption text-grey-600">{trust.sample}</p>
        <button
          ref={resetLink}
          type="button"
          onClick={resetBoard}
          className="-mx-2 inline-flex h-11 items-center gap-2 rounded-pill px-2 text-[15px] leading-none font-bold text-green-800 underline decoration-green-800/30 underline-offset-4 transition-[scale,text-decoration-color] duration-(--duration-fast) ease-snap hover:decoration-green-800 active:scale-[0.98]"
          data-board-reset=""
        >
          <ArrowCounterClockwiseIcon size={18} weight="light" aria-hidden="true" />
          {trust.reset}
        </button>
      </div>
    </div>
  );
}

function StepButton({ label, dir, onPress }: { label: string; dir: StepDir; onPress: (button: HTMLButtonElement) => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      data-step={dir}
      onClick={(event) => onPress(event.currentTarget)}
      className="grid size-12 shrink-0 place-items-center rounded-pill text-ink transition-[background-color,scale] duration-(--duration-fast) ease-snap hover:bg-surface/70 active:scale-[0.96]"
    >
      {dir === "up" ? <PlusIcon size={22} weight="light" aria-hidden="true" /> : <MinusIcon size={22} weight="light" aria-hidden="true" />}
    </button>
  );
}
