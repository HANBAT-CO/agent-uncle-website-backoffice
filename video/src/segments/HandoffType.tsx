import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { C, ease, lerp, prog } from "../theme";
import { GlyphWord, G_TOP, INK_CY, layoutText } from "../components/Glyphs";
import { Disc } from "../components/Disc";

const TRACK = -10;
const WORDS = ["확보", "전달", "수령"];

/** Hop choreography shared by both layouts (authored for 30 frames). */
const hop = (f: number) => {
  const crouch = lerp(f, [9, 13], [0, 1], ease.anticipate);
  const fly = prog(f, 13, 8, ease.inOut);
  const land = lerp(f, [21, 22, 27], [0, 1, 0], ease.snap);
  const flying = fly > 0 && fly < 1;
  const sx = flying ? 0.82 : 1 + land * 0.32 + (fly <= 0 ? crouch * 0.18 : 0);
  const sy = flying ? 1.25 : 1 - land * 0.26 - (fly <= 0 ? crouch * 0.2 : 0);
  return { crouch, fly, land, flying, sx, sy, small1: prog(f, 16, 6, ease.overshoot), small2: 1 - prog(f, 15, 5, ease.in) };
};

/**
 * Landscape hero row geometry at local frame `f` (shared by the segment and the S06B match cut).
 * The words settle in from the left over f0-8 (inOut) and drift right; the hero dot sits at `sepX(0)`.
 */
const heroRow = (W: number, H: number, f: number, dur: number) => {
  const u = Math.min(W, H) / 1080;
  const size = 210 * u;
  const k = size / 900;
  const gap = 150 * u;
  const wordW = WORDS.map((w) => layoutText(w, "black", TRACK).width * k);
  // round 5: inOut (starts at rest) because S06B's dot lands at rest on this row's "·" on the cut;
  // an ease-out start jerked the matched dot ~150 px on the first frame after the cut
  const settle = prog(f, 0, 8, ease.inOut);
  const rowW = wordW.reduce((a, b) => a + b, 0) + gap * 2;
  const heroX0 = (W - rowW) / 2 + lerp(f, [0, Math.max(30, dur)], [-30 * u, 30 * u * (Math.max(30, dur) / 30)]) - (1 - settle) * 260 * u;
  const sepX = (i: number) => heroX0 + wordW.slice(0, i + 1).reduce((a, b) => a + b, 0) + gap * i + gap / 2;
  return { heroX0, sepX, heroY: H / 2, hd: 64 * u };
};

/**
 * Where I3's hero dot (the "·" after 확보) sits on its first frame (landscape). S06B's 미송 record
 * chip collapses into a dot that grows into exactly this dot on its last frame, so the cut into I3
 * is a match cut: the settled 미송 answer becomes the dot that hops 확보 → 전달 (round 5).
 */
export const handoffDotStart = (W: number, H: number, dur: number) => {
  const r = heroRow(W, H, 0, dur);
  return { x: r.sepX(0), y: r.heroY, d: r.hd };
};

/**
 * I3 · The handoff. "확보 · 전달 · 수령" in Paperlogy Black; the separators are mint dots.
 * The larger dot after 확보 anticipates, hops in an arc with squash and lands after 전달:
 * the words do what they say. `stacked` sets the words vertically for 9:16.
 */
