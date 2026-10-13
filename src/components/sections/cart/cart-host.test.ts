import { describe, expect, it } from "vitest";

import {
  CART_CROP,
  CART_REST,
  CART_TOTAL,
  CART_TOUR_COUNTS,
  CART_TOUR_HOLD_MS,
  CART_TOUR_MS,
  CART_TOUR_TRAVEL_MS,
  CART_VIEWBOX,
  clampCount,
  clientYToCount,
  countForKey,
  countToY,
  parseRead,
  previewRead,
  readoutLabel,
  sameCount,
  sameRead,
  tourPointerY,
  viewBoxToClient,
  yToCount,
} from "./cart-host";

describe("parseRead", () => {
  it("maps the figure's rest read-out to the recorded truth 2 · 4, at rest", () => {
    expect(parseRead("rest")).toEqual({ secured: 2, backorder: 4, live: false });
  });

  it("parses the short form n·m the figure writes while a pointer is in, as live", () => {
    expect(parseRead("5·1")).toEqual({ secured: 5, backorder: 1, live: true });
    expect(parseRead("0·6")).toEqual({ secured: 0, backorder: 6, live: true });
    expect(parseRead("6·0")).toEqual({ secured: 6, backorder: 0, live: true });
  });

  it("keeps a live 2·4 live: a pointer crossing the record's band is still a preview", () => {
    expect(parseRead("2·4")).toEqual({ secured: 2, backorder: 4, live: true });
  });

  it("falls back to rest for anything the figure never writes", () => {
    for (const text of ["", null, undefined, "7·-1", "3·4", "a·b", "3-3", " 2·4 x", "1.5·4.5"]) {
      expect(parseRead(text)).toEqual({ secured: CART_REST, backorder: CART_TOTAL - CART_REST, live: false });
    }
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseRead(" 4·2 ")).toEqual({ secured: 4, backorder: 2, live: true });
  });
});

describe("previewRead", () => {
  it("is live everywhere but the record itself", () => {
    expect(previewRead(2)).toEqual({ secured: 2, backorder: 4, live: false });
    for (const secured of [0, 1, 3, 4, 5, 6]) {
      expect(previewRead(secured)).toEqual({ secured, backorder: CART_TOTAL - secured, live: true });
    }
  });

  it("clamps to 0..6", () => {
    expect(previewRead(-1).secured).toBe(0);
    expect(previewRead(9).secured).toBe(6);
  });
});

describe("countToY and yToCount (the band contract n = clamp(round((288 - y) / 36), 0, 6))", () => {
  it("maps every count to the middle of its band", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(countToY)).toEqual([288, 252, 216, 180, 144, 108, 72]);
  });

  it("round-trips every count through the figure's hit test", () => {
    for (let n = 0; n <= CART_TOTAL; n++) expect(yToCount(countToY(n))).toBe(n);
  });

  it("clamps out-of-range counts before mapping", () => {
    expect(countToY(-3)).toBe(288);
    expect(countToY(9)).toBe(72);
  });

  it("never reads more than six or fewer than none", () => {
    expect(yToCount(0)).toBe(6);
    expect(yToCount(-200)).toBe(6);
    expect(yToCount(320)).toBe(0);
    expect(yToCount(1000)).toBe(0);
  });
});

/** The count the tour shows every `step` ms, from its start until it has left (null). */
function sampleTour(step = 5): (number | null)[] {
  const counts: (number | null)[] = [];
  for (let t = 0; t <= CART_TOUR_MS + 200; t += step) {
    const y = tourPointerY(t);
    counts.push(y === null ? null : yToCount(y));
  }
  return counts;
}

describe("tourPointerY", () => {
  it("holds on 1, 3, then 5 secured, then leaves", () => {
    expect(CART_TOUR_COUNTS).toEqual([1, 3, 5]);
    const holds = CART_TOUR_COUNTS.map((_, index) =>
      tourPointerY(index * (CART_TOUR_HOLD_MS + CART_TOUR_TRAVEL_MS) + CART_TOUR_HOLD_MS / 2),
    );
    expect(holds).toEqual([countToY(1), countToY(3), countToY(5)]);
    expect(tourPointerY(CART_TOUR_MS)).toBeNull();
    expect(tourPointerY(CART_TOUR_MS + 1_000)).toBeNull();
  });

  it("lands on band 1 at once and never shows 확보 0 · 미송 6 or 6 · 0", () => {
    expect(tourPointerY(0)).toBe(countToY(1));
    expect(tourPointerY(-50)).toBe(countToY(1));
    const live = sampleTour().filter((count): count is number => count !== null);
    expect(Math.min(...live)).toBe(1);
    expect(Math.max(...live)).toBe(5);
  });

  it("only climbs, and once it has left it stays gone", () => {
    const counts = sampleTour();
    const left = counts.indexOf(null);
    expect(left).toBeGreaterThan(0);
    expect(counts.slice(left).every((count) => count === null)).toBe(true);
    const live = counts.slice(0, left) as number[];
    expect(live.every((count, index) => index === 0 || count >= live[index - 1]!)).toBe(true);
  });

  it("is over, bags settled, within WCAG 2.2.2's 5s", () => {
    // The bags' 700ms return after the leave, plus the widest stagger (5 × 40ms).
    expect(CART_TOUR_MS + 700 + 200).toBeLessThan(5_000);
  });

  it("stays inside the pointer space", () => {
    for (let t = 0; t < CART_TOUR_MS; t += 10) {
      const y = tourPointerY(t)!;
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(CART_VIEWBOX.height);
    }
  });
});

