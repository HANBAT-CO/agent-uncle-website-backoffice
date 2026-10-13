import { describe, expect, it } from "vitest";

import { clampLens, clearOfRects, fromViewBox, lensPenetration, nudgeLens, panInto, pathCrosses, placeReadout, readoutSide, toViewBox, type Rect } from "./lens-geometry";

const STAGE: Rect = { left: 0, top: 0, right: 1000, bottom: 800 };

describe("clampLens", () => {
  it("keeps a point that already fits", () => {
    expect(clampLens({ x: 500, y: 400 }, STAGE, 100)).toEqual({ x: 500, y: 400 });
  });

  it("keeps the whole circle inside the stage", () => {
    expect(clampLens({ x: 20, y: 790 }, STAGE, 100)).toEqual({ x: 100, y: 700 });
    expect(clampLens({ x: 1400, y: -50 }, STAGE, 100)).toEqual({ x: 900, y: 100 });
  });

  it("centres the lens on an axis narrower than the circle", () => {
    const narrow: Rect = { left: 10, top: 0, right: 150, bottom: 800 };
    expect(clampLens({ x: 0, y: 400 }, narrow, 100)).toEqual({ x: 80, y: 400 });
  });
});

describe("readoutSide", () => {
  // Ring 100 + gap 24 + card 260 + margin 16.
  const reach = 400;

  it("takes the west side whenever the card fits there (the record cards float north-east)", () => {
    expect(readoutSide(700, STAGE, reach)).toBe("left");
    expect(readoutSide(400, STAGE, reach)).toBe("left");
  });

  it("flips east when the west side is too narrow", () => {
    expect(readoutSide(399, STAGE, reach)).toBe("right");
    expect(readoutSide(150, STAGE, reach)).toBe("right");
  });

  it("falls back to the side with more room when neither fits", () => {
    const narrow: Rect = { left: 0, top: 0, right: 600, bottom: 800 };
    expect(readoutSide(250, narrow, reach)).toBe("right");
    expect(readoutSide(350, narrow, reach)).toBe("left");
  });

  it("measures room from the stage edges, not from zero", () => {
    expect(readoutSide(700, { left: 400, top: 0, right: 1400, bottom: 800 }, reach)).toBe("right");
  });
});

