import { describe, expect, it } from "vitest";

import {
  BAND_RANGE,
  DOT_INK_RAMP,
  FALLBACK_RANGE,
  ROUTE_V,
  progressWhenRampReaches,
  HORIZON,
  RAMP,
  SKY_STOPS,
  contrastRatio,
  fallbackRampAt,
  fallbackShift,
  horizonAt,
  TEXT_RAMP,
  isLit,
  lightState,
  lightThresholds,
  progressWhenLit,
  rampAt,
  rampColor,
  rampGradient,
  relativeLuminance,
} from "./sky-ramp";

const NIGHT_INK = [0xed, 0xec, 0xe3] as const;
const INK = [0x10, 0x10, 0x10] as const;

describe("SKY_STOPS", () => {
  it("are the spec's six stops in order, from the night ground to the morning canvas", () => {
    expect(SKY_STOPS.map((stop) => stop.hex)).toEqual(["#07231C", "#093A32", "#0C483E", "#B6D7C2", "#F2FFE8", "#EDECE3"]);
    expect(SKY_STOPS[0].at).toBe(0);
    expect(SKY_STOPS.at(-1)?.at).toBe(1);
    for (let i = 1; i < SKY_STOPS.length; i += 1) expect(SKY_STOPS[i].at).toBeGreaterThan(SKY_STOPS[i - 1].at);
  });

  it("interpolate in sRGB like a CSS gradient", () => {
    expect(rampColor(0)).toEqual([0x07, 0x23, 0x1c]);
    expect(rampColor(1)).toEqual([0xed, 0xec, 0xe3]);
    expect(rampColor(-3)).toEqual(rampColor(0));
    expect(rampColor(4)).toEqual(rampColor(1));
    const [a, b] = [SKY_STOPS[2], SKY_STOPS[3]];
    const mid = rampColor((a.at + b.at) / 2);
    expect(mid[1]).toBeCloseTo((0x48 + 0xd7) / 2, 6);
  });
});

describe("horizonAt", () => {
  it("rises from below the frame to above it by 70% of the pin, then holds", () => {
    expect(horizonAt(0)).toBe(HORIZON.start);
    expect(horizonAt(HORIZON.until)).toBeCloseTo(HORIZON.end, 12);
    expect(horizonAt(1)).toBeCloseTo(HORIZON.end, 12);
    expect(horizonAt(-1)).toBe(horizonAt(0));
    expect(horizonAt(2)).toBe(horizonAt(1));
  });

  it("only ever rises (scrolling back only lowers it)", () => {
    let previous = horizonAt(0);
    for (let p = 0.01; p <= 1.0001; p += 0.01) {
      const h = horizonAt(p);
      expect(h).toBeLessThanOrEqual(previous);
      previous = h;
    }
  });

  it("is the inverse of progressWhenLit", () => {
    for (let v = HORIZON.end; v <= HORIZON.start; v += 0.05) expect(horizonAt(progressWhenLit(v))).toBeCloseTo(v, 9);
    expect(progressWhenLit(HORIZON.start + 1)).toBe(0);
    expect(progressWhenLit(HORIZON.end - 1)).toBe(HORIZON.until);
  });
});

describe("the dawn the page tells", () => {
  it("is night everywhere when the pin starts, with only a faint first light at the foot of the frame", () => {
    for (let v = 0; v <= 1; v += 0.05) expect(isLit(v, 0)).toBe(false);
    // The top four fifths stay night ground; the foot is no lighter than the #0C483E stop.
    for (let v = 0; v <= 0.8; v += 0.05) expect(rampAt(v, 0)).toBeLessThan(0.3);
    expect(rampAt(1, 0)).toBeLessThan(SKY_STOPS[2].at);
  });

  it("brings the horizon into the frame just after the card lands (30%), not at 45%", () => {
    const enters = progressWhenLit(1);
    expect(enters).toBeGreaterThan(0.3);
    expect(enters).toBeLessThan(0.36);
    expect(horizonAt(0.45)).toBeLessThan(0.85);
  });

  it("lands on the morning canvas everywhere by 70%", () => {
    for (let v = 0; v <= 1; v += 0.05) expect(rampAt(v, 0.7)).toBe(1);
    expect(rampColor(rampAt(0, 0.85))).toEqual([0xed, 0xec, 0xe3]);
  });

  it("puts the light on the route (66% down) as the dot inks, between 50% and 60%", () => {
    const p = progressWhenLit(ROUTE_V);
    expect(p).toBeGreaterThan(0.5);
    expect(p).toBeLessThan(0.56);
  });

  it("reaches the heading at the theme switch (62%)", () => {
    expect(progressWhenLit(0.2)).toBeGreaterThan(0.6);
    expect(progressWhenLit(0.2)).toBeLessThan(0.64);
  });

  it("puts the horizon where light and dark text read equally (the colour flip point)", () => {
    // Find the ramp value where #EDECE3 and #101010 have the same contrast.
    let crossover = 0;
    for (let r = 0; r <= 1; r += 0.0005) {
      const background = relativeLuminance(rampColor(r));
      if (contrastRatio(relativeLuminance(INK), background) >= contrastRatio(relativeLuminance(NIGHT_INK), background)) {
        crossover = r;
        break;
      }
    }
    expect(Math.abs(crossover - RAMP.atHorizon)).toBeLessThan(0.01);
  });

  it("inks the dot where a mint lamp and an ink dot read equally on the sky, between 50% and 60%", () => {
    const mint = relativeLuminance([0xf2, 0xff, 0xe8]);
    const inkDot = relativeLuminance([0x0c, 0x48, 0x3e]);
    let crossover = 0;
    for (let r = 0; r <= 1; r += 0.0005) {
      const background = relativeLuminance(rampColor(r));
      if (contrastRatio(inkDot, background) >= contrastRatio(mint, background)) {
        crossover = r;
        break;
      }
    }
    expect(Math.abs(crossover - DOT_INK_RAMP)).toBeLessThan(0.01);
    const p = progressWhenRampReaches(ROUTE_V, DOT_INK_RAMP);
    expect(p).toBeGreaterThan(0.5);
    expect(p).toBeLessThan(0.6);
    expect(rampAt(ROUTE_V, p)).toBeCloseTo(DOT_INK_RAMP, 9);
  });

  it("keeps night text readable well above the horizon and ink readable well below it", () => {
    const night = relativeLuminance(NIGHT_INK);
    const ink = relativeLuminance(INK);
    expect(contrastRatio(night, relativeLuminance(rampColor(RAMP.atHorizon - 0.12)))).toBeGreaterThan(4.5);
    expect(contrastRatio(ink, relativeLuminance(rampColor(RAMP.atHorizon + 0.1)))).toBeGreaterThan(4.5);
  });
});

