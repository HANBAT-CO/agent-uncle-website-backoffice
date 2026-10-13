import { describe, expect, it } from "vitest";

import { beatForProgress } from "@/lib/story/derive";

import {
  APM_DEPARTURE,
  ARRIVALS,
  BUBBLE_AT,
  CAMERA_END,
  CAPTION_SWAPS,
  DESKTOP_BEATS,
  ENTRY_LIT,
  FIT_FLOOR,
  LAMP_ON,
  PUSH,
  STAGE_BEATS,
  STOP_RESTS,
  arrivedCount,
  cameraShift,
  captionIndex,
  drawnFraction,
  frameRound,
  headingClearance,
  inverseScaleEase,
  pageRest,
  projectPoint,
  pushShift,
  roundBounds,
  routeLegs,
  settlePose,
} from "./route-script";

/** Route fraction of the APM stop in the generated hero-desktop view (map-views.json). */
const APM_T = 0.5461;

describe("desktop beat markers", () => {
  it("follow spec S3: 23:30 until the APM arrival, then 02:16, 03:06 and 03:07", () => {
    expect(beatForProgress(DESKTOP_BEATS, 0)).toBe("b2330");
    expect(beatForProgress(DESKTOP_BEATS, 0.319)).toBe("b2330");
    expect(beatForProgress(DESKTOP_BEATS, 0.32)).toBe("b0216");
    expect(beatForProgress(DESKTOP_BEATS, 0.659)).toBe("b0216");
    expect(beatForProgress(DESKTOP_BEATS, 0.66)).toBe("b0306");
    expect(beatForProgress(DESKTOP_BEATS, 0.899)).toBe("b0306");
    expect(beatForProgress(DESKTOP_BEATS, 0.9)).toBe("b0307");
    expect(beatForProgress(DESKTOP_BEATS, 1)).toBe("b0307");
  });

  it("report the record beats exactly at the dot's arrivals", () => {
    expect(ARRIVALS).toEqual([0.32, 0.66]);
    expect(BUBBLE_AT).toBe(0.9);
    expect(beatForProgress(DESKTOP_BEATS, ARRIVALS[0])).toBe("b0216");
    expect(beatForProgress(DESKTOP_BEATS, ARRIVALS[1])).toBe("b0306");
  });
});

describe("stage beats (mobile blocks and reduced motion)", () => {
  it("map the number of stop blocks passed to a beat", () => {
    expect(beatForProgress(STAGE_BEATS, 0)).toBe("b2330");
    expect(beatForProgress(STAGE_BEATS, 1)).toBe("b0216");
    expect(beatForProgress(STAGE_BEATS, 2)).toBe("b0306");
    expect(beatForProgress(STAGE_BEATS, 3)).toBe("b0307");
  });
});

describe("captionIndex", () => {
  it("swaps each caption on the beat it names, so its clock never runs ahead of the plate", () => {
    expect(CAPTION_SWAPS).toEqual([0.32, 0.66, 0.9]);
    expect(captionIndex(0)).toBe(0);
    expect(captionIndex(0.3199)).toBe(0);
    expect(captionIndex(0.32)).toBe(1);
    expect(captionIndex(0.6599)).toBe(1);
    expect(captionIndex(0.66)).toBe(2);
    expect(captionIndex(0.8999)).toBe(2);
    expect(captionIndex(0.9)).toBe(3);
    expect(captionIndex(1)).toBe(3);
  });

  it("agrees with the beat markers at every progress", () => {
    const order = ["b2330", "b0216", "b0306", "b0307"];
    for (let step = 0; step <= 1000; step += 1) {
      const p = step / 1000;
      expect(order[captionIndex(p)]).toBe(beatForProgress(DESKTOP_BEATS, p));
    }
  });

  it("clamps progress outside 0..1", () => {
    expect(captionIndex(-0.5)).toBe(0);
    expect(captionIndex(1.5)).toBe(3);
  });
});

describe("arrivedCount", () => {
  it("counts the stops the dot has reached", () => {
    expect(arrivedCount(0)).toBe(0);
    expect(arrivedCount(0.3199)).toBe(0);
    expect(arrivedCount(0.32)).toBe(1);
    expect(arrivedCount(0.6599)).toBe(1);
    expect(arrivedCount(0.66)).toBe(2);
    expect(arrivedCount(1)).toBe(2);
  });
});

