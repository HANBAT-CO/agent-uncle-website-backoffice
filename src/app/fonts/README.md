# Paperlogy web fonts

Brand typeface of the 사입삼춘 app. Copyright © 2024 PT& (피티앤), redesign by Lee Juim;
Hangul from Gmarket Sans, Latin from Montserrat. Licensed under the
**SIL Open Font License 1.1** (https://openfontlicense.org). The copyright and
license records are kept in each file's `name` table. "Paperlogy" is a
trademark of Lee Juim.

| File | Weight | Glyphs | Preloaded | Size |
|---|---|---|---|---|
| paperlogy-400-page.woff2 | 400 Regular | page subset (unicode-range: page text) | yes | 24.4 KB |
| paperlogy-800-display.woff2 | 800 ExtraBold | display subset (H1, H2) | yes | 5.2 KB |
| paperlogy-700-page.woff2 | 700 Bold | page subset (unicode-range: page text) | no (swap) | 24.3 KB |
| paperlogy-900-display.woff2 | 900 Black | display subset (사입삼춘. 0-9 ≤ 장) | no (swap) | 2.5 KB |
| paperlogy-400.woff2, paperlogy-700.woff2 | 400, 700 | KS X 1001 set (unicode-range: everything else) | no, on demand | 116.1 KB each |
| og/paperlogy-400-og.ttf, og/paperlogy-900-og.ttf | 400, 900 | share image text only | build only (OG image) | 4.0 KB, 2.3 KB |
| og/paperlogy-400.ttf, og/paperlogy-900.ttf | 400, 900 | KS X 1001 set | not loaded (fallback source for npm run fonts:og) | ~350 KB each |

Weights 300, 500 and 600 are not shipped. Weight 800 is for the strings in
`DISPLAY_800` only and 900 for `DISPLAY_900` only (src/content/copy.ts): any
other character at those weights has no glyph and falls back to a system font.

## KS X 1001 set (400, 700, OG)

Basic Latin, Latin-1, general punctuation, arrows, minus sign, ≈ ≠ ≤ ≥, circled
digits, geometric shapes, CJK punctuation, Hangul Compatibility Jamo (ㄱ…ㆎ), the
2,350 KS X 1001 syllables, plus every character in `.context/brief/product.md`
and the app's `lib/**/*.dart` that the font has. Vertical metrics tables
(vhea/vmtx) are dropped. `²` and `✓` are not in Paperlogy at all (use an icon
for check marks).

```sh
uv run --no-project --with fonttools --with brotli python3 scripts/fonts/subset-paperlogy.py
```

## Display subsets (800, 900)

Built from the page copy, so a heading change needs a rebuild:

```sh
npm run fonts:display
```

`scripts/fonts/display-text.mjs` writes `scripts/fonts/display-{800,900}.txt`
(unique characters of `DISPLAY_800` / `DISPLAY_900` plus a space and basic
punctuation), then `pyftsubset` builds the WOFF2 files with the same name
records as the full set. `src/content/content.test.ts` reads the WOFF2 cmaps
and fails when a display string uses a character its subset lacks.

Loader: `paperlogy.ts` (two next/font/local calls, one "Paperlogy" family,
CSS variable `--font-paperlogy`).

## Page subsets (400, 700)

The page prints about 450 distinct characters. `npm run fonts:page`
(scripts/fonts/page-subset.mjs) collects them (printable ASCII plus every
non-ASCII character in non-test source under src/ that the font has), writes
`paperlogy-{400,700}-page.woff2` from the full files, and rewrites the two
generated unicode-range literals in `paperlogy.ts`. The full KS X 1001 files
stay declared with the complement range, so a character the page never
prints (a visitor's name typed into the form) still renders in Paperlogy and
costs a download only then. `src/app/fonts/page-subset.test.ts` fails when
copy changes and the subsets or ranges are stale.

## Share image (OG)

`npm run fonts:og` (scripts/fonts/og-fonts.mjs) subsets the 900 and 400 TTFs
to the wordmark and the one-liner (src/lib/og-text.ts); Satori reads TTF only.
`src/app/fonts/og-fonts.test.ts` guards the coverage.
