"use client";

import { Fragment, useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import SplitFlapText from "@/components/rb/SplitFlapText";
import { plate } from "@/content/copy";
import { PLATE_TOOLTIPS, type PlateField } from "@/content/glossary";
import type { Ledger } from "@/content/story";
import { usePrefersReducedMotion } from "@/hooks/use-media-query";
import { cx } from "@/lib/cx";
import { gsap } from "@/lib/gsap";
import { MQ } from "@/lib/gsap-plugins";
import { duration, gsapEase } from "@/lib/motion";
import { chromeFor, currentLedger } from "@/lib/story/derive";
import { useStorySelector } from "@/lib/story/use-story";

import { CLOCK_FLAP_DIGITS, clockMotion, ledgerRest, plateSummary, type LedgerField } from "./chrome-model";
import { DigitRoll } from "./DigitRoll";
import { useNowClock } from "./hooks";

/**
 * The record plate (spec 5.3): the denim request's clock, status and ledger,
 * always paper #F5F4EE with ink, in both phases (nothing in here reads the
 * phase, so the plate's pixels only change where a digit changes).
 *
 * - full: split-flap clock + status chip, the item line, 요청 ≥ 확보 ≥ 전달 ≥ 수령
 *   then 남은 미송 (미확인 before 03:06)
 * - compact (1024-1279px, and roles): clock + 확보 ≥ 전달 ≥ 수령 on one line, 280px
 * - sheet: the full plate inside the mobile sheet (tooltips open below)
 *
 * The clock flaps one story step at a time through 0, 1 and 2 only (always a
 * real time) and snaps on multi-step jumps and fast flings (useClockFlap).
 * Numbers roll in digit cells; the ≥ glyphs (app grey #808080 at rest, about
 * 3.6:1 on paper, so the invariant stays legible) flash #0C483E for 600ms after
 * any change (the check still holds). Every label is a button with its glossary
 * tooltip on hover and keyboard focus. A visually hidden sentence carries the
 * whole record for screen readers ([data-plate-summary]).
 */

export type PlateVariant = "full" | "compact" | "sheet";

const GEQ_GREY = "#808080";
const GEQ_GREEN = "#0C483E";
const TIP_HIDE_DELAY_MS = 120;

const FULL_FIELDS: readonly LedgerField[] = ["requested", "secured", "delivered", "received"];
const COMPACT_FIELDS: readonly LedgerField[] = ["secured", "delivered", "received"];

function useLedgerFlash(ledger: Ledger) {
  const root = useRef<HTMLDivElement>(null);
  const rest = ledgerRest(ledger);
  const key = `${ledger.requested}/${ledger.secured}/${ledger.delivered}/${ledger.received}/${rest.field}:${rest.value}`;
  const previous = useRef(key);

  useEffect(() => {
    if (previous.current === key) return;
    previous.current = key;
    const geqs = root.current?.querySelectorAll<HTMLElement>("[data-geq]");
    if (!geqs || geqs.length === 0) return;
    const reduce = window.matchMedia(MQ.reduced).matches;
    const flash = gsap.timeline();
    if (reduce) {
      flash.set(geqs, { color: GEQ_GREEN }).set(geqs, { color: GEQ_GREY }, 0.6);
    } else {
      flash
        .to(geqs, { color: GEQ_GREEN, duration: duration.fast, ease: gsapEase.snap })
        .to(geqs, { color: GEQ_GREY, duration: duration.roll, ease: gsapEase.snap }, 0.6);
    }
    return () => {
      flash.kill();
      gsap.set(geqs, { clearProps: "color" });
    };
  }, [key]);

  return root;
}

type TipControls = {
  open: PlateField | null;
  show: (field: PlateField) => void;
  hideSoon: () => void;
  hideNow: () => void;
  keep: () => void;
};

function useTooltip(): TipControls {
  const [open, setOpen] = useState<PlateField | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (open === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return {
    open,
    show(field) {
      clearTimeout(timer.current);
      setOpen(field);
    },
    hideSoon() {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setOpen(null), TIP_HIDE_DELAY_MS);
    },
    hideNow() {
      clearTimeout(timer.current);
      setOpen(null);
    },
    keep() {
      clearTimeout(timer.current);
    },
  };
}

function isMouse(event: ReactPointerEvent) {
  return event.pointerType === "mouse";
}

function LedgerCell({
  field,
  value,
  tipId,
  tip,
  size,
}: {
  field: PlateField;
  value: number;
  tipId: string;
  tip: TipControls;
  size: "lg" | "sm";
}) {
  return (
    <li className="flex">
      <button
        type="button"
        aria-describedby={tipId}
        onPointerEnter={(event) => isMouse(event) && tip.show(field)}
        onPointerLeave={(event) => isMouse(event) && tip.hideSoon()}
        onFocus={() => tip.show(field)}
        onBlur={tip.hideNow}
        className="relative flex cursor-help flex-col items-start gap-1 rounded-[8px] text-left after:absolute after:-inset-x-1.5 after:-inset-y-2 after:content-['']"
      >
        <span className="text-[11px] leading-none whitespace-nowrap text-record-meta">{plate.labels[field]}</span>
        <span className={cx("flex items-baseline font-bold text-record-fg", size === "lg" ? "text-[22px]" : "text-[18px]")}>
          <DigitRoll value={value} />
          <span className="ml-px text-[0.55em] font-normal text-record-meta">{plate.unit}</span>
        </span>
      </button>
    </li>
  );
}

function Geq({ size }: { size: "lg" | "sm" }) {
  return (
    <li aria-hidden="true" data-geq className={cx("flex items-center self-end text-[13px] leading-none text-grey-500", size === "lg" ? "h-[22px] -translate-y-[3px]" : "h-[18px] -translate-y-[2px]")}>
      {plate.geq}
    </li>
  );
}

/** A flap of all four tiles: 3 staggers + 5 steps of 60ms, plus a margin. A change inside it is a fling. */
const FLAP_RUN_MS = 600;

type FlapState = { clock: string; text: string; serial: number; running: boolean };

/**
 * Which SplitFlapText instance shows the clock: the same one flaps from the
 * time on screen; a new one (the serial bumps) snaps straight to the time.
 * Snaps when the story jumps several steps (End, a nav jump) or when a change
 * lands while the last flap still runs (a fast fling), so the tiles never
 * step through times the story never shows (clockMotion).
 */
function useClockFlap(beatClock: string, text: string): number {
  const [flap, setFlap] = useState<FlapState>({ clock: beatClock, text, serial: 0, running: false });
  if (flap.text !== text) {
    const snap = clockMotion(flap.clock, beatClock, flap.running) === "snap";
    setFlap({ clock: beatClock, text, serial: snap ? flap.serial + 1 : flap.serial, running: true });
  }
  useEffect(() => {
    if (!flap.running) return;
    const timer = setTimeout(() => setFlap((current) => (current === flap ? { ...current, running: false } : current)), FLAP_RUN_MS);
    return () => clearTimeout(timer);
  }, [flap]);
  return flap.serial;
}

function PlateClock({ size, live }: { size: "lg" | "sm"; live: boolean }) {
  const reduced = usePrefersReducedMotion();
  const beatClock = useStorySelector((s) => chromeFor(s).clock);
  const isNow = beatClock === "now";
  const now = useNowClock(isNow, live);
  const text = isNow ? now : beatClock;
  const fontSize = size === "lg" ? 28 : 20;
  const flapSerial = useClockFlap(beatClock, text);

  return (
    <span className="flex items-center gap-2" data-plate-clock data-value={text}>
      {reduced ? (
        <span className="font-bold tabular-nums text-record-fg" style={{ fontSize, lineHeight: 1.16 }}>
          {text}
        </span>
      ) : (
        <SplitFlapText
          key={flapSerial}
          text={text}
          charset={CLOCK_FLAP_DIGITS}
          staticChars=":"
          fontSize={fontSize}
          flipDuration={0.06}
          stagger={0.06}
          flipsPerChar={4}
          gap={size === "lg" ? 3 : 2}
          tileRadius={size === "lg" ? 6 : 5}
          tileColor="#E4E3DA"
          textColor="#101010"
          splitColor="#D7D7D7"
          loop={false}
        />
      )}
      {isNow ? <span className="text-[13px] leading-none text-record-meta">{plate.now}</span> : null}
    </span>
  );
}

/**
 * `live`: the plate is on screen. The 지금 clock only ticks while it is, so a
 * hidden plate (phones, the closed sheet, the footer) never re-renders on the
 * minute.
 */
export function RecordPlate({ variant, live = true, className }: { variant: PlateVariant; live?: boolean; className?: string }) {
  const ledger = useStorySelector(currentLedger);
  const root = useLedgerFlash(ledger);
  const tip = useTooltip();
  const uid = useId();
  const rest = ledgerRest(ledger);
  const compact = variant === "compact";
  const fields = compact ? COMPACT_FIELDS : FULL_FIELDS;
  const tipFields: readonly PlateField[] = compact ? COMPACT_FIELDS : [...FULL_FIELDS, rest.field];
  const tipId = (field: PlateField) => `${uid}-tip-${field}`;

  return (
    <div
      ref={root}
      data-plate={variant}
      className={cx(
        "au-paper au-plate relative rounded-card bg-record text-record-fg [--focus:#0C483E]",
        compact ? "w-[280px] px-4 py-3" : "px-5 py-4",
        className,
      )}
    >
      <p className="sr-only" data-plate-summary>
        {plateSummary(ledger)}
      </p>

      {compact ? (
        <div className="flex items-center justify-between gap-3">
          <PlateClock size="sm" live={live} />
          <ul className="flex items-end gap-2">
            {fields.map((field, index) => (
              <Fragment key={field}>
                {index > 0 ? <Geq size="sm" /> : null}
                <LedgerCell field={field} value={ledger[field]} tipId={tipId(field)} tip={tip} size="sm" />
              </Fragment>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <PlateClock size="lg" live={live} />
            <span className="inline-flex h-6 shrink-0 items-center rounded-pill border border-ink px-2.5 text-[12px] leading-none font-bold whitespace-nowrap text-ink">
              {ledger.status}
            </span>
          </div>
          <p className="mt-2 text-[13px] leading-[1.6] text-record-meta">{plate.item}</p>
          <div className="mt-3 flex items-end justify-between gap-3">
            <ul className="flex items-end gap-1.5">
              {fields.map((field, index) => (
                <Fragment key={field}>
                  {index > 0 ? <Geq size="lg" /> : null}
                  <LedgerCell field={field} value={ledger[field]} tipId={tipId(field)} tip={tip} size="lg" />
                </Fragment>
              ))}
            </ul>
            <ul className="flex">
              <LedgerCell field={rest.field} value={rest.value} tipId={tipId(rest.field)} tip={tip} size="lg" />
            </ul>
          </div>
        </>
      )}

      {tipFields.map((field) => (
        <span
          key={field}
          id={tipId(field)}
          role="tooltip"
          hidden={tip.open !== field}
          onPointerEnter={tip.keep}
          onPointerLeave={(event) => isMouse(event) && tip.hideSoon()}
          className={cx(
            "absolute inset-x-2 z-10 rounded-2xl bg-ink px-3.5 py-2.5 text-[13px] leading-[1.5] text-surface",
            variant === "sheet" ? "top-[calc(100%+8px)]" : "bottom-[calc(100%+8px)]",
          )}
        >
          <span className="font-bold">{plate.labels[field]}</span> {PLATE_TOOLTIPS[field]}
        </span>
      ))}
    </div>
  );
}
