/**
 * Pure placement math for the S1 lens and its readout card (spec S1).
 *
 * Every value is in pixels of the map box (the element that holds the map at
 * the view's aspect ratio), except the viewBox helpers, which convert between
 * those pixels and the map's viewBox units for the camera pick.
 */

export type Point = { x: number; y: number };
export type Rect = { left: number; top: number; right: number; bottom: number };
export type Size = { width: number; height: number };
export type ReadoutSide = "left" | "right" | "above" | "below";

function clamp(value: number, min: number, max: number): number {
  if (min > max) return (min + max) / 2;
  return Math.min(max, Math.max(min, value));
}

/**
 * The lens centre for a target point: the whole circle stays inside the stage
 * (the frame minus the record column). On an axis narrower than the circle the
 * lens sits in the middle of that axis.
 */
export function clampLens(target: Point, stage: Rect, radius: number): Point {
  return {
    x: clamp(target.x, stage.left + radius, stage.right - radius),
    y: clamp(target.y, stage.top + radius, stage.bottom - radius),
  };
}

/**
 * West or east of the lens, when nothing better is available. `reach` is how
 * far the card extends from the lens centre (ring + gap + card width +
 * margin): west whenever it fits there, east when the west side is too
 * narrow, otherwise the side with more room.
 */
export function readoutSide(lensX: number, stage: Rect, reach: number): "left" | "right" {
  if (lensX - reach >= stage.left) return "left";
  if (lensX + reach <= stage.right) return "right";
  return lensX - stage.left > stage.right - lensX ? "left" : "right";
}

export type PlaceOptions = {
  /** Lens radius. */
  radius: number;
  /** Space between the ring and the card (24px). */
  gap: number;
  /** Minimum space between the card and the stage edges or any obstacle. */
  margin: number;
  stage: Rect;
  /** What the card must never cover: the H1 lines, the sub, the CTA row, the record cards. */
  obstacles: readonly Rect[];
  /**
   * What the card should rather not cover: the uncle chip, the lamp dot and
   * the other buildings' labels. The side that covers less of them wins, and
   * each side may also slide on past them when that extra slide costs less.
   */
  soft?: readonly Rect[];
  /**
   * The side the card holds now, while it follows the pointer: it keeps that
   * side unless another is clearly better, so a pointer resting on the
   * threshold between two sides does not make the card hop back and forth.
   */
  hold?: ReadoutSide | null;
};

/** Where the readout card goes: its top-left corner, and the side of the lens it took. */
export type Placement = { side: ReadoutSide; x: number; y: number };

const SIDES: readonly ReadoutSide[] = ["left", "right", "above", "below"];
/** Cost per step down the preference order, in px of slide. */
const SIDE_PENALTY = 12;
/** Space kept around a soft obstacle. */
const SOFT_MARGIN = 8;
/**
 * Cost of a soft obstacle the card covers, in px of slide. What it covers
 * fades out under it (HeroLens), so a whole chip costs a flat price (covering
 * the uncle chip beats a card parked far from its lens); grazing the 8px of
 * air around one costs a share of it.
 */
const SOFT_COST = 240;
/** How much better (px of slide) another side must be before a following card leaves the side it holds. */
const HOLD_BONUS = 32;
/** Beyond this distance from the ring a card stops reading as the lens's own... */
const NEAR = 24;
/** ...and every further px costs this much. */
const FAR_WEIGHT = 4;

const isHorizontal = (side: ReadoutSide) => side === "left" || side === "right";

