/**
 * The S3 route's script (spec S3): where, along the desktop pin, the camera
 * settles, the lamp lights and travels, the captions swap and the records
 * happen. Pure numbers and functions, shared by RouteMotion (client) and the
 * unit tests.
 *
 * Before the pin, while the section enters (ENTRY_LIT), the drawing comes up
 * from the S2 end state's 25%, so the film opens on a lit map.
 *
 * Pin progress 0..1 (end +=180%):
 * - 0 to 0.15   the camera eases from the S2 end state (scale 1.6 on 청평화)
 *               to the round framing; the lamp switches on at the junction
 *               from 0.10; a map name it carries across the heading waits
 *               unseen until clear (headingClearance)
 * - 0.15 to 0.32  leg 1: from the avenue junction to APM's door (02:16)
 * - 0.32 to 0.42  the lamp stays at APM while the 02:16 record lands
 * - 0.42 to 0.66  leg 2: back up the avenue, along the north bank, to
 *                 청평화's door (03:06)
 * - 0.66 to 0.84  the camera pushes in on 청평화, the stop where the ledger
 *                 moved
 * - 0.90          the 03:07 caption and the bubble (the ledger does not move)
 * Each caption swaps on the beat it names (the arrival, or the bubble), so
 * the caption's clock never runs ahead of the plate, the tags or the rail.
 * Caption A (the uncle's profile line) covers the first walk.
 */
import type { BeatId } from "@/content/story";

type Markers = ReadonlyArray<readonly [number, BeatId]>;

/** The pin's length in viewport heights (ScrollTrigger end "+=180%"). */
export const PIN_LENGTH = 1.8;

/** Pin progress where the dot reaches APM (02:16) and 청평화 (03:06). */
export const ARRIVALS = [0.32, 0.66] as const;

/** Pin progress of the 03:07 bubble. */
export const BUBBLE_AT = 0.9;

/** Pin progress where the captions swap A to B, B to C, C to D: on the beats they name. */
export const CAPTION_SWAPS = [ARRIVALS[0], ARRIVALS[1], BUBBLE_AT] as const;

/** The camera eases over [0, CAMERA_END]. */
export const CAMERA_END = 0.15;

/**
 * The drawing comes back to full strength (from the S2 end state's 25%) while
 * the section enters: from the scene's top at `from` of the viewport height to
 * its top at `to` (0: the pin start). The heading's reveal starts at 0.75.
 */
export const ENTRY_LIT = { from: 0.7, to: 0 } as const;

/** The lamp switches on at the junction over [LAMP_ON, CAMERA_END], just before leg 1. */
export const LAMP_ON = 0.1;

/** The dot leaves APM for 청평화 here. */
export const APM_DEPARTURE = 0.42;

/** Through the 청평화 hold the camera pushes in about its door, by this factor. */
export const PUSH = { from: ARRIVALS[1], to: 0.84, scale: 1.06 } as const;

/** Story beats from the desktop pin's own progress (spec S3). */
export const DESKTOP_BEATS = [
  [0, "b2330"],
  [ARRIVALS[0], "b0216"],
  [ARRIVALS[1], "b0306"],
  [BUBBLE_AT, "b0307"],
] as const satisfies Markers;

/** Mobile and reduced motion report how many stop blocks have crossed the viewport centre. */
export const STAGE_BEATS = [
  [0, "b2330"],
  [1, "b0216"],
  [2, "b0306"],
  [3, "b0307"],
] as const satisfies Markers;

export type CaptionIndex = 0 | 1 | 2 | 3;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** The caption on screen at a pin progress: 0 = A, 1 = B (02:16), 2 = C (03:06), 3 = D (03:07). */
export function captionIndex(progress: number): CaptionIndex {
  const p = clamp01(progress);
  if (p >= CAPTION_SWAPS[2]) return 3;
  if (p >= CAPTION_SWAPS[1]) return 2;
  if (p >= CAPTION_SWAPS[0]) return 1;
  return 0;
}

/** Stops reached at a pin progress: 0, 1 (APM) or 2 (APM and 청평화). */
export function arrivedCount(progress: number): 0 | 1 | 2 {
  const p = clamp01(progress);
  if (p >= ARRIVALS[1]) return 2;
  if (p >= ARRIVALS[0]) return 1;
  return 0;
}

/**
 * One composed frame per caption, where keyboard paging rests: A once the
 * camera has settled (the #route landing too), B with the lamp parked at APM,
 * C at the end of the push in on 청평화, D with the bubble.
 */
export const STOP_RESTS = [CAMERA_END, (ARRIVALS[0] + APM_DEPARTURE) / 2, PUSH.to, (BUBBLE_AT + 1) / 2] as const;

/** The stop on screen at a pin progress: -1 before the pin, 0 to 3 (A to D) inside it, 4 after it. */
function stopAt(progress: number): number {
  if (progress < 0) return -1;
  if (progress >= 1) return STOP_RESTS.length;
  return captionIndex(progress);
}

