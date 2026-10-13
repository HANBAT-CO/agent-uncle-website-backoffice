import { describe, expect, it } from "vitest";

import { words } from "@/content/copy";
import { VOCAB } from "@/content/glossary";

import { HEAP, NO_SPIN_IDS, PIT_ITEMS, fallbackHeap, heapPose, heapSpot } from "./pit-heap";

describe("PIT_ITEMS", () => {
  it("are the six phrase bubbles then the six vocabulary pills, verbatim from copy", () => {
    expect(PIT_ITEMS.map((item) => item.label)).toEqual([...words.bubbles, ...words.vocab]);
    expect(PIT_ITEMS.filter((item) => item.kind === "bubble")).toHaveLength(6);
    expect(PIT_ITEMS.filter((item) => item.kind === "vocab")).toHaveLength(6);
    expect(new Set(PIT_ITEMS.map((item) => item.id)).size).toBe(12);
  });

  it("links each bubble to its ledger row in order", () => {
    const bubbles = PIT_ITEMS.filter((item) => item.kind === "bubble");
    expect(bubbles.map((item) => item.ledgerIndex)).toEqual([0, 1, 2, 3, 4, 5]);
    bubbles.forEach((item, index) => {
      expect(words.ledger[index].phrase).toContain(item.label);
    });
  });

  it("gives every vocabulary pill its glossary line", () => {
    for (const item of PIT_ITEMS.filter((entry) => entry.kind === "vocab")) {
      expect(item.gloss).toBe(VOCAB.find((entry) => entry.term === item.label)?.gloss);
    }
  });

  it("keeps only 누적 확보 and 재확인일 on phones", () => {
    const mobile = PIT_ITEMS.filter((item) => !item.desktopOnly).map((item) => item.label);
    expect(mobile).toEqual([...words.bubbles, ...words.vocabMobile]);
  });
});

describe("HEAP", () => {
  it("places all 12 pills on desktop and in the desktop bin, and the 8 phone pills on mobile", () => {
    expect(Object.keys(HEAP.desktop).sort()).toEqual(PIT_ITEMS.map((item) => item.id).sort());
    expect(Object.keys(HEAP.bin).sort()).toEqual(PIT_ITEMS.map((item) => item.id).sort());
    expect(Object.keys(HEAP.mobile).sort()).toEqual(
      PIT_ITEMS.filter((item) => !item.desktopOnly)
        .map((item) => item.id)
        .sort(),
    );
  });

  it("uses percent coordinates inside the heap frame and gentle tilts", () => {
    for (const layout of [HEAP.desktop, HEAP.mobile, HEAP.bin]) {
      for (const spot of Object.values(layout)) {
        expect(spot.x).toBeGreaterThanOrEqual(0);
        expect(spot.x).toBeLessThanOrEqual(100);
        expect(spot.y).toBeGreaterThanOrEqual(0);
        expect(spot.y).toBeLessThanOrEqual(100);
        expect(Math.abs(spot.r)).toBeLessThanOrEqual(30);
      }
    }
  });

  it("rests on the floor: the lowest row sits in the bottom fifth of the frame", () => {
    for (const layout of [HEAP.desktop, HEAP.mobile, HEAP.bin]) {
      expect(Math.max(...Object.values(layout).map((spot) => spot.y))).toBeGreaterThan(80);
    }
  });
});

describe("fallbackHeap and NO_SPIN_IDS", () => {
  it("falls back to the bin on desktop and the phone pile below 1024px", () => {
    expect(fallbackHeap("desktop")).toBe("bin");
    expect(fallbackHeap("mobile")).toBe("mobile");
  });

  it("never spins the empty bubble '…' (it must read as an ellipsis)", () => {
    const empty = PIT_ITEMS.find((item) => item.label === "…");
    expect(empty).toBeDefined();
    expect([...NO_SPIN_IDS]).toEqual([empty?.id]);
  });
});

describe("heapSpot", () => {
  it("reads the layout for the viewport", () => {
    expect(heapSpot("v1", "desktop")).toEqual(HEAP.desktop.v1);
    expect(heapSpot("b0", "mobile")).toEqual(HEAP.mobile.b0);
  });

  it("throws for a pill that has no place in that layout", () => {
    expect(() => heapSpot("v1", "mobile")).toThrow(/v1/);
  });
});

describe("heapPose", () => {
  it("turns a percent spot into a pit pose through the measured heap frame", () => {
    const frame = { left: 20, top: 300, width: 400, height: 200 };
    const pose = heapPose({ x: 50, y: 90, r: -30 }, frame);
    expect(pose.x).toBe(220);
    expect(pose.y).toBe(480);
    expect(pose.angle).toBeCloseTo(-Math.PI / 6, 9);
  });
});
