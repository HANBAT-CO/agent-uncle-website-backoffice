// Checks a film.json candidate against the Film type in src/content/media.ts
// before it is written, so the generated file can never break `tsc` or
// `next build` for the rest of the app.
//
// media.ts is copied into a scratch project next to the candidate JSON and
// compiled alone with the app's strictness (the "@/" alias points at the real
// src/ in case media.ts grows imports).

import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { MEDIA_TS, ROOT } from "./paths.mjs";
import { run } from "./proc.mjs";

const TSC = path.join(ROOT, "node_modules/typescript/bin/tsc");

/**
 * @param {unknown} film candidate film.json content
 * @returns {Promise<{ ok: true } | { ok: false, message: string }>}
 */
export async function typecheckFilm(film) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "au-film-type-"));
  try {
    const content = path.join(dir, "src/content");
    mkdirSync(path.join(content, "generated"), { recursive: true });
    copyFileSync(MEDIA_TS, path.join(content, "media.ts"));
    writeFileSync(path.join(content, "generated/film.json"), `${JSON.stringify(film, null, 2)}\n`);
    writeFileSync(
      path.join(dir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ES2017",
          lib: ["esnext"],
          strict: true,
          noEmit: true,
          module: "esnext",
          moduleResolution: "bundler",
          resolveJsonModule: true,
          isolatedModules: true,
          skipLibCheck: true,
          types: [],
          paths: { "@/*": [path.join(ROOT, "src/*")] },
        },
        files: ["src/content/media.ts"],
      }),
    );
    try {
      await run(process.execPath, [TSC, "-p", path.join(dir, "tsconfig.json")]);
      return { ok: true };
    } catch (error) {
      const message = /** @type {Error} */ (error).message;
      return { ok: false, message: message.replaceAll(dir, "<scratch>") };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