/**
 * Keyboard paging through the pin (PageDown, PageUp, Space): a page from
 * `from` that the browser would land at `to` (pin progress) never steps over
 * a whole stop. A native page is about half the pin, so from B it would land
 * on D and the 03:06 frame, where the ledger moves, would never be a resting
 * frame. Returns the rest of the stop it would skip, or null to let the
 * browser page.
 */
export function pageRest(from: number, to: number): number | null {
  const at = stopAt(from);
  const lands = stopAt(to);
  if (lands > at + 1) return STOP_RESTS[at + 1] ?? null;
  if (lands < at - 1) return STOP_RESTS[at - 1] ?? null;
  return null;
}

/** One straight run of the dot: route fractions `from` to `to`, placed at `at` for `duration` (pin progress). */
export type RouteLeg = { from: number; to: number; at: number; duration: number };

/**
 * The two legs of the round, split at APM's route fraction (the generated
 * view's stops: start 0, apm about 0.546, cheongpyeonghwa 1).
 */
export function routeLegs(apmFraction: number): readonly [RouteLeg, RouteLeg] {
  if (!(apmFraction > 0 && apmFraction < 1)) {
    throw new RangeError(`route: the APM stop must lie inside the route, got ${apmFraction}`);
  }
  return [
    { from: 0, to: apmFraction, at: CAMERA_END, duration: ARRIVALS[0] - CAMERA_END },
    { from: apmFraction, to: 1, at: APM_DEPARTURE, duration: ARRIVALS[1] - APM_DEPARTURE },
  ];
}

/** The drawn share of the route (and the dot's route fraction) at a pin progress. */
export function drawnFraction(progress: number, apmFraction: number): number {
  const p = clamp01(progress);
  let drawn = 0;
  for (const leg of routeLegs(apmFraction)) {
    if (p <= leg.at) break;
    const t = Math.min(1, (p - leg.at) / leg.duration);
    drawn = leg.from + (leg.to - leg.from) * t;
  }
  return drawn;
}

type Size = { width: number; height: number };
type Point = { x: number; y: number };
/** [x0, y0, x1, y1] */
type Box = readonly [number, number, number, number];

/** The smallest end scale the camera settles on, however short the free band is. */
export const FIT_FLOOR = 0.6;
const FIT_STEP = 0.005;

/** A door tag: its door in map px at scale 1, and its box in screen px around the door (it never scales). */
export type DoorTag = { door: Point; box: Box };

type RoundInput = {
  /** The drawing to frame (buildings and route), in map px at scale 1. */
  shapes: Box;
  /** Door tags: they keep their pixel size while the drawing scales. */
  tags: readonly DoorTag[];
  /** The free band. */
  space: Size;
};

/** The bounding box of the drawing scaled by `scale` (about the map box's origin) and its constant-size tags. */
export function roundBounds({ shapes, tags }: Omit<RoundInput, "space">, scale: number): Box {
  let [x0, y0, x1, y1] = shapes.map((value) => value * scale);
  for (const { door, box } of tags) {
    x0 = Math.min(x0, door.x * scale + box[0]);
    y0 = Math.min(y0, door.y * scale + box[1]);
    x1 = Math.max(x1, door.x * scale + box[2]);
    y1 = Math.max(y1, door.y * scale + box[3]);
  }
  return [x0, y0, x1, y1];
}

/**
 * The round framing: the largest scale up to 1 (spec S3) at which the drawing
 * and its tags fit the free band, never below FIT_FLOOR, and the centre of
 * what is framed at that scale (in the same scaled space as roundBounds).
 * Tags are budgeted in pixels, so a short screen that shrinks the map still
 * keeps room for them.
 */
export function frameRound({ shapes, tags, space }: RoundInput): { scale: number; centre: Point } {
  let scale = 1;
  let bounds = roundBounds({ shapes, tags }, scale);
  while (scale - FIT_STEP >= FIT_FLOOR - 1e-9) {
    if (bounds[2] - bounds[0] <= space.width && bounds[3] - bounds[1] <= space.height) break;
    scale = Math.round((scale - FIT_STEP) * 1e4) / 1e4;
    bounds = roundBounds({ shapes, tags }, scale);
  }
  return { scale, centre: { x: (bounds[0] + bounds[2]) / 2, y: (bounds[1] + bounds[3]) / 2 } };
}

/**
 * The camera translate (px) that puts a point given in scaled map space
 * (scale × map px, as frameRound's centre) on a target. The camera scales
 * about `origin` (px from the map box's top-left) and its box sits at `box`.
 */
export function cameraShift({
  box,
  origin,
  scale,
  centre,
  target,
}: {
  box: { left: number; top: number };
  origin: Point;
  scale: number;
  centre: Point;
  target: Point;
}): Point {
  return {
    x: target.x - box.left - origin.x * (1 - scale) - centre.x,
    y: target.y - box.top - origin.y * (1 - scale) - centre.y,
  };
}

/**
 * The translate change that keeps `anchor` (map px at scale 1) still on
 * screen while the camera scale goes from `from` to `to` about `origin`.
 */
