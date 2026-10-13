import { describe, expect, it } from "vitest";

import {
  RECUT,
  dropOffset,
  dropWindows,
  easeInOutCubic,
  flightFrame,
  flightT,
  flightWindows,
  isLanded,
  isScrambled,
  staggerWindows,
} from "./recut";

describe("RECUT", () => {
  it("keeps the spec's order with the fill moved before the pin: rest, freeze at 18%, drop 18-27%, flights 27-82%, closing 82-100%", () => {
    expect(RECUT).toMatchObject({
      freezeAt: 0.18,
      dropStart: 0.18,
      dropEnd: 0.27,
      flightsStart: 0.27,
      flightsEnd: 0.82,
      closingStart: 0.82,
      closingEnd: 1,
      scrambleAt: 0.7,
    });
    expect(RECUT.dropStart).toBe(RECUT.freezeAt);
    expect(RECUT.flightsStart).toBe(RECUT.dropEnd);
    expect(RECUT.closingStart).toBe(RECUT.flightsEnd);
  });
});

describe("dropWindows and dropOffset", () => {
  const drops = dropWindows(6);

  it("fits six short drops into 18-27%", () => {
    expect(drops).toHaveLength(6);
    expect(drops[0].start).toBeCloseTo(0.18, 9);
    expect(drops.at(-1)?.end).toBeCloseTo(0.27, 9);
    for (const drop of drops) expect(drop.end - drop.start).toBeLessThan(0.05);
  });

  it("falls with acceleration and is reversible (a pure function of progress)", () => {
    const window = { start: 0.2, end: 0.24 };
    expect(dropOffset(0.1, window, 300)).toBe(0);
    expect(dropOffset(0.22, window, 300)).toBeCloseTo(75, 6);
    expect(dropOffset(0.24, window, 300)).toBe(300);
    expect(dropOffset(0.9, window, 300)).toBe(300);
  });
});

describe("flightWindows", () => {
  const windows = flightWindows(6);

  it("gives six overlapping flights that start at 27% and land by 82%", () => {
    expect(windows).toHaveLength(6);
    expect(windows[0].start).toBeCloseTo(0.27, 9);
    expect(windows.at(-1)?.end).toBeCloseTo(0.82, 9);
    for (let i = 1; i < windows.length; i += 1) {
      expect(windows[i].start).toBeGreaterThan(windows[i - 1].start);
      expect(windows[i].start).toBeLessThan(windows[i - 1].end);
    }
  });

  it("puts each scramble at 70% of its own flight", () => {
    for (const window of windows) {
      expect(window.scramble).toBeCloseTo(window.start + 0.7 * (window.end - window.start), 9);
    }
  });
});

describe("staggerWindows", () => {
  it("fits n staggered tweens exactly into a span", () => {
    const drop = staggerWindows(6, 0.4, 0.5, 0.2);
    expect(drop[0].start).toBeCloseTo(0.4, 9);
    expect(drop.at(-1)?.end).toBeCloseTo(0.5, 9);
    const durations = drop.map((w) => w.end - w.start);
    for (const duration of durations) expect(duration).toBeCloseTo(durations[0], 9);
  });

  it("handles a single tween", () => {
    expect(staggerWindows(1, 0.2, 0.3, 0.5)).toEqual([{ start: 0.2, end: 0.3 }]);
  });
});

describe("flightT", () => {
  const window = { start: 0.5, end: 0.64, scramble: 0.598 };

  it("is 0 before, 1 after and linear inside the window", () => {
    expect(flightT(0.2, window)).toBe(0);
    expect(flightT(0.5, window)).toBe(0);
    expect(flightT(0.57, window)).toBeCloseTo(0.5, 9);
    expect(flightT(0.64, window)).toBe(1);
    expect(flightT(0.99, window)).toBe(1);
  });

  it("drives the scramble and landing switches as pure functions of progress", () => {
    expect(isScrambled(0.597, window)).toBe(false);
    expect(isScrambled(0.598, window)).toBe(true);
    expect(isLanded(0.639, window)).toBe(false);
    expect(isLanded(0.64, window)).toBe(true);
  });
});

describe("easeInOutCubic", () => {
  it("starts and ends at rest and passes the midpoint", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 9);
    expect(easeInOutCubic(0.25)).toBeLessThan(0.25);
    expect(easeInOutCubic(-1)).toBe(0);
    expect(easeInOutCubic(2)).toBe(1);
  });
});

describe("flightFrame", () => {
  const from = { x: 300, y: 420, angle: 0.4 };
  const to = { x: 520, y: 60 };

  it("sits exactly on the recorded pose at t = 0", () => {
    expect(flightFrame(from, to, 0)).toEqual({ x: 300, y: 420, angle: 0.4 });
  });

  it("lands exactly on the ledger slot, level, at t = 1", () => {
    expect(flightFrame(from, to, 1)).toEqual({ x: 520, y: 60, angle: 0 });
  });

  it("levels the pill before it lands", () => {
    const mid = flightFrame(from, to, 0.7);
    expect(Math.abs(mid.angle)).toBeLessThan(0.05);
    expect(mid.y).toBeLessThan(from.y);
    expect(mid.y).toBeGreaterThan(to.y);
  });

  it("is reversible: the same t always gives the same frame", () => {
    expect(flightFrame(from, to, 0.37)).toEqual(flightFrame(from, to, 0.37));
  });
});
