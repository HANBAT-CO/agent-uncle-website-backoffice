import { describe, expect, it } from "vitest";

import { dashFor, screenLength } from "./draw-strokes";

describe("dashFor", () => {
  it("hides the stroke while nothing is drawn, as DrawSVG did", () => {
    expect(dashFor(0, 0, 200)).toEqual({ dasharray: "0px, 999999px", dashoffset: "0.001px" });
    // A line growing from 40% starts as an empty stretch there.
    expect(dashFor(80, 80, 200)).toEqual({ dasharray: "0px, 999999px", dashoffset: "-79.999px" });
  });

  it("shows the stretch from start to end and a gap past the rest of the stroke", () => {
    expect(dashFor(0, 50, 200)).toEqual({ dasharray: "50px, 150.1px", dashoffset: "0px" });
    expect(dashFor(20, 120, 200)).toEqual({ dasharray: "100px, 100.1px", dashoffset: "-20px" });
  });

  it("orders start and end and clamps them to the stroke", () => {
    expect(dashFor(120, 20, 200)).toEqual(dashFor(20, 120, 200));
    expect(dashFor(-10, 250, 200)).toEqual(dashFor(0, 200, 200));
  });

  it("draws the whole stroke at the end", () => {
    expect(dashFor(0, 200, 200)).toEqual({ dasharray: "200px, 0.1px", dashoffset: "0px" });
  });

  it("keeps a stretch that ends at the stroke's end from wrapping round to its start", () => {
    const { dasharray, dashoffset } = dashFor(150, 200, 200);
    const [dash] = dasharray.split(",").map((part) => Number.parseFloat(part));
    expect(dash + Math.abs(Number.parseFloat(dashoffset))).toBeLessThan(200);
  });

  it("treats a stroke without length as drawn", () => {
    expect(dashFor(0, 0, 0)).toEqual({ dasharray: "none", dashoffset: "0px" });
  });
});

describe("screenLength", () => {
  it("scales the user-unit length by the map's screen scale (non-scaling strokes dash in screen pixels)", () => {
    expect(screenLength(234.47, 1.1667)).toBeCloseTo(273.556, 3);
  });

  it("is zero for a missing or bad length", () => {
    expect(screenLength(Number.NaN, 1.2)).toBe(0);
    expect(screenLength(120, Number.NaN)).toBe(0);
    expect(screenLength(-4, 1)).toBe(0);
  });
});
