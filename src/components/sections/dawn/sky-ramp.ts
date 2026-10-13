/**
 * The S5 dawn sky as numbers (spec S5, 4.1): one vertical ramp through the
 * six stops, night ground to morning canvas, and a horizon that rises with
 * the pin's progress. Pure, shared by three renderers so they always agree:
 *
 * - the ogl fragment shader (sky-shader.ts templates these constants in),
 * - the CSS fallback: a tall gradient moved by one transform (fallbackShift),
 * - the DOM: text and strokes on the sky flip from night to day colours when
 *   the horizon passes them (isLit), at the point where light and dark text
 *   read equally on the ramp.
 *
 * Coordinates: v is the vertical position in the frame, 0 at the top and 1 at
 * the bottom. r is the position on the ramp, 0 = #07231C and 1 = #EDECE3.
 * Above the horizon the sky is darker, below it lighter:
 *
 *   r(v, p) = clamp(RAMP.atHorizon + (v - horizonAt(p)) * RAMP.perViewport, 0, 1)
 */

export type SkyStop = { readonly hex: string; readonly at: number };

/** Spec S5 stops: #07231C, #093A32, #0C483E, #B6D7C2, #F2FFE8 (the horizon light), #EDECE3. */
export const SKY_STOPS: readonly SkyStop[] = [
  { hex: "#07231C", at: 0 },
  { hex: "#093A32", at: 0.26 },
  { hex: "#0C483E", at: 0.44 },
  { hex: "#B6D7C2", at: 0.64 },
  { hex: "#F2FFE8", at: 0.8 },
  { hex: "#EDECE3", at: 1 },
];

/**
 * The ramp around the horizon line.
 * - atHorizon: ramp value on the horizon line. It is the point where #EDECE3
 *   and #101010 text have equal contrast, so "the light has reached it" and
 *   "switch to day colours" are the same moment.
 * - perViewport: ramp change per frame height (the whole ramp spans one frame).
 */
export const RAMP = { atHorizon: 0.514, perViewport: 1 } as const;

/**
 * Horizon line position over the pin: an ease-in (power 4) from just below
 * the frame to above it, reaching the end at `until` and holding to 100%.
 * The curve is tuned so the first light shows at the foot of the frame from
 * the start (a faint pre-dawn band) and the horizon enters the frame at about
 * 34%, just after the card lands, so the light rises through the empty middle
 * of the stage over 0.34-0.70 instead of 0.45-0.70. It reaches the route (66%
 * down) at about 50%, the dot inks at about 51% (spec 0.50-0.60), and it
 * reaches the heading (16-20% down) at about 61%, the theme switch at 62%.
 */
export const HORIZON = { start: 1.09, end: -0.5, until: 0.7, power: 4 } as const;

/** Slight curvature of the horizon towards the frame edges (shader only), in v per squared aspect unit. */
export const HORIZON_CURVE = 0.035;

/** The mint horizon light: a soft band where the ramp passes #F2FFE8 (shader only). */
export const HORIZON_BAND = { width: 0.07, strength: 0.3 } as const;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Horizon line (v) at pin progress 0..1. */
export function horizonAt(progress: number): number {
  const t = clamp01(clamp01(progress) / HORIZON.until);
  return HORIZON.start - (HORIZON.start - HORIZON.end) * t ** HORIZON.power;
}

/** The pin progress at which the horizon reaches v (0 if it starts above v, `until` if it never does). */
export function progressWhenLit(v: number): number {
  const t = clamp01((HORIZON.start - v) / (HORIZON.start - HORIZON.end));
  return HORIZON.until * t ** (1 / HORIZON.power);
}

/** The pin progress at which the ramp at frame height v reaches value r. */
export function progressWhenRampReaches(v: number, r: number): number {
  return progressWhenLit(v - (r - RAMP.atHorizon) / RAMP.perViewport);
}

/** Frame height of the horizontal route on desktop (dawn.css: .dawn-route top 66%). */
export const ROUTE_V = 0.66;

/**
 * Ramp value where a mint lamp dot (#F2FFE8) and an ink dot (#0C483E) have
 * equal contrast on the sky: the dot inks as the sky behind it passes this.
 */
export const DOT_INK_RAMP = 0.55;

/** True once the horizon has risen to or above v: day colours there. */
export function isLit(v: number, progress: number): boolean {
  return horizonAt(progress) <= v;
}

/**
 * Text on the sky (spec 14, 4.5:1) switches in four steps, so no pair of inks
 * has to hold AA across the mid-tones it cannot:
 *
 * - night: night inks, #EDECE3 primary and #B6D7C2 secondary, while the ramp
 *   behind the element's lower edge is at most `nightSecondary`;
 * - night-strong: every line in #EDECE3 until the horizon reaches the
 *   element's middle (RAMP.atHorizon, where #EDECE3 and #101010 read equally);
 * - day-strong: every line in #101010 until the ramp behind the element's
 *   upper edge reaches `daySecondary`;
 * - day: day inks, #101010 primary and #636363 / #2D2D2D secondary.
 *
 * Values are ramp positions with a margin: #B6D7C2 holds 4.5:1 up to about
 * 0.478 (dither and rounding take 0.008), #636363 from about 0.700 (the
 * shader's horizon curves down 0.02 towards the frame edges, so 0.725).
 * Only the crossover itself (about 0.503-0.525, a few pixels of scroll) dips
 * under 4.5:1, to 4.0:1.
 */
