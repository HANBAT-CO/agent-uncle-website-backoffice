// Manifest verification (spec 11 and 13): every media path that
// src/content/media.ts and src/content/generated/film.json reference must
// exist and probe to the expected size, codec and length.
//
//   npm run media:verify               public/ and film.json
//   npm run media:verify -- --scratch  the film dry run (node_modules/.cache/agent-uncle-media/scratch)
//
// Checks
// - app clips: MP4 (H.264, faststart, at most 1.8 MB) and AV1 WebM at 720x1564,
//   no audio, length within 0.1 s of the manifest, poster id known
// - app stills: AVIF and WebP at both widths with the manifest sizes, the
//   1080w AVIF at most 120 KB
// - film.json: typechecks against Film; chapters equal video/src/timeline.ts
//   and the spec S9 labels; when ready, files equal FILM_FILES and every film
//   file probes right (masters and social with AAC audio, loops muted,
//   faststart, a keyframe on every chapter start of both masters, posters
//   and chapter stills at their sizes)
// - orphans: files in public/media not referenced anywhere (warning only)
// Exit 1 on any mismatch. A film that is not ready only warns: the WP-20
// release gate blocks on it.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual, parseArgs } from "node:util";

import { chaptersFromTimeline, chaptersWithoutKeyframe } from "./lib/film.mjs";
import { imageSize } from "./lib/images.mjs";
import { isFaststart } from "./lib/mp4.mjs";
import { CACHE_DIR, FILM_JSON, MEDIA_TS, PUBLIC_DIR, TIMELINE_TS, publicFile, rel } from "./lib/paths.mjs";
import { keyframeTimes, probe } from "./lib/proc.mjs";
import { banner, formatBytes, printTable } from "./lib/report.mjs";
import { importFile } from "./lib/ts-import.mjs";
import { typecheckFilm } from "./lib/typecheck.mjs";

const { values: options } = parseArgs({
  options: { scratch: { type: "boolean", default: false } },
  strict: true,
});

/** Spec S9 chapter ticks, in order. */
const SPEC_CHAPTERS = ["연결", "요청", "수락", "확보", "미송", "전달", "수령", "기록"];
const MAX_CLIP_BYTES = 1_800_000;
const MAX_STILL_AVIF_BYTES = 120_000;
const CHAPTER_STILL = { width: 480, height: 270 };
const DASHES = /[–—]/;

const SCRATCH_DIR = path.join(CACHE_DIR, "scratch");
const filmJsonFile = options.scratch ? path.join(SCRATCH_DIR, "film.json") : FILM_JSON;
const filmFile = (url) => (options.scratch ? path.join(SCRATCH_DIR, "public", ...url.slice(1).split("/")) : publicFile(url));

/** @type {{ file: string, expected: string, actual: string, result: string }[]} */
const rows = [];
/** @type {string[]} */
const failures = [];
/** @type {string[]} */
const warnings = [];
/** Every public file the manifests reference, for the orphan scan. */
const referenced = new Set();

function record(file, expected, actual, ok) {
  rows.push({ file: rel(file), expected, actual, result: ok ? "ok" : "FAIL" });
  if (!ok) failures.push(`${rel(file)}: expected ${expected}, got ${actual}`);
}

function missing(file) {
  if (existsSync(file)) return false;
  record(file, "exists", "missing", false);
  return true;
}

/**
 * @param {string} file
 * @param {{ width: number, height: number, codec: string, audio: boolean, duration?: number, tolerance?: number, maxBytes?: number, faststart?: boolean }} expect
 */
