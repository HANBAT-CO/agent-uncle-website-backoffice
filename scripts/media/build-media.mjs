// Media build (spec 11): real app clips and stills for S7 and S8, the promo
// film files, posters and chapter stills for S9, and
// src/content/generated/film.json.
//
//   npm run media                    build what changed (stamped, idempotent)
//   npm run media -- --force         rebuild everything
//   npm run media -- --only=app      app clips and stills only
//   npm run media -- --only=film     film files and film.json only
//   npm run media -- --no-render     never call Remotion for the brand loop
//   npm run media -- --scratch       film pipeline dry run: accepts renders older than the
//                                    timeline and writes to node_modules/.cache/agent-uncle-media/scratch
//                                    (public/ and film.json untouched)
//
// Inputs (read only):
//   .context/app-capture/videos and screenshots   the real app capture
//   video/out                                     the Remotion renders
//   video/src/timeline.ts                         chapters and lengths
//   src/content/media.ts                          the manifest: every output path and size
// Outputs: public/media/app/**, public/media/film/**, src/content/generated/film.json.
// Scratch: node_modules/.cache/agent-uncle-media (frames, the brand loop render, stamps).
//
// Exit code 1 on any hard failure (encoder error, size or budget mismatch,
// missing capture with no previous output, film colour audit failure).
// Missing green v2 film renders are not a failure here: film.json is written
// with ready false and a loud warning; the release gate (WP-20) blocks later.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { Stamps, clearTemp, commit, tempFor } from "./lib/cache.mjs";
import { AUDIT, auditFile, auditVideo } from "./lib/color-audit.mjs";
import { colorFilter, outputColorArgs, rgbFrameFilter } from "./lib/color.mjs";
import { chapterKeyframes, chaptersFromTimeline, chaptersWithoutKeyframe, checkFilmSource, isLegacyRender } from "./lib/film.mjs";
import { AVIF, WEBP, cornerColor, encodeStill, imageSize } from "./lib/images.mjs";
import {
  CACHE_DIR,
  CAPTURE_DIR,
  FILM_JSON,
  MEDIA_TS,
  ROOT,
  TIMELINE_TS,
  VIDEO_DIR,
  VIDEO_OUT,
  publicFile,
  rel,
} from "./lib/paths.mjs";
import { ffmpeg, keyframeTimes, probe, requireTools, run } from "./lib/proc.mjs";
import { banner, formatBytes, printTable } from "./lib/report.mjs";
import { importFile } from "./lib/ts-import.mjs";
import { typecheckFilm } from "./lib/typecheck.mjs";

