// Film colour audit (spec 4.1 and 11): green is the only key colour, so no
// film frame may carry orange (the v1 persimmon) or lime.
//
// Each video is sampled at 2 frames per second, scaled to 480 px wide; each
// image is scaled to the same width. A pixel is orange when its hue is 8-60
// degrees with saturation above 0.35 and value above 0.35, lime when its hue
// is 65-100 degrees with saturation above 0.5 and value above 0.6. A frame
// fails when more than 100 of its pixels match either range.
//
// The app's red badge (#E42939, hue about 355) lies outside both ranges; it
// is allowed inside real footage by the pixel rule (spec 2).

import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";

import { ffmpeg } from "./proc.mjs";

export const AUDIT = Object.freeze({
  fps: 2,
  width: 480,
  maxPixels: 100,
  orange: Object.freeze({ hueMin: 8, hueMax: 60, saturationAbove: 0.35, valueAbove: 0.35 }),
  lime: Object.freeze({ hueMin: 65, hueMax: 100, saturationAbove: 0.5, valueAbove: 0.6 }),
});

/**
 * 8-bit RGB to HSV with hue in degrees [0, 360) and s, v in [0, 1].
 * @returns {{ h: number, s: number, v: number }}
 */
export function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const v = max / 255;
  const s = max === 0 ? 0 : delta / max;
  if (delta === 0) return { h: 0, s, v };
  let h;
  if (max === r) h = 60 * ((g - b) / delta);
  else if (max === g) h = 60 * ((b - r) / delta + 2);
  else h = 60 * ((r - g) / delta + 4);
  if (h < 0) h += 360;
  return { h, s, v };
}

const inRange = (hsv, range) =>
  hsv.h >= range.hueMin && hsv.h <= range.hueMax && hsv.s > range.saturationAbove && hsv.v > range.valueAbove;

/** @returns {"orange" | "lime" | null} */
export function classifyPixel(r, g, b) {
  const hsv = rgbToHsv(r, g, b);
  if (inRange(hsv, AUDIT.orange)) return "orange";
  if (inRange(hsv, AUDIT.lime)) return "lime";
  return null;
}

/**
 * Banned-pixel counts of an interleaved 8-bit buffer.
 * @param {Uint8Array} data
 * @param {number} channels 3 (RGB) or 4 (RGBA; alpha ignored)
 */
export function countBanned(data, channels) {
  let orange = 0;
  let lime = 0;
  for (let i = 0; i + 2 < data.length; i += channels) {
    const kind = classifyPixel(data[i], data[i + 1], data[i + 2]);
    if (kind === "orange") orange += 1;
    else if (kind === "lime") lime += 1;
  }
  return { orange, lime };
}

/** @param {{ orange: number, lime: number }} counts */
export function frameFails(counts) {
  return counts.orange + counts.lime > AUDIT.maxPixels;
}

async function countImage(source) {
  const { data, info } = await sharp(source).resize({ width: AUDIT.width }).raw().toBuffer({ resolveWithObject: true });
  return countBanned(data, info.channels);
}

/**
 * @typedef {{ frame: number, time: number, orange: number, lime: number }} FrameCount
 * @typedef {{ file: string, kind: "video" | "image", frames: number, failures: FrameCount[], worst: FrameCount, keptFrames: string | null }} AuditResult
 */

/**
 * Samples a video at AUDIT.fps and counts banned pixels per frame.
 * Failing frames are kept in a temp folder (path in keptFrames) for review.
 * @param {string} file
 * @returns {Promise<AuditResult>}
 */
export async function auditVideo(file) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "au-film-audit-"));
  let keep = false;
  try {
    await ffmpeg(["-i", file, "-an", "-vf", `fps=${AUDIT.fps},scale=${AUDIT.width}:-2`, path.join(dir, "frame-%05d.png")]);
    const names = (await readdir(dir)).filter((name) => name.endsWith(".png")).sort();
    if (names.length === 0) throw new Error(`no frames decoded from ${file}`);
    /** @type {FrameCount[]} */
    const counts = [];
    for (const [index, name] of names.entries()) {
      const { orange, lime } = await countImage(path.join(dir, name));
      counts.push({ frame: index + 1, time: index / AUDIT.fps, orange, lime });
    }
    const failures = counts.filter(frameFails);
    keep = failures.length > 0;
    const worst = counts.reduce((a, b) => (b.orange + b.lime > a.orange + a.lime ? b : a));
    return { file, kind: "video", frames: counts.length, failures, worst, keptFrames: keep ? dir : null };
  } finally {
    if (!keep) await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Counts banned pixels of a still at the audit width.
 * @param {string} file
 * @returns {Promise<AuditResult>}
 */
export async function auditImage(file) {
  const { orange, lime } = await countImage(file);
  const count = { frame: 1, time: 0, orange, lime };
  return { file, kind: "image", frames: 1, failures: frameFails(count) ? [count] : [], worst: count, keptFrames: null };
}

/** @param {string} file */
export function auditFile(file) {
  return /\.(mp4|webm|mov|m4v)$/i.test(file) ? auditVideo(file) : auditImage(file);
}
