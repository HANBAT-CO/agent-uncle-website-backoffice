import { describe, expect, it } from "vitest";

import { OUTLINE_BOXES } from "./outline-boxes";
import {
  SEAM,
  clampSeam,
  connectorPath,
  connectorPoints,
  labelOpacity,
  pxToSeam,
  knobZone,
  seamBounds,
  seamFromClick,
  seamForPlay,
  seamFromKey,
  seamLayout,
  seamToPx,
  seamValueNow,
  seamValueText,
} from "./seam-math";

describe("clampSeam", () => {
  it("keeps values inside 25..75", () => {
    expect(clampSeam(25)).toBe(25);
    expect(clampSeam(50)).toBe(50);
    expect(clampSeam(61.4)).toBe(61.4);
    expect(clampSeam(75)).toBe(75);
  });

  it("clamps values outside the bounds", () => {
    expect(clampSeam(10)).toBe(25);
    expect(clampSeam(-40)).toBe(25);
    expect(clampSeam(80)).toBe(75);
    expect(clampSeam(200)).toBe(75);
  });

  it("falls back to the 50/50 split for non-finite input", () => {
    expect(clampSeam(Number.NaN)).toBe(SEAM.initial);
    expect(clampSeam(Number.POSITIVE_INFINITY)).toBe(SEAM.initial);
  });
});

describe("seamFromKey", () => {
  it("moves 5 percent per arrow key", () => {
    expect(seamFromKey(50, "ArrowRight")).toBe(55);
    expect(seamFromKey(50, "ArrowUp")).toBe(55);
    expect(seamFromKey(50, "ArrowLeft")).toBe(45);
    expect(seamFromKey(50, "ArrowDown")).toBe(45);
  });

  it("snaps a dragged value to the next step on the 5 percent grid", () => {
    expect(seamFromKey(47.3, "ArrowRight")).toBe(50);
    expect(seamFromKey(47.3, "ArrowLeft")).toBe(45);
    expect(seamFromKey(52.5, "ArrowLeft")).toBe(50);
  });

  it("never steps outside the bounds", () => {
    expect(seamFromKey(75, "ArrowRight")).toBe(75);
    expect(seamFromKey(73, "ArrowRight")).toBe(75);
    expect(seamFromKey(25, "ArrowLeft")).toBe(25);
    expect(seamFromKey(27, "ArrowDown")).toBe(25);
  });

  it("jumps to the bounds with Home and End", () => {
    expect(seamFromKey(50, "Home")).toBe(25);
    expect(seamFromKey(61.2, "End")).toBe(75);
  });

  it("moves 10 percent with Page Up and Page Down", () => {
    expect(seamFromKey(50, "PageUp")).toBe(60);
    expect(seamFromKey(50, "PageDown")).toBe(40);
    expect(seamFromKey(70, "PageUp")).toBe(75);
  });

  it("ignores every other key", () => {
    expect(seamFromKey(50, "Enter")).toBeNull();
    expect(seamFromKey(50, " ")).toBeNull();
    expect(seamFromKey(50, "Tab")).toBeNull();
  });
});

describe("knob clicks", () => {
  it("reads the left chevron, the dot and the right chevron from the click offset", () => {
    expect(knobZone(-20)).toBe(-1);
    expect(knobZone(-11)).toBe(-1);
    expect(knobZone(-10)).toBe(0);
    expect(knobZone(0)).toBe(0);
    expect(knobZone(10)).toBe(0);
    expect(knobZone(18)).toBe(1);
    expect(knobZone(Number.NaN)).toBe(0);
  });

  it("moves a chevron click to the next stop on its side", () => {
    expect(seamFromClick(50, -1)).toBe(25);
    expect(seamFromClick(50, 1)).toBe(75);
    expect(seamFromClick(25, 1)).toBe(50);
    expect(seamFromClick(75, -1)).toBe(50);
    expect(seamFromClick(61.4, -1)).toBe(50);
    expect(seamFromClick(61.4, 1)).toBe(75);
    expect(seamFromClick(38, -1)).toBe(25);
  });

  it("stays at a bound and sends a dot click back to 50/50", () => {
    expect(seamFromClick(25, -1)).toBe(25);
    expect(seamFromClick(75, 1)).toBe(75);
    expect(seamFromClick(70, 0)).toBe(50);
    expect(seamFromClick(50.0000001, 1)).toBe(75);
  });
});

describe("aria values", () => {
  it("reports the retailer share as a whole percent", () => {
    expect(seamValueNow(50)).toBe(50);
    expect(seamValueNow(47.6)).toBe(48);
    expect(seamValueNow(12)).toBe(25);
  });

  it("reads 소매업자 화면 n퍼센트", () => {
    expect(seamValueText(50)).toBe("소매업자 화면 50퍼센트");
    expect(seamValueText(64.7)).toBe("소매업자 화면 65퍼센트");
    expect(seamValueText(90)).toBe("소매업자 화면 75퍼센트");
  });
});

describe("labelOpacity", () => {
  it("is full at an even split or more", () => {
    expect(labelOpacity(50)).toBe(1);
    expect(labelOpacity(75)).toBe(1);
  });

  it("fades to 0.7 at the bound, keeping AA contrast for ink text", () => {
    expect(labelOpacity(25)).toBeCloseTo(0.7, 5);
    expect(labelOpacity(37.5)).toBeCloseTo(0.85, 5);
    expect(labelOpacity(10)).toBeCloseTo(0.7, 5);
  });
});