const { values: options } = parseArgs({
  options: {
    force: { type: "boolean", default: false },
    only: { type: "string" },
    "no-render": { type: "boolean", default: false },
    scratch: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
  strict: true,
});

if (options.help) {
  console.log("Usage: node scripts/media/build-media.mjs [--force] [--only=app|film] [--no-render] [--scratch]");
  process.exit(0);
}
if (options.only && options.only !== "app" && options.only !== "film") {
  console.error(`--only must be app or film, not ${options.only}`);
  process.exit(1);
}
if (options.scratch && options.only === "app") {
  console.error("--scratch builds the film only");
  process.exit(1);
}
if (options.scratch) options.only = "film";

/** Scratch (dry run) destination for film outputs and film.json. */
const SCRATCH_DIR = path.join(CACHE_DIR, "scratch");
const FILM_JSON_OUT = options.scratch ? path.join(SCRATCH_DIR, "film.json") : FILM_JSON;

/** Absolute file for a film output URL (public/, or the scratch tree with --scratch). */
function filmOut(url) {
  return options.scratch ? path.join(SCRATCH_DIR, "public", ...url.slice(1).split("/")) : publicFile(url);
}

/** Spec 13: each app clip at most 1.8 MB (H.264). */
const MAX_CLIP_BYTES = 1_800_000;
/** Spec 13: stills at most 120 KB each (AVIF 1080w). */
const MAX_STILL_AVIF_BYTES = 120_000;

/** App clip trims (spec 11), keyed like APP_CLIPS. Sources are the 1080w30 web versions. */
const CLIP_SOURCES = {
  retailerDenimDetail: { file: "videos/03-request-detail_1080w30.mp4", start: 0, end: 17.62 },
  uncleHome: { file: "videos/05-uncle-home_1080w30.mp4", start: 0, end: 16.72 },
  // ends on the scrolled-up records, before the capture goes back to the 채팅 list (motion from 23.17s)
  chatHistory: { file: "videos/09-chat_1080w30.mp4", start: 14.0, end: 23.1 },
};

/**
 * App still sources (spec 11), keyed like APP_STILLS. First-frame stills come
 * from the 1320-wide 60 fps masters so the 1080w still is not an upscale.
 */
const STILL_SOURCES = {
  retailerHome0941: { png: "screenshots/04-home-scroll.png" },
  uncleHome0941: { png: "screenshots/10-uncle-home.png" },
  retailerDenimDetailFirst: { video: "videos/03-request-detail.mp4", at: 0.1 },
  uncleHomeFirst: { video: "videos/05-uncle-home.mp4", at: 0.1 },
  chatHistoryFirst: { video: "videos/09-chat.mp4", at: 14.0 },
  // the chat clip's resting end frame: 20:31, 02:16, 03:06, the 03:07 bubble and 05:53
  chatHistoryRecords: { video: "videos/09-chat.mp4", at: 23.0 },
};

/**
 * Film sources in video/out, first match wins. The green v2 renders were
 * first planned as *-v2-*.mp4; video/scripts/render-all.sh writes them under
 * the canonical names and the persimmon v1 cut now carries a -v1 suffix.
 * A canonical-name file is used only when it matches the v2 timeline frame
 * count and passes the colour audit, so a v1 file under that name is refused.
 */
const MASTER_CANDIDATES = ["agent-uncle-promo-v2-16x9.mp4", "agent-uncle-promo-16x9.mp4"];
const SOCIAL_CANDIDATES = ["agent-uncle-promo-v2-9x16.mp4", "agent-uncle-promo-9x16.mp4"];
/** Brand-palette loop (green field), rendered on demand into the cache when absent. */
const LOOP_BRAND_CANDIDATE = "agent-uncle-hero-loop-v2-brand.mp4";
/** Fallbacks: the calm-palette v2 loop (off-white field). */
const LOOP_FALLBACK_CANDIDATES = ["agent-uncle-hero-loop-v2.mp4", "agent-uncle-hero-loop.mp4"];
const BRAND_LOOP_RENDER = path.join(CACHE_DIR, "hero-loop-brand.mp4");
/** HeroLoop field colours (video/src/HeroLoop.tsx): brand #0C483E. */
const BRAND_FIELD = [12, 72, 62];

/**
 * Film encodes (spec 11). Keys are FilmFiles keys in src/content/media.ts.
 * - gop: the longest keyframe interval (2 s on the cuts, 1 s on the loops).
 * - chapterSeek: an IDR frame on every chapter start, so a chapter tick (spec
 *   S9, 16:9 frame only) seeks onto a keyframe and paints at once.
 * - level: H.264 level 4.0 on the 1080p files (x264 then keeps 4 reference
 *   frames), the level hardware decoders take for granted; the 720p files
 *   come out at 3.1 on their own.
 */
const FILM_ENCODES = {
  master1080: { source: "master", width: 1920, height: 1080, crf: 23, audio: true, gop: 60, chapterSeek: true, level: "4.0" },
  master720: { source: "master", width: 1280, height: 720, crf: 25, audio: true, gop: 60, chapterSeek: true },
  social720: { source: "social", width: 720, height: 1280, crf: 24, audio: true, gop: 60 },
  loop720: { source: "loop", width: 1280, height: 720, crf: 24, audio: false, gop: 30 },
  loop1080: { source: "loop", width: 1920, height: 1080, crf: 24, audio: false, gop: 30, level: "4.0" },
};

/**
 * Posters (spec 11). Keys are FilmFiles Poster keys. fromEnd: seconds before
 * the end of the source; at: seconds from its start.
 * - posterEnd, posterSocialEnd: the last frame of each cut.
 * - posterLoop: the loop at 0.1 s, the same grid frame the player uses as its
 *   still before the loop decodes.
 * - posterLoopSocial: the centre cover crop of the loop at 0.1 s, so mobile
 *   Save-Data uses the same grid frame under the play mark.
 */
const FILM_POSTERS = {
  posterEnd: { source: "master", fromEnd: 0.1 },
  posterSocialEnd: { source: "social", fromEnd: 0.1 },
  posterLoop: { source: "loop", at: 0.1 },
  posterLoopSocial: { source: "loop", at: 0.1, fit: "cover" },
};

/** Chapter stills sit this far after each chapter start (spec 11). */
const CHAPTER_STILL_OFFSET = 0.8;
const CHAPTER_STILL_SIZE = { width: 480, height: 270 };

const stamps = new Stamps();
/** @type {{ output: string, detail: string, size: string, status: string }[]} */
const rows = [];
/** @type {string[]} */
const problems = [];
/** @type {string[]} */
const warnings = [];

const round3 = (value) => Math.round(value * 1000) / 1000;

const log = (message) => console.log(`[media] ${message}`);

/**
 * Builds `outputs` with `build` unless their stamp is current.
 * @returns {Promise<"built" | "up to date">}
 */
async function produce(outputs, recipe, sources, build) {
  const stamp = Stamps.compute(recipe, sources);
  if (!options.force && stamps.fresh(outputs, stamp)) return "up to date";
  await build();
  stamps.record(outputs, stamp);
  return "built";
}

/** ffmpeg into a scratch file, then moved into place. */
async function encodeTo(target, args) {
  const temp = tempFor(target);
  await ffmpeg([...args, temp]);
  commit(temp, target);
}

/**
 * Writes one RGB frame of `source` to a PNG.
 * @param {string} source
 * @param {{ at?: number, fromEnd?: number }} when
 * @param {import("./lib/proc.mjs").Probe} sourceProbe
 * @param {string} out
 */
async function extractFrame(source, when, sourceProbe, out) {
  mkdirSync(path.dirname(out), { recursive: true });
  const seek =
    when.fromEnd !== undefined
      ? ["-sseof", String(-when.fromEnd), "-i", source]
      : ["-ss", String(when.at ?? 0), "-i", source, "-frames:v", "1"];
  // with -sseof every frame after the seek point is written over the same file, leaving the last one
  await ffmpeg([...seek, "-an", "-vf", rgbFrameFilter(sourceProbe), "-update", "1", out]);
}

function addRow(file, detail, status) {
  rows.push({ output: rel(file), detail, size: formatBytes(statSync(file).size), status });
}

/** A capture file is gone: keep earlier outputs if every one exists, else fail. */
function sourceMissing(source, outputs) {
  if (outputs.every((file) => existsSync(file))) {
    warnings.push(`source missing, kept the existing outputs: ${rel(source)}`);
    for (const file of outputs) rows.push({ output: rel(file), detail: "source missing", size: formatBytes(statSync(file).size), status: "kept" });
    return;
  }
  problems.push(
    `source missing: ${rel(source)}. The capture lives in .context (local only), so media must be rebuilt in the workspace that has it.`,
  );
}

function sameKeys(label, manifest, recipes) {
  const missing = manifest.filter((key) => !recipes.includes(key));
  const extra = recipes.filter((key) => !manifest.includes(key));
  if (missing.length) problems.push(`${label}: no build recipe for ${missing.join(", ")}`);
  if (extra.length) problems.push(`${label}: recipe for ids the manifest does not list: ${extra.join(", ")}`);
  return missing.length === 0;
}

// ---------------------------------------------------------------------------
// App clips and stills
// ---------------------------------------------------------------------------

/** @param {import("../../src/content/media.ts").AppClip} clip */
async function buildClip(clip) {
  const recipe = CLIP_SOURCES[clip.id];
  const source = path.join(CAPTURE_DIR, recipe.file);
  const mp4 = publicFile(clip.mp4);
  const webm = publicFile(clip.webm);
  const span = round3(recipe.end - recipe.start);
  if (Math.abs(span - clip.duration) > 0.05) {
    problems.push(`${clip.id}: trim ${recipe.start}-${recipe.end}s is ${span}s, media.ts says ${clip.duration}s`);
  }
  if (!existsSync(source)) {
    sourceMissing(source, [mp4, webm]);
    return;
  }
  const sourceProbe = await probe(source);
  const vf = [`scale=${clip.width}:-2:flags=lanczos`, colorFilter(sourceProbe)].filter(Boolean).join(",");
  const color = outputColorArgs(sourceProbe);
  const trim = ["-ss", String(recipe.start), "-to", String(recipe.end), "-i", source];
  const h264 = [
    "-vf", vf,
    "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p",
    "-crf", "26", "-preset", "slow", "-g", "15", "-keyint_min", "15", "-sc_threshold", "0",
    ...color, "-movflags", "+faststart", "-an",
  ];
  const av1 = [
    "-vf", vf,
    "-c:v", "libsvtav1", "-crf", "38", "-preset", "6", "-g", "15", "-pix_fmt", "yuv420p",
    ...color, "-an",
  ];
  const status = await produce([mp4, webm], { trim: [recipe.start, recipe.end], h264, av1 }, [source], async () => {
    log(`encoding ${clip.id} (H.264 + AV1)`);
    await encodeTo(mp4, [...trim, ...h264]);
    await encodeTo(webm, [...trim, ...av1]);
  });
  for (const [file, codec] of [
    [mp4, "h264"],
    [webm, "av1"],
  ]) {
    const out = await probe(file);
    if (out.width !== clip.width || out.height !== clip.height) {
      problems.push(`${rel(file)} is ${out.width}x${out.height}, expected ${clip.width}x${clip.height}`);
    }
    if (out.videoCodec !== codec) problems.push(`${rel(file)} is ${out.videoCodec}, expected ${codec}`);
    if (out.hasAudio) problems.push(`${rel(file)} has an audio track`);
    if (Math.abs(out.duration - clip.duration) > 0.1) {
      problems.push(`${rel(file)} lasts ${out.duration.toFixed(2)}s, media.ts says ${clip.duration}s`);
    }
    if (file === mp4 && out.size > MAX_CLIP_BYTES) {
      problems.push(`${rel(file)} is ${formatBytes(out.size)}, above the ${formatBytes(MAX_CLIP_BYTES)} clip budget`);
    }
    addRow(file, `${out.width}x${out.height} ${codec} ${out.duration.toFixed(2)}s`, status);
  }
}

/**
 * @param {import("../../src/content/media.ts").AppStill} still
 * @param {(width: number) => number} stillHeight
 */
async function buildStill(still, stillHeight) {
  const recipe = STILL_SOURCES[still.id];
  const source = path.join(CAPTURE_DIR, recipe.png ?? recipe.video);
  const targets = still.variants.map((variant) => ({
    width: variant.width,
    height: variant.height,
    avif: publicFile(variant.avif),
    webp: publicFile(variant.webp),
  }));
  const outputs = targets.flatMap((target) => [target.avif, target.webp]);
  for (const variant of still.variants) {
    if (variant.height !== stillHeight(variant.width)) {
      problems.push(`${still.id}: ${variant.width}w lists height ${variant.height}, the source ratio gives ${stillHeight(variant.width)}`);
    }
  }
  if (!existsSync(source)) {
    sourceMissing(source, outputs);
    return;
  }
  const sizes = targets.map(({ width, height }) => [width, height]);
  const checkSource = async (file) => {
    const size = await imageSize(file);
    if (size.width !== still.source.width || size.height !== still.source.height) {
      throw new Error(`${rel(file)} is ${size.width}x${size.height}, expected ${still.source.width}x${still.source.height}`);
    }
  };
  let status;
  if (recipe.video) {
    const sourceProbe = await probe(source);
    const frame = path.join(CACHE_DIR, "frames", `${still.id}.png`);
    const filter = rgbFrameFilter(sourceProbe);
    status = await produce(outputs, { at: recipe.at, filter, AVIF, WEBP, sizes }, [source], async () => {
      log(`still ${still.id} from ${rel(source)} at ${recipe.at}s`);
      await extractFrame(source, { at: recipe.at }, sourceProbe, frame);
      await checkSource(frame);
      for (const target of targets) await encodeStill(frame, { ...target, fit: recipe.fit });
    });
  } else {
    status = await produce(outputs, { AVIF, WEBP, sizes }, [source], async () => {
      log(`still ${still.id} from ${rel(source)}`);
      await checkSource(source);
      for (const target of targets) await encodeStill(source, target);
    });
  }
  for (const target of targets) {
    for (const file of [target.avif, target.webp]) {
      const size = await imageSize(file);
      if (size.width !== target.width || size.height !== target.height) {
        problems.push(`${rel(file)} is ${size.width}x${size.height}, expected ${target.width}x${target.height}`);
      }
      const bytes = statSync(file).size;
      if (file === target.avif && target.width === 1080 && bytes > MAX_STILL_AVIF_BYTES) {
        problems.push(`${rel(file)} is ${formatBytes(bytes)}, above the ${formatBytes(MAX_STILL_AVIF_BYTES)} still budget`);
      }
      addRow(file, `${size.width}x${size.height} ${size.format}`, status);
    }
  }
}

async function buildAppMedia(media) {
  const clipsOk = sameKeys("APP_CLIPS", Object.keys(media.APP_CLIPS), Object.keys(CLIP_SOURCES));
  const stillsOk = sameKeys("APP_STILLS", Object.keys(media.APP_STILLS), Object.keys(STILL_SOURCES));
  if (clipsOk) for (const clip of Object.values(media.APP_CLIPS)) await buildClip(clip);
  if (stillsOk) for (const still of Object.values(media.APP_STILLS)) await buildStill(still, media.stillHeight);
}

// ---------------------------------------------------------------------------
// Film
// ---------------------------------------------------------------------------

/** Passes the colour audit on a film source, remembering passes by fingerprint. */
async function sourcePassesAudit(file) {
  const key = `audit:${rel(file)}`;
  const stamp = Stamps.compute({ audit: AUDIT }, [file]);
  if (!options.force && stamps.has(key, stamp)) return { ok: true, note: "colour audit passed (cached)" };
  log(`colour-auditing ${rel(file)} at ${AUDIT.fps} fps`);
  const result = await auditVideo(file);
  if (result.failures.length > 0) {
    const worst = result.worst;
    return {
      ok: false,
      note: `colour audit: ${result.failures.length} of ${result.frames} frames fail (worst ${worst.time}s: orange ${worst.orange}, lime ${worst.lime}; frames kept in ${result.keptFrames})`,
    };
  }
  stamps.set(key, stamp);
  return { ok: true, note: `colour audit passed (${result.frames} frames)` };
}

/** A render touched this recently may still be being written by video/scripts/render-all.sh. */
const SETTLE_MS = 15_000;

/**
 * Copies a video/out render into the cache, so a render in progress cannot
 * change the file between the gate and the encodes. Snapshots are named by
 * the source's size and mtime and reused while the source is unchanged.
 * @param {string} file
 * @returns {{ file: string } | { file: null, reason: string }}
 */
function snapshotSource(file) {
  const before = statSync(file);
  const age = Date.now() - before.mtimeMs;
  if (age < SETTLE_MS) return { file: null, reason: `written ${(age / 1000).toFixed(1)}s ago (render in progress?)` };
  const base = path.basename(file, path.extname(file));
  const dir = path.join(CACHE_DIR, "sources");
  const copy = path.join(dir, `${base}-${before.size}-${Math.round(before.mtimeMs)}${path.extname(file)}`);
  if (!existsSync(copy)) {
    mkdirSync(dir, { recursive: true });
    for (const name of readdirSync(dir)) {
      if (name.startsWith(`${base}-`)) rmSync(path.join(dir, name), { force: true });
    }
    const temp = tempFor(copy);
    copyFileSync(file, temp);
    commit(temp, copy);
  }
  const after = statSync(file);
  if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
    rmSync(copy, { force: true });
    return { file: null, reason: "changed while it was copied (render in progress?)" };
  }
  return { file: copy };
}

