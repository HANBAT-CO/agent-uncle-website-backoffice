import {
  BEAT_ORDER,
  BEATS,
  RECORDS,
  SECTION_CHROME,
  SECTION_DEFAULT_BEAT,
  type BeatId,
  type Ledger,
  type Phase,
  type PillMode,
  type PlateMode,
  type RailMode,
  type StoryRecord,
} from "@/content/story";

import type { StoryState, VisitorRecord } from "./store";

/**
 * Pure derivations from the story store (spec 3.3). Everything the chrome
 * shows (clock, ledger, rail, phase, modes) is a function of the store state,
 * which itself is a function of scroll position, so reverse scrolling rewinds
 * the chrome exactly and no entry is ever orphaned.
 */

export type RailEntry = { type: "story"; record: StoryRecord } | { type: "visitor"; record: VisitorRecord };

export type Chrome = { rail: RailMode; plate: PlateMode; pill: PillMode; phase: Phase; clock: string };

/** Visitor records exist only from 09:41 on (the demo night is over). */
const VISITOR_FROM: BeatId = "b0941";

const INDEX: Readonly<Record<BeatId, number>> = Object.fromEntries(BEAT_ORDER.map((id, index) => [id, index])) as Record<
  BeatId,
  number
>;

/**
 * Rail entries per beat, built once. Every call returns the same arrays and
 * entry objects, so selectors stay referentially stable between renders.
 */
const STORY_PREFIX: ReadonlyArray<readonly RailEntry[]> = (() => {
  const prefixes: RailEntry[][] = [];
  let running: RailEntry[] = [];
  for (const id of BEAT_ORDER) {
    const added = BEATS[id].adds.map((recordId): RailEntry => ({ type: "story", record: RECORDS[recordId] }));
    running = [...running, ...added];
    prefixes.push(running);
  }
  return prefixes;
})();

const visitorEntries = new WeakMap<VisitorRecord, RailEntry>();

function visitorEntry(record: VisitorRecord): RailEntry {
  let entry = visitorEntries.get(record);
  if (!entry) {
    entry = { type: "visitor", record };
    visitorEntries.set(record, entry);
  }
  return entry;
}

export function beatIndex(id: BeatId): number {
  return INDEX[id];
}

/** The beat the active section reported, else that section's default. */
export function currentBeatId(s: StoryState): BeatId {
  return s.beats[s.active] ?? SECTION_DEFAULT_BEAT[s.active];
}

function visitorVisible(s: StoryState): boolean {
  return beatIndex(currentBeatId(s)) >= beatIndex(VISITOR_FROM);
}

/** The denim ledger now; the status reads 미송 대기 after the visitor's sample 기다리기 (b0941 on). */
export function currentLedger(s: StoryState): Ledger {
  const ledger = BEATS[currentBeatId(s)].ledger;
  if (visitorVisible(s) && s.visitor.some((record) => record.kind === "answer-wait")) {
    return { ...ledger, status: "미송 대기" };
  }
  return ledger;
}

/** Records up to the current beat (oldest first), then the visitor's records from b0941 on. */
export function railEntries(s: StoryState): readonly RailEntry[] {
  const story = STORY_PREFIX[beatIndex(currentBeatId(s))];
  if (!visitorVisible(s) || s.visitor.length === 0) return story;
  return [...story, ...s.visitor.map(visitorEntry)];
}

/** Chrome modes of the active section plus the current beat's phase and clock ('now' is formatted by the consumer). */
export function chromeFor(s: StoryState): Chrome {
  const beat = BEATS[currentBeatId(s)];
  return { ...SECTION_CHROME[s.active], phase: beat.phase, clock: beat.clock };
}

/**
 * The beat of the last marker at or below `progress` (0..1 of a section's own
 * ScrollTrigger). Progress below every marker maps to the earliest marker.
 */
export function beatForProgress(markers: ReadonlyArray<readonly [number, BeatId]>, progress: number): BeatId | null {
  let best: readonly [number, BeatId] | null = null;
  let first: readonly [number, BeatId] | null = null;
  for (const marker of markers) {
    if (first === null || marker[0] < first[0]) first = marker;
    if (marker[0] <= progress && (best === null || marker[0] >= best[0])) best = marker;
  }
  return (best ?? first)?.[1] ?? null;
}
