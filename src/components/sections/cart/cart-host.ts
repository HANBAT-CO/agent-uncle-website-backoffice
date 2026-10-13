import { fill } from "@/content/copy";

/**
 * Pure helpers for the S4 cart host (spec 8): the contract between the React
 * side and the hairline figure in src/vendor/hairline/figures/cart.js.
 *
 * - The figure writes read.textContent as "n·m" (n secured, m still owed)
 *   while a pointer is in, and "rest" when it leaves. Rest is the recorded
 *   truth, 확보 2 · 미송 4.
 * - Its hit test is a set of fixed screen bands in pointer units (the stage
 *   mapped to 400 x 320, whatever the SVG's viewBox):
 *   n = clamp(round((288 - y) / 36), 0, 6). The stepper drives the same
 *   unseen pointer, so it aims at the middle of band n: y = 288 - 36n.
 */

export const CART_TOTAL = 6;
export const CART_REST = 2;
/** The hanging gap the page mounts the figure with (its range is [8, 14, 22]). */
export const CART_GAP = 14;
/** The kernel's pointer space: it maps the stage's box onto 400 x 320, whatever the SVG shows. */
export const CART_VIEWBOX = { width: 400, height: 320 } as const;
/**
 * What the SVG shows of that space: the drawing, cropped. At the production gap
 * the cart and its bags span x 116 to 333 at every cut (0 to 6) and the
 * tethers rise to y 0, so a 256-unit window from x 100 frames them with a
 * margin on both sides. The full 320 height is kept, so pointer y (the only
 * thing the figure reads) is unchanged. The stage's aspect ratio is 256 / 320.
 */
export const CART_CROP = { x: 100, y: 0, width: 256, height: 320 } as const;
/** The x the stepper's unseen pointer uses: the middle of the stage. The figure reads y only. */
export const CART_POINTER_X = 200;

const BAND_BASE_Y = 288;
const BAND_HEIGHT = 36;
const SHORT_FORM = /^([0-6])·([0-6])$/;

export type CartCount = { readonly secured: number; readonly backorder: number };
/** What the figure reads now. `live` is true while a pointer (a hand, the tour or the stepper) holds it, false at rest. */
export type CartRead = CartCount & { readonly live: boolean };

export const CART_REST_COUNT: CartCount = { secured: CART_REST, backorder: CART_TOTAL - CART_REST };
export const CART_REST_READ: CartRead = { ...CART_REST_COUNT, live: false };

/**
 * The tour (spec 8: 1, 3, then 5 secured, then leave to rest), walked by the
 * host with the stepper's unseen pointer, not the kernel's tour:
 * - the kernel's 900ms legs and 1.2s dwells keep the figure moving for about
 *   7s, and motion that starts on its own must be over within 5s (WCAG
 *   2.2.2). This walk is CART_TOUR_MS, then the bags' 700ms return;
 * - the kernel walks in from the stage edge, and for the first stop that edge
 *   is band 0 (확보 0 · 미송 6). This walk lands on band 1 directly.
 * It holds on each count, eases to the next, and leaves after the last.
 */
export const CART_TOUR_COUNTS: readonly number[] = [1, 3, 5];
export const CART_TOUR_HOLD_MS = 800;
export const CART_TOUR_TRAVEL_MS = 600;
export const CART_TOUR_MS = CART_TOUR_COUNTS.length * CART_TOUR_HOLD_MS + (CART_TOUR_COUNTS.length - 1) * CART_TOUR_TRAVEL_MS;
/**
 * The reader sees the ink record for this long before the tour moves anything
 * (the kernel's own resume delay). The tour's conditions must hold throughout.
 */
export const CART_TOUR_DELAY_MS = 1200;
/**
 * The tour plays only while at least this share of the stage is on screen
 * (spec S4: at 50% visibility). Below it, a walk under way stops at rest and
 * the tour is armed again for the next time the figure is seen.
 */
export const CART_TOUR_MIN_VISIBLE = 0.5;
/** How a walk ended: it ran its course, or the stage left the screen under it. */
export type CartTourOutcome = "done" | "aborted";

