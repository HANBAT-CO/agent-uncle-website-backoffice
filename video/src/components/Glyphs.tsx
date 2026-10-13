import React from "react";
import { GLYPHS, GlyphData } from "../generated/glyphs";

/**
 * Exact Paperlogy outlines (extracted from the TTFs by scripts/build-glyphs.mjs).
 * Rendering Hangul as paths gives pixel-exact typesetting, per-syllable animation and
 * the ability to drop single jamo contours (the ㅇ that the hero disc replaces).
 */
export type Weight = "black" | "extrabold";

/** Vertical box in font units used for every glyph svg (ink spans about -765..52). */
export const G_TOP = -800;
export const G_BOTTOM = 70;
export const G_HEIGHT = G_BOTTOM - G_TOP;
export const UPM = 900;
const SPACE = 260;

export type LaidGlyph = { ch: string; x: number; adv: number; g: GlyphData | null };

export const layoutText = (text: string, weight: Weight = "black", tracking = 0) => {
  let x = 0;
  const items: LaidGlyph[] = [];
  for (const ch of text) {
    const g = GLYPHS[weight].glyphs[ch] ?? null;
    const adv = g ? g.advance : SPACE;
    items.push({ ch, x, adv, g });
    x += adv + tracking;
  }
  return { items, width: x - tracking };
};

export type GlyphWordProps = {
  text: string;
  /** font size in px (UPM 900 units -> size px) */
  size: number;
  color: string;
  weight?: Weight;
  tracking?: number;
  hide?: (charIndex: number, contourIndex: number) => boolean;
  glyphStyle?: (charIndex: number) => React.CSSProperties | undefined;
  stroke?: { color: string; width: number };
  style?: React.CSSProperties;
  children?: React.ReactNode;
};

/** Renders text as an inline svg. Box: width = advance sum, height = G_HEIGHT units. */
export const GlyphWord: React.FC<GlyphWordProps> = ({
  text,
  size,
  color,
  weight = "black",
  tracking = -10,
  hide,
  glyphStyle,
  stroke,
  style,
  children,
}) => {
  const k = size / UPM;
  const { items, width } = layoutText(text, weight, tracking);
  return (
    <svg
      width={width * k}
      height={G_HEIGHT * k}
      viewBox={`0 ${G_TOP} ${width} ${G_HEIGHT}`}
      style={{ overflow: "visible", display: "block", ...style }}
    >
      {items.map((it, i) =>
        it.g ? (
          <g key={i} transform={`translate(${it.x} 0)`}>
            <g
              style={{
                transformBox: "fill-box",
                transformOrigin: "50% 50%",
                ...(glyphStyle?.(i) ?? {}),
              }}
            >
              <path
                d={it.g.contours
                  .filter((_, ci) => !hide?.(i, ci))
                  .map((c) => c.d)
                  .join("")}
                fill={stroke ? "none" : color}
                stroke={stroke?.color}
                strokeWidth={stroke ? stroke.width / k : undefined}
                strokeLinejoin="round"
              />
            </g>
          </g>
        ) : null,
      )}
      {children}
    </svg>
  );
};

/** Vertical centre of Hangul ink in font units (ink spans about -757..37). */
export const INK_CY = -360;