/**
 * First candidate that exists, matches the timeline and passes the audit.
 * @param {string} label
 * @param {string[]} files
 * @param {{ width: number, height: number, frames: number, fps: number, audio: boolean }} expect
 */
async function pickSource(label, files, expect) {
  for (const file of files) {
    if (isLegacyRender(path.basename(file))) {
      log(`${label}: refused ${rel(file)} (v1 render)`);
      continue;
    }
    if (!existsSync(file)) {
      log(`${label}: ${rel(file)} not found`);
      continue;
    }
    const snapshot = file.startsWith(VIDEO_OUT + path.sep) ? snapshotSource(file) : { file };
    if (!snapshot.file) {
      log(`${label}: skipped ${rel(file)}: ${snapshot.reason}`);
      warnings.push(`${label} source ${rel(file)} skipped: ${snapshot.reason}`);
      continue;
    }
    const sourceProbe = await probe(snapshot.file);
    const reasons = checkFilmSource(sourceProbe, expect);
    // a dry run may use a render older than the timeline; nothing else is relaxed
    const blocking = options.scratch ? reasons.filter((reason) => reason.code !== "length") : reasons;
    if (blocking.length > 0) {
      log(`${label}: refused ${rel(file)}: ${blocking.map((reason) => reason.message).join("; ")}`);
      continue;
    }
    if (reasons.length > 0) {
      warnings.push(`scratch run uses ${rel(file)} although ${reasons.map((reason) => reason.message).join("; ")}`);
    }
    const audit = await sourcePassesAudit(snapshot.file);
    if (!audit.ok) {
      log(`${label}: refused ${rel(file)}: ${audit.note}`);
      continue;
    }
    log(`${label}: using ${rel(file)} (${sourceProbe.width}x${sourceProbe.height}, ${sourceProbe.frames} frames, ${audit.note})`);
    return { file: snapshot.file, origin: file, probe: sourceProbe };
  }
  return null;
}

