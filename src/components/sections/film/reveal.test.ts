import { describe, expect, it } from "vitest";

import { REVEAL, RING_REST, coverScale, revealFrame, type RevealGeometry } from "./reveal";

/** 1440x900 scene with a 944x531 frame whose centre sits at (720, 500). */
const GEO: RevealGeometry = { width: 944, height: 531, scale: coverScale({ x: 248, y: 234.5, width: 944, height: 531 }, { width: 1440, height: 900 }) };

function circleRadius(clipPath: string): number {
  const match = /^circle\(([\d.]+)px at 50% 50%\)$/.exec(clipPath);
  if (!match) throw new Error(`not a circle: ${clipPath}`);
  return Number(match[1]);
}

function insetRadius(clipPath: string): number {
  const match = /^inset\(0px round ([\d.]+)px\)$/.exec(clipPath);
  if (!match) throw new Error(`not an inset: ${clipPath}`);
  return Number(match[1]);
}

describe("coverScale", () => {
  it("scales the frame about its centre until it covers the whole scene", () => {
    const box = { x: 248, y: 234.5, width: 944, height: 531 };
    const scene = { width: 1440, height: 900 };
    const scale = coverScale(box, scene);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    expect(cx - (box.width * scale) / 2).toBeLessThanOrEqual(0);
    expect(cx + (box.width * scale) / 2).toBeGreaterThanOrEqual(scene.width);
    expect(cy - (box.height * scale) / 2).toBeLessThanOrEqual(0);
    expect(cy + (box.height * scale) / 2).toBeGreaterThanOrEqual(scene.height);
  });

  it("never shrinks the frame and survives an empty box", () => {
    expect(coverScale({ x: 0, y: 0, width: 2000, height: 2000 }, { width: 100, height: 100 })).toBe(1);
    expect(coverScale({ x: 0, y: 0, width: 0, height: 0 }, { width: 1440, height: 900 })).toBe(1);
  });
});

describe("revealFrame", () => {
  it("starts as the 16px dot on screen at the frame's centre", () => {
    const frame = revealFrame(0, GEO);
    expect(frame.scale).toBeCloseTo(GEO.scale, 6);
    expect(circleRadius(frame.clipPath) * frame.scale).toBeCloseTo(8, 1);
    // The shell's ring already shows faintly: a slot for the film.
    expect(frame.ring).toBe(RING_REST);
    expect(frame.land).toBe(0);
    expect(frame.chrome).toBe(1);
  });

  it("keeps the dot small while it scrolls in, then blooms (eased in)", () => {
    const early = circleRadius(revealFrame(REVEAL.open * 0.2, GEO).clipPath) * GEO.scale;
    const cover = (Math.hypot(GEO.width, GEO.height) / 2) * GEO.scale;
    expect(early).toBeLessThan(cover * 0.06);
  });

  it("opens the circle until it covers the scaled frame at REVEAL.open", () => {
    const frame = revealFrame(REVEAL.open, GEO);
    expect(circleRadius(frame.clipPath)).toBeGreaterThanOrEqual(Math.hypot(GEO.width, GEO.height) / 2);
    expect(frame.scale).toBeCloseTo(GEO.scale, 6);
  });

  it("grows the circle monotonically on the way to REVEAL.open", () => {
    let last = 0;
    for (let step = 0; step <= REVEAL.open * 100; step += 2.5) {
      const radius = circleRadius(revealFrame(step / 100, GEO).clipPath);
      expect(radius).toBeGreaterThanOrEqual(last);
      last = radius;
    }
  });

  it("shrinks the full-bleed frame into the card between REVEAL.open and REVEAL.settle, rounding to 24px on screen", () => {
    const mid = revealFrame((REVEAL.open + REVEAL.settle) / 2, GEO);
    expect(mid.scale).toBeGreaterThan(1);
    expect(mid.scale).toBeLessThan(GEO.scale);
    expect(insetRadius(mid.clipPath) * mid.scale).toBeCloseTo(12, 1);

    const settled = revealFrame(REVEAL.settle, GEO);
    expect(settled.scale).toBe(1);
    expect(settled.clipPath).toBe("inset(0px round 24px)");
  });

  it("holds the card from REVEAL.settle to the end of the pin", () => {
    expect(revealFrame(0.85, GEO)).toEqual(revealFrame(1, GEO));
    expect(revealFrame(1, GEO)).toEqual({
      clipPath: "inset(0px round 24px)",
      scale: 1,
      ring: 1,
      land: 1,
      chrome: 1,
      reach: GEO.height / 2,
    });
  });

  it("brings the shell's ring from its rest to full as the card lands", () => {
    expect(revealFrame(REVEAL.ringFrom, GEO).ring).toBe(RING_REST);
    expect(revealFrame((REVEAL.ringFrom + REVEAL.settle) / 2, GEO).land).toBeCloseTo(0.5, 6);
    expect(revealFrame((REVEAL.ringFrom + REVEAL.settle) / 2, GEO).ring).toBeCloseTo(RING_REST + (1 - RING_REST) / 2, 6);
    expect(revealFrame(REVEAL.settle, GEO).ring).toBe(1);
  });

  it("takes the heading and the controls away before the circle reaches them, and back as the card lands", () => {
    const [outFrom, outTo] = REVEAL.chromeOut;
    expect(revealFrame(outFrom, GEO).chrome).toBe(1);
    expect(revealFrame(outTo, GEO).chrome).toBe(0);
    expect(revealFrame(REVEAL.open, GEO).chrome).toBe(0);
    expect(revealFrame(REVEAL.settle, GEO).chrome).toBe(1);
    // By the time the heading has gone, the circle is still well inside the frame's half height.
    expect(revealFrame(outTo, GEO).reach).toBeLessThan((GEO.height / 2) * GEO.scale * 0.9);
  });

  it("clamps progress outside 0..1 and is a pure function of progress (reverse scroll replays exactly)", () => {
    expect(revealFrame(-1, GEO)).toEqual(revealFrame(0, GEO));
    expect(revealFrame(3, GEO)).toEqual(revealFrame(1, GEO));
    expect(revealFrame(0.33, GEO)).toEqual(revealFrame(0.33, GEO));
  });

  it("starts the loop at 20%, inside the circle phase, before the card's chrome lands", () => {
    expect(REVEAL.loopAt).toBe(0.2);
    expect(REVEAL.loopAt).toBeLessThan(REVEAL.open);
    expect(REVEAL.open).toBeLessThan(REVEAL.ringFrom);
    expect(REVEAL.ringFrom).toBeLessThan(REVEAL.settle);
  });
});