describe("the opening", () => {
  it("lights the drawing while the section enters, then lights the lamp before leg 1 departs", () => {
    // Viewport fractions of the scene's top: after the heading's reveal starts (0.75), done by the pin start.
    expect(ENTRY_LIT.from).toBeLessThan(0.75);
    expect(ENTRY_LIT.from).toBeGreaterThan(ENTRY_LIT.to);
    expect(ENTRY_LIT.to).toBe(0);
    expect(LAMP_ON).toBeGreaterThan(0);
    expect(LAMP_ON).toBeLessThan(CAMERA_END);
    expect(routeLegs(APM_T)[0].at).toBe(CAMERA_END);
  });
});

describe("routeLegs", () => {
  it("splits the round at the stop fraction: start to APM, then APM to 청평화", () => {
    const legs = routeLegs(APM_T);
    expect(legs).toHaveLength(2);
    expect(legs[0]).toMatchObject({ from: 0, to: APM_T, at: 0.15 });
    expect(legs[1]).toMatchObject({ from: APM_T, to: 1, at: APM_DEPARTURE });
  });

  it("lands each leg on its arrival marker", () => {
    const [toApm, toCheongpyeonghwa] = routeLegs(APM_T);
    expect(toApm.at + toApm.duration).toBeCloseTo(ARRIVALS[0], 10);
    expect(toCheongpyeonghwa.at + toCheongpyeonghwa.duration).toBeCloseTo(ARRIVALS[1], 10);
  });

  it("holds at APM long enough for the 02:16 record to land, then keeps walking", () => {
    const [toApm, toCheongpyeonghwa] = routeLegs(APM_T);
    const hold = toCheongpyeonghwa.at - (toApm.at + toApm.duration);
    expect(hold).toBeGreaterThan(0.099);
    expect(hold).toBeLessThanOrEqual(0.12);
    expect(toCheongpyeonghwa.at + toCheongpyeonghwa.duration).toBeLessThanOrEqual(0.85);
  });

  it("walks both legs at a similar pace", () => {
    const [toApm, toCheongpyeonghwa] = routeLegs(APM_T);
    const pace = (leg: (typeof toApm)) => (leg.to - leg.from) / leg.duration;
    expect(pace(toCheongpyeonghwa) / pace(toApm)).toBeGreaterThan(0.55);
    expect(pace(toCheongpyeonghwa) / pace(toApm)).toBeLessThan(1.1);
  });

  it("rejects a stop fraction outside (0, 1)", () => {
    expect(() => routeLegs(0)).toThrow();
    expect(() => routeLegs(1)).toThrow();
    expect(() => routeLegs(Number.NaN)).toThrow();
  });
});

describe("the 청평화 push", () => {
  it("runs through the hold after the arrival and ends before the bubble", () => {
    expect(PUSH.from).toBe(ARRIVALS[1]);
    expect(PUSH.to).toBeLessThan(BUBBLE_AT);
    expect(PUSH.scale).toBeGreaterThan(1);
    expect(PUSH.scale).toBeLessThanOrEqual(1.08);
  });

  it("keeps the anchor still on screen", () => {
    const origin = { x: 300, y: 200 };
    const anchor = { x: 520, y: 410 };
    const from = 0.8;
    const to = from * PUSH.scale;
    const shift = pushShift({ anchor, origin, from, to });
    const before = { x: origin.x + from * (anchor.x - origin.x), y: origin.y + from * (anchor.y - origin.y) };
    const after = { x: shift.x + origin.x + to * (anchor.x - origin.x), y: shift.y + origin.y + to * (anchor.y - origin.y) };
    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
  });
});

