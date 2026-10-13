import { describe, expect, it } from "vitest";

import { SLIP, slipGeometry } from "./slip-geometry";

describe("slipGeometry", () => {
  it("puts the stub on the right of a wide slip and keeps the body's height", () => {
    const geometry = slipGeometry(533, 612.4);
    expect(geometry).toMatchObject({ orientation: "horizontal", width: 533, stubSize: SLIP.stubWide, height: 613 });
  });

  it("moves the stub under the body on a phone-width slip so the body keeps the full width", () => {
    const geometry = slipGeometry(342, 640);
    expect(geometry).toMatchObject({ orientation: "vertical", width: 342, stubSize: SLIP.stubNarrow, height: 640 + SLIP.stubNarrow });
  });

  it("switches orientation at SLIP.wideFrom", () => {
    expect(slipGeometry(SLIP.wideFrom - 1, 600).orientation).toBe("vertical");
    expect(slipGeometry(SLIP.wideFrom, 600).orientation).toBe("horizontal");
  });

  it("never grows past SLIP.maxWidth and floors fractional widths", () => {
    expect(slipGeometry(900, 600).width).toBe(SLIP.maxWidth);
    expect(slipGeometry(463.8, 600).width).toBe(463);
  });

  it("gives a wide slip a stub tall enough for the grip and the button", () => {
    expect(slipGeometry(533, 120).height).toBe(SLIP.minStubLength);
  });

  it.each([
    [533, 612],
    [464, 700],
    [342, 640],
    [312, 700],
  ])("spaces the perforation holes evenly along the cut (%i x %i)", (width, body) => {
    const { orientation, height, holes } = slipGeometry(width, body);
    const cut = orientation === "horizontal" ? height : width;
    const bridge = (cut - 2 * SLIP.notch - holes * SLIP.hole) / (holes + 1);
    expect(holes).toBeGreaterThan(10);
    expect(bridge).toBeGreaterThanOrEqual(SLIP.bridge - 3);
    expect(bridge).toBeLessThanOrEqual(SLIP.bridge + 3);
  });

  it("returns at least one hole for degenerate sizes", () => {
    expect(slipGeometry(0, 0).holes).toBeGreaterThanOrEqual(1);
  });
});
