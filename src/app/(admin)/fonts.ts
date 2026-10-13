import localFont from "next/font/local";

/**
 * Paperlogy for the console (backoffice spec 9): 400, 500, 600 and 700 as
 * full KS X 1001 files, because operators read arbitrary user text (names,
 * shop names, product names), so the landing's page subsets are not enough.
 *
 * - 400 and 700 are byte copies of the landing's full files
 *   (src/app/fonts/paperlogy-{400,700}.woff2, scripts/fonts/subset-paperlogy.py).
 * - 500 and 600 use the same code points (the cmap of paperlogy-400.woff2):
 *     uv run --no-project --with fonttools --with brotli pyftsubset \
 *       .context/brief/assets/fonts/Paperlogy-{5Medium,6SemiBold}.ttf \
 *       --unicodes-file=<cmap of src/app/fonts/paperlogy-400.woff2> \
 *       --flavor=woff2 --layout-features='*' \
 *       --name-IDs=0,1,2,3,4,5,6,7,8,9,11,13,14 --name-languages='*' \
 *       --drop-tables+=vhea,vmtx,DSIG --desubroutinize --no-hinting \
 *       --notdef-outline --recalc-bounds \
 *       --output-file=src/app/(admin)/fonts/paperlogy-{500,600}.woff2
 * src/lib/admin/theme.test.ts checks all four cover the 2,350 KS X 1001
 * syllables and every code point of the landing's full set.
 *
 * Paperlogy is OFL 1.1; the copyright and license name records stay in each
 * file. Keep the export name `paperlogy` (Turbopack writes it into the
 * --font-paperlogy family name; CSS matches family names case-insensitively).
 * next/font reads these options statically, so every value is a literal.
 */
export const paperlogy = localFont({
  src: [
    { path: "./fonts/paperlogy-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/paperlogy-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/paperlogy-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/paperlogy-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-paperlogy",
  display: "swap",
  preload: true,
  adjustFontFallback: "Arial",
  fallback: ["Apple SD Gothic Neo", "Malgun Gothic", "system-ui", "sans-serif"],
});