export function pushShift({ anchor, origin, from, to }: { anchor: Point; origin: Point; from: number; to: number }): Point {
  return { x: (from - to) * (anchor.x - origin.x), y: (from - to) * (anchor.y - origin.y) };
}

/**
 * An ease for a tween from 1 / from to 1 / to that keeps the product with a
 * from-to scale eased by `outer` at exactly 1 (the lamp keeps its 16px while
 * the camera scales).
 */
export function inverseScaleEase(from: number, to: number, outer: (t: number) => number = (t) => t): (t: number) => number {
  const start = 1 / from;
  const span = 1 / to - start;
  return (t) => {
    const e = outer(t);
    return span === 0 ? e : (1 / (from + (to - from) * e) - start) / span;
  };
}

/** The camera's pose: translate (px), scale and tilt (rotateX, degrees). */
export type CameraPose = { x: number; y: number; scale: number; tilt: number };

/** The pose at camera time `u` (0 to 1) of the settle, which runs with ease none. */
export function settlePose(from: CameraPose, to: CameraPose, u: number): CameraPose {
  const t = clamp01(u);
  const mix = (a: number, b: number) => a + (b - a) * t;
  return { x: mix(from.x, to.x), y: mix(from.y, to.y), scale: mix(from.scale, to.scale), tilt: mix(from.tilt, to.tilt) };
}

/**
 * Where a point of the map lands under a pose, as CSS draws the camera's
 * transform perspective(d) translate(x, y) rotateX(tilt) scale(scale) about
 * its origin. The point and the result are px from the origin's place with no
 * transform.
 */
export function projectPoint(point: Point, pose: CameraPose, perspective: number): Point {
  const angle = (pose.tilt * Math.PI) / 180;
  const y = point.y * pose.scale;
  const depth = perspective / (perspective - y * Math.sin(angle));
  return { x: (point.x * pose.scale + pose.x) * depth, y: (y * Math.cos(angle) + pose.y) * depth };
}

/** Camera samples per settle when a label is checked against the heading. */
const CLEAR_SAMPLES = 60;

/**
 * A map label against the heading through the camera's settle (spec S3: no
 * element over a heading). Every box is in px from the camera origin's place
 * with no transform.
 */
export type HeadingClearanceInput = {
  /** The label's box at scale 1. It keeps its size while the camera scales (its counter-scale). */
  label: Box;
  /** The point the label's counter-scale holds still: its centre. */
  centre: Point;
  /** The heading's box, and the air it keeps around it. */
  heading: Box;
  margin: number;
  /** The settle: from the S2 end state to the round framing. */
  from: CameraPose;
  to: CameraPose;
  perspective: number;
  /** Camera time over which the label fades back in once it is clear (and out before it meets the heading). */
  ramp: number;
};

/**
 * An opacity factor over the settle (camera time 0 to 1) for one label: 0
 * wherever the camera carries it onto the heading, back to 1 over `ramp`
 * either side (smoothstep), and 1 throughout when it never meets it. The
 * ramps never reach past the settle: a label clear at either end is at full
 * strength there (the S2 frame and the round framing are kept exactly).
 */
export function headingClearance({ label, centre, heading, margin, from, to, perspective, ramp }: HeadingClearanceInput): (u: number) => number {
  const [h0, h1, h2, h3] = [heading[0] - margin, heading[1] - margin, heading[2] + margin, heading[3] + margin];
  // Runs of camera time [start, end] over which the label meets the heading (adjacent samples join).
  const runs: Array<[number, number]> = [];
  let previous = -2;
  for (let i = 0; i <= CLEAR_SAMPLES; i += 1) {
    const u = i / CLEAR_SAMPLES;
    const pose = settlePose(from, to, u);
    const corners = [
      [label[0], label[1]],
      [label[2], label[1]],
      [label[0], label[3]],
      [label[2], label[3]],
    ].map(([x, y]) => projectPoint({ x: centre.x + (x - centre.x) / pose.scale, y: centre.y + (y - centre.y) / pose.scale }, pose, perspective));
    const xs = corners.map((corner) => corner.x);
    const ys = corners.map((corner) => corner.y);
    if (!(Math.min(...xs) < h2 && Math.max(...xs) > h0 && Math.min(...ys) < h3 && Math.max(...ys) > h1)) continue;
    const run = runs[runs.length - 1];
    if (run && previous === i - 1) run[1] = u;
    else runs.push([u, u]);
    previous = i;
  }
  const first = runs[0]?.[0];
  const last = runs[runs.length - 1]?.[1];
  if (first === undefined || last === undefined) return () => 1;
  return (u) => {
    const reach = u < first ? Math.min(ramp, first) : u > last ? Math.min(ramp, 1 - last) : ramp;
    const gap = Math.min(...runs.map(([start, end]) => (u < start ? start - u : u > end ? u - end : 0)));
    const away = clamp01(gap / reach);
    return away * away * (3 - 2 * away);
  };
}
