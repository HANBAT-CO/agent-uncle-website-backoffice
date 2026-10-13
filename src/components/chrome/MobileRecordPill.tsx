"use client";

import { fill, plate } from "@/content/copy";
import { chromeFor, currentLedger, railEntries } from "@/lib/story/derive";
import { useStorySelector } from "@/lib/story/use-story";

import { pillSummary, recordCount } from "./chrome-model";
import { useHeroCtasOut, useNowClock } from "./hooks";

/**
 * The record below 1024px (spec 5.4): a 48px paper pill fixed bottom centre
 * above the safe area with the clock, 확보 n · 남은 미송 n and 기록 n (업무 기록
 * only: the 03:07 message is not counted). The lead slot follows the latest
 * ledger change (전달 2 from 05:53, 수령 2 from 08:49; pillSummary). Paper in both phases. It shows where
 * chromeFor().pill says so, and only once the hero CTAs have left the viewport
 * (they are still on screen while words takes over the centre line). Tapping
 * it opens the sheet.
 *
 * Shown and hidden by a 700ms transform (chrome.css), never by layout. While
 * hidden, the whole landmark is inert: out of the accessibility tree and out
 * of the tab order (aria-hidden alone would leave a focusable button inside a
 * hidden landmark, WCAG 4.1.2), and the clock stops ticking.
 *
 * The button's name starts with 업무 기록 and then holds the visible text in
 * order (WCAG 2.5.3). The spaces between the parts are real text nodes: a
 * flex row never renders them, but name checks that read the visible text
 * (axe label-content-name-mismatch) would otherwise see 03:07확보 2 run
 * together. Test hook: [data-record-pill][data-visible].
 */
export function MobileRecordPill({ onOpenSheet }: { onOpenSheet: (opener: HTMLElement) => void }) {
  const chrome = useStorySelector(chromeFor);
  const ledger = useStorySelector(currentLedger);
  const count = useStorySelector((s) => recordCount(railEntries(s)));
  const ctasOut = useHeroCtasOut();

  const visible = chrome.pill === "show" && ctasOut;
  const now = useNowClock(chrome.clock === "now", visible);
  const clock = chrome.clock === "now" ? now : chrome.clock;
  const summary = pillSummary(ledger);
  const countText = fill(plate.pill.count, { count });

  return (
    <aside aria-label={plate.label} aria-hidden={visible ? undefined : true} inert={!visible || undefined} className="au-scope lg:hidden">
      <div
        data-record-pill
        data-visible={visible ? "" : undefined}
        className="au-mpill fixed bottom-[calc(16px+env(safe-area-inset-bottom))] left-1/2 z-(--z-sticky) w-max max-w-[calc(100vw-32px)]"
      >
        <button
          type="button"
          aria-haspopup="dialog"
          // The name in parts, every visible piece in order: 업무 기록, 03:07, 확보 2 · 남은 미송 4, 기록 4.
          aria-label={[plate.label, clock, summary, countText].join(", ")}
          onClick={(event) => onOpenSheet(event.currentTarget)}
          className="au-paper flex h-12 items-center gap-3 rounded-pill bg-record pr-2 pl-5 text-record-fg transition-[scale] duration-(--duration-fast) ease-snap select-none active:scale-[0.98]"
        >
          <span className="text-[15px] leading-none font-bold tabular-nums">{clock}</span>{" "}
          <span aria-hidden="true" className="h-4 w-px bg-grey-200" />{" "}
          {/* Keyed by the line, so each ledger change replays the brief green mark (chrome.css), as the plate's ≥ do. */}
          <span key={summary} data-pill-summary className="au-pill-summary text-[13px] leading-none whitespace-nowrap text-grey-800 tabular-nums">
            {summary}
          </span>{" "}
          <span className="inline-flex h-8 items-center rounded-pill bg-[rgb(12_72_62/0.12)] px-3 text-[13px] leading-none font-bold whitespace-nowrap text-green-800">
            {countText}
          </span>
        </button>
      </div>
    </aside>
  );
}
