// Imports TypeScript modules (src/content/media.ts, video/src/timeline.ts)
// from plain Node with built-in type stripping.
//
// Two module hooks make that work without CLI flags:
// - `.ts` files load as "module-typescript", so Node neither warns about a
//   package.json without "type" (MODULE_TYPELESS_PACKAGE_JSON) nor guesses.
// - `.json` imports get the `type: "json"` attribute that Node requires and
//   that TypeScript sources (media.ts imports generated/film.json) omit.

import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

let registered = false;

function ensureHooks() {
  if (registered) return;
  if (!process.features.typescript) {
    throw new Error(
      `Node ${process.version} cannot strip TypeScript types. Use Node 22.18 or newer (this workspace runs Node 25).`,
    );
  }
  if (typeof registerHooks !== "function") {
    throw new Error(`Node ${process.version} lacks module.registerHooks. Use Node 22.18 or newer.`);
  }
  registerHooks({
    load(url, context, nextLoad) {
      if (url.startsWith("file:") && url.endsWith(".ts")) {
        return nextLoad(url, { ...context, format: "module-typescript" });
      }
      if (url.startsWith("file:") && url.endsWith(".json") && context.importAttributes?.type !== "json") {
        return nextLoad(url, { ...context, format: "json", importAttributes: { ...context.importAttributes, type: "json" } });
      }
      return nextLoad(url, context);
    },
  });
  registered = true;
}

/**
 * Imports a module by absolute path (cached by Node like any import; read
 * files rewritten during a run, such as film.json, with fs instead).
 * @param {string} file absolute path
 */
export async function importFile(file) {
  ensureHooks();
  return import(pathToFileURL(file).href);
}
