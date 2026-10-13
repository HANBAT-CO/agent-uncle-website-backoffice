/**
 * The denim card on each 09:41 home screen (spec S7), as boxes in percent of
 * the device screen. The screen is exactly the 1320x2868 capture (spec 4.7),
 * so a percent box maps onto the still and the SVG overlay at any width.
 *
 * Measured on the lossless captures (card fill #F5F4EE against the app
 * canvas #EDECE3, scanned row by row and column by column):
 * - retailer, .context/app-capture/screenshots/04-home-scroll.png:
 *   다음 미송 재확인 / 2026-10-13 / 와이드 데님 팬츠 / 남은 미송 4장,
 *   x 36-1283, y 1111-1614
 * - uncle, .context/app-capture/screenshots/10-uncle-home.png:
 *   상대방 확인 대기 / 1건 / 와이드 데님 팬츠 / 연청 · 27 · 답변 필요,
 *   x 36-1283, y 1917-2469
 * Corner radius: the app's 24pt card radius at 3x, 72px on the capture
 * (the corner profile fits a 72px circle within 1px).
 *
 * The spec's rounded figures (x 2.7-97.3, y 38.8-56.3 and 66.9-86.1) agree
 * with these to within 0.1 percent; the measured values are used so the
 * 1.5px outline lands on the card edge at every width.
 */

/** The capture every still and clip was made from, in px. */
export const CAPTURE = { width: 1320, height: 2868 } as const;

/** A box in percent of the screen: x and w of the width, y and h of the height. */
export type OutlineBox = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };

export type OutlineSide = "retailer" | "uncle";

function fromCapture(x: number, y: number, width: number, height: number): OutlineBox {
  return {
    x: (x / CAPTURE.width) * 100,
    y: (y / CAPTURE.height) * 100,
    w: (width / CAPTURE.width) * 100,
    h: (height / CAPTURE.height) * 100,
  };
}

export const OUTLINE_BOXES: Readonly<Record<OutlineSide, OutlineBox>> = {
  retailer: fromCapture(36, 1111, 1248, 504),
  uncle: fromCapture(36, 1917, 1248, 553),
};

/** Card corner radius in percent of the screen width (72 / 1320). */
export const OUTLINE_RADIUS = (72 / CAPTURE.width) * 100;

/** Vertical centre of a box, in percent of the screen height. */
export function boxCentreY(box: OutlineBox): number {
  return box.y + box.h / 2;
}

/**
 * Where the seam dot sits, in percent of the screen height: halfway between
 * the two card centres, so the connector leaves one card, passes through the
 * dot on the seam and enters the other card at the same slope. roles.css
 * mirrors this as the handle's top offset.
 */
export const DOT_Y = (boxCentreY(OUTLINE_BOXES.retailer) + boxCentreY(OUTLINE_BOXES.uncle)) / 2;

function px(value: number): number {
  return Math.round(value * 100) / 100;
}

/** A box in capture pixels (the overlay's viewBox units). */
export function boxInCapture(box: OutlineBox): { x: number; y: number; width: number; height: number } {
  return {
    x: px((box.x * CAPTURE.width) / 100),
    y: px((box.y * CAPTURE.height) / 100),
    width: px((box.w * CAPTURE.width) / 100),
    height: px((box.h * CAPTURE.height) / 100),
  };
}

/**
 * The card outline as a rounded-rectangle path in capture pixels, clockwise,
 * starting at the middle of the left or right edge. Halfway along the path is
 * the middle of the opposite edge, so DrawSVG from "50% 50%" to "0% 100%"
 * grows the outline out of the side that faces the seam.
 */
export function outlinePath(box: OutlineBox, start: "left" | "right"): string {
  const { x, y, width, height } = boxInCapture(box);
  const r = px((OUTLINE_RADIUS * CAPTURE.width) / 100);
  const left = x;
  const right = px(x + width);
  const top = y;
  const bottom = px(y + height);
  const cy = px(y + height / 2);
  const arc = (toX: number, toY: number) => `A${r} ${r} 0 0 1 ${toX} ${toY}`;

  if (start === "left") {
    return [
      `M${left} ${cy}`,
      `V${px(top + r)}`,
      arc(px(left + r), top),
      `H${px(right - r)}`,
      arc(right, px(top + r)),
      `V${px(bottom - r)}`,
      arc(px(right - r), bottom),
      `H${px(left + r)}`,
      arc(left, px(bottom - r)),
      `V${cy}Z`,
    ].join("");
  }

  return [
    `M${right} ${cy}`,
    `V${px(bottom - r)}`,
    arc(px(right - r), bottom),
    `H${px(left + r)}`,
    arc(left, px(bottom - r)),
    `V${px(top + r)}`,
    arc(px(left + r), top),
    `H${px(right - r)}`,
    arc(right, px(top + r)),
    `V${cy}Z`,
  ].join("");
}