/** Newest modification time under the Remotion sources the loop depends on. */
function newestVideoSource() {
  let newest = 0;
  const visit = (entry) => {
    if (!existsSync(entry)) return;
    const stat = statSync(entry);
    if (stat.isDirectory()) {
      for (const name of readdirSync(entry)) visit(path.join(entry, name));
    } else {
      newest = Math.max(newest, stat.mtimeMs);
    }
  };
  for (const entry of ["src", "public", "remotion.config.ts", "package-lock.json"]) visit(path.join(VIDEO_DIR, entry));
  return newest;
}

/**
 * Renders the brand-palette hero loop with Remotion into the cache (never
 * into video/). Reuses the render while video/src is unchanged.
 * @returns {Promise<string | null>}
 */
async function renderBrandLoop() {
  if (!options.force && existsSync(BRAND_LOOP_RENDER) && statSync(BRAND_LOOP_RENDER).mtimeMs >= newestVideoSource()) {
    return BRAND_LOOP_RENDER;
  }
  if (options["no-render"]) {
    log("loop: --no-render set, skipping the brand loop render");
    return null;
  }
  if (!existsSync(path.join(VIDEO_DIR, "node_modules/.bin/remotion"))) {
    warnings.push("Remotion is not installed in video/ (run npm ci there), so the brand loop could not be rendered");
    return null;
  }
  const temp = tempFor(BRAND_LOOP_RENDER);
  log("loop: rendering HeroLoop with the brand palette (Remotion, read only in video/)");
  try {
    await run(
      "npx",
      ["--no-install", "remotion", "render", "HeroLoop", temp, '--props={"palette":"brand"}', "--muted", "--codec=h264", "--crf=16", "--log=error"],
      { cwd: VIDEO_DIR },
    );
  } catch (error) {
    warnings.push(`brand loop render failed: ${/** @type {Error} */ (error).message.split("\n")[0]}`);
    return null;
  }
  commit(temp, BRAND_LOOP_RENDER);
  return BRAND_LOOP_RENDER;
}

