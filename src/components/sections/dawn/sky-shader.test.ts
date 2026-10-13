import { describe, expect, it } from "vitest";

import { SKY_FRAGMENT, SKY_VERTEX } from "./sky-shader";
import { HORIZON, RAMP, SKY_STOPS, hexToRgb } from "./sky-ramp";

describe("sky shaders", () => {
  it("templates every stop of the ramp as a vec3 constant, in order", () => {
    SKY_STOPS.forEach((stop, index) => {
      const [r, g, b] = hexToRgb(stop.hex).map((channel) => Number((channel / 255).toFixed(6)));
      const line = SKY_FRAGMENT.split("\n").find((candidate) => candidate.startsWith(`const vec3 C${index} =`));
      expect(line).toBeDefined();
      const inside = /vec3\(([^)]*)\)/.exec(line ?? "")?.[1] ?? "";
      expect(inside.split(",").map((part) => Number(part.trim()))).toEqual([r, g, b]);
      expect(line).toContain(stop.hex);
    });
  });

  it("uses the shared horizon and ramp constants", () => {
    expect(SKY_FRAGMENT).toContain(`const float H_START = ${HORIZON.start};`);
    expect(SKY_FRAGMENT).toContain(`const float H_END = ${HORIZON.end};`);
    expect(SKY_FRAGMENT).toContain(`const float R_HORIZON = ${RAMP.atHorizon};`);
  });

  it("dithers with a 4x4 Bayer matrix of plus or minus 1/255 before output", () => {
    expect(SKY_FRAGMENT).toContain("float bayer4(vec2 a)");
    expect(SKY_FRAGMENT).toMatch(/bayer4\(gl_FragCoord\.xy\)[^;]*\/ 255\.0;/);
    expect(SKY_FRAGMENT).toContain("gl_FragColor = vec4(color + dither, 1.0);");
  });

  it("reads progress and resolution uniforms and the Triangle's attributes", () => {
    expect(SKY_FRAGMENT).toContain("uniform float uProgress;");
    expect(SKY_FRAGMENT).toContain("uniform vec2 uResolution;");
    expect(SKY_VERTEX).toContain("attribute vec2 position;");
    expect(SKY_VERTEX).toContain("attribute vec2 uv;");
  });

  it("has no unfilled template slots", () => {
    expect(SKY_FRAGMENT).not.toMatch(/\$\{|undefined|NaN/);
  });
});

describe("Bayer 4x4 (the shader's formula, evaluated in JS)", () => {
  const fract = (value: number) => value - Math.floor(value);
  const bayer2 = (x: number, y: number) => {
    const fx = Math.floor(x);
    const fy = Math.floor(y);
    return fract(fx * 0.5 + fy * fy * 0.75);
  };
  const bayer4 = (x: number, y: number) => bayer2(0.5 * x, 0.5 * y) * 0.25 + bayer2(x, y);

  it("covers 16 distinct levels in every 4x4 tile, centred on zero within 1/255", () => {
    const levels = new Set<number>();
    let sum = 0;
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        const value = (bayer4(x + 0.5, y + 0.5) / 0.9375) * 2 - 1;
        levels.add(Math.round(value * 1000));
        sum += value;
        expect(Math.abs(value)).toBeLessThanOrEqual(1);
      }
    }
    expect(levels.size).toBe(16);
    expect(Math.abs(sum / 16)).toBeLessThan(1e-9);
  });
});
