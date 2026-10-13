// Build brand files and app icons from the real logo SVGs.
//
//   node scripts/images/build-icons.mjs
//
// Input  (not committed): .context/brief/assets/logos/*.svg|png
// Output (committed):
//   public/brand/saip-samchun-symbol.svg   primary ㅅㅊ mark, 415x254, #111111 (verbatim copy)
//   public/brand/samchun-app-icon.svg      app icon mascot, 1024x1024 (verbatim copy)
//   public/brand/samchun-app-icon.png      PNG export of the mascot (verbatim copy)
//   src/app/icon.svg                       ㅅㅊ mark on an off-white tile (tab icon)
//   src/app/favicon.ico                    16/32/48 PNG-in-ICO of the same tile
//   src/app/apple-icon.png                 180x180, full-bleed off-white (iOS masks corners)
//
// The mark keeps its original #111111 ink. It sits on the brand off-white (#EDECE3)
// so it stays visible on dark browser chrome.
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const logos = path.join(root, ".context/brief/assets/logos");
const brandOut = path.join(root, "public/brand");
const appDir = path.join(root, "src/app");

const PAPER = "#EDECE3";
// Ink bounding box of the mark inside its 415x254 viewBox (measured with sharp.trim).
const INK = { x: 15.5, y: 15.8, width: 383.7, height: 222.6 };

await mkdir(brandOut, { recursive: true });
await copyFile(path.join(logos, "saip_samchun_sc_symbol.svg"), path.join(brandOut, "saip-samchun-symbol.svg"));
await copyFile(path.join(logos, "samchun_app_icon.svg"), path.join(brandOut, "samchun-app-icon.svg"));
await copyFile(path.join(logos, "samchun_app_icon.png"), path.join(brandOut, "samchun-app-icon.png"));

const symbolSvg = await readFile(path.join(logos, "saip_samchun_sc_symbol.svg"), "utf8");
const paths = symbolSvg.match(/<path\b[^>]*\/>/g);
if (!paths || paths.length !== 2) throw new Error("expected the 2 paths of the ㅅㅊ mark");

/** Square SVG with the mark centred; `inkRatio` = ink width / canvas width. */
function tile({ size, radius, inkRatio }) {
  const scale = (size * inkRatio) / INK.width;
  const cx = INK.x + INK.width / 2;
  const cy = INK.y + INK.height / 2;
  const tx = size / 2 - cx * scale;
  const ty = size / 2 - cy * scale;
  const round = (n) => Number(n.toFixed(3));
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    `<rect width="${size}" height="${size}" rx="${radius}" fill="${PAPER}"/>`,
    `<g transform="translate(${round(tx)} ${round(ty)}) scale(${round(scale)})">`,
    ...paths,
    `</g>`,
    `</svg>`,
    "",
  ].join("\n");
}

// Tab icon: rounded tile, large mark so it reads at 16 px.
const iconSvg = tile({ size: 512, radius: 112, inkRatio: 0.8 });
await writeFile(path.join(appDir, "icon.svg"), iconSvg);

// favicon.ico: PNG-in-ICO with 16, 32 and 48 px entries.
const icoSizes = [16, 32, 48];
const pngs = await Promise.all(
  icoSizes.map((s) => sharp(Buffer.from(iconSvg), { density: (72 * s) / 512 * 4 }).resize(s, s).png().toBuffer()),
);
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(icoSizes.length, 4);
let offset = 6 + 16 * icoSizes.length;
const entries = icoSizes.map((s, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(s, 0);
  e.writeUInt8(s, 1);
  e.writeUInt8(0, 2);
  e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(pngs[i].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  return e;
});
await writeFile(path.join(appDir, "favicon.ico"), Buffer.concat([header, ...entries, ...pngs]));

// apple-icon: opaque square, iOS applies its own corner mask.
const appleSvg = tile({ size: 180, radius: 0, inkRatio: 0.66 });
await sharp(Buffer.from(appleSvg), { density: 288 }).resize(180, 180).flatten({ background: PAPER }).png().toFile(path.join(appDir, "apple-icon.png"));

console.log("brand files copied; icon.svg, favicon.ico (16/32/48), apple-icon.png (180) written");