/** HeroLoop length in frames, read from video/src/HeroLoop.tsx (it imports React, so it is not imported). */
function loopFrames() {
  const file = path.join(VIDEO_DIR, "src/HeroLoop.tsx");
  const match = existsSync(file) ? /LOOP_FRAMES\s*=\s*(\d+)/.exec(readFileSync(file, "utf8")) : null;
  if (!match) {
    warnings.push("could not read LOOP_FRAMES from video/src/HeroLoop.tsx; assuming 210 frames");
    return 210;
  }
  return Number(match[1]);
}

async function loopPalette(loop) {
  const frame = path.join(CACHE_DIR, "frames", "loop-first.png");
  await extractFrame(loop.file, { at: 0 }, loop.probe, frame);
  const rgb = await cornerColor(frame);
  const distance = Math.hypot(rgb[0] - BRAND_FIELD[0], rgb[1] - BRAND_FIELD[1], rgb[2] - BRAND_FIELD[2]);
  return { palette: distance < 16 ? "brand" : "calm", rgb };
}

async function pickLoop(expect) {
  const brandFile = path.join(VIDEO_OUT, LOOP_BRAND_CANDIDATE);
  let loop = await pickSource("loop", [brandFile], expect);
  if (!loop) {
    const rendered = await renderBrandLoop();
    if (rendered) loop = await pickSource("loop", [rendered], expect);
  }
  if (!loop) loop = await pickSource("loop", LOOP_FALLBACK_CANDIDATES.map((name) => path.join(VIDEO_OUT, name)), expect);
  if (!loop) return null;
  const { palette, rgb } = await loopPalette(loop);
  log(`loop: field rgb(${rgb.join(", ")}), ${palette} palette`);
  if (palette !== "brand") {
    warnings.push(`the hero loop is the ${palette} palette (field rgb(${rgb.join(", ")})); spec S9 wants the brand palette (#0C483E field)`);
  }
  return loop;
}