describe("CART_CROP", () => {
  it("keeps the full height, so pointer y and the bands are unchanged", () => {
    expect(CART_CROP.y).toBe(0);
    expect(CART_CROP.height).toBe(CART_VIEWBOX.height);
  });

  it("frames the drawing's widest extent at the production gap (x 116 to 333) with a margin", () => {
    expect(CART_CROP.x).toBeLessThan(116 - 8);
    expect(CART_CROP.x + CART_CROP.width).toBeGreaterThan(333 + 8);
  });
});

describe("clampCount", () => {
  it("rounds and clamps to 0..6", () => {
    expect(clampCount(-1)).toBe(0);
    expect(clampCount(2.4)).toBe(2);
    expect(clampCount(2.6)).toBe(3);
    expect(clampCount(7)).toBe(6);
    expect(clampCount(Number.NaN)).toBe(CART_REST);
  });
});

describe("sameCount and sameRead", () => {
  it("compares both numbers", () => {
    expect(sameCount({ secured: 2, backorder: 4 }, { secured: 2, backorder: 4 })).toBe(true);
    expect(sameCount({ secured: 2, backorder: 4 }, { secured: 3, backorder: 3 })).toBe(false);
  });

  it("tells a live 2 · 4 from the record at rest", () => {
    expect(sameRead(parseRead("2·4"), parseRead("rest"))).toBe(false);
    expect(sameRead(parseRead("3·3"), previewRead(3))).toBe(true);
  });
});

describe("countForKey", () => {
  it("steps with the arrow keys and jumps with Home and End", () => {
    expect(countForKey("ArrowUp", 2)).toBe(3);
    expect(countForKey("ArrowRight", 2)).toBe(3);
    expect(countForKey("ArrowDown", 2)).toBe(1);
    expect(countForKey("ArrowLeft", 2)).toBe(1);
    expect(countForKey("Home", 4)).toBe(0);
    expect(countForKey("End", 1)).toBe(6);
  });

  it("steps by two with Page Up and Page Down", () => {
    expect(countForKey("PageUp", 2)).toBe(4);
    expect(countForKey("PageDown", 2)).toBe(0);
    expect(countForKey("PageUp", 5)).toBe(6);
    expect(countForKey("PageDown", 1)).toBe(0);
  });

  it("refuses to pass the ends", () => {
    expect(countForKey("ArrowUp", 6)).toBe(6);
    expect(countForKey("ArrowDown", 0)).toBe(0);
    expect(countForKey("PageUp", 6)).toBe(6);
    expect(countForKey("PageDown", 0)).toBe(0);
  });

  it("ignores every other key", () => {
    expect(countForKey("Enter", 2)).toBeNull();
    expect(countForKey("a", 2)).toBeNull();
    expect(countForKey("Tab", 2)).toBeNull();
  });
});

describe("viewBoxToClient", () => {
  it("maps a pointer-space point onto the stage's box on screen", () => {
    const rect = { left: 100, top: 50, width: 480, height: 384 };
    expect(viewBoxToClient(rect, 200, 216)).toEqual({ clientX: 340, clientY: 309.2 });
    expect(viewBoxToClient(rect, 0, 0)).toEqual({ clientX: 100, clientY: 50 });
    expect(viewBoxToClient(rect, 400, 320)).toEqual({ clientX: 580, clientY: 434 });
  });
});

describe("clientYToCount", () => {
  it("reads the band under a tap", () => {
    const rect = { top: 100, height: 400 };
    for (let n = 0; n <= CART_TOTAL; n++) {
      expect(clientYToCount(rect, rect.top + (countToY(n) / CART_VIEWBOX.height) * rect.height)).toBe(n);
    }
    expect(clientYToCount(rect, rect.top + 2)).toBe(6);
    expect(clientYToCount(rect, rect.top + rect.height - 2)).toBe(0);
  });

  it("falls back to rest for a box with no height", () => {
    expect(clientYToCount({ top: 0, height: 0 }, 10)).toBe(CART_REST);
  });
});

describe("readoutLabel", () => {
  it("fills the figure's accessible name from the count", () => {
    expect(readoutLabel("손수레 위 봉투 {secured}개는 확보, 걸린 봉투 {backorder}개는 미송", { secured: 5, backorder: 1 })).toBe(
      "손수레 위 봉투 5개는 확보, 걸린 봉투 1개는 미송",
    );
  });
});
