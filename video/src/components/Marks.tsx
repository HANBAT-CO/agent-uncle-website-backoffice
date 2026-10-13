import React, { useContext } from "react";
import { C, ease, lerp, prog } from "../theme";
import { ScreenCtx } from "./Phone";

/**
 * Tap ripple, in % of the phone screen. Mint over deep-green buttons, green over light rows.
 * `cutAt` (round 5) is the first frame of the next screen (a new page, a dialog opening or closing,
 * or a footage cut): the ring fades over the last 2 frames of its own screen and is gone on `cutAt`,
 * so it never lands on the next screen's buttons. Frames are measured by frame-differencing the source clips.
 */
export type Ripple = { at: number; x: number; y: number; tone: "mint" | "green"; cutAt?: number };

/** Frames a ripple fades over once its screen changes. */
const CUT_FADE = 2;
/**
 * Highlight frame around an ROI, in % of the phone screen.
 * `marks` (round 6) replaces the frame with marker strokes, one block per text line, for a sentence that
 * wraps inside a paragraph: a frame (or a notched frame) has to run in the 10 px gap between the lines
 * and reads as an underline of the other sentence. The blocks are tinted green (multiply, so the text
 * stays dark) and wipe in left to right, line after line, like a highlighter.
 */
export type Box = [number, number, number, number];
export type Hl = { at: number; until: number; box?: Box; marks?: Box[] };

/** Source pixels (1080-wide capture) to screen pixels. */
const useK = () => {
  const s = useContext(ScreenCtx);
  return { ...s, k: s.w / 1080 };
};

/**
 * Tap indicator sized for a demo-led film (round 2): a 90 source-px press disc (light 25 % fill with
 * a 2 px rim, so the button label under it stays readable) and a ring that expands to 220 source px.
 */
export const TapRipple: React.FC<{ f: number; r: Ripple }> = ({ f, r }) => {
  const { w, h, k, cam } = useK();
  const t = f - r.at;
  const live = r.cutAt === undefined ? 1 : 1 - prog(f, r.cutAt - CUT_FADE, CUT_FADE);
  if (t < 0 || t > 18 || live <= 0) return null;
  const color = r.tone === "mint" ? C.mint : C.green;
  const cx = (r.x / 100) * w;
  const cy = (r.y / 100) * h;
  const press = t < 6 ? lerp(t, [0, 2], [0.6, 1], ease.out) : lerp(t, [6, 10], [1, 0]);
  const ring = prog(t, 2, 15, ease.out);
  const d0 = 90 * k;
  const d1 = 220 * k;
  const d = d0 + (d1 - d0) * ring;
  const sw = (12 - 8 * ring) * k;
  return (
    <svg width={w} height={h} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none", opacity: live }}>
      <circle cx={cx} cy={cy} r={(d0 / 2) * (0.85 + 0.15 * press)} fill={color} fillOpacity={0.25 * press} stroke={color} strokeWidth={2 / cam} strokeOpacity={press} />
      {t >= 2 && <circle cx={cx} cy={cy} r={d / 2} fill="none" stroke={color} strokeWidth={sw} opacity={0.95 * (1 - ring)} />}
    </svg>
  );
};

/** Marker strokes over wrapped text (see `Hl.marks`): each line's block wipes in, in reading order. */
const MarkerStrokes: React.FC<{ t: number; marks: Box[]; fade: number }> = ({ t, marks, fade }) => {
  const { w, h, cam } = useK();
  const total = marks.reduce((a, [x0, , x1]) => a + (x1 - x0), 0);
  let start = 0;
  return (
    <svg width={w} height={h} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none", opacity: fade }}>
      {marks.map(([x0, y0, x1, y1], i) => {
        // 10 frames in all, shared by the lines in proportion to their length
        const span = ((x1 - x0) / total) * 10;
        const p = prog(t, start, span, i === marks.length - 1 ? ease.out : ease.linear);
        start += span;
        if (p <= 0) return null;
        return (
          <rect
            key={i}
            x={(x0 / 100) * w}
            y={(y0 / 100) * h}
            width={((x1 - x0) / 100) * w * p}
            height={((y1 - y0) / 100) * h}
            rx={3 / cam}
            fill={C.tint2}
            style={{ mixBlendMode: "multiply" }}
          />
        );
      })}
    </svg>
  );
};

export const Highlight: React.FC<{ f: number; hl: Hl; color?: string }> = ({ f, hl, color = C.green }) => {
  const { w, h, cam } = useK();
  const t = f - hl.at;
  if (t < 0 || f > hl.until + 6) return null;
  const draw = prog(t, 0, 8, ease.out);
  const pop = lerp(t, [0, 8], [1.04, 1], ease.overshoot);
  const fade = lerp(f, [hl.until, hl.until + 6], [1, 0]);
  if (hl.marks) return <MarkerStrokes t={t} marks={hl.marks} fade={fade} />;
  if (!hl.box) return null;
  const pad = 7 / cam;
  const [x0, y0, x1, y1] = hl.box;
  const x = (x0 / 100) * w - pad;
  const y = (y0 / 100) * h - pad;
  const bw = ((x1 - x0) / 100) * w + pad * 2;
  const bh = ((y1 - y0) / 100) * h + pad * 2;
  const sw = 4 / cam;
  return (
    <svg
      width={w}
      height={h}
      style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none", opacity: fade }}
    >
      <g style={{ transformBox: "fill-box", transformOrigin: "50% 50%", scale: pop }}>
        <rect
          x={x}
          y={y}
          width={bw}
          height={bh}
          rx={14 / cam}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - draw}
        />
      </g>
    </svg>
  );
};

export const Marks: React.FC<{ f: number; ripples?: Ripple[]; highlights?: Hl[] }> = ({ f, ripples = [], highlights = [] }) => (
  <>
    {highlights.map((hl, i) => (
      <Highlight key={`h${i}`} f={f} hl={hl} />
    ))}
    {ripples.map((r, i) => (
      <TapRipple key={`r${i}`} f={f} r={r} />
    ))}
  </>
);