async function checkVideo(file, expect) {
  referenced.add(file);
  if (missing(file)) return;
  const out = await probe(file);
  const problems = [];
  if (out.width !== expect.width || out.height !== expect.height) problems.push(`${out.width}x${out.height}`);
  if (out.videoCodec !== expect.codec) problems.push(out.videoCodec);
  if (out.hasAudio !== expect.audio) problems.push(out.hasAudio ? `audio ${out.audioCodec}` : "no audio");
  if (expect.audio && out.audioCodec !== "aac") problems.push(`audio ${out.audioCodec}`);
  if (expect.duration !== undefined && Math.abs(out.duration - expect.duration) > (expect.tolerance ?? 0.1)) {
    problems.push(`${out.duration.toFixed(3)}s`);
  }
  if (expect.maxBytes !== undefined && out.size > expect.maxBytes) problems.push(formatBytes(out.size));
  if (expect.faststart && !isFaststart(file)) problems.push("moov after mdat");
  const wanted = [
    `${expect.width}x${expect.height} ${expect.codec}`,
    expect.audio ? "aac" : "muted",
    expect.duration !== undefined ? `${expect.duration}s` : null,
    expect.maxBytes !== undefined ? `<= ${formatBytes(expect.maxBytes)}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const actual = `${out.width}x${out.height} ${out.videoCodec} ${out.hasAudio ? out.audioCodec : "muted"} ${out.duration.toFixed(2)}s ${formatBytes(out.size)}`;
  record(file, wanted, problems.length ? `${actual} (${problems.join(", ")})` : actual, problems.length === 0);
}

/**
 * @param {string} file
 * @param {{ width: number, height: number, format: "heif" | "webp", maxBytes?: number }} expect
 */
async function checkImage(file, expect) {
  referenced.add(file);
  if (missing(file)) return;
  const size = await imageSize(file);
  const bytes = statSync(file).size;
  const ok =
    size.width === expect.width &&
    size.height === expect.height &&
    size.format === expect.format &&
    (expect.maxBytes === undefined || bytes <= expect.maxBytes);
  const wanted = `${expect.width}x${expect.height} ${expect.format}${expect.maxBytes ? ` <= ${formatBytes(expect.maxBytes)}` : ""}`;
  record(file, wanted, `${size.width}x${size.height} ${size.format} ${formatBytes(bytes)}`, ok);
}

/**
 * Spec S9: chapter ticks seek the master to each chapter start. Each start
 * must be a keyframe, so the seek paints at once.
 * @param {string} file
 * @param {{ label: string, start: number }[]} chapters
 */
async function checkChapterKeyframes(file, chapters) {
  if (!existsSync(file)) return;
  const out = await probe(file);
  const unaligned = chaptersWithoutKeyframe(chapters, await keyframeTimes(file), out.fps ?? 30);
  const actual = unaligned.length ? `no keyframe at ${unaligned.map((c) => `${c.label} ${c.start}s`).join(", ")}` : `${chapters.length} chapter keyframes`;
  record(file, `keyframe on each of ${chapters.length} chapter starts`, actual, unaligned.length === 0);
}

/** @param {import("../../src/content/media.ts").Poster} poster */
async function checkPoster(poster, fileFor, maxAvifBytes) {
  if (!poster.alt || DASHES.test(poster.alt)) failures.push(`poster alt is empty or has a dash: ${poster.alt}`);
  for (const variant of poster.variants) {
    const limit = variant.width === 1080 ? maxAvifBytes : undefined;
    await checkImage(fileFor(variant.avif), { width: variant.width, height: variant.height, format: "heif", maxBytes: limit });
    await checkImage(fileFor(variant.webp), { width: variant.width, height: variant.height, format: "webp" });
  }
}

async function checkAppMedia(media) {
  const { APP_CLIPS, APP_STILLS, stillHeight } = media;
  for (const clip of Object.values(APP_CLIPS)) {
    if (!APP_STILLS[clip.poster]) failures.push(`${clip.id}: poster ${clip.poster} is not an APP_STILLS id`);
    if (DASHES.test(clip.alt)) failures.push(`${clip.id}: alt contains a dash`);
    await checkVideo(publicFile(clip.mp4), {
      width: clip.width,
      height: clip.height,
      codec: "h264",
      audio: false,
      duration: clip.duration,
      maxBytes: MAX_CLIP_BYTES,
      faststart: true,
    });
    await checkVideo(publicFile(clip.webm), { width: clip.width, height: clip.height, codec: "av1", audio: false, duration: clip.duration });
  }
  for (const still of Object.values(APP_STILLS)) {
    for (const variant of still.variants) {
      if (variant.height !== stillHeight(variant.width)) {
        failures.push(`${still.id}: ${variant.width}w height ${variant.height} does not follow the 1320x2868 source (${stillHeight(variant.width)})`);
      }
    }
    await checkPoster(still, publicFile, MAX_STILL_AVIF_BYTES);
  }
}

async function checkFilm(media) {
  const { FILM_FILES } = media;
  const film = JSON.parse(readFileSync(filmJsonFile, "utf8"));
  const type = await typecheckFilm(film);
  if (!type.ok) failures.push(`${rel(filmJsonFile)} does not typecheck against Film:\n${type.message}`);

  if (typeof film.ready !== "boolean") failures.push("film.json ready is not a boolean");
  const labels = (film.chapters ?? []).map((chapter) => chapter.label);
  if (!isDeepStrictEqual(labels, SPEC_CHAPTERS)) {
    failures.push(`film.json chapter labels are ${labels.join(" ")}, spec S9 lists ${SPEC_CHAPTERS.join(" ")}`);
  }
  if (existsSync(TIMELINE_TS)) {
    const fromTimeline = chaptersFromTimeline(await importFile(TIMELINE_TS));
    if (!isDeepStrictEqual({ duration: film.duration, chapters: film.chapters }, fromTimeline)) {
      failures.push(
        `film.json duration/chapters differ from ${rel(TIMELINE_TS)} (run npm run media): ` +
          `film.json ${film.duration}s [${(film.chapters ?? []).map((c) => c.start).join(", ")}], ` +
          `timeline ${fromTimeline.duration}s [${fromTimeline.chapters.map((c) => c.start).join(", ")}]`,
      );
    }
  } else {
    warnings.push(`${rel(TIMELINE_TS)} not found; chapters checked against the spec labels only`);
  }

  if (!film.ready) {
    if (Object.keys(film.files ?? {}).length > 0) failures.push("film.json is not ready but lists files");
    banner([
      `FILM NOT READY: ${rel(filmJsonFile)} has ready false (no audited green v2 render yet).`,
      "App media is verified; film files are skipped. The WP-20 release gate blocks until ready is true.",
    ]);
    return;
  }

  // files must equal FILM_FILES (posters may be omitted while media.ts types them as tuples)
  for (const [key, value] of Object.entries(film.files)) {
    if (!isDeepStrictEqual(value, FILM_FILES[key])) failures.push(`film.json files.${key} differs from FILM_FILES.${key}`);
  }
  for (const key of Object.keys(FILM_FILES)) {
    if (!(key in film.files)) {
      const isPoster = typeof FILM_FILES[key] === "object" && !Array.isArray(FILM_FILES[key]);
      if (isPoster) warnings.push(`film.json omits files.${key}; verified from FILM_FILES`);
      else failures.push(`film.json lacks files.${key}`);
    }
  }

  const masterOptions = { codec: "h264", audio: true, duration: film.duration, tolerance: 0.2, faststart: true };
  await checkVideo(filmFile(FILM_FILES.master1080), { width: 1920, height: 1080, ...masterOptions });
  await checkVideo(filmFile(FILM_FILES.master720), { width: 1280, height: 720, ...masterOptions });
  for (const url of [FILM_FILES.master1080, FILM_FILES.master720]) await checkChapterKeyframes(filmFile(url), film.chapters);
  await checkVideo(filmFile(FILM_FILES.social720), { width: 720, height: 1280, codec: "h264", audio: true, faststart: true });
  await checkVideo(filmFile(FILM_FILES.loop720), { width: 1280, height: 720, codec: "h264", audio: false, faststart: true });
  await checkVideo(filmFile(FILM_FILES.loop1080), { width: 1920, height: 1080, codec: "h264", audio: false, faststart: true });
  await checkPoster(FILM_FILES.posterEnd, filmFile);
  await checkPoster(FILM_FILES.posterSocialEnd, filmFile);
  await checkPoster(FILM_FILES.posterLoop, filmFile);
  await checkPoster(FILM_FILES.posterLoopSocial, filmFile);
  if (FILM_FILES.chapterStills.length !== film.chapters.length) {
    failures.push(`FILM_FILES has ${FILM_FILES.chapterStills.length} chapter stills for ${film.chapters.length} chapters`);
  }
  for (const url of FILM_FILES.chapterStills) {
    await checkImage(filmFile(url), { ...CHAPTER_STILL, format: "heif" });
  }
}

function orphans() {
  const roots = [path.join(PUBLIC_DIR, "media/app"), path.join(PUBLIC_DIR, "media/film")];
  if (options.scratch) roots.push(path.join(SCRATCH_DIR, "public/media/film"));
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const name of readdirSync(root)) {
      const file = path.join(root, name);
      if (name.startsWith(".") || referenced.has(file)) continue;
      if (options.scratch && root === path.join(PUBLIC_DIR, "media/film")) continue;
      warnings.push(`not referenced by the manifest: ${rel(file)}`);
    }
  }
}

async function main() {
  const media = await importFile(MEDIA_TS);
  await checkAppMedia(media);
  await checkFilm(media);
  orphans();

  if (rows.length > 0) {
    printTable(
      [
        { key: "file", label: "file" },
        { key: "expected", label: "expected" },
        { key: "actual", label: "actual" },
        { key: "result", label: "result" },
      ],
      rows,
    );
  }
  for (const warning of warnings) console.warn(`[verify] warning: ${warning}`);
  if (failures.length > 0) {
    for (const failure of failures) console.error(`[verify] FAIL: ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n[verify] ok: ${rows.length} files match the manifest.`);
}

main().catch((error) => {
  console.error(`[verify] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
