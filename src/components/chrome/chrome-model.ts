import { fill, plate, signup } from "@/content/copy";
import { BEAT_ORDER, BEATS, SECTION_DEFAULT_BEAT, type BeatId, type Ledger, type RecordId, type SectionId, type StoryRecord } from "@/content/story";
import type { RailEntry } from "@/lib/story/derive";
import type { VisitorDraft, VisitorRecord } from "@/lib/story/store";

/**
 * Pure helpers for the record chrome (spec 5.2 to 5.4): what an entry says,
 * where it scrolls, how removed entries linger for their exit fade, what the
 * live region announces and the plate's text. No React, no DOM.
 */

export type ChromeEntry =
  | { kind: "story"; key: RecordId; record: StoryRecord }
  | { kind: "visitor"; key: string; record: VisitorRecord }
  | { kind: "draft"; key: "draft"; lines: readonly string[] };

export const DRAFT_KEY = "draft";

/** Rail entries in order (oldest first), then the visitor's draft when the signup section asks for it. */
export function toChromeEntries(entries: readonly RailEntry[], draft: VisitorDraft, showDraft: boolean): ChromeEntry[] {
  const mapped = entries.map(
    (entry): ChromeEntry =>
      entry.type === "story"
        ? { kind: "story", key: entry.record.id, record: entry.record }
        : { kind: "visitor", key: entry.record.id, record: entry.record },
  );
  if (showDraft && draft !== null) mapped.push({ kind: "draft", key: DRAFT_KEY, lines: draft.lines });
  return mapped;
}

export function entryKey(entry: ChromeEntry): string {
  return entry.key;
}

/** The section where the entry happened: rail cards scroll there. */
export function entryTarget(entry: ChromeEntry): SectionId {
  if (entry.kind === "story") return entry.record.section;
  if (entry.kind === "draft") return "signup";
  return entry.record.kind === "answer-wait" ? "trust" : "signup";
}

/** The beat that adds each story record (spec 3.3). */
const RECORD_BEAT = Object.fromEntries(BEAT_ORDER.flatMap((beat) => BEATS[beat].adds.map((id) => [id, beat]))) as Record<RecordId, BeatId>;

export type EntryJump = { section: SectionId; at: "start" | "end" };

/**
 * Where activating an entry scrolls: its section, at the start, or at the end
 * when the section opens on an earlier beat than the record's (route opens at
 * 23:30, so 03:06 only exists once the round has run). Landing on the start
 * there would rewind the story and erase the record the visitor picked.
 */
export function entryJump(entry: ChromeEntry): EntryJump {
  if (entry.kind !== "story") return { section: entryTarget(entry), at: "start" };
  const section = entry.record.section;
  const later = BEAT_ORDER.indexOf(RECORD_BEAT[entry.record.id]) > BEAT_ORDER.indexOf(SECTION_DEFAULT_BEAT[section]);
  return { section, at: later ? "end" : "start" };
}

/** 업무 기록 in the list: messages (the 03:07 bubble) are not records (spec 6.4, product 4.12). */
export function recordCount(entries: readonly RailEntry[]): number {
  return entries.reduce((count, entry) => (entry.type === "story" && entry.record.kind === "message" ? count : count + 1), 0);
}

/** Meta line in the app format: 업무 기록 · 03:06, 신청 기록 · 09:58, 신청 기록 · 지금. */
export function entryMeta(entry: ChromeEntry): string {
  if (entry.kind === "story") return fill(plate.recordMeta, { time: entry.record.time });
  if (entry.kind === "draft") return signup.draft.meta;
  return entry.record.meta;
}

export function entryTitle(entry: ChromeEntry): string {
  if (entry.kind === "draft") return signup.draft.title;
  return entry.record.title;
}

/** Optional second line: the app's detail line, or the success line of the visitor's 사전 신청. */
export function entryDetail(entry: ChromeEntry): string | undefined {
  if (entry.kind === "story") return entry.record.detail;
  if (entry.kind === "visitor" && entry.record.kind === "signup") return signup.success.line;
  return undefined;
}

/** Records that change the denim ledger get the live outline on enter (spec 5.2). */
export function entryMovesLedger(entry: ChromeEntry): boolean {
  return entry.kind === "story" && entry.record.movesLedger;
}

/* ---------- Presence: removed entries fade out before they leave the list ---------- */

export type Presence<T extends { key: string }> = { item: T; exiting: boolean };

/**
 * Merge the next list into what is on screen. Live entries follow `next`
 * exactly; entries that left stay where they were, flagged exiting, until
 * dropExited removes them. A key that returns while exiting is live again.
 * With keepExiting false (reduced motion), removed entries go at once.
 */
export function reconcilePresence<T extends { key: string }>(
  prev: readonly Presence<T>[],
  next: readonly T[],
  keepExiting: boolean,
): Presence<T>[] {
  const nextIndex = new Map<string, number>();
  next.forEach((entry, index) => nextIndex.set(entry.key, index));

  const result: Presence<T>[] = [];
  const placed = new Set<string>();
  let cursor = 0;

  const placeUpTo = (index: number) => {
    while (cursor <= index) {
      const entry = next[cursor];
      cursor += 1;
      if (placed.has(entry.key)) continue;
      placed.add(entry.key);
      result.push({ item: entry, exiting: false });
    }
  };

  for (const shown of prev) {
    const index = nextIndex.get(shown.item.key);
    if (index !== undefined) {
      if (index >= cursor) placeUpTo(index);
      continue;
    }
    if (keepExiting && !placed.has(shown.item.key)) {
      placed.add(shown.item.key);
      result.push({ item: shown.item, exiting: true });
    }
  }
  placeUpTo(next.length - 1);
  return result;
}