/** @param {{ ready: boolean, duration: number, chapters: { label: string, start: number }[], files: Record<string, unknown> }} film */
async function writeFilm(film) {
  let candidate = film;
  let check = await typecheckFilm(candidate);
  if (!check.ok) {
    const posterKeys = Object.keys(candidate.files).filter((key) => {
      const value = candidate.files[key];
      return value !== null && typeof value === "object" && !Array.isArray(value);
    });
    if (posterKeys.length > 0) {
      const files = Object.fromEntries(Object.entries(candidate.files).filter(([key]) => !posterKeys.includes(key)));
      const reduced = { ...candidate, files };
      const retry = await typecheckFilm(reduced);
      if (retry.ok) {
        warnings.push(
          `film.json omits ${posterKeys.join(", ")}: media.ts types Poster.variants as a tuple, which a JSON array cannot satisfy. ` +
            "Their files are built; FILM_FILES in media.ts holds the paths.",
        );
        candidate = reduced;
        check = retry;
      }
    }
  }
  if (!check.ok) {
    problems.push(`film.json would not typecheck against Film in media.ts, left unchanged:\n${check.message}`);
    return;
  }
  const text = `${JSON.stringify(candidate, null, 2)}\n`;
  const previous = existsSync(FILM_JSON_OUT) ? readFileSync(FILM_JSON_OUT, "utf8") : "";
  if (previous === text) {
    log(`${rel(FILM_JSON_OUT)} unchanged (ready ${candidate.ready})`);
    return;
  }
  mkdirSync(path.dirname(FILM_JSON_OUT), { recursive: true });
  writeFileSync(FILM_JSON_OUT, text);
  log(`wrote ${rel(FILM_JSON_OUT)} (ready ${candidate.ready}, ${candidate.chapters.length} chapters, ${candidate.duration}s)`);
}

