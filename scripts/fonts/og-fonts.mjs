// Subset the Paperlogy TTFs that the share image (src/app/opengraph-image.tsx)
// renders with. Satori reads TTF/OTF only (no WOFF2), and the full KS X 1001
// sets are about 350 KB each, so the image route reads two tiny subsets that
// hold exactly the characters it draws: the wordmark (900) and the one-liner
// (400), both from src/lib/site.ts.
//
//   npm run fonts:og
//
// Run it after changing site.name or site.oneLiner; src/app/fonts/og-fonts.test.ts
// fails while a subset lacks a character the image needs.
// Sources: the original Paperlogy files in .context/brief/assets/fonts when
// present (this workspace), else the committed KS X 1001 TTFs.

import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Same mapping as OG_FONT_TEXT in src/lib/og-text.ts (kept in step by og-fonts.test.ts).
import { site } from "../../src/lib/site.ts";

const OG_FONT_TEXT = { 900: site.name, 400: site.oneLiner };

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const FONTS = [
  {
    weight: 900,
    text: OG_FONT_TEXT[900],
    sources: [".context/brief/assets/fonts/Paperlogy-9Black.ttf", "src/app/fonts/og/paperlogy-900.ttf"],
    output: "src/app/fonts/og/paperlogy-900-og.ttf",
  },
  {
    weight: 400,
    text: OG_FONT_TEXT[400],
    sources: [".context/brief/assets/fonts/Paperlogy-4Regular.ttf", "src/app/fonts/og/paperlogy-400.ttf"],
    output: "src/app/fonts/og/paperlogy-400-og.ttf",
  },
];

for (const font of FONTS) {
  const source = font.sources.map((path) => join(root, path)).find((path) => existsSync(path));
  if (!source) throw new Error(`[fonts:og] no source font for weight ${font.weight}: ${font.sources.join(", ")}`);
  const output = join(root, font.output);
  execFileSync(
    "uv",
    [
      "run",
      "--no-project",
      "--with",
      "fonttools",
      "pyftsubset",
      source,
      `--text=${font.text}`,
      "--layout-features=*",
      "--name-IDs=0,1,2,3,4,5,6,7,8,9,11,13,14",
      "--name-languages=*",
      "--drop-tables+=vhea,vmtx,DSIG",
      "--no-hinting",
      `--output-file=${output}`,
    ],
    { cwd: root, stdio: "inherit" },
  );
  console.log(`[fonts:og] ${font.output} (${font.weight}): ${(statSync(output).size / 1024).toFixed(1)} KB`);
}
