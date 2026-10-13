import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT, ease, lerp, mix, prog, rand } from "../theme";
import { Disc } from "../components/Disc";

/** figma_shirt.svg path from the brand kit (stroke recoloured to #636363). */
export const SHIRT_D = "M8 3L3 6L1 11L5 13L7 10V21H17V10L19 13L23 11L21 6L16 3C15 6 9 6 8 3Z";

type Frag =
  | { kind: "bubble"; at: number; x: number; y: number; rot: number; text: string; size: number; time?: string; tone?: "grey" | "surface" }
  | { kind: "photo"; at: number; x: number; y: number; rot: number; size: number }
  | { kind: "memo"; at: number; x: number; y: number; rot: number; lines: string[] }
  | { kind: "bar"; at: number; x: number; y: number; rot: number; w: number };

/** Rough ink box of a readable fragment in px (Paperlogy: Hangul ~0.92 em, digits/Latin ~0.62 em). */
const textW = (t: string, size: number) =>
  [...t].reduce((a, ch) => a + size * (/[가-힣]/.test(ch) ? 0.92 : ch === " " ? 0.28 : /[0-9A-Za-z]/.test(ch) ? 0.62 : 0.36), 0);
const boxOf = (fr: Frag, W: number, H: number, u: number) => {
  let w = 0;
  let h = 0;
  if (fr.kind === "bubble") {
    w = textW(fr.text, fr.size) * u + fr.size * 1.32 * u + (fr.time ? 58 * u : 0);
    h = fr.size * (1.15 + 0.84) * u;
  } else if (fr.kind === "memo") {
    w = Math.max(...fr.lines.map((l) => textW(l, 30))) * u + 52 * u;
    h = (2 * 30 * 1.45 + 40) * u;
  } else if (fr.kind === "photo") {
    w = fr.size * u;
    h = fr.size * u;
  }
  const cx = (fr.x / 100) * W;
  const cy = (fr.y / 100) * H;
  return { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 };
};

/**
 * Fragments in % of the frame (x, y = centre). Dramatised pre-app chat, not app copy
 * (EDL §7, flagged illustrative): counts clash and a back-order gets forgotten.
 * Generic bubbles, no messenger brand.
 * Round 4: the readable lines are laid out per format (portrait has its own column, nothing clipped
 * or stacked), "7장 보냈어요" and "6장 왔는데요?" read as a sent / reply pair with the converge
 * centre clear between them, and the 15 blank filler bars are placed only where they cannot touch a
 * readable fragment (they also paint underneath every readable fragment).
 */
