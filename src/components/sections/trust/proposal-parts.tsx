import type { ReactNode, Ref } from "react";

import { AppIcon } from "@/components/icons/AppIcon";
import { trust } from "@/content/copy";
import { cn } from "@/lib/cn";

import { PhraseSpans } from "./lines";

/**
 * Presentational pieces of the S8 proposal block, shared by the server's
 * static first paint (index.tsx) and the client Motion leaf (ProposalBlock),
 * so the swap between them changes nothing on screen. No hooks, no state.
 *
 * The panes are typographic paper objects set with the app's strings, never
 * imitations of a phone screen (spec 2, pixel rule): each is labelled with
 * whose screen it stands for.
 */

const { proposal } = trust;

export const BUTTON_PRIMARY =
  "inline-flex h-[52px] w-full items-center justify-center rounded-pill bg-green-800 px-5 text-[15px] leading-none font-bold text-surface transition-[scale,background-color] duration-(--duration-fast) ease-snap hover:bg-green-900 active:scale-[0.98]";

export const BUTTON_WEAK =
  "inline-flex h-[52px] w-full items-center justify-center rounded-pill bg-accent-weak px-5 text-[15px] leading-none font-bold text-green-800 transition-[scale,background-color] duration-(--duration-fast) ease-snap hover:bg-[rgb(12_72_62/0.18)] active:scale-[0.98]";

export const BUTTON_TEXT =
  "-mx-2 inline-flex h-11 items-center gap-1.5 rounded-pill px-2 text-[15px] leading-none font-bold text-green-800 underline decoration-green-800/30 underline-offset-4 transition-[text-decoration-color,scale] duration-(--duration-fast) ease-snap hover:decoration-green-800 active:scale-[0.98]";

/** The sheet: H3, the two panes side by side from 768px, an optional footer, the sample line. */
export function ProposalSheet({
  retailer,
  counterpart,
  footer,
  phase,
  sheetRef,
}: {
  retailer: ReactNode;
  counterpart: ReactNode;
  footer?: ReactNode;
  phase: string;
  sheetRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={sheetRef}
      className="rounded-card bg-surface p-4 shadow-float sm:p-8 lg:p-10"
      data-proposal=""
      data-proposal-phase={phase}
    >
      <h3 className="text-heading-md font-bold text-ink">{proposal.h3}</h3>
      <div className="mt-5 grid items-stretch gap-5 md:mt-8 md:grid-cols-2 md:gap-5">
        {retailer}
        {counterpart}
      </div>
      {footer}
      <p className="mt-5 text-caption text-grey-600 md:mt-6">{trust.sample}</p>
    </div>
  );
}

/**
 * One side's pane: whose screen it is (store icon for 소매업자, bag for 사입삼촌)
 * over its body. A ghost pane (the counterpart before a cancel) has a dashed,
 * unfilled body: it stands for the other phone, which this visitor never
 * operates. Hidden below 768px, where the panes stack.
 */
export function Pane({
  side,
  children,
  ghost = false,
  className,
  bodyClassName,
  live,
}: {
  side: "retailer" | "counterpart";
  children?: ReactNode;
  ghost?: boolean;
  className?: string;
  bodyClassName?: string;
  /** Polite announcements for the replay (counterpart pane). */
  live?: ReactNode;
}) {
  const label = side === "retailer" ? proposal.retailerPane : proposal.replay.pane;
  return (
    <div
      role="group"
      aria-label={label}
      data-pane={side}
      data-ghost={ghost ? "" : undefined}
      className={cn("flex min-w-0 flex-col gap-2.5 md:gap-3", ghost && "max-md:hidden", className)}
    >
      <p className="flex items-center gap-1.5 text-[13px] leading-none font-bold text-grey-700" aria-hidden="true">
        <AppIcon name={side === "retailer" ? "store" : "bag"} size={16} className="text-green-800" />
        {label}
      </p>
      <div
        className={cn(
          "relative flex flex-1 flex-col overflow-hidden rounded-[20px] p-4 sm:p-5",
          ghost ? "trust-pane-ghost min-h-40" : "bg-paper",
          bodyClassName,
        )}
      >
        {children}
      </div>
      {live}
    </div>
  );
}