describe("drawnFraction", () => {
  it("is 0 while the camera eases and 1 from the 청평화 arrival on", () => {
    expect(drawnFraction(0, APM_T)).toBe(0);
    expect(drawnFraction(0.15, APM_T)).toBe(0);
    expect(drawnFraction(0.66, APM_T)).toBe(1);
    expect(drawnFraction(1, APM_T)).toBe(1);
  });

  it("reaches the APM stop at its arrival and holds there until the second leg departs", () => {
    const [, second] = routeLegs(APM_T);
    expect(drawnFraction(0.32, APM_T)).toBeCloseTo(APM_T, 10);
    expect(drawnFraction((0.32 + second.at) / 2, APM_T)).toBeCloseTo(APM_T, 10);
    expect(drawnFraction(second.at, APM_T)).toBeCloseTo(APM_T, 10);
  });

  it("moves linearly within a leg (ease none per segment)", () => {
    const [first] = routeLegs(APM_T);
    const middle = first.at + first.duration / 2;
    expect(drawnFraction(middle, APM_T)).toBeCloseTo(APM_T / 2, 10);
  });

  it("never decreases as progress grows", () => {
    let previous = -1;
    for (let step = 0; step <= 1000; step += 1) {
      const value = drawnFraction(step / 1000, APM_T);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});

describe("frameRound", () => {
  const shapes = [0, 0, 500, 300] as const;

  it("keeps scale 1 when the drawing and its tags fit the free band", () => {
    const framed = frameRound({ shapes, tags: [], space: { width: 900, height: 340 } });
    expect(framed.scale).toBe(1);
    expect(framed.centre).toEqual({ x: 250, y: 150 });
  });

  it("shrinks the drawing into a short or narrow band, never above 1", () => {
    expect(frameRound({ shapes, tags: [], space: { width: 900, height: 240 } }).scale).toBeCloseTo(0.8, 2);
    expect(frameRound({ shapes, tags: [], space: { width: 400, height: 900 } }).scale).toBeCloseTo(0.8, 2);
  });

  it("budgets the tags in pixels: they keep their size while the drawing shrinks", () => {
    // A tag hanging 100px below a door on the drawing's bottom edge.
    const tags = [{ door: { x: 400, y: 300 }, box: [16, 24, 216, 100] as const }];
    const framed = frameRound({ shapes, tags, space: { width: 900, height: 340 } });
    const bounds = roundBounds({ shapes, tags }, framed.scale);
    expect(bounds[3] - bounds[1]).toBeLessThanOrEqual(340);
    // 300 * s + 100 <= 340 gives s <= 0.8; a viewBox-unit budget would have allowed more.
    expect(framed.scale).toBeCloseTo(0.8, 2);
    expect(framed.centre.y).toBeCloseTo((0 + 300 * framed.scale + 100) / 2, 6);
  });

  it("frames tags that hang left of their door too", () => {
    const tags = [{ door: { x: 40, y: 280 }, box: [-216, 24, -16, 80] as const }];
    const bounds = roundBounds({ shapes, tags }, 1);
    expect(bounds[0]).toBe(-176);
    expect(bounds[3]).toBe(360);
  });

  it("never goes below its floor, even in a band with no room", () => {
    expect(frameRound({ shapes, tags: [], space: { width: 900, height: -20 } }).scale).toBe(FIT_FLOOR);
  });
});

describe("cameraShift", () => {
  it("moves the framed centre onto the target at scale 1", () => {
    const shift = cameraShift({ box: { left: 100, top: 50 }, origin: { x: 0, y: 0 }, scale: 1, centre: { x: 400, y: 240 }, target: { x: 500, y: 300 } });
    expect(shift.x).toBeCloseTo(0, 10);
    expect(shift.y).toBeCloseTo(10, 10);
  });

  it("accounts for a scale about the transform origin", () => {
    // Point p = (600, 380) at scale 0.5 about (300, 200) lands at 300 + 0.5 * 300 = 450, 200 + 0.5 * 180 = 290.
    const scale = 0.5;
    const shift = cameraShift({
      box: { left: 0, top: 0 },
      origin: { x: 300, y: 200 },
      scale,
      centre: { x: 600 * scale, y: 380 * scale },
      target: { x: 450, y: 290 },
    });
    expect(shift.x).toBeCloseTo(0, 10);
    expect(shift.y).toBeCloseTo(0, 10);
  });
});

describe("inverseScaleEase", () => {
  it("keeps the product of the camera scale and the dot scale at 1", () => {
    for (const end of [1, 0.8]) {
      const ease = inverseScaleEase(1.6, end);
      for (let step = 0; step <= 20; step += 1) {
        const t = step / 20;
        const camera = 1.6 + (end - 1.6) * t;
        const dot = 1 / 1.6 + (1 / end - 1 / 1.6) * ease(t);
        expect(camera * dot).toBeCloseTo(1, 10);
      }
    }
  });

  it("follows an eased camera too", () => {
    const outer = (t: number) => t * t * (3 - 2 * t);
    const ease = inverseScaleEase(0.8, 0.85, outer);
    for (let step = 0; step <= 20; step += 1) {
      const t = step / 20;
      const camera = 0.8 + 0.05 * outer(t);
      const dot = 1 / 0.8 + (1 / 0.85 - 1 / 0.8) * ease(t);
      expect(camera * dot).toBeCloseTo(1, 10);
    }
  });

  it("runs from 0 to 1", () => {
    const ease = inverseScaleEase(1.6, 0.9);
    expect(ease(0)).toBeCloseTo(0, 10);
    expect(ease(1)).toBeCloseTo(1, 10);
  });
});

describe("keyboard paging (pageRest)", () => {
  /** A native page at 1440x900 is about 0.48 of the pin (772px of 1620px). */
  const PAGE = 0.48;

  it("rests on one composed frame per stop, each inside its own caption's range", () => {
    expect(STOP_RESTS).toHaveLength(4);
    STOP_RESTS.forEach((rest, index) => expect(captionIndex(rest)).toBe(index));
    // A once the camera has settled, B with the lamp parked at APM, C pushed in on 청평화, D with the bubble.
    expect(STOP_RESTS[0]).toBe(CAMERA_END);
    expect(STOP_RESTS[1]).toBeGreaterThan(ARRIVALS[0]);
    expect(STOP_RESTS[1]).toBeLessThan(APM_DEPARTURE);
    expect(STOP_RESTS[2]).toBe(PUSH.to);
    expect(STOP_RESTS[3]).toBeGreaterThan(BUBBLE_AT);
  });

  it("lets the browser page when the step reaches at most the next stop", () => {
    expect(pageRest(0, PAGE)).toBeNull(); // A to B
    expect(pageRest(-0.3, 0.18)).toBeNull(); // into A from above the pin
    expect(pageRest(0.95, 0.95 + PAGE)).toBeNull(); // D out of the pin
    expect(pageRest(0.84, 0.84 - PAGE)).toBeNull(); // C back to B
    expect(pageRest(-2, -1.5)).toBeNull(); // far above
    expect(pageRest(2, 1.5)).toBeNull(); // far below
  });

  it("never steps over a whole stop: it rests on the stop it would skip", () => {
    // Down from B: the native page lands on D, so it rests on 03:06 first.
    expect(pageRest(0.48, 0.96)).toBe(STOP_RESTS[2]);
    // Down from C, or from above the pin straight into B.
    expect(pageRest(0.84, 0.84 + PAGE)).toBe(STOP_RESTS[3]);
    expect(pageRest(-0.1, 0.38)).toBe(STOP_RESTS[0]);
    // Up from D (or from below the pin) and from B.
    expect(pageRest(0.95, 0.95 - PAGE)).toBe(STOP_RESTS[2]);
    expect(pageRest(1.3, 0.82)).toBe(STOP_RESTS[3]);
    expect(pageRest(0.37, 0.37 - PAGE)).toBe(STOP_RESTS[0]);
  });

  it("visits A, B, C and D in order, both ways, from the pin start", () => {
    const walk = (from: number, direction: 1 | -1, presses: number) => {
      const seen: number[] = [];
      let at = from;
      for (let press = 0; press < presses; press += 1) {
        const native = at + direction * PAGE;
        at = pageRest(at, native) ?? native;
        seen.push(at >= 1 ? 4 : at < 0 ? -1 : captionIndex(at));
      }
      return seen;
    };
    expect(walk(0, 1, 4)).toEqual([1, 2, 3, 4]);
    expect(walk(STOP_RESTS[3], -1, 4)).toEqual([2, 1, 0, -1]);
  });
});

describe("the settle's poses (settlePose, projectPoint)", () => {
  const from = { x: 0, y: 0, scale: 1.6, tilt: 10 };
  const to = { x: -120, y: 80, scale: 1, tilt: 0 };

  it("runs linearly from the S2 end state to the round framing, clamped", () => {
    expect(settlePose(from, to, 0)).toEqual(from);
    expect(settlePose(from, to, 1)).toEqual(to);
    const half = settlePose(from, to, 0.5);
    expect(half.x).toBeCloseTo(-60, 9);
    expect(half.y).toBeCloseTo(40, 9);
    expect(half.scale).toBeCloseTo(1.3, 9);
    expect(half.tilt).toBeCloseTo(5, 9);
    expect(settlePose(from, to, 1.4)).toEqual(to);
  });

  it("scales about the origin and then translates, flat", () => {
    const flat = { x: 30, y: -20, scale: 2, tilt: 0 };
    expect(projectPoint({ x: 10, y: 5 }, flat, 1200)).toEqual({ x: 50, y: -10 });
    expect(projectPoint({ x: 0, y: 0 }, flat, 1200)).toEqual({ x: 30, y: -20 });
  });

  it("tilts the top away (rotateX in perspective): above the origin recedes, below comes forward", () => {
    const tilted = { x: 0, y: 0, scale: 1, tilt: 10 };
    const above = projectPoint({ x: 100, y: -200 }, tilted, 1200);
    const below = projectPoint({ x: 100, y: 200 }, tilted, 1200);
    expect(above.y).toBeGreaterThan(-200);
    expect(above.x).toBeLessThan(100);
    expect(below.y).toBeGreaterThan(200);
    expect(below.x).toBeGreaterThan(100);
    // On the origin's row the tilt changes nothing.
    expect(projectPoint({ x: 100, y: 0 }, tilted, 1200)).toEqual({ x: 100, y: 0 });
  });
});

describe("headingClearance", () => {
  const still = { x: 0, y: 0, scale: 1, tilt: 0 };
  // A 20 x 10 label at the origin, travelling from 200px above the heading's middle to 200px below.
  const crossing = {
    label: [-10, -5, 10, 5] as const,
    centre: { x: 0, y: 0 },
    heading: [-50, -20, 50, 20] as const,
    margin: 0,
    from: { ...still, y: -200 },
    to: { ...still, y: 200 },
    perspective: 1200,
    ramp: 0.2,
  };

  it("keeps a label that never meets the heading at full strength", () => {
    const clear = headingClearance({ ...crossing, from: { ...still, x: 300 }, to: { ...still, x: 300, y: 200 } });
    for (let u = 0; u <= 1; u += 0.05) expect(clear(u)).toBe(1);
  });

  it("hides a label while it crosses the heading and brings it back on either side", () => {
    const clear = headingClearance(crossing);
    expect(clear(0.5)).toBe(0);
    expect(clear(0.5 + 1 / 120)).toBe(0); // between two samples inside the crossing
    expect(clear(0)).toBe(1);
    expect(clear(1)).toBe(1);
    // Wherever the label truly overlaps the heading it is all but gone (samples every 1/60).
    for (let u = 0; u <= 1; u += 0.001) {
      const y = -200 + 400 * u;
      if (y - 5 < 20 && y + 5 > -20) expect(clear(u)).toBeLessThan(0.03);
    }
    // It fades out on the way in and back in on the way out.
    expect(clear(0.3)).toBeGreaterThan(clear(0.35));
    expect(clear(0.35)).toBeGreaterThan(clear(0.4));
    expect(clear(0.6)).toBeLessThan(clear(0.65));
    expect(clear(0.65)).toBeLessThan(clear(0.7));
  });

  it("is back at full strength by the end of the settle when the label clears the heading late", () => {
    // From 200px above to 40px below the heading's middle: it overlaps from about 0.73 to 0.94.
    const late = headingClearance({ ...crossing, to: { ...still, y: 40 } });
    expect(late(0.85)).toBe(0);
    expect(late(1)).toBe(1);
    // And from the very start when it is clear there (the S2 frame is kept).
    const early = headingClearance({ ...crossing, from: { ...still, y: -40 } });
    expect(early(0)).toBe(1);
    expect(early(0.1)).toBe(0);
  });

  it("keeps the heading's margin as air", () => {
    // The label passes 8px clear of the heading's right edge: clear with no margin, hidden with 12px.
    const beside = { ...crossing, from: { ...still, x: 68, y: -200 }, to: { ...still, x: 68, y: 200 } };
    expect(headingClearance(beside)(0.5)).toBe(1);
    expect(headingClearance({ ...beside, margin: 12 })(0.5)).toBe(0);
  });

  it("measures the label at its own size while the camera scales (its counter-scale)", () => {
    // At scale 2 the label's centre lands at x 200 and its 20px box spans 190 to 210: clear of a
    // heading ending at 185 (a label scaled with the map would span 180 to 220 and meet it).
    const zoomed = { x: 0, y: 0, scale: 2, tilt: 0 };
    const clear = headingClearance({
      ...crossing,
      label: [90, -5, 110, 5],
      centre: { x: 100, y: 0 },
      heading: [150, -10, 185, 10],
      from: zoomed,
      to: zoomed,
    });
    expect(clear(0.5)).toBe(1);
  });
});
