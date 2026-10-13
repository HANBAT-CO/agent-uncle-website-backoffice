/**
 * The hero draw-in's stroke styles, without DrawSVG (spec S1 draw-in).
 *
 * The map's strokes are non-scaling, so their dash patterns run in screen
 * pixels: DrawSVG re-measured every stroke on every frame of the draw-in
 * (getScreenCTM, getBBox, getTotalLength, a style write between them), a
 * forced style and layout pass per stroke per frame while the page was still
 * hydrating. Here each stroke's length comes from the server (its --len, in
 * map units, MarketMap) times the map's screen scale, read once when the
 * draw-in starts, and every frame only writes two inline styles per stroke.
 * The styles match what DrawSVG wrote, so map.css and the end of the draw-in
 * (the inline styles removed) are unchanged.
 */

const round3 = (value: number) => Math.round(value * 1e3) / 1e3 + 0;
const px = (value: number) => `${round3(value)}px`;

export type Dash = { dasharray: string; dashoffset: string };

/**
 * Inline stroke-dasharray and stroke-dashoffset that show only the stretch
 * from `start` to `end` (screen px along the stroke) of a stroke `length` px
 * long. An empty stretch hides the stroke.
 */
export function dashFor(start: number, end: number, length: number): Dash {
  if (!(length > 0)) return { dasharray: "none", dashoffset: "0px" };
  const from = Math.min(Math.max(Math.min(start, end), 0), length);
  const to = Math.min(Math.max(Math.max(start, end), 0), length);
  const dash = to - from;
  let offset = -from;
  if (dash < 0.001) return { dasharray: "0px, 999999px", dashoffset: px(offset + 0.001) };
  let gap = length - dash + 0.1;
  // A stretch that reaches the stroke's end would wrap the next dash round to its start.
  if (offset !== 0 && dash + Math.abs(offset % length) > length - 0.05) {
    offset += offset < 0 ? 0.005 : -0.005;
    gap += 0.005;
  }
  return { dasharray: gap < 0.1 ? "none" : `${px(dash)}, ${px(gap)}`, dashoffset: px(offset) };
}

/** A stroke's length on screen: its map-unit length times the map's screen scale (0 when either is unknown). */
export function screenLength(length: number, scale: number): number {
  if (!Number.isFinite(length) || !Number.isFinite(scale) || length <= 0 || scale <= 0) return 0;
  return length * scale;
}
