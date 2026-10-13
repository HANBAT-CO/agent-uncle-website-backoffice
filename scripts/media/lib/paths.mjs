// Locations used by the media scripts. All absolute; `rel` prints them
// relative to the repo root for logs.

import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** Real app footage and stills (local only, gitignored). */
export const CAPTURE_DIR = path.join(ROOT, ".context/app-capture");
/** Remotion project (read only for this pipeline). */
export const VIDEO_DIR = path.join(ROOT, "video");
export const VIDEO_OUT = path.join(VIDEO_DIR, "out");
export const TIMELINE_TS = path.join(VIDEO_DIR, "src/timeline.ts");
export const PUBLIC_DIR = path.join(ROOT, "public");
export const MEDIA_TS = path.join(ROOT, "src/content/media.ts");
export const FILM_JSON = path.join(ROOT, "src/content/generated/film.json");
/** Scratch space: extracted frames, the brand loop render, rebuild stamps. Gitignored with node_modules. */
export const CACHE_DIR = path.join(ROOT, "node_modules/.cache/agent-uncle-media");

/** Absolute file for a public URL path such as /media/app/x.mp4. */
export function publicFile(urlPath) {
  if (!urlPath.startsWith("/")) throw new Error(`not a public path: ${urlPath}`);
  return path.join(PUBLIC_DIR, ...urlPath.slice(1).split("/"));
}

/** Path relative to the repo root, for logs. */
export function rel(file) {
  return path.relative(ROOT, file) || ".";
}
