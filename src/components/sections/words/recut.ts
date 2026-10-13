/**
 * S2 re-cut timing (spec S2, desktop pin +=120vh, scrub 0.8), pure.
 *
 * The H2 fills on approach, on its own scrub from the section's top at 75%
 * of the viewport to the pin (spec order kept: fill, freeze, drop, flights,
 * closing), so the pin spends no scroll on a dim heading. The pinned
 * timeline is a function of its progress p (0..1):
 *   0-0.18    the pile at rest (grab and throw it)
 *   0.18      freeze: the pile settles, every body static, poses recorded
 *   0.18-0.27 vocabulary pills drop through the floor
 *   0.27-0.82 each bubble flies from its recorded pose to its ledger slot;
 *            at 70% of its flight the phrase scrambles into the token label
 *   0.82-1    closing line
 * Flights, drops, scramble switches and landings are pure functions of p, so
 * a fast reverse scrub can never strand a pill mid-flight: whatever p the
 * scrub reaches, every pill is drawn where that p says.
 */

export const RECUT = {
  freezeAt: 0.18,
  dropStart: 0.18,
  dropEnd: 0.27,
  /** Next drop starts this fraction of a drop after the previous one. */
  dropStagger: 0.3,
  flightsStart: 0.27,
  flightsEnd: 0.82,
  closingStart: 0.82,
  closingEnd: 1,
  /** Fraction of each flight at which the scramble starts. */
  scrambleAt: 0.7,
  /** Next flight starts this fraction of a flight after the previous one. */
  flightStagger: 0.3,
  /** Fraction of a flight by which the pill is level. */
  levelBy: 0.6,
} as const;

export type Window = { readonly start: number; readonly end: number };
export type FlightWindow = Window & { readonly scramble: number };

/** Top-left corner of a pill's box in pit pixels plus its rotation (radians). */
export type Frame = { readonly x: number; readonly y: number; readonly angle: number };

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * n equal tweens staggered by `staggerRatio` of a tween's duration, filling
 * [start, end] exactly: (n - 1) * stagger + duration = end - start.
 */
export function staggerWindows(count: number, start: number, end: number, staggerRatio: number): Window[] {
  const span = end - start;
  const duration = span / (1 + staggerRatio * Math.max(0, count - 1));
  const stagger = staggerRatio * duration;
  return Array.from({ length: count }, (_, index) => {
    const from = start + index * stagger;
    return { start: from, end: index === count - 1 ? end : from + duration };
  });
}

/** The vocabulary drops inside 0.18-0.27, each a short fall. */
export function dropWindows(count: number): Window[] {
  return staggerWindows(count, RECUT.dropStart, RECUT.dropEnd, RECUT.dropStagger);
}

/**
 * How far a vocabulary pill has fallen through the floor at timeline
 * progress p: an accelerating fall (power2.in) of `distance` pixels.
 */
export function dropOffset(progress: number, window: Window, distance: number): number {
  const t = clamp01((progress - window.start) / (window.end - window.start));
  return distance * t * t;
}

/** The six flights inside 0.27-0.82, each with its scramble point at 70%. */
export function flightWindows(count: number): FlightWindow[] {
  return staggerWindows(count, RECUT.flightsStart, RECUT.flightsEnd, RECUT.flightStagger).map((window) => ({
    ...window,
    scramble: window.start + RECUT.scrambleAt * (window.end - window.start),
  }));
}

/** Linear progress of one flight at timeline progress p, clamped to [0, 1]. */
export function flightT(progress: number, window: Window): number {
  return clamp01((progress - window.start) / (window.end - window.start));
}

/** Past the scramble point: the pill shows the token label and skin. */
export function isScrambled(progress: number, window: FlightWindow): boolean {
  return progress >= window.scramble;
}

/** Landed: the ledger's own token takes over from the flying pill. */
export function isLanded(progress: number, window: Window): boolean {
  return progress >= window.end;
}

export function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

function easeOutCubic(t: number): number {
  const x = clamp01(t);
  return 1 - (1 - x) ** 3;
}

/**
 * A pill's frame at flight progress t: the box moves from the recorded pose
 * to the ledger slot on an in-out curve, and the tilt eases out early so the
 * pill is level well before it lands.
 */
export function flightFrame(from: Frame, to: { x: number; y: number }, t: number): Frame {
  const move = easeInOutCubic(t);
  const level = clamp01(t / RECUT.levelBy);
  return {
    x: from.x + (to.x - from.x) * move,
    y: from.y + (to.y - from.y) * move,
    angle: level >= 1 ? 0 : from.angle * (1 - easeOutCubic(level)),
  };
}
