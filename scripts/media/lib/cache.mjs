// Rebuild stamps and atomic writes.
//
// Each output (or group of outputs) records a hash of its recipe (encoder
// arguments, sizes) and its sources (path, size, mtime). A rerun skips work
// whose stamp still matches and whose files exist, so `npm run media` is
// idempotent and cheap to repeat; --force ignores the stamps.

import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CACHE_DIR, rel } from "./paths.mjs";

/** Bump when an encode recipe changes in a way the arguments do not show. */
const RECIPE_VERSION = 2;

const STAMPS_FILE = path.join(CACHE_DIR, "stamps.json");
const TMP_DIR = path.join(CACHE_DIR, "tmp");

/** @param {string} file */
function fingerprint(file) {
  const stat = statSync(file);
  return { file: rel(file), size: stat.size, mtime: Math.round(stat.mtimeMs) };
}

export class Stamps {
  constructor() {
    /** @type {Record<string, string>} */
    this.map = existsSync(STAMPS_FILE) ? JSON.parse(readFileSync(STAMPS_FILE, "utf8")) : {};
  }

  /**
   * @param {unknown} recipe anything JSON-serialisable that defines the output
   * @param {string[]} sources input files
   */
  static compute(recipe, sources) {
    const payload = JSON.stringify({ v: RECIPE_VERSION, recipe, sources: sources.map(fingerprint) });
    return createHash("sha256").update(payload).digest("hex");
  }

  /** @param {string[]} outputs */
  static key(outputs) {
    return outputs.map(rel).join("|");
  }

  /** True when every output exists and was built from the same recipe and sources. */
  fresh(outputs, stamp) {
    return outputs.every((file) => existsSync(file)) && this.has(Stamps.key(outputs), stamp);
  }

  record(outputs, stamp) {
    this.set(Stamps.key(outputs), stamp);
  }

  /** Raw access for results that are not files (a source that passed the colour audit). */
  has(key, stamp) {
    return this.map[key] === stamp;
  }

  set(key, stamp) {
    this.map[key] = stamp;
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(STAMPS_FILE, `${JSON.stringify(this.map, null, 2)}\n`);
  }
}

/**
 * A scratch path with the same extension as `target`, inside the cache, so
 * encoders never leave half-written files in public/.
 * @param {string} target
 */
export function tempFor(target) {
  mkdirSync(TMP_DIR, { recursive: true });
  const ext = path.extname(target);
  return path.join(TMP_DIR, `${path.basename(target, ext)}-${process.pid}-${Date.now().toString(36)}${ext}`);
}

/**
 * Moves a finished scratch file into place (rename, or copy across devices).
 * @param {string} temp
 * @param {string} target
 */
export function commit(temp, target) {
  mkdirSync(path.dirname(target), { recursive: true });
  try {
    renameSync(temp, target);
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== "EXDEV") throw error;
    copyFileSync(temp, target);
    rmSync(temp, { force: true });
  }
}

/** Removes leftover scratch files from interrupted runs. */
export function clearTemp() {
  rmSync(TMP_DIR, { recursive: true, force: true });
}
