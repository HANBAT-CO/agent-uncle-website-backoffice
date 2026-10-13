import { words } from "@/content/copy";
import { glossFor, type VocabTerm } from "@/content/glossary";

import type { PitItemKind, Pose } from "./pit-physics";

/**
 * The S2 pit's twelve pills and their hand-composed static heap (spec S2).
 *
 * The heap is the server-rendered layout (no JS), the reduced-motion layout
 * and the fallback pose of any body that never fell (a fast scroll that
 * freezes the pit before the second wave, or a visit that enters the pin
 * from below). Each spot is a percent position of the pill's centre inside
 * the heap frame (a box anchored to the pit floor, scaled with the pills)
 * plus a tilt in degrees.
 *
 * Desktop holds all twelve pills; phones keep the six bubbles and two
 * vocabulary pills (누적 확보, 재확인일). The desktop layout spreads them in
 * a low mound across the full pit (no JS, reduced motion); `bin` stacks the
 * same twelve four rows deep in the narrow bin the desktop physics uses
 * (26rem x pill scale), as the fallback when matter-js has not loaded yet.
 */

export type PitItem = {
  readonly id: string;
  readonly kind: PitItemKind;
  readonly label: string;
  /** Hidden below 1024px (four of the six vocabulary pills). */
  readonly desktopOnly: boolean;
  /** Bubbles: the ledger row this phrase is re-cut into. */
  readonly ledgerIndex?: number;
  /** Vocabulary pills: the glossary caption. */
  readonly gloss?: string;
};

/** Percent centre in the heap frame (x of its width, y of its height) and tilt in degrees. */
export type HeapSpot = { readonly x: number; readonly y: number; readonly r: number };

export type HeapLayout = "desktop" | "mobile";

/** Every hand-composed heap: the two server layouts plus the desktop physics bin. */
export type HeapName = HeapLayout | "bin";

const MOBILE_VOCAB: readonly string[] = words.vocabMobile;

export const PIT_ITEMS: readonly PitItem[] = [
  ...words.bubbles.map(
    (label, index): PitItem => ({ id: `b${index}`, kind: "bubble", label, desktopOnly: false, ledgerIndex: index }),
  ),
  ...words.vocab.map(
    (label: VocabTerm, index): PitItem => ({
      id: `v${index}`,
      kind: "vocab",
      label,
      desktopOnly: !MOBILE_VOCAB.includes(label),
      gloss: glossFor(label),
    }),
  ),
];

/** Pills that never spin: the empty bubble '…' must stay readable as an ellipsis (no reply). */
export const NO_SPIN_IDS: ReadonlySet<string> = new Set(
  PIT_ITEMS.filter((item) => item.label === "…").map((item) => item.id),
);

/*
 * Ids: b0 확인했어요, b1 3장 보냈어요, b2 2장밖에 안 왔는데요, b3 남은 건 언제
 * 와요?, b4 그거 바꾸기로 했잖아요, b5 …; v0 누적 확보, v1 전달 대기, v2 남은
 * 미송, v3 재확인일, v4 회차, v5 처리 이력.
 */
export const HEAP: Readonly<Record<HeapName, Readonly<Record<string, HeapSpot>>>> = {
  // A low mound across the full pit width: five on the floor, four resting
  // in the gaps, three on top.
  desktop: {
    b4: { x: 15, y: 89.5, r: -2 },
    v0: { x: 38.4, y: 89.5, r: 2.5 },
    b2: { x: 60.7, y: 89.5, r: -1.5 },
    v5: { x: 83, y: 89.5, r: 3 },
    b5: { x: 95, y: 89, r: 12 },
    b3: { x: 26.5, y: 68, r: 6 },
    v1: { x: 48, y: 67.5, r: -8 },
    b1: { x: 67.3, y: 68, r: 4 },
    v3: { x: 86.7, y: 67.5, r: -10 },
    b0: { x: 34.7, y: 46.5, r: -13 },
    v2: { x: 57, y: 46, r: 9 },
    v4: { x: 77.5, y: 46.5, r: 17 },
  },
  // A narrow pile against a 26rem frame: three on the floor, then two, two, one.
  mobile: {
    b4: { x: 27.5, y: 89, r: -2 },
    v0: { x: 70.5, y: 89, r: 3 },
    b5: { x: 92, y: 88, r: 14 },
    b2: { x: 31, y: 67, r: -6 },
    v3: { x: 77, y: 67, r: 9 },
    b3: { x: 44, y: 45, r: 5 },
    b0: { x: 84, y: 46, r: -12 },
    b1: { x: 55, y: 23, r: 10 },
  },
  // The desktop bin (26rem x pill scale wide): four on the floor, three, three, two.
  bin: {
    b4: { x: 20.5, y: 89.5, r: -2 },
    b5: { x: 46.8, y: 89.5, r: 0 },
    v0: { x: 64.9, y: 89.5, r: 2.5 },
    v4: { x: 86, y: 89.5, r: -4 },
    b2: { x: 21, y: 68, r: 4 },
    v1: { x: 53.4, y: 68, r: -6 },
    v3: { x: 79.3, y: 68, r: 7 },
    b3: { x: 23.2, y: 46.5, r: -5 },
    b0: { x: 54.8, y: 46.5, r: -9 },
    v5: { x: 81.3, y: 46.5, r: 6 },
    b1: { x: 32, y: 25, r: 7 },
    v2: { x: 64.3, y: 25, r: -8 },
  },
};

/** The heap a live pit falls back to: the bin on desktop, the phone pile below 1024px. */
export function fallbackHeap(layout: HeapLayout): HeapName {
  return layout === "desktop" ? "bin" : "mobile";
}

export function heapSpot(id: string, layout: HeapName): HeapSpot {
  const spot = HEAP[layout][id];
  if (!spot) throw new Error(`no ${layout} heap spot for pit item ${id}`);
  return spot;
}

/** A heap spot as a pit pose, through the measured heap frame (pit pixels). */
export function heapPose(spot: HeapSpot, frame: { left: number; top: number; width: number; height: number }): Pose {
  return {
    x: frame.left + (spot.x / 100) * frame.width,
    y: frame.top + (spot.y / 100) * frame.height,
    angle: (spot.r * Math.PI) / 180,
  };
}
