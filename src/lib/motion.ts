/**
 * Motion tokens shared by CSS, GSAP and `motion` (spec 6.2). Mirrors the
 * `--ease-*` and `--duration-*` custom properties in src/app/(site)/globals.css;
 * change both together.
 *
 * - record: any discrete state change (captions, badges, entries, label
 *   swaps, seam snap): duration.record on easing.snap
 * - roll: numbers in digit cells: duration.roll on easing.outExpo
 * - drop settle (dot landing) and pops: easing.overshoot
 * - follow (pointer): gsap.quickTo 0.45s power3.out, or a spring k100 c18 m1
 * Scrubs use ease "none". Nothing else is linear.
 */

export type CubicBezier = readonly [number, number, number, number];

export const easing = {
  /** Long, soft landing. Default for reveals and number rolls. */
  outExpo: [0.16, 1, 0.3, 1],
  outQuart: [0.25, 1, 0.5, 1],
  inOutQuart: [0.76, 0, 0.24, 1],
  /** Quick start, firm settle. The record token: sheets, toggles, entries, captions. */
  snap: [0.32, 0.72, 0, 1],
  /** Lands past the target and settles back: tag pops, the dot's drop settle. */
  overshoot: [0.34, 1.56, 0.64, 1],
} as const satisfies Record<string, CubicBezier>;

export type EasingName = keyof typeof easing;

/** Seconds (GSAP and motion both take seconds). */
export const duration = {
  fast: 0.16,
  base: 0.24,
  slow: 0.48,
  reveal: 0.9,
  /** Any discrete state change. */
  record: 0.7,
  /** Digit rolls. */
  roll: 0.3,
} as const;

/** GSAP ease names registered in src/lib/gsap.ts, e.g. `ease: gsapEase.outExpo`. */
export const gsapEase = {
  outExpo: "au.outExpo",
  outQuart: "au.outQuart",
  inOutQuart: "au.inOutQuart",
  snap: "au.snap",
  overshoot: "au.overshoot",
} as const satisfies Record<EasingName, string>;

/** "0.16,1,0.3,1" style string (the CSS cubic-bezier() arguments). */
export function bezierString(curve: CubicBezier): string {
  return curve.join(",");
}

/**
 * The CSS cubic-bezier(x1, y1, x2, y2) timing function as (x) => y, so GSAP
 * can use the same curves through gsap.registerEase without CustomEase (and
 * its SVG path utilities) in the initial bundle. x is solved for the curve
 * parameter with Newton steps, falling back to bisection where the slope is
 * flat; accurate to well under 1e-4 for every token above (motion.test.ts).
 */
export function cubicBezier([x1, y1, x2, y2]: CubicBezier): (x: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  const solve = (x: number): number => {
    let t = x;
    for (let i = 0; i < 8; i += 1) {
      const error = sampleX(t) - x;
      if (Math.abs(error) < 1e-7) return t;
      const slope = slopeX(t);
      if (Math.abs(slope) < 1e-6) break;
      t -= error / slope;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 40; i += 1) {
      const value = sampleX(t);
      if (Math.abs(value - x) < 1e-7) return t;
      if (value < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };

  return (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : sampleY(solve(x)));
}