async function buildFilm(media) {
  const { FILM_FILES } = media;
  const problemsBefore = problems.length;
  if (!existsSync(TIMELINE_TS)) {
    problems.push(`missing ${rel(TIMELINE_TS)}: the film chapters come from the Remotion timeline`);
    return;
  }
  const timeline = await importFile(TIMELINE_TS);
  const { duration, chapters } = chaptersFromTimeline(timeline);
  const fps = timeline.FPS;
  log(`timeline: ${duration}s, chapters ${chapters.map((c) => `${c.label} ${c.start}`).join(" / ")}`);

  const knownKeys = [...Object.keys(FILM_ENCODES), ...Object.keys(FILM_POSTERS), "chapterStills"];
  sameKeys("FILM_FILES", Object.keys(FILM_FILES), knownKeys);
  if (FILM_FILES.chapterStills.length !== chapters.length) {
    problems.push(`FILM_FILES lists ${FILM_FILES.chapterStills.length} chapter stills, the timeline has ${chapters.length} chapters`);
  }

  const sources = {
    master: await pickSource(
      "master",
      MASTER_CANDIDATES.map((name) => path.join(VIDEO_OUT, name)),
      { width: 1920, height: 1080, frames: timeline.MASTER.total, fps, audio: true },
    ),
    social: await pickSource(
      "social",
      SOCIAL_CANDIDATES.map((name) => path.join(VIDEO_OUT, name)),
      { width: 1080, height: 1920, frames: timeline.SOCIAL.total, fps, audio: true },
    ),
    loop: await pickLoop({ width: 1920, height: 1080, frames: loopFrames(), fps, audio: false }),
  };
  const missing = Object.entries(sources)
    .filter(([, source]) => !source)
    .map(([name]) => name);
  if (missing.length > 0) {
    banner([
      `FILM NOT READY: no usable green v2 render for ${missing.join(", ")} in ${rel(VIDEO_OUT)}.`,
      "film.json is written with ready false and no files; the S9 film shows its fallback.",
      "Render the v2 cuts (video/scripts/render-all.sh) and run npm run media again.",
      "The WP-20 release gate blocks while ready is false.",
    ]);
    await writeFilm({ ready: false, duration, chapters, files: {} });
    return;
  }
  const { master } = /** @type {Record<string, { file: string, origin?: string, probe: import("./lib/proc.mjs").Probe }>} */ (sources);
  if (Math.abs(master.probe.duration - duration) > 0.2) {
    problems.push(`master lasts ${master.probe.duration.toFixed(3)}s, the timeline says ${duration}s`);
  }

  // Video encodes
  for (const [key, recipe] of Object.entries(FILM_ENCODES)) {
    const source = sources[recipe.source];
    const target = filmOut(FILM_FILES[key]);
    const vf = [`scale=${recipe.width}:${recipe.height}:flags=lanczos`, colorFilter(source.probe)].filter(Boolean).join(",");
    const audio = recipe.audio ? ["-map", "0:a:0", "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-ar", "48000"] : ["-an"];
    const level = recipe.level ? ["-level:v", recipe.level] : [];
    const seek = recipe.chapterSeek ? ["-force_key_frames", chapterKeyframes(chapters), "-forced-idr", "1"] : [];
    const args = [
      "-i", source.file, "-map", "0:v:0", ...audio,
      "-vf", vf,
      "-c:v", "libx264", "-profile:v", "high", ...level, "-pix_fmt", "yuv420p",
      "-crf", String(recipe.crf), "-preset", "slow", "-g", String(recipe.gop), ...seek,
      ...outputColorArgs(source.probe), "-movflags", "+faststart",
    ];
    const status = await produce([target], { args: args.slice(2) }, [source.file], async () => {
      log(`encoding ${key} from ${rel(source.origin ?? source.file)}`);
      await encodeTo(target, args);
    });
    const out = await probe(target);
    if (out.width !== recipe.width || out.height !== recipe.height) {
      problems.push(`${rel(target)} is ${out.width}x${out.height}, expected ${recipe.width}x${recipe.height}`);
    }
    if (out.hasAudio !== recipe.audio) problems.push(`${rel(target)} ${recipe.audio ? "lacks" : "has"} an audio track`);
    if (Math.abs(out.duration - source.probe.duration) > 0.2) {
      problems.push(`${rel(target)} lasts ${out.duration.toFixed(2)}s, its source ${source.probe.duration.toFixed(2)}s`);
    }
    if (recipe.chapterSeek) {
      const unaligned = chaptersWithoutKeyframe(chapters, await keyframeTimes(target), fps);
      if (unaligned.length > 0) {
        problems.push(`${rel(target)} has no keyframe at chapter ${unaligned.map((c) => `${c.label} ${c.start}s`).join(", ")}`);
      }
    }
    addRow(target, `${out.width}x${out.height} h264${out.hasAudio ? "+aac" : ""} ${out.duration.toFixed(2)}s`, status);
  }

  // Posters: the last frame of each cut, and the loop and title-card frames
  for (const [key, recipe] of Object.entries(FILM_POSTERS)) {
    const source = sources[recipe.source];
    const poster = FILM_FILES[key];
    const targets = poster.variants.map((variant) => ({
      width: variant.width,
      height: variant.height,
      avif: filmOut(variant.avif),
      webp: filmOut(variant.webp),
    }));
    const outputs = targets.flatMap((target) => [target.avif, target.webp]);
    const frame = path.join(CACHE_DIR, "frames", `${key}.png`);
    const filter = rgbFrameFilter(source.probe);
    const sizes = targets.map(({ width, height }) => [width, height]);
    const when = recipe.fromEnd !== undefined ? { fromEnd: recipe.fromEnd } : { at: recipe.at };
    const status = await produce(outputs, { ...when, filter, AVIF, WEBP, sizes }, [source.file], async () => {
      const where = when.fromEnd !== undefined ? "last frame" : `frame at ${when.at}s`;
      log(`poster ${key}: ${where} of ${rel(source.origin ?? source.file)}`);
      await extractFrame(source.file, when, source.probe, frame);
      for (const target of targets) await encodeStill(frame, target);
    });
    for (const target of targets) {
      for (const file of [target.avif, target.webp]) {
        const size = await imageSize(file);
        if (size.width !== target.width || size.height !== target.height) {
          problems.push(`${rel(file)} is ${size.width}x${size.height}, expected ${target.width}x${target.height}`);
        }
        addRow(file, `${size.width}x${size.height} ${size.format}`, status);
      }
    }
  }

  // Chapter stills: chapter start + 0.8 s of the master
  for (const [index, chapter] of chapters.entries()) {
    const url = FILM_FILES.chapterStills[index];
    if (!url) break;
    const target = filmOut(url);
    const at = round3(chapter.start + CHAPTER_STILL_OFFSET);
    const frame = path.join(CACHE_DIR, "frames", `chapter-${index}.png`);
    const filter = rgbFrameFilter(master.probe);
    const status = await produce([target], { at, filter, AVIF, size: CHAPTER_STILL_SIZE }, [master.file], async () => {
      await extractFrame(master.file, { at }, master.probe, frame);
      await encodeStill(frame, { ...CHAPTER_STILL_SIZE, avif: target });
    });
    const size = await imageSize(target);
    if (size.width !== CHAPTER_STILL_SIZE.width || size.height !== CHAPTER_STILL_SIZE.height) {
      problems.push(`${rel(target)} is ${size.width}x${size.height}, expected ${CHAPTER_STILL_SIZE.width}x${CHAPTER_STILL_SIZE.height}`);
    }
    addRow(target, `${size.width}x${size.height} ${size.format} ${chapter.label} @${at}s`, status);
  }

  // Blocking colour audit of every shipped film file (spec 11)
  const shipped = [
    ...Object.keys(FILM_ENCODES).map((key) => FILM_FILES[key]),
    ...Object.keys(FILM_POSTERS).flatMap((key) => FILM_FILES[key].variants.flatMap((variant) => [variant.avif, variant.webp])),
    ...FILM_FILES.chapterStills,
  ].map(filmOut);
  let auditOk = true;
  for (const file of shipped) {
    const key = `audit:${rel(file)}`;
    const stamp = Stamps.compute({ audit: AUDIT }, [file]);
    if (!options.force && stamps.has(key, stamp)) continue;
    const result = await auditFile(file);
    if (result.failures.length > 0) {
      auditOk = false;
      problems.push(
        `colour audit failed: ${rel(file)}: ${result.failures.length} of ${result.frames} frames above ${AUDIT.maxPixels} orange/lime pixels` +
          (result.keptFrames ? ` (frames in ${result.keptFrames})` : ""),
      );
    } else {
      stamps.set(key, stamp);
    }
  }
  log(`film colour audit: ${auditOk ? "pass" : "FAIL"} (${shipped.length} files)`);

  const files = JSON.parse(JSON.stringify(FILM_FILES));
  await writeFilm({ ready: auditOk && problems.length === problemsBefore, duration, chapters, files });
}

// ---------------------------------------------------------------------------

async function main() {
  const started = Date.now();
  await requireTools(["libx264", "libsvtav1", "aac"]);
  clearTemp();
  const media = await importFile(MEDIA_TS);
  if (options.only !== "film") await buildAppMedia(media);
  if (options.only !== "app") await buildFilm(media);

  if (rows.length > 0) {
    console.log("");
    printTable(
      [
        { key: "output", label: "output" },
        { key: "detail", label: "detail" },
        { key: "size", label: "size", align: "right" },
        { key: "status", label: "status" },
      ],
      rows,
    );
  }
  console.log(`\n[media] ${rows.length} outputs in ${((Date.now() - started) / 1000).toFixed(1)}s (root ${ROOT})`);
  for (const warning of warnings) console.warn(`[media] warning: ${warning}`);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`[media] FAIL: ${problem}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`[media] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
