import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { getMapView, type MapBuilding, type MapPath, type MapView } from "@/components/map/views";
import { OG_TEXT } from "@/lib/og-text";
import { site } from "@/lib/site";

/**
 * Share card (spec 12), 1200x630, statically generated at build time.
 *
 * The night of the hero: ground #07231C, the hero-desktop market map from the
 * generated map JSON as an inline SVG (dim silhouettes at
 * rgba(182,215,194,0.30), the stream and roads at 0.16, 청평화 in mint
 * #F2FFE8 with its 1층 dot), the ㅅㅊ symbol on its paper plate, the wordmark
 * 사입삼춘 in Paperlogy 900 with a mint circle as the full stop, and the
 * one-liner in 400.
 *
 * Fonts are TTF subsets holding only the characters drawn here
 * (npm run fonts:og; src/app/fonts/og-fonts.test.ts guards them), so the
 * route's inputs stay a few KB.
 */

export const alt = `${site.name}: ${site.oneLiner}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = {
  ground: "#07231C",
  dim: "rgba(182,215,194,0.30)",
  faint: "rgba(182,215,194,0.16)",
  mint: "#F2FFE8",
  text: "#EDECE3",
  textSecondary: "#B6D7C2",
  paper: "#F5F4EE",
} as const;

/** Where the map's focus (청평화's roof) lands on the card, and the map scale. */
const MAP_PLACE = { x: 846, y: 214, scale: 1.12 } as const;
/** On-card stroke widths (the map is drawn once at MAP_PLACE.scale). */
const STROKE = { line: 1.5, faint: 1.25 } as const;

const [black, regular, symbol] = await Promise.all([
  readFile(join(process.cwd(), "src/app/fonts/og/paperlogy-900-og.ttf")),
  readFile(join(process.cwd(), "src/app/fonts/og/paperlogy-400-og.ttf")),
  readFile(join(process.cwd(), "public/brand/saip-samchun-symbol.svg")),
]);

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function strokePath(path: MapPath, stroke: string, width: number, fill = "none"): string {
  return `<path d="${path.d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`;
}

function buildingSvg(building: MapBuilding, lit: boolean, unit: number): string {
  const line = lit ? INK.mint : INK.dim;
  const crease = lit ? "rgba(242,255,232,0.45)" : INK.faint;
  const parts = [
    strokePath(building.sil, line, STROKE.line * unit, INK.ground),
    strokePath(building.crease, crease, STROKE.line * unit),
    ...building.floors.map((floor) => strokePath(floor, line, STROKE.line * unit)),
  ];
  if (lit && building.door) parts.push(strokePath(building.door, line, STROKE.line * unit));
  return `<g>${parts.join("")}</g>`;
}

/** The hero-desktop map placed on the card: faint ground lines, then buildings back to front. */
function mapSvg(view: MapView): string {
  const { width, height } = size;
  const [fx, fy] = view.focus.point;
  const { x, y, scale } = MAP_PLACE;
  // Stroke widths are given in map units, so divide by the scale to land at STROKE px on the card.
  const unit = 1 / scale;
  const faint = [...view.faint.stream, ...view.faint.roads].map((path) => strokePath(path, INK.faint, STROKE.faint * unit));
  const buildings = [...view.buildings]
    .sort((a, b) => a.order - b.order)
    .map((building) => buildingSvg(building, building.id === view.focus.building, unit));
  const focusBuilding = view.buildings.find((building) => building.id === view.focus.building);
  const dotAt = focusBuilding?.floors[0]?.anchor;
  const dot = dotAt
    ? `<circle cx="${dotAt[0]}" cy="${dotAt[1]}" r="${11 * unit}" fill="none" stroke="rgba(242,255,232,0.30)" stroke-width="${unit}"/>` +
      `<circle cx="${dotAt[0]}" cy="${dotAt[1]}" r="${7 * unit}" fill="${INK.mint}"/>`
    : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<g transform="translate(${x - fx * scale} ${y - fy * scale}) scale(${scale})">` +
    faint.join("") +
    buildings.join("") +
    dot +
    `</g></svg>`
  );
}

export default function OpengraphImage() {
  const mapSrc = svgDataUri(mapSvg(getMapView("hero-desktop")));
  const symbolSrc = `data:image/svg+xml;base64,${symbol.toString("base64")}`;
  const wordSize = 168;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          backgroundColor: INK.ground,
          fontFamily: "Paperlogy",
        }}
      >
        {/* Satori draws plain <img> elements; next/image does not apply here. */}
        <img src={mapSrc} width={size.width} height={size.height} alt="" style={{ position: "absolute", left: 0, top: 0 }} />

        <div
          style={{
            position: "absolute",
            left: 72,
            top: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 104,
            height: 68,
            borderRadius: 20,
            backgroundColor: INK.paper,
          }}
        >
          <img src={symbolSrc} width={76} height={47} alt="" />
        </div>

        <div
          style={{
            position: "absolute",
            left: 66,
            bottom: 64,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <span
              style={{
                fontSize: wordSize,
                fontWeight: 900,
                lineHeight: 1,
                letterSpacing: "-0.02em",
                color: INK.text,
              }}
            >
              {OG_TEXT.wordmark}
            </span>
            <div
              style={{
                width: Math.round(wordSize * 0.17),
                height: Math.round(wordSize * 0.17),
                marginLeft: Math.round(wordSize * 0.05),
                marginBottom: Math.round(wordSize * 0.06),
                borderRadius: 999,
                backgroundColor: INK.mint,
              }}
            />
          </div>
          <span
            style={{
              marginTop: 30,
              marginLeft: 6,
              fontSize: 36,
              fontWeight: 400,
              lineHeight: 1.4,
              color: INK.textSecondary,
            }}
          >
            {OG_TEXT.line}
          </span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Paperlogy", data: black, weight: 900, style: "normal" },
        { name: "Paperlogy", data: regular, weight: 400, style: "normal" },
      ],
    },
  );
}