export const TEXT_RAMP = { nightSecondary: 0.47, daySecondary: 0.725 } as const;

export type LightState = "night" | "night-strong" | "day-strong" | "day";

/** Pin progress at which an element spanning frame heights [top, bottom] enters night-strong, day-strong and day. */
export function lightThresholds(top: number, bottom: number): readonly [number, number, number] {
  const middle = (top + bottom) / 2;
  return [
    progressWhenRampReaches(bottom, TEXT_RAMP.nightSecondary),
    progressWhenLit(middle),
    progressWhenRampReaches(top, TEXT_RAMP.daySecondary),
  ];
}

/** The light state of an element (its lightThresholds) at pin progress. */
export function lightState(thresholds: readonly [number, number, number], progress: number): LightState {
  if (progress < thresholds[0]) return "night";
  if (progress < thresholds[1]) return "night-strong";
  if (progress < thresholds[2]) return "day-strong";
  return "day";
}

/** Ramp value (0..1) at frame height v and pin progress. */
export function rampAt(v: number, progress: number): number {
  return clamp01(RAMP.atHorizon + (v - horizonAt(progress)) * RAMP.perViewport);
}

/** "#0C483E" to [12, 72, 62]. */
export function hexToRgb(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new RangeError(`Not a #RRGGBB colour: ${hex}`);
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

const STOP_RGB = SKY_STOPS.map((stop) => hexToRgb(stop.hex));

/** sRGB colour (0..255 per channel, unrounded) of ramp value r, interpolated like a CSS gradient. */
export function rampColor(r: number): [number, number, number] {
  const value = clamp01(r);
  for (let i = 1; i < SKY_STOPS.length; i += 1) {
    const to = SKY_STOPS[i];
    if (value <= to.at) {
      const from = SKY_STOPS[i - 1];
      const t = (value - from.at) / (to.at - from.at);
      const a = STOP_RGB[i - 1];
      const b = STOP_RGB[i];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }
  }
  const last = STOP_RGB[STOP_RGB.length - 1];
  return [last[0], last[1], last[2]];
}

function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of an sRGB colour (0..255 per channel). */
export function relativeLuminance(rgb: readonly [number, number, number] | readonly number[]): number {
  return 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
}

/** WCAG contrast ratio of two relative luminances. */
export function contrastRatio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** A ramp span: the element's top edge sits at ramp value `from`, its bottom edge at `to`. */
export type RampRange = { readonly from: number; readonly to: number };

/**
 * Desktop CSS fallback: an element three frames tall whose middle frame holds
 * the whole ramp (solid night above, solid canvas below). One translateY
 * (fallbackShift) per frame reproduces the shader's ramp without repainting.
 */
export const FALLBACK_RANGE: RampRange = { from: -1, to: 2 };

/** Mobile static band (160vh): the horizon, where text flips, sits at the band's middle. */
export const BAND_RANGE: RampRange = { from: 0, to: RAMP.atHorizon * 2 };

/** `linear-gradient(180deg, ...)` placing the six stops on an element that spans `range`. */
export function rampGradient(range: RampRange): string {
  const span = range.to - range.from;
  const stops = SKY_STOPS.map((stop) => `${stop.hex} ${(((stop.at - range.from) / span) * 100).toFixed(3)}%`);
  return `linear-gradient(180deg, ${stops.join(", ")})`;
}

const FALLBACK_SCREENS = (FALLBACK_RANGE.to - FALLBACK_RANGE.from) / RAMP.perViewport;

/** Top of the fallback element in frame heights at pin progress. */
function fallbackTop(progress: number): number {
  return horizonAt(progress) + (FALLBACK_RANGE.from - RAMP.atHorizon) / RAMP.perViewport;
}

/** The fallback's translateY as a percentage of its own height (GSAP yPercent). */
export function fallbackShift(progress: number): number {
  return (fallbackTop(progress) / FALLBACK_SCREENS) * 100;
}

/** Ramp value the fallback element shows at frame height v (for tests: must equal rampAt). */
export function fallbackRampAt(v: number, progress: number): number {
  const top = (fallbackShift(progress) / 100) * FALLBACK_SCREENS;
  const u = (v - top) / FALLBACK_SCREENS;
  return clamp01(FALLBACK_RANGE.from + u * (FALLBACK_RANGE.to - FALLBACK_RANGE.from));
}

/** Height of the fallback element as a multiple of the frame. */
export const FALLBACK_HEIGHT = FALLBACK_SCREENS;
