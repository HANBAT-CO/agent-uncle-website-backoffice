/**
 * The S5 dawn sky shaders (spec S5): a full-frame triangle whose fragment
 * shader draws the six-stop vertical ramp, shifted by the pin's progress,
 * with the mint horizon light rising through it. A 4x4 ordered (Bayer)
 * dither of plus or minus 1/255 is added before output, so the long dark
 * greens never band on 8-bit displays.
 *
 * Every number comes from ./sky-ramp.ts, the same model the CSS fallback and
 * the DOM colour flips use. GLSL ES 1.00 so it runs on WebGL 1 and 2.
 *
 * Uniforms:
 * - uProgress: pin progress 0..1 (the scrubbed timeline's progress)
 * - uResolution: drawing-buffer size in pixels (for the horizon curvature)
 */

import { HORIZON, HORIZON_BAND, HORIZON_CURVE, RAMP, SKY_STOPS, hexToRgb } from "./sky-ramp";

/** A GLSL float literal ("1.0", "-0.5", "0.514"). */
function float(value: number): string {
  const text = Number(value.toFixed(6)).toString();
  return text.includes(".") || text.includes("e") ? text : `${text}.0`;
}

function vec3(hex: string): string {
  return `vec3(${hexToRgb(hex)
    .map((channel) => float(channel / 255))
    .join(", ")})`;
}

const stopConstants = SKY_STOPS.map((stop, index) => `const vec3 C${index} = ${vec3(stop.hex)}; // ${stop.hex}`).join("\n");

const stopPositions = SKY_STOPS.map((stop, index) => `const float P${index} = ${float(stop.at)};`).join("\n");

/** Chained mixes: each segment saturates in order, so r inside segment k leaves earlier segments at their end colour. */
const rampBody = SKY_STOPS.slice(1)
  .map((_, i) => `  c = mix(c, C${i + 1}, clamp((r - P${i}) / (P${i + 1} - P${i}), 0.0, 1.0));`)
  .join("\n");

/** Index of the mint horizon light (#F2FFE8) in the stops. */
const MINT_INDEX = SKY_STOPS.findIndex((stop) => stop.hex === "#F2FFE8");

export const SKY_VERTEX = /* glsl */ `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

export const SKY_FRAGMENT = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform float uProgress;
uniform vec2 uResolution;
varying vec2 vUv;

${stopConstants}
${stopPositions}

const float H_START = ${float(HORIZON.start)};
const float H_END = ${float(HORIZON.end)};
const float H_UNTIL = ${float(HORIZON.until)};
const float R_HORIZON = ${float(RAMP.atHorizon)};
const float R_SLOPE = ${float(RAMP.perViewport)};
const float CURVE = ${float(HORIZON_CURVE)};
const float BAND_WIDTH = ${float(HORIZON_BAND.width)};
const float BAND_STRENGTH = ${float(HORIZON_BAND.strength)};

// Horizon line (0 = top, 1 = bottom of the frame): ease-in to H_END by H_UNTIL, then hold.
float horizonAt(float p) {
  float t = clamp(p / H_UNTIL, 0.0, 1.0);
  float t2 = t * t;
  return H_START - (H_START - H_END) * t2 * t2;
}

vec3 ramp(float r) {
  vec3 c = C0;
${rampBody}
  return c;
}

// Ordered dither: 2x2 Bayer, then 4x4 from two octaves (16 levels in [0, 15/16]).
float bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x * 0.5 + a.y * a.y * 0.75);
}

float bayer4(vec2 a) {
  return bayer2(0.5 * a) * 0.25 + bayer2(a);
}

void main() {
  float v = 1.0 - vUv.y;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  float x = (vUv.x - 0.5) * aspect;
  float horizon = horizonAt(uProgress) + CURVE * x * x;

  float r = clamp(R_HORIZON + (v - horizon) * R_SLOPE, 0.0, 1.0);
  vec3 color = ramp(r);

  // The mint light sits where the ramp passes it and rises with the horizon.
  float bandCentre = horizon + (P${MINT_INDEX} - R_HORIZON) / R_SLOPE;
  float d = (v - bandCentre) / BAND_WIDTH;
  color = mix(color, C${MINT_INDEX}, exp(-d * d) * BAND_STRENGTH);

  // Plus or minus 1/255, centred on zero.
  float dither = (bayer4(gl_FragCoord.xy) / 0.9375 * 2.0 - 1.0) / 255.0;
  gl_FragColor = vec4(color + dither, 1.0);
}
`;