describe("seamForPlay", () => {
  it("brings a narrower side back to 50/50 when its clip starts", () => {
    expect(seamForPlay(25, "retailer")).toBe(50);
    expect(seamForPlay(42, "retailer")).toBe(50);
    expect(seamForPlay(75, "uncle")).toBe(50);
    expect(seamForPlay(58, "uncle")).toBe(50);
  });

  it("leaves the seam alone when the playing side is already as wide or wider", () => {
    expect(seamForPlay(50, "retailer")).toBe(50);
    expect(seamForPlay(70, "retailer")).toBe(70);
    expect(seamForPlay(50, "uncle")).toBe(50);
    expect(seamForPlay(30, "uncle")).toBe(30);
  });
});

describe("seam pixels", () => {
  it("converts between percent and stage pixels", () => {
    expect(seamToPx(50, 744)).toBe(372);
    expect(pxToSeam(186, 744)).toBe(25);
    expect(pxToSeam(0, 0)).toBe(SEAM.initial);
  });

  it("gives the drag bounds as 25 and 75 percent of the stage", () => {
    expect(seamBounds(744)).toEqual({ minX: 186, maxX: 558 });
  });
});

describe("seamLayout", () => {
  // 1440px: 300px screen, 11.25px bezel each side, 744px stage.
  const geometry = { stage: 744, device: 322.5 };

  it("centres each device in its half at 50/50 without clipping", () => {
    const layout = seamLayout(geometry, 50);
    expect(layout.seamX).toBe(372);
    expect(layout.retailer.x).toBeCloseTo(24.75, 5);
    expect(layout.retailer.clipRight).toBe(0);
    expect(layout.uncle.x).toBeCloseTo(396.75, 5);
    expect(layout.uncle.clipLeft).toBe(0);
  });

  it("pins the retailer device to the stage edge and clips it at the seam at 25", () => {
    const layout = seamLayout(geometry, 25);
    expect(layout.seamX).toBe(186);
    expect(layout.retailer.x).toBe(0);
    expect(layout.retailer.clipRight).toBeCloseTo(136.5, 5);
    // The uncle device moves to the centre of its wider pane.
    expect(layout.uncle.x).toBeCloseTo(303.75, 5);
    expect(layout.uncle.clipLeft).toBe(0);
  });

  it("mirrors the layout at 75", () => {
    const layout = seamLayout(geometry, 75);
    expect(layout.seamX).toBe(558);
    expect(layout.uncle.x).toBeCloseTo(421.5, 5);
    expect(layout.uncle.clipLeft).toBeCloseTo(136.5, 5);
    expect(layout.retailer.x).toBeCloseTo(117.75, 5);
    expect(layout.retailer.clipRight).toBe(0);
  });

  it("never lets a clip exceed the device or leave the stage", () => {
    for (let percent = 25; percent <= 75; percent += 2.5) {
      const { retailer, uncle } = seamLayout(geometry, percent);
      expect(retailer.x).toBeGreaterThanOrEqual(0);
      expect(uncle.x + geometry.device).toBeLessThanOrEqual(geometry.stage + 1e-9);
      expect(retailer.clipRight).toBeGreaterThanOrEqual(0);
      expect(retailer.clipRight).toBeLessThan(geometry.device);
      expect(uncle.clipLeft).toBeGreaterThanOrEqual(0);
      expect(uncle.clipLeft).toBeLessThan(geometry.device);
    }
  });

  it("clamps an out-of-range seam before laying out", () => {
    expect(seamLayout(geometry, 5)).toEqual(seamLayout(geometry, 25));
  });
});

describe("connector", () => {
  const geometry = { stage: 744, device: 322.5 };
  const ends = { screenLeft: 11.25, screenWidth: 300, retailerY: 321, uncleY: 510, dotY: 415.5 };

  it("joins the right edge of the retailer card to the left edge of the uncle card through the dot", () => {
    const points = connectorPoints(seamLayout(geometry, 50), ends, OUTLINE_BOXES);
    const retailerRight = 24.75 + 11.25 + (300 * (OUTLINE_BOXES.retailer.x + OUTLINE_BOXES.retailer.w)) / 100;
    const uncleLeft = 396.75 + 11.25 + (300 * OUTLINE_BOXES.uncle.x) / 100;
    expect(points.start[0]).toBeCloseTo(retailerRight, 5);
    expect(points.start[1]).toBe(321);
    expect(points.dot).toEqual([372, 415.5]);
    expect(points.end[0]).toBeCloseTo(uncleLeft, 5);
    expect(points.end[1]).toBe(510);
  });

  it("starts at the seam when the seam clips the retailer card", () => {
    const points = connectorPoints(seamLayout(geometry, 25), ends, OUTLINE_BOXES);
    expect(points.start[0]).toBe(186);
    expect(points.dot[0]).toBe(186);
    expect(points.end[0]).toBeGreaterThan(186);
  });

  it("ends at the seam when the seam clips the uncle card", () => {
    const points = connectorPoints(seamLayout(geometry, 75), ends, OUTLINE_BOXES);
    expect(points.end[0]).toBe(558);
    expect(points.start[0]).toBeLessThan(558);
  });

  it("draws two curves with horizontal tangents that meet at the dot", () => {
    const d = connectorPath({ start: [10, 100], dot: [50, 150], end: [90, 200] });
    expect(d).toBe("M10 100C30 100 30 150 50 150C70 150 70 200 90 200");
  });

  it("rounds coordinates to a tenth of a pixel", () => {
    const d = connectorPath({ start: [10.04, 100.06], dot: [50, 150], end: [90.111, 200] });
    expect(d).toBe("M10 100.1C30 100.1 30 150 50 150C70.1 150 70.1 200 90.1 200");
  });
});
