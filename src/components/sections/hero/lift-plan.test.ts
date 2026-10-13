import { describe, expect, it } from "vitest";

import { COPY_SPAN, dotRectAt, firstContact, liftOffset, liftOpacity, planLift, type LiftInput } from "./lift-plan";

/** Measured on the dev page (1440x900 and 1366x768): origin, dot, end pan and scale, the four text rects. */
const at1440: LiftInput = {
  origin: { x: 636, y: 372.862 },
  dot: { x: -25, y: 93.138 },
  size: 16,
  shift: { x: -163, y: 41 },
  scale: 1.6234,
  tilt: 10,
  perspective: 1200,
  text: [
    { left: 84, top: 534, right: 776, bottom: 609 },
    { left: 84, top: 606, right: 441, bottom: 681 },
    { left: 84, top: 704, right: 631, bottom: 732 },
    { left: 84, top: 764, right: 319, bottom: 816 },
  ],
};

const at1366: LiftInput = {
  origin: { x: 603.44, y: 295.307 },
  dot: { x: -23.44, y: 87.693 },
  size: 16,
  shift: { x: -156, y: 58 },
  scale: 1.4629,
  tilt: 10,
  perspective: 1200,
  text: [
    { left: 84, top: 409, right: 740, bottom: 480 },
    { left: 84, top: 478, right: 422, bottom: 549 },
    { left: 84, top: 572, right: 631, bottom: 600 },
    { left: 84, top: 632, right: 319, bottom: 684 },
  ],
};

const centre = (rect: { left: number; top: number; right: number; bottom: number }) => ({
  x: (rect.left + rect.right) / 2,
  y: (rect.top + rect.bottom) / 2,
});

describe("dotRectAt", () => {
  it("rests at the dot's own place", () => {
    const rect = dotRectAt(at1366, 0);
    expect(centre(rect).x).toBeCloseTo(580, 0);
    expect(centre(rect).y).toBeCloseTo(383, 0);
    expect(rect.bottom - rect.top).toBeCloseTo(16, 5);
  });

  it("matches the browser at the end of the map's dive (perspective, tilt, scale, pan)", () => {
    // Chromium at 1366x768, pin progress 0.6: the dot's centre at 412.04, 482.04.
    const { x, y } = centre(dotRectAt(at1366, 0.6));
    expect(Math.abs(x - 412.04)).toBeLessThan(1);
    expect(Math.abs(y - 482.04)).toBeLessThan(1);
  });

  it("holds the end frame after the map's dive", () => {
    expect(dotRectAt(at1440, 0.8)).toEqual(dotRectAt(at1440, 0.6));
  });
});

describe("lift curves", () => {
  it("fades linearly and rises on an ease-in, both done at the fade's end", () => {
    const plan = { fade: 0.1, rise: 40 };
    expect(liftOpacity(plan, 0)).toBe(1);
    expect(liftOpacity(plan, 0.05)).toBeCloseTo(0.5, 5);
    expect(liftOpacity(plan, 0.2)).toBe(0);
    expect(liftOffset(plan, 0.05)).toBeCloseTo(-10, 5);
    expect(liftOffset(plan, 0.15)).toBe(-40);
  });
});

describe("planLift", () => {
  it("keeps the full window and the full rise where the dot rests far above the H1 (1440x900)", () => {
    expect(planLift(at1440)).toEqual({ fade: COPY_SPAN, rise: 64 });
  });

  it("shortens the fade on a short laptop (1366x768), where a 0.2 fade meets the dot with the text more than half visible", () => {
    const old = { fade: COPY_SPAN, rise: 64 };
    const contactBefore = firstContact(at1366, old, COPY_SPAN);
    expect(contactBefore).not.toBeNull();
    expect(liftOpacity(old, contactBefore ?? 0)).toBeGreaterThan(0.5);

    const plan = planLift(at1366);
    expect(plan.fade).toBeLessThan(COPY_SPAN);
    expect(plan.fade).toBeGreaterThanOrEqual(0.06);
    const contact = firstContact(at1366, plan, COPY_SPAN, 4);
    expect(contact === null || liftOpacity(plan, contact) <= 0.4 + 1e-9).toBe(true);
  });

  it("never lets the dot touch text that is more than 40% visible", () => {
    for (const input of [at1440, at1366]) {
      const plan = planLift(input);
      for (let progress = 0; progress <= COPY_SPAN; progress += 0.001) {
        if (liftOpacity(plan, progress) <= 0.4) break;
        const dot = dotRectAt(input, progress);
        const dy = liftOffset(plan, progress);
        const hit = input.text.some((rect) => dot.left < rect.right && rect.left < dot.right && dot.top < rect.bottom + dy && rect.top + dy < dot.bottom);
        expect(hit, `progress ${progress.toFixed(3)}`).toBe(false);
      }
    }
  });

  it("falls back to the shortest fade without a rise when the dot already sits on the text", () => {
    const touching: LiftInput = { ...at1366, text: [{ left: 84, top: 380, right: 740, bottom: 450 }] };
    expect(planLift(touching)).toEqual({ fade: 0.06, rise: 0 });
  });
});
