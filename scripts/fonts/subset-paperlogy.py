"""Subset Paperlogy TTFs into web fonts for the landing page.

Run from the repo root:

    uv run --no-project --with fonttools --with brotli \
        python3 scripts/fonts/subset-paperlogy.py

Inputs (not committed, copied from the app repo):
    .context/brief/assets/fonts/Paperlogy-{3Light..9Black}.ttf
    .context/brief/product.md            (every character the font has is kept)
    .context/app-copy/lib/**/*.dart      (optional, same)

Outputs (committed):
    src/app/fonts/paperlogy-{400,700}.woff2    used by next/font/local
    src/app/fonts/og/paperlogy-{400,900}.ttf   used by opengraph-image (Satori
                                               cannot read WOFF2)

The 800 and 900 web files are display subsets built from the page copy, not
from this glyph set: `npm run fonts:display` (scripts/fonts/display-text.mjs,
then pyftsubset with the same name-ID and table options as below).

Glyph set: Basic Latin, Latin-1, general punctuation, arrows, a few symbols,
CJK punctuation, Hangul Compatibility Jamo, the 2,350 KS X 1001 syllables, plus
any character found in the inputs above (Hangul or not, e.g. the brief's
"≠" / "≤" and the hanja glosses 仕入 / 未送) that the source font contains. Paperlogy is OFL 1.1; the copyright and
license name records (IDs 0-14) are preserved in every output.
"""

from __future__ import annotations

import pathlib
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC_DIR = ROOT / ".context" / "brief" / "assets" / "fonts"
OUT_DIR = ROOT / "src" / "app" / "fonts"
OG_DIR = OUT_DIR / "og"

WEIGHTS: dict[int, str] = {
    400: "Paperlogy-4Regular.ttf",
    700: "Paperlogy-7Bold.ttf",
    900: "Paperlogy-9Black.ttf",
}
WEB_WEIGHTS = (400, 700)
OG_WEIGHTS = (400, 900)

# (start, end) inclusive code point ranges.
RANGES: list[tuple[int, int]] = [
    (0x0020, 0x007E),  # Basic Latin
    (0x00A0, 0x00FF),  # Latin-1 Supplement (middle dot, multiplication sign, ...)
    (0x2010, 0x2027),  # General punctuation: dashes, quotes, bullet, ellipsis
    (0x2030, 0x203B),  # per mille, primes, angle quotes, reference mark
    (0x20A9, 0x20A9),  # won sign
    (0x20AC, 0x20AC),  # euro sign
    (0x2116, 0x2116),  # numero sign
    (0x2122, 0x2122),  # trade mark
    (0x2190, 0x2199),  # arrows
    (0x2212, 0x2212),  # minus sign (steppers)
    (0x2248, 0x2248),  # almost equal to
    (0x2260, 0x2260),  # not equal to ("읽음 ≠ 수락")
    (0x2264, 0x2265),  # less/greater-than or equal to
    (0x2460, 0x2473),  # circled digits 1-20
    (0x25A0, 0x25CF),  # geometric shapes present in the font
    (0x3000, 0x303F),  # CJK symbols and punctuation
    (0x3131, 0x318E),  # Hangul Compatibility Jamo
]


def ks_x_1001_syllables() -> set[str]:
    """The 2,350 precomposed syllables of KS X 1001 (EUC-KR rows 0xB0-0xC8)."""
    chars: set[str] = set()
    for lead in range(0xB0, 0xC9):
        for trail in range(0xA1, 0xFF):
            chars.add(bytes([lead, trail]).decode("euc-kr"))
    assert len(chars) == 2350, len(chars)
    return chars


def chars_in(paths: list[pathlib.Path]) -> set[str]:
    """Every printable character in the files (the subsetter skips ones the font lacks)."""
    found: set[str] = set()
    for path in paths:
        text = path.read_text(encoding="utf-8", errors="ignore")
        found |= {ch for ch in text if ch.isprintable() and not ch.isspace()}
    return found


def is_syllable(ch: str) -> bool:
    return 0xAC00 <= ord(ch) <= 0xD7A3


def build_unicodes() -> tuple[list[int], dict[str, int]]:
    codepoints: set[int] = set()
    for start, end in RANGES:
        codepoints.update(range(start, end + 1))

    ks = ks_x_1001_syllables()
    brief = ROOT / ".context" / "brief" / "product.md"
    if not brief.exists():
        sys.exit(f"missing {brief}")
    brief_chars = chars_in([brief])
    app_lib = ROOT / ".context" / "app-copy" / "lib"
    app_chars = chars_in(sorted(app_lib.rglob("*.dart"))) if app_lib.exists() else set()
    from_brief = {ch for ch in brief_chars if is_syllable(ch)}
    from_app = {ch for ch in app_chars if is_syllable(ch)}

    hangul = ks | from_brief | from_app
    codepoints.update(ord(ch) for ch in hangul)
    # Non-Hangul characters the copy uses (symbols, hanja glosses).
    codepoints.update(ord(ch) for ch in brief_chars | app_chars)
    stats = {
        "ks_x_1001": len(ks),
        "brief": len(from_brief),
        "brief_outside_ks": len(from_brief - ks),
        "app_lib": len(from_app),
        "app_lib_outside_ks": len(from_app - ks),
        "hangul_total": len(hangul),
        "other_chars_from_inputs": len({ch for ch in brief_chars | app_chars if not is_syllable(ch)}),
    }
    return sorted(codepoints), stats


def subset_font(src: pathlib.Path, dst: pathlib.Path, unicodes: list[int], flavor: str | None) -> int:
    options = subset.Options()
    options.flavor = flavor
    options.layout_features = ["*"]
    options.hinting = False  # source is unhinted already; keeps the flag explicit
    options.desubroutinize = True
    options.drop_tables += ["vhea", "vmtx", "DSIG"]  # no vertical writing on the site
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 13, 14]  # keep OFL notice
    options.name_languages = ["*"]
    options.notdef_outline = True
    options.recalc_bounds = True

    font = TTFont(src)
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=unicodes)
    subsetter.subset(font)
    dst.parent.mkdir(parents=True, exist_ok=True)
    font.flavor = flavor
    font.save(dst)
    return dst.stat().st_size


def main() -> None:
    unicodes, stats = build_unicodes()
    print(f"code points requested: {len(unicodes)}  {stats}")
    for weight in WEB_WEIGHTS:
        name = WEIGHTS[weight]
        src = SRC_DIR / name
        size = subset_font(src, OUT_DIR / f"paperlogy-{weight}.woff2", unicodes, "woff2")
        print(f"{weight}  {name:28s} {src.stat().st_size / 1024:8.1f} KB ttf -> {size / 1024:7.1f} KB woff2")
    for weight in OG_WEIGHTS:
        src = SRC_DIR / WEIGHTS[weight]
        size = subset_font(src, OG_DIR / f"paperlogy-{weight}.ttf", unicodes, None)
        print(f"og {weight} ttf {size / 1024:7.1f} KB")


if __name__ == "__main__":
    main()
