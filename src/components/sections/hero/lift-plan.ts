/**
 * How the hero's text block leaves at the start of the dive (spec S1, 18.1:
 * "the scaling dot and 남평화 never cross half-visible text").
 *
 * The dive scales and tilts the map about 청평화's roof and pans it to S2's
 * framing, so the lamp dot on 청평화 1층 moves down while the text block
 * rises to meet it. How soon they meet depends on the screen: on a 1440x900
 * frame the dot rests 60px above the H1, on 1366x768 only 18px. The text
 * fades over `fade` of the pin (at most 0.2) and rises `rise` px on an ease-in
 * (k squared, k the share of the fade), and this picks the longest fade, then
 * the largest rise, for which the dot has not touched any line of the text
 * while that line is still more than 40% visible.
 *
 * Pure: every rect and point is in px of the pinned element, untransformed.
 */

export type Point = { x: number; y: number };
export type Rect = { left: number; top: number; right: number; bottom: number };

/** The map's dive (scale, tilt, pan) runs over the first 60% of the pin. */
export const MAP_SPAN = 0.6;
/** The text block's window: it is gone by 20% of the pin on every screen. */
export const COPY_SPAN = 0.2;

export type LiftInput = {
  /** The map's transform origin (청평화's roof) at rest. */
  origin: Point;
  /** The dot's centre relative to that origin, in the map's own (unscaled) px. */
  dot: Point;
  /** The dot's diameter at rest. */
  size: number;
  /** The pan at the end of the map's dive (px). */
  shift: Point;
  /** The scale at the end of the map's dive. */
  scale: number;
  /** The tilt at the end of the map's dive (rotateX, degrees; 0 on low-power devices). */
  tilt: number;
  /** The tilt's perspective (px). */
  perspective: number;
  /** The text block at rest: the H1's lines, the sub and the CTA row. */
  text: readonly Rect[];
};

export type LiftPlan = {
  /** Share of the pin over which the text block fades out. */
  fade: number;
  /** How far it rises meanwhile (px, on an ease-in). */
  rise: number;
};

export type LiftOptions = {
  maxFade?: number;
  minFade?: number;
  maxRise?: number;
  /** Text at or below this opacity may meet the dot. */
  visible?: number;
  /** Air kept between the dot and the text (px). */
  clearance?: number;
};

/** Rises tried for each fade, largest first: 64px (spec S1) down to none. */
const RISE_STEP = 8;
const FADE_STEP = 0.01;
const SAMPLE = 0.002;

/**
 * Where the dot is at pin `progress`: the map's pan, scale and tilt (GSAP's
 * perspective(P) rotateX(θ) scale(s) about the origin, inside the pan) applied
 * to the dot's centre, with its size scaled by the same factor.
 */
export function dotRectAt(input: LiftInput, progress: number): Rect {
  const t = Math.min(1, Math.max(0, progress / MAP_SPAN));
  const scale = 1 + (input.scale - 1) * t;
  const theta = (input.tilt * t * Math.PI) / 180;
  const depth = scale * input.dot.y * Math.sin(theta);
  const projection = input.perspective / (input.perspective - depth);
  const x = input.origin.x + input.shift.x * t + scale * input.dot.x * projection;
  const y = input.origin.y + input.shift.y * t + scale * input.dot.y * Math.cos(theta) * projection;
  const half = (input.size / 2) * scale * projection;
  return { left: x - half, top: y - half, right: x + half, bottom: y + half };
}

/** The text block's offset (px, negative is up) at pin `progress`. */
export function liftOffset(plan: LiftPlan, progress: number): number {
  const k = Math.min(1, Math.max(0, progress / plan.fade));
  return -plan.rise * k * k;
}

/** The text block's opacity at pin `progress`. */
export function liftOpacity(plan: LiftPlan, progress: number): number {
  return 1 - Math.min(1, Math.max(0, progress / plan.fade));
}

/** The first sampled progress below `until` at which the dot meets the lifted text, or null. */
export function firstContact(input: LiftInput, plan: LiftPlan, until: number, clearance = 0): number | null {
  for (let progress = 0; progress < until; progress += SAMPLE) {
    const dot = dotRectAt(input, progress);
    const dy = liftOffset(plan, progress);
    const hit = input.text.some(
      (rect) =>
        dot.left - clearance < rect.right &&
        rect.left < dot.right + clearance &&
        dot.top - clearance < rect.bottom + dy &&
        rect.top + dy < dot.bottom + clearance,
    );
    if (hit) return progress;
  }
  return null;
}

/**
 * The longest fade (0.2 down to `minFade`) and, for it, the largest rise
 * (64px down to 0) that keep the dot off the text while the text is above
 * `visible` opacity. If even the shortest fade without a rise cannot (the dot
 * already sits on the text), that is what it gets: the text then leaves as
 * fast as the dive allows.
 */
export function planLift(input: LiftInput, { maxFade = COPY_SPAN, minFade = 0.06, maxRise = 64, visible = 0.4, clearance = 4 }: LiftOptions = {}): LiftPlan {
  const fades = Math.round((maxFade - minFade) / FADE_STEP);
  for (let index = 0; index <= fades; index += 1) {
    const fade = Math.round((maxFade - index * FADE_STEP) * 1e4) / 1e4;
    for (let rise = maxRise; rise >= 0; rise -= RISE_STEP) {
      const plan = { fade, rise };
      if (firstContact(input, plan, (1 - visible) * fade, clearance) === null) return plan;
    }
  }
  return { fade: minFade, rise: 0 };
}