/** The retailer's question (app 미송 답변 screen, strings verbatim): rows, note, the two answers. */
export function AskContent({
  onWait,
  onCancel,
  questionRef,
}: {
  onWait?: () => void;
  onCancel?: () => void;
  questionRef?: Ref<HTMLParagraphElement>;
}) {
  return (
    <div className="flex flex-1 flex-col gap-3.5 md:gap-4" data-ask="">
      <p ref={questionRef} tabIndex={-1} data-focus-key="question" className="text-[19px] leading-[1.4] font-bold text-ink outline-none">
        {proposal.question}
      </p>
      <dl className="flex flex-col gap-2 rounded-2xl bg-surface px-3.5 py-3 md:gap-2.5 md:px-4 md:py-3.5">
        {proposal.rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-4">
            <dt className="text-[15px] text-grey-700">{row.label}</dt>
            <dd className="text-[17px] font-bold text-ink tabular-nums">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[14px] leading-[1.6] text-grey-700">
        <PhraseSpans text={proposal.note} />
      </p>
      <div className="mt-auto flex flex-col gap-2.5 pt-2">
        <button type="button" onClick={onCancel} className={BUTTON_WEAK} data-focus-key="cancel" data-action="requestCancel">
          {proposal.cancel}
        </button>
        <button type="button" onClick={onWait} className={BUTTON_PRIMARY} data-focus-key="wait" data-action="wait">
          {proposal.wait}
        </button>
      </div>
    </div>
  );
}

/**
 * The counterpart's screen before a cancel: 동대문 박삼촌's home at 09:41
 * (10-uncle-home.png), the denim waiting on the retailer's answer. After the
 * visitor answers 기다리기 only the product line stays, dimmed: no uncle-side
 * status for that moment is verified, so none is shown.
 */
export function CounterpartIdle({ answered = false }: { answered?: boolean }) {
  const { counterpartIdle: idle } = proposal;
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-paper px-4 py-4" data-counterpart-idle={answered ? "answered" : "waiting"}>
      {answered ? null : (
        <p className="flex items-center justify-between gap-3 text-[15px] leading-[1.4] font-bold text-ink">
          {idle.status}
          <AppIcon name="clock" size={18} className="shrink-0 text-green-800" />
        </p>
      )}
      <div className="flex items-center gap-3">
        <AppIcon name="shirt" size={20} className={cn("shrink-0", answered ? "text-grey-500" : "text-grey-700")} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className={cn("text-[15px] leading-[1.4] font-bold", answered ? "text-grey-600" : "text-ink")}>{idle.product}</p>
          <p className="text-[13px] leading-[1.5] text-grey-600">{answered ? idle.option : `${idle.option} · ${idle.reply}`}</p>
        </div>
      </div>
    </div>
  );
}

/** The cancel proposal's detail lines, the same record on both sides. */
export function ProposalDetail({ status, ledger }: { status: ReactNode; ledger: ReactNode }) {
  const { cancelOutcome } = proposal;
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-surface px-4 py-4">
      <div className="min-h-6">{status}</div>
      <p className="text-[14px] leading-[1.5] text-grey-800 tabular-nums" data-ledger-line="">
        {ledger}
      </p>
      <p className="text-[15px] font-bold text-ink">{cancelOutcome.quantity}</p>
      <div className="flex flex-col gap-1">
        <p className="text-[13px] leading-[1.5] text-grey-600">{cancelOutcome.reasonLabel}</p>
        <p className="text-[14px] leading-[1.55] text-ink">
          <PhraseSpans text={cancelOutcome.reason} />
        </p>
      </div>
    </div>
  );
}