describe("text on the sky (four light states)", () => {
  const night = relativeLuminance(NIGHT_INK);
  const night2 = relativeLuminance([0xb6, 0xd7, 0xc2]);
  const ink = relativeLuminance(INK);
  const day2 = relativeLuminance([0x63, 0x63, 0x63]);
  const on = (r: number) => relativeLuminance(rampColor(r));

  it("keeps the secondary inks at 4.5:1 or more on their side of the switch", () => {
    for (let r = 0; r <= TEXT_RAMP.nightSecondary + 0.007; r += 0.001) expect(contrastRatio(night2, on(r))).toBeGreaterThanOrEqual(4.5);
    for (let r = TEXT_RAMP.daySecondary - 0.025; r <= 1; r += 0.001) expect(contrastRatio(day2, on(r))).toBeGreaterThanOrEqual(4.5);
  });

  it("dips under 4.5:1 only across the narrow crossover, and never under 4:1", () => {
    for (let r = 0; r <= 1; r += 0.001) {
      const best = r < RAMP.atHorizon ? contrastRatio(night, on(r)) : contrastRatio(ink, on(r));
      expect(best).toBeGreaterThan(4);
      if (r < 0.5 || r > 0.53) expect(best).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("orders the switches night, night-strong, day-strong, day for any element", () => {
    for (let top = 0; top <= 0.95; top += 0.05) {
      const thresholds = lightThresholds(top, top + 0.05);
      expect(thresholds[0]).toBeLessThanOrEqual(thresholds[1]);
      expect(thresholds[1]).toBeLessThanOrEqual(thresholds[2]);
      expect(lightState(thresholds, 0)).toBe("night");
      expect(lightState(thresholds, 1)).toBe("day");
    }
  });

  it("never puts a secondary ink on a ramp it cannot read on", () => {
    const top = 0.84;
    const bottom = 0.86;
    const thresholds = lightThresholds(top, bottom);
    for (let p = 0; p <= 1; p += 0.002) {
      const state = lightState(thresholds, p);
      if (state === "night") expect(rampAt(bottom, p)).toBeLessThanOrEqual(TEXT_RAMP.nightSecondary + 1e-9);
      if (state === "day") expect(rampAt(top, p)).toBeGreaterThanOrEqual(TEXT_RAMP.daySecondary - 1e-9);
      // The middle flips exactly where the horizon passes it.
      expect(state === "night" || state === "night-strong").toBe(!isLit((top + bottom) / 2, p) || p < thresholds[1]);
    }
  });
});

describe("CSS fallback", () => {
  it("draws the same ramp as the shader at every scroll position", () => {
    for (let p = 0; p <= 1; p += 0.05) {
      for (let v = 0; v <= 1; v += 0.1) {
        expect(fallbackRampAt(v, p)).toBeCloseTo(rampAt(v, p), 9);
      }
    }
  });

  it("moves only upwards (a single transform)", () => {
    expect(fallbackShift(0)).toBeGreaterThan(fallbackShift(0.5));
    expect(fallbackShift(0.7)).toBeCloseTo(fallbackShift(1), 12);
  });

  it("builds gradients with the six stops at their ramp positions", () => {
    const css = rampGradient(FALLBACK_RANGE);
    expect(css.startsWith("linear-gradient(180deg, ")).toBe(true);
    for (const stop of SKY_STOPS) expect(css).toContain(stop.hex);
    const first = (0 - FALLBACK_RANGE.from) / (FALLBACK_RANGE.to - FALLBACK_RANGE.from);
    expect(css).toContain(`#07231C ${(first * 100).toFixed(3)}%`);
  });

  it("splits the static mobile band at its middle", () => {
    const middle = (RAMP.atHorizon - BAND_RANGE.from) / (BAND_RANGE.to - BAND_RANGE.from);
    expect(middle).toBeCloseTo(0.5, 9);
    expect(BAND_RANGE.from).toBe(0);
  });
});
