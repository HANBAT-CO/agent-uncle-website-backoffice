import { describe, expect, it } from "vitest";

import { cubicBezier, easing } from "./motion";

/** Reference: sample the parametric curve densely and read y at x (no solver involved). */
function reference([x1, y1, x2, y2]: readonly [number, number, number, number], x: number): number {
  const bez = (t: number, p1: number, p2: number) => 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    if (bez(mid, x1, x2) < x) lo = mid;
    else hi = mid;
  }
  return bez((lo + hi) / 2, y1, y2);
}

describe("cubicBezier", () => {
  it("pins both ends", () => {
    for (const curve of Object.values(easing)) {
      const ease = cubicBezier(curve);
      expect(ease(0)).toBe(0);
      expect(ease(1)).toBe(1);
    }
  });

  it("matches the CSS curve to within 1e-4 across the range for every token", () => {
    for (const curve of Object.values(easing)) {
      const ease = cubicBezier(curve);
      for (let i = 1; i < 100; i += 1) {
        const x = i / 100;
        expect(Math.abs(ease(x) - reference(curve, x))).toBeLessThan(1e-4);
      }
    }
  });

  it("overshoots past 1 for the overshoot token, like the CSS curve", () => {
    const ease = cubicBezier(easing.overshoot);
    const peak = Math.max(...Array.from({ length: 99 }, (_, i) => ease((i + 1) / 100)));
    expect(peak).toBeGreaterThan(1.05);
  });

  it("is the identity for a linear curve", () => {
    const ease = cubicBezier([0, 0, 1, 1]);
    for (const x of [0.1, 0.33, 0.5, 0.9]) expect(ease(x)).toBeCloseTo(x, 6);
  });
});
