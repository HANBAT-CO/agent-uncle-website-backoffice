/**
 * The S7 seam as pure functions (spec S7): the slider value, its keyboard
 * steps and aria text, the label fade, the device layout on either side of
 * the seam, and the connector that joins the two denim cards across it.
 *
 * The seam value is the retailer side's share of the stage in percent,
 * 25 to 75. RolesSeam writes it as --seam (a 0.25-0.75 fraction) on the stage;
 * roles.css lays the devices out from that variable with the same formulas as
 * seamLayout(), and RolesSeam uses seamLayout() for the connector so the
 * dashed line always meets the outlines the CSS draws.
 */

import { fill, roles } from "@/content/copy";

import type { OutlineBox, OutlineSide } from "./outline-boxes";

export const SEAM = {
  min: 25,
  max: 75,
  initial: 50,
  /** Arrow keys (spec S7). */
  step: 5,
  /** Page Up and Page Down (APG slider pattern). */
  page: 10,
} as const;

/** Keep a seam value inside 25..75; anything non-finite becomes the 50/50 split. */
export function clampSeam(percent: number): number {
  if (!Number.isFinite(percent)) return SEAM.initial;
  return Math.min(SEAM.max, Math.max(SEAM.min, percent));
}

/** Drop float noise from dragged values so 55.0000001 counts as 55 on the step grid. */
function settle(percent: number): number {
  return Math.round(percent * 1000) / 1000;
}

/**
 * The seam value after a key press, or null for keys the slider ignores.
 * Steps land on the 5 percent grid: from a dragged 47.3, the right arrow goes
 * to 50 and the left arrow to 45. Home and End jump to the bounds.
 */
export function seamFromKey(current: number, key: string): number | null {
  const value = settle(clampSeam(current));
  const below = Math.ceil(value / SEAM.step) * SEAM.step;
  const above = Math.floor(value / SEAM.step) * SEAM.step;
  switch (key) {
    case "ArrowRight":
    case "ArrowUp":
      return clampSeam(above + SEAM.step);
    case "ArrowLeft":
    case "ArrowDown":
      return clampSeam(below - SEAM.step);
    case "PageUp":
      return clampSeam(above + SEAM.page);
    case "PageDown":
      return clampSeam(below - SEAM.page);
    case "Home":
      return SEAM.min;
    case "End":
      return SEAM.max;
    default:
      return null;
  }
}

/** Where a click on the knob can send the seam: either bound or the even split. */
export const SEAM_STOPS: readonly number[] = [SEAM.min, SEAM.initial, SEAM.max];

/** Half-width of the knob's centre zone (the dot), in px: a click there resets to 50/50. */
export const KNOB_CENTRE = 10;

/**
 * Which part of the knob a click landed on, from its offset to the knob's
 * centre in px: -1 the left chevron, 1 the right one, 0 the dot.
 */
export function knobZone(offset: number): -1 | 0 | 1 {
  if (!Number.isFinite(offset) || Math.abs(offset) <= KNOB_CENTRE) return 0;
  return offset < 0 ? -1 : 1;
}

/**
 * The seam value after a click on the knob, the single-pointer alternative to
 * dragging (WCAG 2.5.7): a chevron moves to the next stop on its side
 * (25, 50, 75), the dot goes back to the even split.
 */
export function seamFromClick(current: number, zone: -1 | 0 | 1): number {
  if (zone === 0) return SEAM.initial;
  const value = settle(clampSeam(current));
  if (zone < 0) return [...SEAM_STOPS].reverse().find((stop) => stop < value) ?? SEAM.min;
  return SEAM_STOPS.find((stop) => stop > value) ?? SEAM.max;
}

/** aria-valuenow: the retailer share as a whole percent. */
export function seamValueNow(percent: number): number {
  return Math.round(clampSeam(percent));
}

/** aria-valuetext: 소매업자 화면 n퍼센트. */
export function seamValueText(percent: number): string {
  return fill(roles.seam.valueText, { percent: seamValueNow(percent) });
}

/**
 * Where the seam goes when a side's clip starts: a narrower side comes back
 * to 50/50, so its footage plays whole (not cut at the seam) and undimmed; a
 * side already as wide or wider keeps the reader's split.
 */
export function seamForPlay(percent: number, side: "retailer" | "uncle"): number {
  const value = clampSeam(percent);
  return side === "retailer" ? Math.max(value, SEAM.initial) : Math.min(value, SEAM.initial);
}

/** Lowest label opacity: ink role text still passes WCAG AA on the #EDECE3 canvas. */
export const LABEL_MIN_OPACITY = 0.7;