describe("placeReadout", () => {
  // The 1440x900 hero in map-box pixels: stage, H1 lines, sub and CTA row, the two record cards.
  const stage: Rect = { left: 0, top: 13, right: 1039, bottom: 873 };
  const copy: Rect[] = [
    { left: 64, top: 549, right: 756, bottom: 621 },
    { left: 64, top: 621, right: 420, bottom: 693 },
    { left: 64, top: 717, right: 611, bottom: 745 },
    { left: 64, top: 777, right: 300, bottom: 829 },
  ];
  const cards: Rect = { left: 712, top: 218, right: 1029, bottom: 371 };
  const card = { width: 260, height: 132 };
  const options = { radius: 100, gap: 24, margin: 16, stage, obstacles: [...copy, cards] };
  const overlaps = (a: Rect, b: Rect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const rectOf = (p: { x: number; y: number }): Rect => ({ left: p.x, top: p.y, right: p.x + card.width, bottom: p.y + card.height });

  it("rests west of 청평화, 24px from the ring, centred on the lens", () => {
    const lens = { x: 616, y: 407 };
    const placed = placeReadout(lens, card, options);
    expect(placed.side).toBe("left");
    expect(placed.x).toBe(lens.x - 100 - 24 - 260);
    expect(placed.y).toBe(lens.y - 66);
  });

  it("goes east of APM, where the west side is off the stage", () => {
    const placed = placeReadout({ x: 131, y: 220 }, card, options);
    expect(placed.side).toBe("right");
    expect(placed.x).toBe(131 + 124);
  });

  it("never covers the text block: over 남평화 it rises above the H1", () => {
    const placed = placeReadout({ x: 732, y: 694 }, card, options);
    for (const block of copy) expect(overlaps(rectOf(placed), block)).toBe(false);
    expect(placed.side).toBe("above");
    expect(placed.y + card.height).toBeLessThanOrEqual(549 - 16);
  });

  it("never covers the record cards", () => {
    const placed = placeReadout({ x: 919, y: 414 }, card, options);
    expect(overlaps(rectOf(placed), cards)).toBe(false);
    for (const block of copy) expect(overlaps(rectOf(placed), block)).toBe(false);
  });

  it("stays inside the stage and off the lens", () => {
    for (const lens of [
      { x: 131, y: 220 },
      { x: 616, y: 407 },
      { x: 919, y: 414 },
      { x: 732, y: 694 },
      { x: 939, y: 773 },
    ]) {
      const placed = placeReadout(lens, card, options);
      const rect = rectOf(placed);
      expect(rect.left).toBeGreaterThanOrEqual(stage.left);
      expect(rect.right).toBeLessThanOrEqual(stage.right);
      expect(rect.top).toBeGreaterThanOrEqual(stage.top);
      expect(rect.bottom).toBeLessThanOrEqual(stage.bottom);
      const dx = Math.max(rect.left - lens.x, 0, lens.x - rect.right);
      const dy = Math.max(rect.top - lens.y, 0, lens.y - rect.bottom);
      expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(100);
    }
  });

  it("keeps the side a following card holds unless another is clearly better", () => {
    const open = { ...options, stage: { left: 0, top: 0, right: 1000, bottom: 800 }, obstacles: [] };
    // West just fits: by preference it goes west, but a card already east stays east.
    expect(placeReadout({ x: 400, y: 400 }, card, open).side).toBe("left");
    expect(placeReadout({ x: 400, y: 400 }, card, { ...open, hold: "right" }).side).toBe("right");
    // Below 청평화 the card would have to slide past the whole text block: holding it there is not worth that.
    expect(placeReadout({ x: 616, y: 407 }, card, { ...options, hold: "below" }).side).toBe("left");
  });

  it("falls back to the roomier side when nothing fits", () => {
    const tiny: Rect = { left: 0, top: 0, right: 400, bottom: 220 };
    const placed = placeReadout({ x: 120, y: 110 }, card, { ...options, stage: tiny, obstacles: [] });
    expect(placed.side).toBe("right");
  });
});

describe("nudgeLens", () => {
  // 1440x900 in map-box px: the H1's two lines, the sub and the CTA row; 남평화's roof just east of the H1's first line.
  const text: Rect[] = [
    { left: 64, top: 516, right: 756, bottom: 584 },
    { left: 64, top: 584, right: 420, bottom: 652 },
    { left: 64, top: 684, right: 611, bottom: 712 },
    { left: 64, top: 744, right: 300, bottom: 796 },
  ];
  const area: Rect = { left: 0, top: 60, right: 1039, bottom: 860 };
  const options = { radius: 100, rects: text, area };

  it("leaves a lens that is already clear of the text where it is", () => {
    const centre = { x: 616, y: 407 };
    expect(nudgeLens(centre, centre, options)).toEqual(centre);
  });

  it("moves the 남평화 lens down and off the H1 when up or right cannot clear it, the roof still inside the ring", () => {
    const roof = { x: 732, y: 626 };
    const nudged = nudgeLens(roof, roof, options);
    expect(lensPenetration(nudged, 100, text)).toBe(0);
    expect(nudged.y).toBeGreaterThan(roof.y);
    expect(Math.hypot(nudged.x - roof.x, nudged.y - roof.y)).toBeLessThanOrEqual(100 - 24);
  });

  it("keeps the whole circle inside the area and the roof 24px inside the ring", () => {
    const roof = { x: 732, y: 626 };
    const tight: Rect = { left: 0, top: 60, right: 1039, bottom: 740 };
    const nudged = nudgeLens(roof, roof, { ...options, area: tight });
    expect(nudged.y + 100).toBeLessThanOrEqual(tight.bottom);
    expect(Math.hypot(nudged.x - roof.x, nudged.y - roof.y)).toBeLessThanOrEqual(76);
    // Less deep into the text than where it started, even when it cannot clear it.
    expect(lensPenetration(nudged, 100, text)).toBeLessThan(lensPenetration(roof, 100, text));
  });
});

describe("clearOfRects", () => {
  // 1440x900 in map-box px (as nudgeLens above).
  const text: Rect[] = [
    { left: 64, top: 516, right: 756, bottom: 584 },
    { left: 64, top: 584, right: 420, bottom: 652 },
    { left: 64, top: 684, right: 611, bottom: 712 },
    { left: 64, top: 744, right: 300, bottom: 796 },
  ];
  const area: Rect = { left: 0, top: 60, right: 1039, bottom: 860 };
  const clearOf = (point: { x: number; y: number }) => Math.min(...text.map((rect) => Math.hypot(Math.max(rect.left - point.x, 0, point.x - rect.right), Math.max(rect.top - point.y, 0, point.y - rect.bottom))));

  it("leaves a centre that already keeps its distance", () => {
    const centre = { x: 616, y: 380 };
    expect(clearOfRects(centre, 100, text, area, { clearance: 16 })).toEqual(centre);
  });

  it("slides a pointer-led lens on 남평화's roof down off the H1, the ring 16px clear of every line", () => {
    const roof = { x: 732, y: 626 };
    const clear = clearOfRects(roof, 100, text, area, { clearance: 16, maxReach: 84 });
    expect(clear).not.toBeNull();
    if (!clear) return;
    expect(clearOf(clear)).toBeGreaterThanOrEqual(116 - 0.01);
    expect(clear.y).toBeGreaterThan(roof.y);
    expect(Math.hypot(clear.x - roof.x, clear.y - roof.y)).toBeLessThanOrEqual(84);
  });

  it("gives up when no clear centre lies within reach (the pointer between two lines of text)", () => {
    expect(clearOfRects({ x: 500, y: 668 }, 100, text, area, { clearance: 16, maxReach: 84 })).toBeNull();
  });

  it("never leaves the area", () => {
    const tight: Rect = { left: 0, top: 60, right: 1039, bottom: 740 };
    const clear = clearOfRects({ x: 732, y: 626 }, 100, text, tight, { clearance: 16, maxReach: 200 });
    if (clear) expect(clear.y + 100).toBeLessThanOrEqual(tight.bottom + 0.5);
  });
});

describe("pathCrosses", () => {
  const card = { width: 260, height: 134 };
  // 1440x900: the H1's first line, and the readout's spots west of 청평화 and below 디오트.
  const h1: Rect = { left: 84, top: 540, right: 776, bottom: 600 };
  const west = { x: 252, y: 351 };
  const belowDiot = { x: 783, y: 625 };

  it("finds the H1 on the straight way from west of 청평화 to below 디오트", () => {
    expect(pathCrosses(west, belowDiot, card, [h1])).toBe(true);
    expect(pathCrosses(belowDiot, west, card, [h1])).toBe(true);
  });

  it("lets a card slide where nothing lies on its way", () => {
    expect(pathCrosses(west, { x: 635, y: 384 }, card, [h1])).toBe(false);
    expect(pathCrosses(west, west, card, [h1])).toBe(false);
  });

  it("does not count a card that only touches an edge", () => {
    expect(pathCrosses({ x: 0, y: 406 }, { x: 600, y: 406 }, card, [h1])).toBe(false);
    expect(pathCrosses({ x: 0, y: 407 }, { x: 600, y: 407 }, card, [h1])).toBe(true);
  });

  it("catches a rect passed over mid-way, even when both ends are clear of it", () => {
    const thin: Rect = { left: 500, top: 0, right: 510, bottom: 800 };
    expect(pathCrosses({ x: 100, y: 100 }, { x: 700, y: 100 }, card, [thin])).toBe(true);
  });

  it("misses a rect the diagonal passes by", () => {
    // From the top-left to the bottom-right: the bottom-left corner stays clear.
    const corner: Rect = { left: 0, top: 600, right: 100, bottom: 800 };
    expect(pathCrosses({ x: 0, y: 0 }, { x: 700, y: 500 }, card, [corner])).toBe(false);
  });
});

describe("panInto", () => {
  it("does not pan a point already inside", () => {
    expect(panInto({ x: 100, y: 100 }, { left: 0, top: 0, right: 200, bottom: 200 })).toEqual({ x: 0, y: 0 });
  });

  it("pans the shortest way onto the area (디오트 east of the phone frame)", () => {
    expect(panInto({ x: 450, y: 100 }, { left: 76, top: 144, right: 302, bottom: 220 })).toEqual({ x: -148, y: 44 });
  });
});

describe("viewBox conversion", () => {
  const box = { width: 1400, height: 886.67 };
  const viewBox = { width: 1200, height: 760 };

  it("maps box pixels to viewBox units and back", () => {
    const [sx, sy] = toViewBox({ x: 700, y: 443.335 }, box, viewBox);
    expect(sx).toBeCloseTo(600, 6);
    expect(sy).toBeCloseTo(380, 6);
    const back = fromViewBox([528, 349.6], box, viewBox);
    expect(back.x).toBeCloseTo(616, 6);
    expect(back.y).toBeCloseTo(407.87, 2);
  });

  it("returns the origin for an empty box instead of dividing by zero", () => {
    expect(toViewBox({ x: 10, y: 10 }, { width: 0, height: 0 }, viewBox)).toEqual([0, 0]);
  });
});
