/**
 * Chapter math for the S9 film timeline (spec S9). Pure, so the server
 * renders the ticks and the player seeks with the same numbers.
 *
 * Chapters come from src/content/generated/film.json (WP-03 reads them from
 * video/src/timeline.ts MASTER.chapters). A tick sits at its chapter's start
 * as a percent of the film's duration; a chapter runs until the next one
 * starts, and the last one until the end of the film.
 */

import type { FilmChapter } from "@/content/media";

export type ChapterTick = {
  /** Position in timeline order (0-based). */
  index: number;
  label: string;
  /** Seconds. */
  start: number;
  /** Seconds: the next chapter's start, or the film's duration for the last one. */
  end: number;
  /** Start as a percent of the duration, 0 to 100. */
  percent: number;
};

/**
 * Ticks in timeline order. Throws when the data cannot sit on a timeline
 * (a non-positive duration, a start outside [0, duration), two chapters on
 * the same start): film.json is generated, so bad data is a build error.
 */
export function chapterTicks(chapters: readonly FilmChapter[], duration: number): ChapterTick[] {
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`film chapters: duration must be a positive number of seconds, got ${duration}`);
  }

  const ordered = chapters.toSorted((a, b) => a.start - b.start);
  ordered.forEach((chapter, index) => {
    if (!Number.isFinite(chapter.start) || chapter.start < 0 || chapter.start >= duration) {
      throw new Error(`film chapters: ${chapter.label} starts at ${chapter.start}s, outside the ${duration}s film`);
    }
    const previous = ordered[index - 1];
    if (previous && previous.start === chapter.start) {
      throw new Error(`film chapters: ${previous.label} and ${chapter.label} have the same start (${chapter.start}s)`);
    }
  });

  return ordered.map((chapter, index) => ({
    index,
    label: chapter.label,
    start: chapter.start,
    end: ordered[index + 1]?.start ?? duration,
    percent: (chapter.start / duration) * 100,
  }));
}

/**
 * Index of the chapter playing at `time` (seconds). Starts are inclusive;
 * the last chapter holds through the end of the film and past it. -1 before
 * the first chapter, for a time that is not a number, and with no chapters.
 */
export function activeChapter(ticks: readonly ChapterTick[], time: number): number {
  if (Number.isNaN(time)) return -1;
  let active = -1;
  for (const tick of ticks) {
    if (tick.start > time) break;
    active = tick.index;
  }
  return active;
}

/** Where a tick seeks the master: its chapter start. Indexes outside the list clamp to the ends. */
export function seekTarget(ticks: readonly ChapterTick[], index: number): number {
  if (ticks.length === 0) return 0;
  const clamped = Math.min(ticks.length - 1, Math.max(0, Math.trunc(index)));
  return ticks[clamped].start;
}

/** The playhead as a percent of the duration, clamped to 0..100. Unknown times or durations read as 0. */
export function playheadPercent(time: number, duration: number): number {
  if (!Number.isFinite(time) || !Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(100, Math.max(0, (time / duration) * 100));
}