export const HandoffType: React.FC<{ dur?: number; stacked?: boolean }> = ({ dur = 30, stacked = false }) => {
  // authored for 30 frames: shorter slots compress it, longer slots let the landed dot settle and hold
  const raw = useCurrentFrame();
  const f = dur < 30 ? (raw * 30) / dur : raw;
  const { width: W, height: H } = useVideoConfig();
  const u = Math.min(W, H) / 1080;
  const size = (stacked ? 250 : 210) * u;
  const k = size / 900;
  const gap = 150 * u;
  const words = WORDS.map((w) => layoutText(w, "black", TRACK));
  const wordW = words.map((w) => w.width * k);
  const inkTop = (INK_CY - G_TOP) * k;
  const settle = prog(f, 0, 8, ease.out);
  const h = hop(f);
  const hd = 64 * u;

  /** Outline rows (background echo). `scale` shrinks them so they stay clear of the HUD bands. */
  const row = (y: number, dir: number, speed: number, key: string, offset: number, scale = 1) => {
    const items: React.ReactNode[] = [];
    const seq = [...WORDS, ...WORDS, ...WORDS, ...WORDS, ...WORDS];
    const rs = size * scale;
    const rk = rs / 900;
    const rInkTop = (INK_CY - G_TOP) * rk;
    const rGap = gap * scale;
    let x = -W * 0.4 + offset + dir * speed * f + (1 - settle) * dir * -300 * u;
    seq.forEach((w, i) => {
      const lw = layoutText(w, "black", TRACK).width * rk;
      items.push(
        <div key={`${key}${i}`} style={{ position: "absolute", left: x, top: y - rInkTop }}>
          <GlyphWord text={w} size={rs} color={C.paper} tracking={TRACK} stroke={{ color: C.greenMid, width: 2 * u }} />
        </div>,
      );
      x += lw;
      items.push(<Disc key={`${key}d${i}`} x={x + rGap / 2} y={y} d={22 * u * scale} color={C.greenMid} />);
      x += rGap;
    });
    return items;
  };

  if (stacked) {
    const pitch = 330 * u;
    const cy = H / 2;
    const yOf = (i: number) => cy + (i - 1) * pitch;
    const sepY = (i: number) => (yOf(i) + yOf(i + 1)) / 2;
    const xL = W / 2;
    const hx = xL + Math.sin(h.fly * Math.PI) * 190 * u;
    const hy = sepY(0) + (sepY(1) - sepY(0)) * h.fly + (h.fly <= 0 ? h.crouch * 8 * u : 0);
    return (
      <AbsoluteFill style={{ background: C.green, overflow: "hidden" }}>
        {row(H * 0.12, -1, 5 * u, "a", 0)}
        {row(H * 0.88, 1, 5 * u, "b", -200 * u)}
        {WORDS.map((w, i) => (
          <div
            key={w}
            style={{
              position: "absolute",
              left: (W - wordW[i]) / 2 + (1 - settle) * (i % 2 ? 1 : -1) * 240 * u,
              top: yOf(i) - inkTop,
            }}
          >
            <GlyphWord text={w} size={size} color={C.paper} tracking={TRACK} />
          </div>
        ))}
        <Disc x={xL} y={sepY(0)} d={26 * u * h.small1} color={C.mint} />
        <Disc x={xL} y={sepY(1)} d={26 * u * h.small2} color={C.mint} />
        <Disc x={hx} y={hy} d={hd} color={C.mint} scaleX={h.flying ? 1.25 : h.sx} scaleY={h.flying ? 0.82 : h.sy} />
      </AbsoluteFill>
    );
  }

  const { heroX0, sepX, heroY } = heroRow(W, H, f, dur);
  const hx = sepX(0) + (sepX(1) - sepX(0)) * h.fly;
  const hy = heroY - Math.sin(h.fly * Math.PI) * 170 * u + h.crouch * 10 * u * (h.fly <= 0 ? 1 : 0);
  // outline rows at 0.8x, ink kept between y 150 and 930 (clear of the HUD title and the ledger band)
  const pitch = 310 * u;
  return (
    <AbsoluteFill style={{ background: C.green, overflow: "hidden" }}>
      {row(heroY - pitch, -1, 5 * u, "a", 0, 0.8)}
      {row(heroY + pitch, -1, 6 * u, "b", -180 * u, 0.8)}
      {WORDS.map((w, i) => (
        <div key={w} style={{ position: "absolute", left: heroX0 + wordW.slice(0, i).reduce((a, b) => a + b, 0) + gap * i, top: heroY - inkTop }}>
          <GlyphWord text={w} size={size} color={C.paper} tracking={TRACK} />
        </div>
      ))}
      <Disc x={sepX(0)} y={heroY} d={26 * u * h.small1} color={C.mint} />
      <Disc x={sepX(1)} y={heroY} d={26 * u * h.small2} color={C.mint} />
      {h.flying &&
        [2, 1].map((g) => {
          const gp = prog(f - g, 13, 8, ease.inOut);
          return <Disc key={g} x={sepX(0) + (sepX(1) - sepX(0)) * gp} y={heroY - Math.sin(gp * Math.PI) * 170 * u} d={hd} color={C.mint} opacity={0.14 * (3 - g)} />;
        })}
      <Disc x={hx} y={hy} d={hd} color={C.mint} scaleX={h.sx} scaleY={h.sy} origin={h.flying ? "center" : "bottom"} />
    </AbsoluteFill>
  );
};