function intersects(a: Rect, b: Rect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function overlapArea(a: Rect, b: Rect): number {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return width > 0 && height > 0 ? width * height : 0;
}

function inflate(rect: Rect, by: number): Rect {
  return { left: rect.left - by, top: rect.top - by, right: rect.right + by, bottom: rect.bottom + by };
}

function distanceToRect(point: Point, rect: Rect): number {
  const dx = Math.max(rect.left - point.x, 0, point.x - rect.right);
  const dy = Math.max(rect.top - point.y, 0, point.y - rect.bottom);
  return Math.hypot(dx, dy);
}

/**
 * Place the readout card beside the lens (spec S1: 24px from the ring).
 *
 * Four candidates in order of preference: west (at rest the card sits in the
 * open ground between APM and 청평화, away from the record cards north-east
 * and 디오트 east), east, above, below. Each starts 24px from the ring, is
 * kept inside the stage along its free axis, then slides straight away from
 * the lens until it clears every hard obstacle; a second try per side slides
 * on past the soft ones too, and each side also starts from spots shifted
 * along its free axis to just past an obstacle. A candidate that ends off the
 * stage, over a hard obstacle or over the lens is dropped; the rest are
 * ranked by how far they moved, how far they ended from the ring (steeply,
 * past 24px), a small penalty per step down the order and a flat price per
 * soft obstacle they cover. If none survives (a tiny stage), the card goes
 * west or east by room, clamped to the stage.
 */
export function placeReadout(lens: Point, card: Size, { radius, gap, margin, stage, obstacles, soft = [], hold = null }: PlaceOptions): Placement {
  const { width, height } = card;
  const reach = radius + gap;
  const minX = stage.left + margin;
  const maxX = stage.right - margin - width;
  const minY = stage.top + margin;
  const maxY = stage.bottom - margin - height;
  const blocked = obstacles.map((rect) => inflate(rect, margin));
  const avoid = soft.map((rect) => inflate(rect, SOFT_MARGIN));
  const rectAt = (x: number, y: number): Rect => ({ left: x, top: y, right: x + width, bottom: y + height });

  let best: (Placement & { cost: number }) | null = null;
  const consider = (side: ReadoutSide, index: number, start: Point, { x, y }: Point) => {
    const rect = rectAt(x, y);
    const onStage = x >= minX - 0.5 && x <= maxX + 0.5 && y >= minY - 0.5 && y <= maxY + 0.5;
    if (!onStage || blocked.some((other) => intersects(rect, other))) return;
    if (distanceToRect(lens, rect) < radius + gap / 2) return;
    const covered = avoid.reduce((sum, other) => {
      const area = (other.right - other.left) * (other.bottom - other.top);
      return area > 0 ? sum + Math.min(1, (4 * overlapArea(rect, other)) / area) : sum;
    }, 0);
    const far = Math.max(0, distanceToRect(lens, rect) - reach - NEAR);
    const lateral = isHorizontal(side) ? Math.abs(y - start.y) : Math.abs(x - start.x);
    const cost = lateral + far * FAR_WEIGHT + index * SIDE_PENALTY + covered * SOFT_COST - (side === hold ? HOLD_BONUS : 0);
    if (!best || cost < best.cost) best = { side, x, y, cost };
  };

  SIDES.forEach((side, index) => {
    const horizontal = isHorizontal(side);
    let x = side === "left" ? lens.x - reach - width : side === "right" ? lens.x + reach : lens.x - width / 2;
    let y = side === "above" ? lens.y - reach - height : side === "below" ? lens.y + reach : lens.y - height / 2;
    if (horizontal) y = clamp(y, minY, maxY);
    else x = clamp(x, minX, maxX);
    const start = { x, y };

    /*
     * Besides the centred start, the card may shift along its free axis to
     * just past any obstacle (above 남평화 on a short laptop, the record cards
     * sit right over the centred spot, but the ground west of them is free).
     */
    const lateral = horizontal
      ? [y, ...[...blocked, ...avoid].flatMap((rect) => [rect.top - height, rect.bottom]).map((value) => clamp(value, minY, maxY))]
      : [x, ...[...blocked, ...avoid].flatMap((rect) => [rect.left - width, rect.right]).map((value) => clamp(value, minX, maxX))];
    const starts = [...new Set(lateral.map((value) => Math.round(value * 100) / 100))].map((value) =>
      horizontal ? { x, y: value } : { x: value, y },
    );

    /** Slide straight away from the lens until the card clears every rect in `rects`. */
    const slide = (from: Point, rects: readonly Rect[]): Point => {
      let { x: sx, y: sy } = from;
      for (let step = 0; step <= rects.length; step += 1) {
        const hits = rects.filter((rect) => intersects(rectAt(sx, sy), rect));
        if (hits.length === 0) break;
        if (side === "left") sx = Math.min(...hits.map((rect) => rect.left)) - width;
        else if (side === "right") sx = Math.max(...hits.map((rect) => rect.right));
        else if (side === "above") sy = Math.min(...hits.map((rect) => rect.top)) - height;
        else sy = Math.max(...hits.map((rect) => rect.bottom));
      }
      return { x: sx, y: sy };
    };

    for (const from of starts) {
      const hard = slide(from, blocked);
      consider(side, index, start, hard);
      if (avoid.length > 0) {
        const clear = slide(hard, [...blocked, ...avoid]);
        if (clear.x !== hard.x || clear.y !== hard.y) consider(side, index, start, clear);
      }
    }
  });

  if (best) {
    const { side, x, y } = best;
    return { side, x, y };
  }
  const side = readoutSide(lens.x, stage, reach + width + margin);
  return {
    side,
    x: clamp(side === "left" ? lens.x - reach - width : lens.x + reach, minX, maxX),
    y: clamp(lens.y - height / 2, minY, maxY),
  };
}

/**
 * Whether a card of `size` moving in a straight line from top-left corner
 * `from` to `to` would pass over any of `rects` on the way (touching edges do
 * not count). Exact: on each axis the overlap with a rect is a time interval
 * in [0, 1], and the card crosses the rect when the two intervals meet.
 */
export function pathCrosses(from: Point, to: Point, size: Size, rects: readonly Rect[]): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  /** When, along the move, the card's span [start, start + length] overlaps [min, max] (open interval). */
  const window = (start: number, delta: number, length: number, min: number, max: number): [number, number] | null => {
    if (delta === 0) return start < max && start + length > min ? [0, 1] : null;
    const enter = (min - length - start) / delta;
    const leave = (max - start) / delta;
    const t0 = Math.max(0, Math.min(enter, leave));
    const t1 = Math.min(1, Math.max(enter, leave));
    return t0 < t1 ? [t0, t1] : null;
  };
  return rects.some((rect) => {
    const x = window(from.x, dx, size.width, rect.left, rect.right);
    const y = x && window(from.y, dy, size.height, rect.top, rect.bottom);
    return x !== null && y !== null && Math.max(x[0], y[0]) < Math.min(x[1], y[1]);
  });
}