/** Where the tour's unseen pointer is `elapsed` ms in: a viewBox y, or null once it has left. */
export function tourPointerY(elapsed: number): number | null {
  let t = elapsed >= 0 ? elapsed : 0;
  for (let index = 0; index < CART_TOUR_COUNTS.length; index++) {
    const y = countToY(CART_TOUR_COUNTS[index]!);
    if (t < CART_TOUR_HOLD_MS) return y;
    t -= CART_TOUR_HOLD_MS;
    const next = CART_TOUR_COUNTS[index + 1];
    if (next === undefined) return null;
    if (t < CART_TOUR_TRAVEL_MS) {
      const k = t / CART_TOUR_TRAVEL_MS;
      return y + (countToY(next) - y) * k * k * (3 - 2 * k);
    }
    t -= CART_TOUR_TRAVEL_MS;
  }
  return null;
}

/** Rounds and clamps a count to 0..6. NaN falls back to rest. */
export function clampCount(value: number): number {
  if (Number.isNaN(value)) return CART_REST;
  return Math.min(CART_TOTAL, Math.max(0, Math.round(value)));
}

/** The figure's read-out text as numbers: "n·m" is live; "rest" and anything malformed read as the recorded 2 · 4, at rest. */
export function parseRead(text: string | null | undefined): CartRead {
  const match = SHORT_FORM.exec((text ?? "").trim());
  if (!match) return CART_REST_READ;
  const secured = Number(match[1]);
  const backorder = Number(match[2]);
  if (secured + backorder !== CART_TOTAL) return CART_REST_READ;
  return { secured, backorder, live: true };
}

/** The stepper's optimistic value: n secured, live unless it is the record itself. */
export function previewRead(count: number): CartRead {
  const secured = clampCount(count);
  return { secured, backorder: CART_TOTAL - secured, live: secured !== CART_REST };
}

/** The viewBox y in the middle of the band that reads n secured. */
export function countToY(count: number): number {
  return BAND_BASE_Y - BAND_HEIGHT * clampCount(count);
}

/** The figure's own hit test, mirrored: how many bags a pointer at viewBox y secures. */
export function yToCount(y: number): number {
  return Math.min(CART_TOTAL, Math.max(0, Math.round((BAND_BASE_Y - y) / BAND_HEIGHT)));
}

export function sameCount(a: CartCount, b: CartCount): boolean {
  return a.secured === b.secured && a.backorder === b.backorder;
}

export function sameRead(a: CartRead, b: CartRead): boolean {
  return sameCount(a, b) && a.live === b.live;
}

/** The stepper's keyboard: arrows step by one, Page Up and Page Down by two, Home and End jump to the ends; null for keys it does not own. */
export function countForKey(key: string, current: number): number | null {
  switch (key) {
    case "ArrowUp":
    case "ArrowRight":
      return clampCount(current + 1);
    case "ArrowDown":
    case "ArrowLeft":
      return clampCount(current - 1);
    case "PageUp":
      return clampCount(current + 2);
    case "PageDown":
      return clampCount(current - 2);
    case "Home":
      return 0;
    case "End":
      return CART_TOTAL;
    default:
      return null;
  }
}

type Box = { readonly left: number; readonly top: number; readonly width: number; readonly height: number };

/** A pointer-space point as client coordinates on the stage, for a synthetic pointer event. */
export function viewBoxToClient(rect: Box, x: number, y: number): { clientX: number; clientY: number } {
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return {
    clientX: round(rect.left + (x / CART_VIEWBOX.width) * rect.width),
    clientY: round(rect.top + (y / CART_VIEWBOX.height) * rect.height),
  };
}

/** The count a tap at clientY secures: the figure's band under the finger. */
export function clientYToCount(rect: Pick<Box, "top" | "height">, clientY: number): number {
  if (!(rect.height > 0)) return CART_REST;
  return yToCount(((clientY - rect.top) / rect.height) * CART_VIEWBOX.height);
}

/** Fills a {secured}/{backorder} template (the stage's accessible name, the exploring read-out). */
export function readoutLabel(template: string, count: CartCount): string {
  return fill(template, { secured: count.secured, backorder: count.backorder });
}