const FRAGS = (portrait: boolean, W = 1920, H = 1080): Frag[] => {
  const u = Math.min(W, H) / 1080;
  const base: Frag[] = portrait
    ? [
        { kind: "bubble", at: 2, x: 40, y: 22, rot: -3, text: "오버핏 셔츠 아이보리 M 10장이요", size: 38, time: "19:12" },
        { kind: "bubble", at: 7, x: 66, y: 30, rot: 3, text: "확인했어요", size: 38, time: "19:12", tone: "surface" },
        { kind: "bubble", at: 11, x: 35, y: 42, rot: -2, text: "7장 보냈어요", size: 66, time: "05:53", tone: "surface" },
        { kind: "bubble", at: 16, x: 60, y: 58, rot: 3, text: "6장 왔는데요?", size: 66, time: "08:47" },
        { kind: "bubble", at: 21, x: 58, y: 75, rot: 2, text: "남은 3장은 언제 와요?", size: 44 },
        { kind: "photo", at: 24, x: 78, y: 13, rot: 5, size: 150 },
        { kind: "memo", at: 27, x: 72, y: 65, rot: -5, lines: ["쥬디 디오트 2층 B-12", "아이보리 M 10"] },
        { kind: "bubble", at: 30, x: 30, y: 65, rot: -3, text: "몇 장 확보됐어요?", size: 34, time: "02:14" },
        { kind: "photo", at: 33, x: 24, y: 82, rot: -5, size: 128 },
      ]
    : [
        { kind: "bubble", at: 2, x: 27, y: 25, rot: -4, text: "오버핏 셔츠 아이보리 M 10장이요", size: 38, time: "19:12" },
        { kind: "bubble", at: 7, x: 64, y: 33, rot: 3, text: "확인했어요", size: 38, time: "19:12", tone: "surface" },
        { kind: "bubble", at: 11, x: 36, y: 44, rot: -2, text: "7장 보냈어요", size: 66, time: "05:53", tone: "surface" },
        { kind: "bubble", at: 16, x: 65, y: 58, rot: 3, text: "6장 왔는데요?", size: 66, time: "08:47" },
        { kind: "bubble", at: 21, x: 70, y: 83, rot: 2, text: "남은 3장은 언제 와요?", size: 44 },
        { kind: "photo", at: 24, x: 77, y: 17, rot: 5, size: 150 },
        { kind: "memo", at: 27, x: 19, y: 63, rot: -6, lines: ["쥬디 디오트 2층 B-12", "아이보리 M 10"] },
        { kind: "bubble", at: 30, x: 84, y: 45, rot: -3, text: "몇 장 확보됐어요?", size: 34, time: "02:14" },
        { kind: "photo", at: 33, x: 36, y: 84, rot: -5, size: 128 },
      ];
  // keep-out boxes: every readable fragment (+ air) and the converge centre
  const pad = 26 * u;
  const keep = base.map((fr) => boxOf(fr, W, H, u)).map((b) => ({ x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad }));
  keep.push({ x0: W / 2 - 90 * u, y0: H / 2 - 90 * u, x1: W / 2 + 90 * u, y1: H / 2 + 90 * u });
  const hit = (a: { x0: number; y0: number; x1: number; y1: number }) => keep.some((b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0);
  const bars: Frag[] = [];
  let seed = 3;
  for (let i = 0; i < 15; i++) {
    for (let tries = 0; tries < 60; tries++, seed += 7) {
      const w = (120 + rand(seed + 13) * 160) * u;
      const x = 6 + rand(seed) * 88;
      const y = 7 + rand(seed + 31) * 86;
      const cx = (x / 100) * W;
      const cy = (y / 100) * H;
      const box = { x0: cx - w / 2, y0: cy - 26 * u, x1: cx + w / 2, y1: cy + 26 * u };
      if (box.x0 < 20 * u || box.x1 > W - 20 * u || hit(box)) continue;
      keep.push({ x0: box.x0 - 10 * u, y0: box.y0 - 10 * u, x1: box.x1 + 10 * u, y1: box.y1 + 10 * u });
      bars.push({ kind: "bar", at: 36 + i * 0.55, x, y, rot: (rand(seed + 7) - 0.5) * 10, w: w / u });
      break;
    }
  }
  // filler first, so every readable fragment paints over it
  return [...bars, ...base];
};

const CX = 50;
const CY = 50;
export const CONVERGE = 52;

/**
 * S00 · The problem. A request lives in scattered chat, photos and memos; then every fragment
 * is pulled into one green dot (one shared record). The dot grows with each absorption.
 */
export const Problem: React.FC<{ scale?: number; converge?: number; tScale?: number }> = ({ scale = 1, converge = CONVERGE, tScale = 1 }) => {
  const raw = useCurrentFrame();
  // authored for a 52-frame build; the build is squeezed into `converge` frames and the
  // converge itself plays tScale times as long
  const f = raw < converge ? (raw * CONVERGE) / converge : CONVERGE + (raw - converge) / tScale;
  const { width: W, height: H } = useVideoConfig();
  const portrait = H > W;
  const u = Math.min(W, H) / 1080 * scale;
  const frags = FRAGS(portrait, W, H);
  const drift = lerp(f, [0, 50], [0, -40 * u], ease.outQuad);
  const jitter = f >= 44 && f < CONVERGE ? (Math.floor(f / 2) % 2 ? 2 : -2) * u : 0;
  const cx = (CX / 100) * W;
  const cy = (CY / 100) * H;
  // absorb the filler first and the readable lines last, so the count clash stays on screen longest
  const prio = (fr: Frag) => (fr.kind === "bar" ? 0 : fr.kind === "bubble" ? (fr.size >= 44 ? 3 : 2) : 1);
  const order = frags.map((_, i) => i).sort((a, b) => prio(frags[a]) - prio(frags[b]) || rand(a + 50) - rand(b + 50));
  const startOf = (i: number) => CONVERGE + order.indexOf(i) * 0.5;
  const absorbed = frags.filter((_, i) => f >= startOf(i) + 12).length;
  const dotIn = prog(f, 46, 6, ease.overshoot);
  const anticip = lerp(f, [46, 49, 52], [1, 0.82, 1]);
  const pop = lerp(f, [69, 72, 75], [1, 170 / 150, 160 / 150], ease.out);
  const dotD = (14 + (136 * absorbed) / frags.length) * u * pop;

  return (
    <AbsoluteFill style={{ background: C.paper, overflow: "hidden" }}>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        {frags.map((fr, i) => {
          const s = startOf(i);
          const p = prog(f, s, 12, ease.in);
          if (p <= 0.02 || p >= 1) return null;
          const x0 = (fr.x / 100) * W;
          const y0 = (fr.y / 100) * H + drift;
          const mx = mix(x0, cx, 0.5) + (rand(i + 77) - 0.5) * 360 * u;
          const my = mix(y0, cy, 0.5) - 160 * u;
          const trail = Math.max(0, p - 0.35);
          // point on the quadratic curve
          const q = (t: number) => ({
            x: (1 - t) ** 2 * x0 + 2 * (1 - t) * t * mx + t * t * cx,
            y: (1 - t) ** 2 * y0 + 2 * (1 - t) * t * my + t * t * cy,
          });
          const a = q(trail);
          const b = q(p);
          const c = q((trail + p) / 2);
          return (
            <path
              key={i}
              d={`M${a.x} ${a.y} Q${2 * c.x - (a.x + b.x) / 2} ${2 * c.y - (a.y + b.y) / 2} ${b.x} ${b.y}`}
              fill="none"
              stroke={C.green}
              strokeWidth={2.2 * u}
              strokeLinecap="round"
              opacity={0.8 * (1 - p * 0.6)}
            />
          );
        })}
      </svg>
      {frags.map((fr, i) => {
        const appear = prog(f, fr.at, 6, ease.overshoot);
        if (appear <= 0) return null;
        const s = startOf(i);
        const p = prog(f, s, 12, ease.in);
        if (p >= 1) return null;
        const x0 = (fr.x / 100) * W;
        const y0 = (fr.y / 100) * H + drift + jitter * (i % 2 ? 1 : -1);
        const mx = mix(x0, cx, 0.5) + (rand(i + 77) - 0.5) * 360 * u;
        const my = mix(y0, cy, 0.5) - 160 * u;
        const x = (1 - p) ** 2 * x0 + 2 * (1 - p) * p * mx + p * p * cx;
        const y = (1 - p) ** 2 * y0 + 2 * (1 - p) * p * my + p * p * cy;
        const sc = (0.5 + 0.5 * appear) * (1 - p * 0.92);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              translate: "-50% -50%",
              rotate: `${fr.rot * (1 - p)}deg`,
              scale: sc,
              opacity: Math.min(1, appear * 1.6),
            }}
          >
            <FragView fr={fr} u={u} morph={p} />
          </div>
        );
      })}
      {f >= 46 && <Disc x={cx} y={cy} d={dotD} scaleX={1 / anticip} scaleY={anticip * dotIn} color={C.green} />}
    </AbsoluteFill>
  );
};