/**
 * How deep the lens circle at `centre` reaches into `rects` (0 when clear):
 * the sum over the rects of the radius minus the centre's distance to each.
 */
export function lensPenetration(centre: Point, radius: number, rects: readonly Rect[]): number {
  return rects.reduce((sum, rect) => sum + Math.max(0, radius - distanceToRect(centre, rect)), 0);
}

export type NudgeOptions = {
  radius: number;
  /** What the ring should keep off: the text block's lines. */
  rects: readonly Rect[];
  /** Where the whole circle must stay. */
  area: Rect;
  /** Largest move on each axis (64px; `keep` bounds the move itself). */
  maxShift?: number;
  step?: number;
  /** How far inside the ring the target (the roof) must stay. */
  keep?: number;
};

/**
 * A resting lens that reaches into the text block (남평화 sits just east of
 * the H1's first line and the sub) moves in any direction, by up to
 * `maxShift` px per axis in `step` px steps, to the spot that reaches least
 * into `rects`, while `target` (the roof) stays at least `keep` px inside the
 * ring and the whole circle stays inside `area`. Down is often the way out:
 * the H1's first line ends right above 남평화's roof, so moving up or right
 * alone cannot clear it within the ring. Ties go to the smaller move; a lens
 * already clear stays put.
 */
