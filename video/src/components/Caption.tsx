import React from "react";
import { C, FONT, ease, prog } from "../theme";

/**
 * Masked line reveal (out, 12 frames, 3-frame line stagger), masked exit (in, 8 frames).
 * Captions are verbatim app copy (see the caption sheet in v2-edl.md §7). No em dashes.
 */
export const Caption: React.FC<{
  f: number;
  from: number;
  to: number;
  lines: string[];
  x: number;
  y: number;
  size?: number;
  weight?: number;
  color?: string;
  lineHeight?: number;
  align?: "left" | "center";
  width?: number;
  tracking?: string;
  stagger?: number;
}> = ({ f, from, to, lines, x, y, size = 64, weight = 800, color = C.ink, lineHeight = 1.22, align = "left", width, tracking = "-0.01em", stagger = 3 }) => {
  if (f < from || f > to + 1) return null;
  const lh = size * lineHeight;
  return (
    <div
      style={{
        position: "absolute",
        left: align === "center" ? x - (width ?? 1600) / 2 : x,
        top: y,
        width: width ?? (align === "center" ? 1600 : undefined),
        textAlign: align,
        fontFamily: FONT,
        fontWeight: weight,
        fontSize: size,
        lineHeight: `${lh}px`,
        letterSpacing: tracking,
        color,
      }}
    >
      {lines.map((line, i) => {
        const inP = prog(f, from + i * stagger, 12, ease.out);
        const outP = prog(f, to - 8 + i * 1.5, 8, ease.in);
        return (
          <div key={i} style={{ height: lh, overflow: "hidden", paddingBottom: 2 }}>
            <div style={{ translate: `0 ${(1 - inP) * 105 - outP * 105}%`, whiteSpace: "nowrap" }}>{line}</div>
          </div>
        );
      })}
    </div>
  );
};

/**
 * Small label over a big value that slot-rolls up whenever the item changes (out, 6 frames).
 * Round 4: an item may set its own value size and break its value over lines with "\n" (a typed
 * sentence rolls in under its field label like any other value).
 */
export const KineticSwap: React.FC<{
  f: number;
  from: number;
  to: number;
  items: { at: number; label: string; value: string; size?: number }[];
  x: number;
  y: number;
  labelSize?: number;
  valueSize?: number;
  valueWeight?: number;
  color?: string;
  labelColor?: string;
}> = ({ f, from, to, items, x, y, labelSize = 28, valueSize = 92, valueWeight = 800, color = C.ink, labelColor = C.grey700 }) => {
  if (f < from || f > to + 1) return null;
  let idx = -1;
  for (let i = 0; i < items.length; i++) if (f >= items[i].at) idx = i;
  if (idx < 0) return null;
  const enter = prog(f, from, 10, ease.out);
  const exit = prog(f, to - 8, 8, ease.in);
  const cur = items[idx];
  const prev = idx > 0 ? items[idx - 1] : null;
  const roll = prog(f, cur.at, 6, ease.out);
  const lh = labelSize * 1.4;
  const vh = (it: { value: string; size?: number }) => (it.size ?? valueSize) * 1.18;
  const lines = (v: string) => v.split("\n").length;
  const slot = (a: string | undefined, b: string, h: number, style: (v: string) => React.CSSProperties) => (
    <div style={{ height: h, width: 1100, overflow: "hidden", position: "relative" }}>
      {a !== undefined && a !== b && (
        <div style={{ position: "absolute", left: 0, top: 0, translate: `0 ${-roll * 100}%`, whiteSpace: "pre", ...style(a) }}>{a}</div>
      )}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          // round 6: the exit applies after a roll too (a rolled-in value used to skip it and vanish on `to`)
          translate: `0 ${(a !== undefined && a !== b ? (1 - roll) * 100 : (1 - enter) * 100) - exit * 100}%`,
          whiteSpace: "pre",
          ...style(b),
        }}
      >
        {b}
      </div>
    </div>
  );
  const sizeOf = (v: string) => (v === cur.value ? cur.size : prev?.value === v ? prev?.size : undefined) ?? valueSize;
  const valueH = Math.max(vh(cur) * lines(cur.value), prev && roll < 1 ? vh(prev) * lines(prev.value) : 0);
  return (
    <div style={{ position: "absolute", left: x, top: y, fontFamily: FONT, opacity: 1 - exit * 0.2 }}>
      {slot(prev?.label, cur.label, lh, () => ({ fontSize: labelSize, fontWeight: 500, color: labelColor, lineHeight: `${lh}px` }))}
      {slot(prev?.value, cur.value, valueH, (v) => ({
        fontSize: sizeOf(v),
        fontWeight: valueWeight,
        color,
        lineHeight: `${sizeOf(v) * 1.18}px`,
        letterSpacing: "-0.02em",
      }))}
    </div>
  );
};
