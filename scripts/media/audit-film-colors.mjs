// Film colour audit (spec 4.1 and 11), a blocking release gate.
//
//   npm run media:audit                          every film file in public/media/film
//   npm run media:audit -- <file> [<file> ...]   any videos or images (for example a
//                                                negative control: video/out/agent-uncle-promo-16x9-v1.mp4)
//
// Videos are sampled at 2 fps at 480 px wide; images are scaled to 480 px.
// A frame fails when more than 100 pixels are orange (hue 8-60, s > 0.35,
// v > 0.35) or lime (hue 65-100, s > 0.5, v > 0.6). Prints a table and exits
// 1 when any frame of any file fails. Frames of failing videos are kept in a
// temp folder for review (path printed).

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { AUDIT, auditFile } from "./lib/color-audit.mjs";
import { FILM_JSON, MEDIA_TS, PUBLIC_DIR, ROOT, publicFile, rel } from "./lib/paths.mjs";
import { banner, printTable } from "./lib/report.mjs";
import { importFile } from "./lib/ts-import.mjs";

const FILM_DIR = path.join(PUBLIC_DIR, "media/film");
const AUDITED = /\.(mp4|webm|avif|webp|png|jpe?g)$/i;

/** Every film file the manifest lists, as absolute paths. */
async function manifestFiles() {
  const { FILM_FILES } = await importFile(MEDIA_TS);
  const urls = [];
  for (const value of Object.values(FILM_FILES)) {
    if (typeof value === "string") urls.push(value);
    else if (Array.isArray(value)) urls.push(...value);
    else for (const variant of value.variants) urls.push(variant.avif, variant.webp);
  }
  return urls.map(publicFile);
}

async function defaultTargets() {
  const film = JSON.parse(readFileSync(FILM_JSON, "utf8"));
  const onDisk = existsSync(FILM_DIR)
    ? readdirSync(FILM_DIR)
        .filter((name) => AUDITED.test(name))
        .map((name) => path.join(FILM_DIR, name))
    : [];
  const expected = await manifestFiles();
  const missing = film.ready ? expected.filter((file) => !existsSync(file)) : [];
  return { ready: Boolean(film.ready), files: [...new Set([...onDisk, ...expected.filter((file) => existsSync(file))])].sort(), missing };
}

async function main() {
  const args = process.argv.slice(2);
  let files;
  let missing = [];
  if (args.length > 0) {
    files = args.map((arg) => path.resolve(process.cwd(), arg));
    missing = files.filter((file) => !existsSync(file));
    files = files.filter((file) => existsSync(file));
  } else {
    const targets = await defaultTargets();
    files = targets.files;
    missing = targets.missing;
    if (files.length === 0 && missing.length === 0) {
      banner([
        "Nothing to audit: public/media/film has no film files and film.json is not ready.",
        "Run npm run media once the green v2 renders exist. The release gate stays blocked until then.",
      ]);
      return;
    }
  }

  console.log(
    `[audit] ${files.length} file(s), ${AUDIT.fps} fps at ${AUDIT.width}px; a frame fails above ${AUDIT.maxPixels} orange or lime pixels\n`,
  );
  const rows = [];
  let failed = missing.length > 0;
  for (const file of files) {
    const result = await auditFile(file);
    const worst = result.worst;
    const fails = result.failures.length > 0;
    failed ||= fails;
    rows.push({
      file: path.relative(ROOT, file).startsWith("..") ? file : rel(file),
      frames: String(result.frames),
      failing: String(result.failures.length),
      worst: `${worst.time.toFixed(1)}s orange ${worst.orange} lime ${worst.lime}`,
      result: fails ? "FAIL" : "pass",
    });
    if (fails && result.keptFrames) console.log(`[audit] failing frames of ${rel(file)} kept in ${result.keptFrames}`);
  }
  printTable(
    [
      { key: "file", label: "file" },
      { key: "frames", label: "frames", align: "right" },
      { key: "failing", label: "failing", align: "right" },
      { key: "worst", label: "worst frame" },
      { key: "result", label: "result" },
    ],
    rows,
  );
  for (const file of missing) console.error(`[audit] FAIL: missing ${rel(file)}`);
  if (failed) {
    console.error("\n[audit] FAIL: orange or lime found (or files missing). Never ship these files.");
    process.exitCode = 1;
  } else {
    console.log("\n[audit] pass: no orange or lime frame.");
  }
}

main().catch((error) => {
  console.error(`[audit] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
