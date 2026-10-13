import { describe, expect, it } from "vitest";

import {
  CAPTURE,
  DOT_Y,
  OUTLINE_BOXES,
  OUTLINE_RADIUS,
  boxCentreY,
  boxInCapture,
  outlinePath,
} from "./outline-boxes";

describe("outline boxes", () => {
  it("sit on the denim cards measured in the 1320x2868 captures", () => {
    // 04-home-scroll.png: 다음 미송 재확인 card, x 36-1283, y 1111-1614.
    expect(boxInCapture(OUTLINE_BOXES.retailer)).toEqual({ x: 36, y: 1111, width: 1248, height: 504 });
    // 10-uncle-home.png: 상대방 확인 대기 card, x 36-1283, y 1917-2469.
    expect(boxInCapture(OUTLINE_BOXES.uncle)).toEqual({ x: 36, y: 1917, width: 1248, height: 553 });
  });

  it("stay inside the screen", () => {
    for (const box of Object.values(OUTLINE_BOXES)) {
      expect(box.x).toBeGreaterThan(0);
      expect(box.y).toBeGreaterThan(0);
      expect(box.x + box.w).toBeLessThan(100);
      expect(box.y + box.h).toBeLessThan(100);
    }
  });

  it("use the app's 24pt card radius at 3x (72px on the capture)", () => {
    expect((OUTLINE_RADIUS * CAPTURE.width) / 100).toBeCloseTo(72, 5);
  });

  it("place the seam dot halfway between the two card centres", () => {
    const expected = (boxCentreY(OUTLINE_BOXES.retailer) + boxCentreY(OUTLINE_BOXES.uncle)) / 2;
    expect(DOT_Y).toBeCloseTo(expected, 10);
    expect(DOT_Y).toBeCloseTo(62.0, 1);
  });
});

describe("outlinePath", () => {
  it("starts at the middle of the left edge and runs clockwise", () => {
    const d = outlinePath(OUTLINE_BOXES.retailer, "left");
    expect(d.startsWith("M36 1363V1183A72 72 0 0 1 108 1111H1212A72 72 0 0 1 1284 1183")).toBe(true);
    expect(d.endsWith("V1363Z")).toBe(true);
  });

  it("starts at the middle of the right edge for the uncle card, so its midpoint faces the seam", () => {
    const d = outlinePath(OUTLINE_BOXES.uncle, "right");
    expect(d.startsWith("M1284 2193.5V2398A72 72 0 0 1 1212 2470H108A72 72 0 0 1 36 2398")).toBe(true);
    expect(d.endsWith("V2193.5Z")).toBe(true);
  });
});
