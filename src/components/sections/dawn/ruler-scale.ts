/**
 * The record ruler's time axis (spec S5): one night from 20:00 to 11:00 the
 * next morning, crossing midnight. Pure functions, no DOM.
 *
 * A time maps to `at`, the hours since 20:00 (20:00 -> 0, 00:00 -> 4,
 * 05:53 -> 9.88, 11:00 -> 15). The track places everything at
 * `at * pxPerHour`; a fixed centre playhead reads the time under it, so moving
 * the night forward means translating the track to the left.
 *
 *   const offset = centerOffset("05:53", { pxPerHour: 60, origin: 0 }, playheadX);
 *   track.style.translate = `${offset}px 0`;
 *
 * In CSS the same mapping is `left: calc(var(--at) * var(--ruler-hour))`.
 */

const MINUTES_PER_DAY = 24 * 60;

/** The ruler starts at 20:00 (the request was sent at 20:05). */
export const RULER_START_MINUTES = 20 * 60;

/** Hours from 20:00 to 11:00. */
export const RULER_HOURS = 15;

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "HH:MM" (24-hour, zero-padded) to minutes since midnight. */
export function parseClock(time: string): number {
  const match = CLOCK.exec(time);
  if (!match) throw new RangeError(`Not an HH:MM time: ${JSON.stringify(time)}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Minutes since midnight (any integer, wrapped to one day) to "HH:MM". */
export function formatClock(minutes: number): string {
  const wrapped = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(wrapped / 60);
  return `${String(hours).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
}

/** Hours since 20:00 for a time of the night; a RangeError outside 20:00 to 11:00. */
export function rulerHours(time: string): number {
  const minutes = (parseClock(time) - RULER_START_MINUTES + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  if (minutes > RULER_HOURS * 60) throw new RangeError(`${time} is outside the night (20:00 to 11:00)`);
  return minutes / 60;
}

export type RulerScale = {
  /** Track pixels per hour. */
  pxPerHour: number;
  /** Track x of 20:00. */
  origin: number;
};

/** Track x of a time. */
export function rulerX(time: string, scale: RulerScale): number {
  return scale.origin + rulerHours(time) * scale.pxPerHour;
}

/** Track translation that puts `time` under a playhead at `playheadX` (same coordinate space as the track). */
export function centerOffset(time: string, scale: RulerScale, playheadX: number): number {
  return playheadX - rulerX(time, scale);
}

/** The time under the playhead for a track translation, to the nearest minute. */
export function timeAtPlayhead(offset: number, scale: RulerScale, playheadX: number): string {
  const hours = (playheadX - offset - scale.origin) / scale.pxPerHour;
  return formatClock(RULER_START_MINUTES + hours * 60);
}

export type RulerTick = {
  /** "HH:00" */
  time: string;
  /** Hours since 20:00. */
  at: number;
  /** The hour label ("20", "22", "00", ...) or null for an unlabelled tick. */
  label: string | null;
};

/**
 * One tick per hour from 20:00 to 11:00. `labels` are two-digit hours (the
 * copy's "20", "22", "00", ...); every label must be an hour of the night.
 */
export function hourTicks(labels: readonly string[]): RulerTick[] {
  const ticks: RulerTick[] = [];
  for (let at = 0; at <= RULER_HOURS; at += 1) {
    ticks.push({ time: formatClock(RULER_START_MINUTES + at * 60), at, label: null });
  }
  for (const label of labels) {
    const tick = /^\d\d$/.test(label) ? ticks.find((candidate) => candidate.time === `${label}:00`) : undefined;
    if (!tick) throw new RangeError(`Hour label ${JSON.stringify(label)} is not an hour of the night`);
    tick.label = label;
  }
  return ticks;
}

export type RulerMark = {
  time: string;
  at: number;
  /** Label row under the stroke: close marks alternate rows so their labels never collide. */
  row: 0 | 1;
};

/**
 * Event marks in time order. A mark closer than `minGapHours` to the previous
 * one takes the other label row; otherwise it returns to row 0.
 */
export function eventMarks(times: readonly string[], minGapHours = 1.1): RulerMark[] {
  const sorted = times.map((time) => ({ time, at: rulerHours(time) })).sort((a, b) => a.at - b.at);
  const marks: RulerMark[] = [];
  for (const { time, at } of sorted) {
    const previous = marks.at(-1);
    const crowded = previous !== undefined && at - previous.at < minGapHours;
    marks.push({ time, at, row: crowded && previous.row === 0 ? 1 : 0 });
  }
  return marks;
}
