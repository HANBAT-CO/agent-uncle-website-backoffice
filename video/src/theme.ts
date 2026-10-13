import { Easing, interpolate } from "remotion";

/**
 * v2 palette: green is the key colour. No orange, no lime, no red outside the real app footage.
 * (Client feedback on v1: "key color가 우리는 초록색이기 때문에 주황색은 안넣었으면 좋겠어.")
 */
export const C = {
  ink: "#101010",
  logoInk: "#111111",
  paper: "#EDECE3",
  paper2: "#F5F4EE",
  bubble: "#E4E3DA",
  grey800: "#2D2D2D",
  grey700: "#484848",
  grey600: "#636363",
  hair: "#D7D7D7",
  /** key green: hero dot on light fields, green fields, block tops, highlight frames */
  green: "#0C483E",
  /** darkest green: I5 field, block left faces */
  greenDeep: "#07231C",
  /** block right faces */
  greenDark: "#093A32",
  /** mid green: hot ticks on light fields, dashed hollow slots, outline type rows */
  greenMid: "#2E8C6B",
  tint1: "#D9E9DC",
  tint2: "#B6D7C2",
  /** mint: the dot on green fields, ripples on green buttons, tags */
  mint: "#F2FFE8",
};

/** The hero dot: green on light fields, mint on green fields. */
export const dotOn = (field: "light" | "dark") => (field === "light" ? C.green : C.mint);

export const BLOCK = { top: C.green, left: C.greenDeep, right: C.greenDark };

export const FONT = "Paperlogy";

export const ease = {
  /** crisp entrance, no overshoot */
  out: Easing.bezier(0.16, 1, 0.3, 1),
  /** accelerate away / gravity */
  in: Easing.bezier(0.7, 0, 0.84, 0),
  inQuad: Easing.bezier(0.55, 0.085, 0.68, 0.53),
  outQuad: Easing.bezier(0.25, 0.46, 0.45, 0.94),
  /** camera punch-ins */
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  /** lock-ins, chips, phones arriving */
  overshoot: Easing.bezier(0.34, 1.56, 0.64, 1),
  /** the dot landing */
  snap: Easing.bezier(0.18, 1.9, 0.42, 1),
  /** the dot before a jump */
  anticipate: Easing.bezier(0.36, 0, 0.66, -0.56),
  linear: Easing.linear,
};

export type EaseName = keyof typeof ease;
export type EaseFn = (t: number) => number;

/** Clamped interpolate shorthand. */
export const lerp = (frame: number, input: readonly number[], output: readonly number[], easing?: EaseFn) =>
  interpolate(frame, input, output, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });

/** 0..1 progress of `frame` through [start, start+dur]. */
export const prog = (frame: number, start: number, dur: number, easing?: EaseFn) =>
  dur <= 0 ? (frame >= start ? 1 : 0) : lerp(frame, [start, start + dur], [0, 1], easing);

export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Deterministic pseudo-random in [0,1) from an integer seed. */
export const rand = (seed: number) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
};

export const hexToRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
};

export const mixColor = (a: string, b: string, t: number) => {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const c = ca.map((v, i) => Math.round(mix(v, cb[i], Math.min(1, Math.max(0, t)))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
};

/** Soft pulse that peaks on frame `at` (0..1). */
export const blip = (f: number, at: number, rise = 2, fall = 8) =>
  lerp(f, [at - rise, at, at + fall], [0, 1, 0], ease.out);
