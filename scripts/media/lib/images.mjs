// Still encoding with sharp (spec 11): sRGB, Lanczos3 resize to exact
// manifest sizes, AVIF quality 60 effort 6 with 4:4:4 chroma (thin UI text
// and hairlines keep their colour edges), WebP quality 82 effort 6.

import sharp from "sharp";

import { commit, tempFor } from "./cache.mjs";

export const AVIF = Object.freeze({ quality: 60, effort: 6, chromaSubsampling: "4:4:4" });
export const WEBP = Object.freeze({ quality: 82, effort: 6 });

/**
 * Resizes `input` to width x height (fit fill by default: most manifest sizes
 * keep the source aspect within half a pixel) and writes AVIF and/or WebP.
 * @param {string} input image file
 * @param {{ width: number, height: number, avif?: string, webp?: string, fit?: "fill" | "cover" }} target absolute output files
 */
export async function encodeStill(input, target) {
  const resized = sharp(input)
    .toColourspace("srgb")
    .resize({ width: target.width, height: target.height, fit: target.fit ?? "fill", position: "center", kernel: "lanczos3" });
  if (target.avif) {
    const temp = tempFor(target.avif);
    await resized.clone().avif(AVIF).toFile(temp);
    commit(temp, target.avif);
  }
  if (target.webp) {
    const temp = tempFor(target.webp);
    await resized.clone().webp(WEBP).toFile(temp);
    commit(temp, target.webp);
  }
}

/**
 * @param {string} file
 * @returns {Promise<{ width: number, height: number, format: string }>}
 */
export async function imageSize(file) {
  const meta = await sharp(file).metadata();
  if (!meta.width || !meta.height || !meta.format) throw new Error(`cannot read image ${file}`);
  return { width: meta.width, height: meta.height, format: meta.format };
}

/**
 * Mean RGB of a square in the top-left corner, to tell the loop palettes
 * apart (brand field #0C483E, calm field #EDECE3).
 * @param {string} file
 */
export async function cornerColor(file, size = 24) {
  const { data, info } = await sharp(file)
    .extract({ left: 0, top: 0, width: size, height: size })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sum = [0, 0, 0];
  for (let i = 0; i < data.length; i += info.channels) {
    sum[0] += data[i];
    sum[1] += data[i + 1];
    sum[2] += data[i + 2];
  }
  const n = data.length / info.channels;
  return sum.map((value) => Math.round(value / n));
}