/**
 * A role label's opacity from its side's share in percent: full at an even
 * split or wider, fading to LABEL_MIN_OPACITY at the 25 percent bound.
 * roles.css computes the same curve from --seam.
 */
export function labelOpacity(share: number): number {
  const t = Math.min(1, Math.max(0, (share - SEAM.min) / (SEAM.initial - SEAM.min)));
  return LABEL_MIN_OPACITY + (1 - LABEL_MIN_OPACITY) * t;
}

export function seamToPx(percent: number, stage: number): number {
  return (clampSeam(percent) / 100) * stage;
}

export function pxToSeam(x: number, stage: number): number {
  if (!(stage > 0)) return SEAM.initial;
  return clampSeam((x / stage) * 100);
}

/** Draggable bounds for the seam proxy, in stage pixels. */
export function seamBounds(stage: number): { minX: number; maxX: number } {
  return { minX: (SEAM.min / 100) * stage, maxX: (SEAM.max / 100) * stage };
}

/** Stage width and device outer width (screen plus both bezels), in px. */
export type SeamGeometry = { stage: number; device: number };

export type SeamLayout = {
  seamX: number;
  /** Device left edge in the stage, and how much the seam cuts off its right side. */
  retailer: { x: number; clipRight: number };
  /** Device left edge in the stage, and how much the seam cuts off its left side. */
  uncle: { x: number; clipLeft: number };
};

/**
 * Each device sits at the centre of its own pane (stage edge to seam), held
 * inside the stage; whatever crosses the seam is clipped at the seam. At
 * 50/50 both devices stand whole; dragged to a bound, the shrinking side's
 * device rests on the stage edge cut by the seam while the other centres in
 * its wider pane. Mirrored in roles.css (--r-x, --r-clip, --u-x, --u-clip).
 */
export function seamLayout({ stage, device }: SeamGeometry, percent: number): SeamLayout {
  const seamX = seamToPx(percent, stage);
  const retailerX = Math.max(0, seamX / 2 - device / 2);
  const uncleX = Math.min(stage - device, (seamX + stage) / 2 - device / 2);
  return {
    seamX,
    retailer: { x: retailerX, clipRight: Math.max(0, retailerX + device - seamX) },
    uncle: { x: uncleX, clipLeft: Math.max(0, seamX - uncleX) },
  };
}

/**
 * Vertical anchors of the connector in stage px, plus the screen's offset
 * inside a device column (the bezel) and its width, measured from the DOM.
 */
export type ConnectorEnds = {
  screenLeft: number;
  screenWidth: number;
  retailerY: number;
  uncleY: number;
  dotY: number;
};

export type Point = readonly [number, number];
export type ConnectorPoints = { start: Point; dot: Point; end: Point };

/**
 * Start on the retailer card's right edge, pass through the dot on the seam,
 * end on the uncle card's left edge. A card edge hidden behind the seam is
 * replaced by the seam itself, so the line never runs into a clipped area.
 */
export function connectorPoints(
  layout: SeamLayout,
  ends: ConnectorEnds,
  boxes: Readonly<Record<OutlineSide, OutlineBox>>,
): ConnectorPoints {
  const retailerRight =
    layout.retailer.x + ends.screenLeft + (ends.screenWidth * (boxes.retailer.x + boxes.retailer.w)) / 100;
  const uncleLeft = layout.uncle.x + ends.screenLeft + (ends.screenWidth * boxes.uncle.x) / 100;
  return {
    start: [Math.min(retailerRight, layout.seamX), ends.retailerY],
    dot: [layout.seamX, ends.dotY],
    end: [Math.max(uncleLeft, layout.seamX), ends.uncleY],
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Two cubic curves with horizontal tangents at the card edges and at the
 * dot, rounded to 0.1px. When a card is cut by the seam the first or last
 * curve collapses into a straight run down the seam.
 */
export function connectorPath({ start, dot, end }: ConnectorPoints): string {
  const h1 = (dot[0] - start[0]) / 2;
  const h2 = (end[0] - dot[0]) / 2;
  const pts = [
    [start[0], start[1]],
    [start[0] + h1, start[1]],
    [dot[0] - h1, dot[1]],
    [dot[0], dot[1]],
    [dot[0] + h2, dot[1]],
    [end[0] - h2, end[1]],
    [end[0], end[1]],
  ].map(([x, y]) => `${round(x)} ${round(y)}`);
  return `M${pts[0]}C${pts[1]} ${pts[2]} ${pts[3]}C${pts[4]} ${pts[5]} ${pts[6]}`;
}