/** Remove an entry whose exit fade finished; a revived entry is left alone (same array back). */
export function dropExited<T extends { key: string }>(list: readonly Presence<T>[], key: string): Presence<T>[] {
  const index = list.findIndex((entry) => entry.item.key === key && entry.exiting);
  if (index === -1) return list as Presence<T>[];
  return [...list.slice(0, index), ...list.slice(index + 1)];
}

/* ---------- Live region ---------- */

/** The newest entry added since `prevKeys` (the draft never counts), or null. */
export function newestAddedEntry(prevKeys: readonly string[], next: readonly ChromeEntry[]): ChromeEntry | null {
  const before = new Set(prevKeys);
  for (let index = next.length - 1; index >= 0; index -= 1) {
    const entry = next[index];
    if (entry.kind === "draft" || before.has(entry.key)) continue;
    return entry;
  }
  return null;
}

/** Title of the newest added entry: what the rail's live region says. */
export function announcementFor(prevKeys: readonly string[], next: readonly ChromeEntry[]): string | null {
  const entry = newestAddedEntry(prevKeys, next);
  return entry ? entryTitle(entry) : null;
}

/* ---------- Plate text ---------- */

export type LedgerField = "requested" | "secured" | "delivered" | "received";
export type RestField = "backorder" | "unconfirmed";
export type LedgerRest = { field: RestField; value: number };

/** 남은 미송 once a result is shared, 미확인 before (spec 5.3). */
export function ledgerRest(ledger: Ledger): LedgerRest {
  if (ledger.backorder !== null) return { field: "backorder", value: ledger.backorder };
  return { field: "unconfirmed", value: ledger.unconfirmed ?? ledger.requested - ledger.secured };
}

/** Visually hidden sentence: 와이드 데님 팬츠 기록: 요청 6장, 확보 2장, 전달 2장, 수령 2장, 남은 미송 4장. */
export function plateSummary(ledger: Ledger): string {
  const rest = ledgerRest(ledger);
  return fill(plate.summary, {
    requested: ledger.requested,
    secured: ledger.secured,
    delivered: ledger.delivered,
    received: ledger.received,
    rest: plate.labels[rest.field],
    restValue: rest.value,
  });
}

export type PillLead = "secured" | "delivered" | "received";

/**
 * The ledger stage the mobile pill leads with: the latest one that moved, so
 * the 05:53 delivery and the 08:49 receipt change a number on phones too, as
 * they do on the desktop plate (확보 until 05:53, then 전달, then 수령).
 */
export function pillLead(ledger: Ledger): PillLead {
  if (ledger.received > 0) return "received";
  if (ledger.delivered > 0) return "delivered";
  return "secured";
}

/**
 * Mobile pill line: 확보 2 · 남은 미송 4 (확보 0 · 미확인 6 before 03:06), then
 * 전달 2 · 남은 미송 4 from 05:53 and 수령 2 · 남은 미송 4 from 08:49. The lead
 * slot keeps its shape (a two-syllable label and the count), so nothing reflows.
 */
export function pillSummary(ledger: Ledger): string {
  const rest = ledgerRest(ledger);
  const lead = pillLead(ledger);
  if (lead !== "secured") return `${plate.labels[lead]} ${ledger[lead]} · ${plate.labels[rest.field]} ${rest.value}`;
  if (rest.field === "unconfirmed") {
    return fill(plate.pill.summaryUnconfirmed, { secured: ledger.secured, unconfirmed: rest.value });
  }
  return fill(plate.pill.summary, { secured: ledger.secured, backorder: rest.value });
}

/* ---------- Clock ---------- */

/** Beat clocks in story order, each once: 22:00, 23:30, 02:16, 03:06, 03:07, 05:53, 08:49, 09:41, now. */
const CLOCK_STEPS: readonly string[] = [...new Set(BEAT_ORDER.map((beat) => BEATS[beat].clock))];

/** Story steps between two beat clocks ("now" is the last step); Infinity for a clock outside the story. */
export function clockSteps(from: string, to: string): number {
  const a = CLOCK_STEPS.indexOf(from);
  const b = CLOCK_STEPS.indexOf(to);
  return a === -1 || b === -1 ? Number.POSITIVE_INFINITY : Math.abs(a - b);
}

/**
 * How the plate's split-flap clock reaches a new beat clock: a flap for one
 * story step at rest (the 지금 minute tick included), a snap to the new time
 * when the jump spans several steps or lands while a flap still runs (a fast
 * fling), so the tiles never step through times the story never shows.
 */
export function clockMotion(from: string, to: string, flapRunning: boolean): "flap" | "snap" {
  return flapRunning || clockSteps(from, to) > 1 ? "snap" : "flap";
}

/**
 * The digits a flapping tile passes through on its way to the target. Every
 * tile of HH:MM accepts 0, 1 and 2 (hours 00 to 22, minutes 00 to 29), so a
 * clock mid-flap always reads as a real time: never 33:05 or 53:05.
 */
export const CLOCK_FLAP_DIGITS = "012";

/** Visitor-local HH:MM, 24-hour (the signup section's 지금 clock). */
export function formatClock(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function msToNextMinute(date: Date): number {
  return 60_000 - (date.getSeconds() * 1000 + date.getMilliseconds());
}

/* ---------- Sheet ---------- */

/** A downward swipe on the sheet's handle of at least this many px closes it (spec 5.4). */
export const SWIPE_CLOSE_PX = 80;

export function shouldCloseSheet(dy: number): boolean {
  return dy >= SWIPE_CLOSE_PX;
}
