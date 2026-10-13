// Read the set of code points a WOFF2 font maps to a glyph (its cmap table).
//
//   import { woff2CodePoints } from "./woff2-cmap.mjs";
//   const cps = woff2CodePoints(readFileSync("src/app/fonts/paperlogy-800-display.woff2"));
//   cps.has("확".codePointAt(0));
//
// WOFF2 (https://www.w3.org/TR/WOFF2/): a 48-byte header, a table directory of
// variable-length entries, then ONE brotli stream holding every table back to
// back in directory order. Only glyf, loca and hmtx may be transformed, so the
// cmap bytes come out of the stream unchanged. Supports cmap formats 4 and 12,
// which is what pyftsubset writes for these fonts.

import { brotliDecompressSync } from "node:zlib";

const KNOWN_TAGS = [
  "cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca", "prep", "CFF ",
  "VORG", "EBDT", "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF", "GPOS",
  "GSUB", "EBSC", "JSTF", "MATH", "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt", "avar", "bdat", "bloc",
  "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar", "gvar", "hsty", "just", "lcar", "mort", "morx", "opbd", "prop",
  "trak", "Zapf", "Silf", "Glat", "Gloc", "Feat", "Sill",
];

/** @param {Buffer} buf @param {number} offset */
function readBase128(buf, offset) {
  let value = 0;
  for (let i = 0; i < 5; i += 1) {
    const byte = buf[offset + i];
    if (i === 0 && byte === 0x80) throw new Error("woff2: UIntBase128 with a leading zero");
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) return { value, next: offset + i + 1 };
  }
  throw new Error("woff2: UIntBase128 longer than 5 bytes");
}

/**
 * Raw bytes of one table.
 * @param {Buffer} woff2
 * @param {string} wanted 4-character table tag
 * @returns {Buffer}
 */
export function woff2Table(woff2, wanted) {
  if (woff2.toString("latin1", 0, 4) !== "wOF2") throw new Error("not a WOFF2 file");
  if (woff2.toString("latin1", 4, 8) === "ttcf") throw new Error("woff2: font collections are not supported");
  const numTables = woff2.readUInt16BE(12);
  const totalCompressedSize = woff2.readUInt32BE(20);

  let offset = 48;
  let streamOffset = 0;
  let found = null;
  for (let i = 0; i < numTables; i += 1) {
    const flags = woff2[offset];
    offset += 1;
    let tag;
    if ((flags & 0x3f) === 0x3f) {
      tag = woff2.toString("latin1", offset, offset + 4);
      offset += 4;
    } else {
      tag = KNOWN_TAGS[flags & 0x3f];
    }
    const transform = (flags >> 6) & 0x03;
    const orig = readBase128(woff2, offset);
    offset = orig.next;
    let length = orig.value;
    const hasTransformLength = tag === "glyf" || tag === "loca" ? transform === 0 : transform !== 0;
    if (hasTransformLength) {
      const transformed = readBase128(woff2, offset);
      offset = transformed.next;
      length = transformed.value;
    }
    if (tag === wanted) found = { start: streamOffset, length, transformed: hasTransformLength };
    streamOffset += length;
  }
  if (!found) throw new Error(`woff2: no ${wanted} table`);
  if (found.transformed) throw new Error(`woff2: ${wanted} is transformed`);

  const stream = brotliDecompressSync(woff2.subarray(offset, offset + totalCompressedSize));
  return stream.subarray(found.start, found.start + found.length);
}

/** @param {Buffer} table @param {number} at */
function format4(table, at, out) {
  const segCount = table.readUInt16BE(at + 6) / 2;
  const ends = at + 14;
  const starts = ends + segCount * 2 + 2;
  const deltas = starts + segCount * 2;
  const rangeOffsets = deltas + segCount * 2;
  for (let s = 0; s < segCount; s += 1) {
    const end = table.readUInt16BE(ends + s * 2);
    const start = table.readUInt16BE(starts + s * 2);
    const delta = table.readInt16BE(deltas + s * 2);
    const rangeAt = rangeOffsets + s * 2;
    const rangeOffset = table.readUInt16BE(rangeAt);
    for (let c = start; c <= end && c !== 0xffff; c += 1) {
      let glyph;
      if (rangeOffset === 0) {
        glyph = (c + delta) & 0xffff;
      } else {
        const raw = table.readUInt16BE(rangeAt + rangeOffset + (c - start) * 2);
        glyph = raw === 0 ? 0 : (raw + delta) & 0xffff;
      }
      if (glyph !== 0) out.add(c);
    }
  }
}

/** @param {Buffer} table @param {number} at */
function format12(table, at, out) {
  const groups = table.readUInt32BE(at + 12);
  for (let g = 0; g < groups; g += 1) {
    const base = at + 16 + g * 12;
    const start = table.readUInt32BE(base);
    const end = table.readUInt32BE(base + 4);
    const startGlyph = table.readUInt32BE(base + 8);
    for (let c = start; c <= end; c += 1) if (startGlyph + (c - start) !== 0) out.add(c);
  }
}

/**
 * Every code point the font maps to a real glyph.
 * @param {Buffer} woff2
 * @returns {Set<number>}
 */
export function woff2CodePoints(woff2) {
  return cmapCodePoints(woff2Table(woff2, "cmap"));
}

/**
 * Raw bytes of one table of a plain TrueType/OpenType file (the OG image
 * fonts in src/app/fonts/og are TTF: Satori cannot read WOFF2).
 * @param {Buffer} sfnt
 * @param {string} wanted 4-character table tag
 * @returns {Buffer}
 */
export function sfntTable(sfnt, wanted) {
  const version = sfnt.readUInt32BE(0);
  if (version !== 0x00010000 && sfnt.toString("latin1", 0, 4) !== "OTTO" && sfnt.toString("latin1", 0, 4) !== "true") {
    throw new Error("not a TrueType/OpenType file");
  }
  const numTables = sfnt.readUInt16BE(4);
  for (let i = 0; i < numTables; i += 1) {
    const record = 12 + i * 16;
    if (sfnt.toString("latin1", record, record + 4) !== wanted) continue;
    const offset = sfnt.readUInt32BE(record + 8);
    const length = sfnt.readUInt32BE(record + 12);
    return sfnt.subarray(offset, offset + length);
  }
  throw new Error(`sfnt: no ${wanted} table`);
}

/**
 * Every code point a TTF/OTF file maps to a real glyph.
 * @param {Buffer} sfnt
 * @returns {Set<number>}
 */
export function sfntCodePoints(sfnt) {
  return cmapCodePoints(sfntTable(sfnt, "cmap"));
}

/**
 * Code points of a raw cmap table (Unicode subtables, formats 4 and 12).
 * @param {Buffer} cmap
 * @returns {Set<number>}
 */
function cmapCodePoints(cmap) {
  const out = new Set();
  const count = cmap.readUInt16BE(2);
  for (let i = 0; i < count; i += 1) {
    const record = 4 + i * 8;
    const platform = cmap.readUInt16BE(record);
    const encoding = cmap.readUInt16BE(record + 2);
    const at = cmap.readUInt32BE(record + 4);
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (!unicode) continue;
    const format = cmap.readUInt16BE(at);
    if (format === 4) format4(cmap, at, out);
    else if (format === 12) format12(cmap, at, out);
  }
  return out;
}
