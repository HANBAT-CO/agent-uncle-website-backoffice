// Shared helpers for the QA scripts (scripts/qa). Plain Node, no dependencies.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Default production server for QA (`npx next start -p 3200`). */
export const DEFAULT_QA_URL = "http://localhost:3200";

const TEXT_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".mjs", ".js", ".jsx", ".css", ".json", ".svg", ".md", ".txt", ".html"]);

/** Every text file under `dir` (relative to the repo root), skipping binaries. */
export function textFiles(dir) {
  const out = [];
  const walk = (path) => {
    for (const name of readdirSync(path)) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const full = join(path, name);
      const stats = statSync(full);
      if (stats.isDirectory()) walk(full);
      else if (TEXT_EXTENSIONS.has(extname(name))) out.push(full);
    }
  };
  walk(join(ROOT, dir));
  return out;
}

export function rel(path) {
  return relative(ROOT, path);
}

export function read(path) {
  return readFileSync(path, "utf8");
}

/** `--url=http://...` from argv, else QA_URL, else the default QA server. */
export function qaUrl(argv = process.argv) {
  const flag = argv.find((arg) => arg.startsWith("--url="));
  return (flag ? flag.slice("--url=".length) : process.env.QA_URL || DEFAULT_QA_URL).replace(/\/$/, "");
}

/** One line per finding, with a line number. */
export function findLines(text, pattern) {
  const hits = [];
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const regex = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
    let match;
    while ((match = regex.exec(line)) !== null) {
      hits.push({ line: index + 1, column: match.index + 1, match: match[0], text: line.trim().slice(0, 160) });
      if (match[0].length === 0) regex.lastIndex += 1;
    }
  }
  return hits;
}

export async function fetchText(url, { timeoutMs = 60_000 } = {}) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.text();
}

export function fail(tag, message) {
  console.error(`[${tag}] FAIL ${message}`);
  process.exitCode = 1;
}

export function pass(tag, message) {
  console.log(`[${tag}] ok ${message}`);
}