export function nudgeLens(centre: Point, target: Point, { radius, rects, area, maxShift = 64, step = 8, keep = 24 }: NudgeOptions): Point {
  let best = { point: centre, depth: lensPenetration(centre, radius, rects), shift: 0 };
  if (best.depth === 0) return centre;
  for (let dx = -maxShift; dx <= maxShift; dx += step) {
    for (let dy = -maxShift; dy <= maxShift; dy += step) {
      if (dx === 0 && dy === 0) continue;
      const point = { x: centre.x + dx, y: centre.y + dy };
      if (point.x - radius < area.left || point.x + radius > area.right || point.y - radius < area.top || point.y + radius > area.bottom) continue;
      if (Math.hypot(point.x - target.x, point.y - target.y) > radius - keep) continue;
      const depth = lensPenetration(point, radius, rects);
      const shift = Math.hypot(dx, dy);
      if (depth < best.depth - 0.5 || (Math.abs(depth - best.depth) <= 0.5 && shift < best.shift)) best = { point, depth, shift };
    }
  }
  return best.point;
}

export type ClearOptions = {
  /** Air kept between the ring and every rect (px). */
  clearance?: number;
  /** How far from `centre` the lens may go (px). */
  maxReach?: number;
  step?: number;
  angles?: number;
};

/**
 * The lens centre nearest `centre` at which the whole circle keeps
 * `clearance` px off every rect and stays inside `area`: `centre` itself when
 * it already does, null when no centre within `maxReach` does. A pointer-led
 * lens uses it so the ring never enters the text block: near 남평화's roof
 * (right under the H1's first line) it slides down until it clears the line.
 * Searched on rings `step` px apart, `angles` directions each; on the first
 * ring with any clear centre, the one with the most room wins (a push straight
 * away from the text, not along it).
 */
export function clearOfRects(centre: Point, radius: number, rects: readonly Rect[], area: Rect, { clearance = 0, maxReach = radius, step = 4, angles = 48 }: ClearOptions = {}): Point | null {
  if (rects.length === 0) return centre;
  const room = (point: Point) => Math.min(...rects.map((rect) => distanceToRect(point, rect))) - radius - clearance;
  if (room(centre) >= 0) return centre;
  const fits = (point: Point) =>
    point.x - radius >= area.left - 0.5 && point.x + radius <= area.right + 0.5 && point.y - radius >= area.top - 0.5 && point.y + radius <= area.bottom + 0.5;
  for (let reach = step; reach <= maxReach + 1e-6; reach += step) {
    let best: { point: Point; room: number } | null = null;
    for (let index = 0; index < angles; index += 1) {
      const angle = (index / angles) * Math.PI * 2;
      const point = { x: centre.x + Math.cos(angle) * reach, y: centre.y + Math.sin(angle) * reach };
      if (!fits(point)) continue;
      const clear = room(point);
      if (clear >= 0 && (!best || clear > best.room)) best = { point, room: clear };
    }
    if (best) return best.point;
  }
  return null;
}

/**
 * The pan (px) that brings `point` inside `area` on each axis: zero when it
 * is already inside, otherwise the shortest move. On an axis where the area
 * is empty (min above max) the point goes to the middle.
 */
export function panInto(point: Point, area: Rect): Point {
  return {
    x: clamp(point.x, area.left, area.right) - point.x,
    y: clamp(point.y, area.top, area.bottom) - point.y,
  };
}

/** Map-box pixels to viewBox units ([sx, sy] for pickBuilding). */
export function toViewBox(point: Point, box: Size, viewBox: Size): [number, number] {
  if (box.width <= 0 || box.height <= 0) return [0, 0];
  return [(point.x / box.width) * viewBox.width, (point.y / box.height) * viewBox.height];
}

/** ViewBox units to map-box pixels. */
export function fromViewBox([sx, sy]: readonly [number, number], box: Size, viewBox: Size): Point {
  return { x: (sx / viewBox.width) * box.width, y: (sy / viewBox.height) * box.height };
}