/** One fragment, drawn flat. `morph` (0..1) turns it into a green dot while it flies. */
export const FragView: React.FC<{ fr: Frag; u: number; morph?: number; flat?: { fill: string; ink: string } }> = ({ fr, u, morph = 0, flat }) => {
  const radius = lerp(morph, [0.4, 0.9], [0, 400]);
  const bg = morph > 0.55 ? C.green : undefined;
  const textOpacity = 1 - prog(morph, 0.2, 0.3);
  const common: React.CSSProperties = {
    fontFamily: FONT,
    color: flat?.ink ?? C.ink,
    whiteSpace: "nowrap",
    borderRadius: Math.max(26 * u, radius * u),
  };
  if (fr.kind === "bubble") {
    return (
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10 * u }}>
        <div
          style={{
            ...common,
            background: bg ?? flat?.fill ?? (fr.tone === "surface" ? C.paper2 : C.bubble),
            padding: `${fr.size * 0.42 * u}px ${fr.size * 0.66 * u}px`,
            fontSize: fr.size * u,
            fontWeight: fr.size > 50 ? 800 : 600,
            lineHeight: 1.15,
            boxShadow: flat ? undefined : `0 ${6 * u}px ${18 * u}px rgba(7,35,28,0.08)`,
          }}
        >
          <span style={{ opacity: textOpacity }}>{fr.text}</span>
        </div>
        {fr.time && (
          <span style={{ fontFamily: FONT, fontSize: 18 * u, color: flat?.ink ?? C.grey600, fontWeight: 500, opacity: textOpacity }}>{fr.time}</span>
        )}
      </div>
    );
  }
  if (fr.kind === "photo") {
    return (
      <div
        style={{
          ...common,
          width: fr.size * u,
          height: fr.size * u,
          borderRadius: Math.max(18 * u, radius * u),
          background: bg ?? flat?.fill ?? C.bubble,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width={fr.size * 0.5 * u} height={fr.size * 0.5 * u} viewBox="0 0 24 24" style={{ opacity: textOpacity }}>
          <path d={SHIRT_D} fill="none" stroke={flat?.ink ?? C.grey600} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }
  if (fr.kind === "memo") {
    return (
      <div
        style={{
          ...common,
          borderRadius: Math.max(6 * u, radius * u),
          background: bg ?? flat?.fill ?? C.paper2,
          border: flat ? undefined : `${1.5 * u}px solid ${C.hair}`,
          padding: `${20 * u}px ${26 * u}px`,
          fontSize: 30 * u,
          fontWeight: 600,
          lineHeight: 1.45,
          boxShadow: flat ? undefined : `0 ${8 * u}px ${20 * u}px rgba(7,35,28,0.08)`,
        }}
      >
        {fr.lines.map((l, i) => (
          <div key={i} style={{ opacity: textOpacity }}>
            {l}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div
      style={{
        width: fr.w * u,
        height: 52 * u,
        borderRadius: 26 * u,
        background: bg ?? flat?.fill ?? (fr.w > 200 ? C.bubble : C.paper2),
        display: "flex",
        alignItems: "center",
        padding: `0 ${22 * u}px`,
        boxSizing: "border-box",
      }}
    >
      <div style={{ width: "70%", height: 10 * u, borderRadius: 5 * u, background: flat?.ink ?? "#CFCEC4", opacity: textOpacity }} />
    </div>
  );
};

export { FRAGS };
export type { Frag };
