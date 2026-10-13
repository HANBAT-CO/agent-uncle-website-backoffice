import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT, ease, mix, prog, rand } from "../theme";
import { Disc } from "../components/Disc";
import { Phone, Place, phoneDims } from "../components/Phone";
import { FootageTrack } from "../components/Footage";
import { HELIX_BAR } from "../timeline";

export type HelixCard = { title: string; y0: number; y1: number; ty: number };

/** The S00 lines that come back readable in the swarm (the chaos the record replaces). */
const ECHO = ["7장 보냈어요", "6장 왔는데요?", "남은 3장은 언제 와요?", "몇 장 확보됐어요?"];

/**
 * Round 4: the swarm's entrance is pre-rolled by this many (authored) frames, so the cut frame
 * already carries the fragments, the readable lines and the dot (no bare field, no lone dot).
 * Only the entrance moves; the ribbon, the rungs and the S09 match cut keep their frames.
 */
const PRE = 4;

const smooth = (v: number) => {
  const c = Math.min(1, Math.max(0, v));
  return c * c * (3 - 2 * c);
};

/**
 * I5 · From scattered chat to one shared record (authored for 60 frames, time-scaled to `dur`).
 * f0-17   The S00 chat returns around the mint dot: four lines stay readable ("6장 왔는데요?",
 *         "남은 3장은 언제 와요?" ...) while blank fragments orbit faster behind them.
 * f16-30  The swarm tightens and is pulled into two flat parallel bands, a ribbon with two
 *         half-twists (소매업자 off-white, 사입삼촌 mint). It is a ladder, not a double helix.
 * f26-44  Each rung carries one real 업무 기록 line, centred on the rung in an off-white pill.
 * f44-60  The twists unwind, the bands become the chat's card column, the pills become the cards
 *         and the real 09r-chat thread fades in underneath (match cut into S09).
 *         Round 3: the field stays darkest green and an off-white bar wipes in from the left (f46-54)
 *         under the cards, instead of a crossfade through grey-green; the HUD splits on the same edge.
 */
export const RecordHelix: React.FC<{
  phone: Place;
  cards: HelixCard[];
  dur?: number;
  /** record line size on the rungs (px at 1080) */
  labelSize?: number;
  /** ribbon width (px at 1080) */
  ribbonW?: number;
  /** straight rung pitch and twist pitch in the ribbon state (px at 1080) */
  pitch?: number;
  twistPitch?: number;
  /** readable echo bubble font size (px at 1080) */
  echoSize?: number;
}> = ({ phone, cards, dur = 60, labelSize = 24, ribbonW = 600, pitch = 100, twistPitch = 190, echoSize = 34 }) => {
  const f = (useCurrentFrame() * 60) / dur;
  const { width: W, height: H } = useVideoConfig();
  const u = Math.min(W, H) / 1080;
  const { w: sw, h: sh } = phoneDims(phone.h);
  const sLeft = phone.cx - sw / 2;
  const sTop = phone.cy - sh / 2;
  const colX0 = sLeft + 0.06 * sw;
  const colX1 = sLeft + 0.94 * sw;

  // ---- ribbon layout: r0 r1 r2 | twist | r3 r4 | twist | r5
  // two half-twists (a full turn), placed for 6 rungs (master) or 5 (social, no 미송 answer rung)
  const TWIST_AFTER = cards.length >= 6 ? [2, 4] : [1, 3];
  const gaps = cards.slice(1).map((_, k) => (TWIST_AFTER.includes(k) ? twistPitch : pitch) * u);
  const span = gaps.reduce((a, b) => a + b, 0);
  const ribbonCy = phone.cy;
  const ry: number[] = [];
  cards.forEach((_, k) => ry.push(k === 0 ? ribbonCy - span / 2 : ry[k - 1] + gaps[k - 1]));
  const twistY = TWIST_AFTER.map((k) => (ry[k] + ry[k + 1]) / 2);
  const twistHalf = (twistPitch * u) / 2 - 26 * u;
  const cardY = cards.map((c) => sTop + (c.ty / 100) * sh);

  const straighten = prog(f, 40, 11, ease.inOut);
  const cx = mix(W / 2, phone.cx, straighten);
  const A = mix((ribbonW * u) / 2, (colX1 - colX0) / 2, straighten);
  // ribbon y -> card-column y (piecewise linear through the rungs)
  const mapY = (y: number) => {
    const n = ry.length;
    const seg = y <= ry[0] ? 0 : y >= ry[n - 1] ? n - 2 : ry.findIndex((v, k) => k < n - 1 && y <= ry[k + 1]);
    const t = (y - ry[seg]) / (ry[seg + 1] - ry[seg]);
    return mix(y, cardY[seg] + (cardY[seg + 1] - cardY[seg]) * t, straighten);
  };
  // straightening pulls the ribbon taut: both half-twists slide up and out through the top end
  // (two half-twists = a full turn, so the bands end on their own sides with no crossing left)
  const yTop0 = ry[0] - 46 * u;
  const twistAt = (i: number) => twistY[i] - straighten * (twistY[i] - yTop0 + 2.2 * twistHalf);
  const phase = (y: number) => TWIST_AFTER.reduce((acc, _, i) => acc + Math.PI * smooth((y - (twistAt(i) - twistHalf)) / (2 * twistHalf)), 0);
  const bandX = (s: number, y: number) => cx + (s === 0 ? -1 : 1) * A * Math.cos(phase(y));
  const yTop = ry[0] - 46 * u;
  const yBot = ry[ry.length - 1] + 46 * u;

  // ---- swarm
  // the bar timing is shared with the HUD (timeline HELIX_BAR), so the HUD ink flips on the same frames
  const wipe = prog(f, HELIX_BAR.at, HELIX_BAR.dur, ease.inOut);
  const bands = prog(f, 22, 10, ease.out);
  const swarmCx = W / 2;
  const swarmCy = ribbonCy;
  const frags: React.ReactNode[] = [];
  const N = 34;
  for (let j = 0; j < N; j++) {
    const a0 = rand(j + 3) * Math.PI * 2;
    const r0 = Math.hypot(W, H) * 0.7;
    const rj = (230 + rand(j + 11) * 260) * u;
    const ang = a0 + f * (0.05 + rand(j + 5) * 0.03);
    const burst = prog(f + PRE, rand(j + 17) * 4, 12, ease.out);
    const tight = prog(f, 14, 8, ease.inOut);
    const R = mix(mix(r0, rj, burst), (ribbonW * u) / 2, tight);
    const ring = { x: swarmCx + Math.cos(ang) * R, y: swarmCy + Math.sin(ang) * R * mix(0.75, 0.9, tight) };
    const s = j % 2;
    const by = mix(yTop, yBot, (Math.floor(j / 2) + 0.5) / (N / 2));
    const toBand = prog(f, 18 + rand(j + 23) * 6, 9, ease.inOut);
    const x = mix(ring.x, bandX(s, by), toBand);
    const y = mix(ring.y, by, toBand);
    const fade = 1 - prog(f, 25, 6);
    if (fade <= 0) continue;
    const isTile = j % 5 === 0;
    const wv = isTile ? 30 * u : (50 + rand(j + 41) * 56) * u;
    const hv = isTile ? 30 * u : 22 * u;
    frags.push(
      <div
        key={j}
        style={{
          position: "absolute",
          left: x - wv / 2,
          top: y - hv / 2,
          width: wv,
          height: hv,
          borderRadius: isTile ? 7 * u : hv / 2,
          background: j % 3 === 0 ? C.mint : C.paper,
          opacity: 0.55 * fade * prog(f + PRE, 0, 3),
          scale: 1 - toBand * 0.7,
          rotate: `${(rand(j + 61) - 0.5) * 40 * (1 - toBand)}deg`,
        }}
      />,
    );
  }
  // the readable S00 lines: slow orbit in front, pulled into the bands last
  const echoes = ECHO.map((text, k) => {
    const appear = prog(f + PRE, 1 + k * 1.5, 7, ease.overshoot);
    // landscape: a slow ellipse around the dot; portrait: a loose vertical stack (like a chat scroll)
    const a = Math.PI / 4 + (k * Math.PI) / 2 + f * 0.012;
    const home =
      W > H
        ? { x: swarmCx + Math.cos(a) * 390 * u, y: swarmCy + Math.sin(a) * 250 * u }
        : { x: swarmCx + ((k % 2 ? 1 : -1) * 90 + Math.sin(f * 0.06 + k) * 12) * u, y: swarmCy + (-480 + k * 320 - f * 1.5) * u };
    const by = k % 2 ? yBot - 40 * u : yTop + 40 * u;
    // absorbed into the bands before the rungs appear, so no chat line ever sits on the ribbon
    const pull = prog(f, 17 + k * 1.2, 7, ease.in);
    const x = mix(home.x, bandX(k % 2, by), pull);
    const y = mix(home.y, by, pull);
    if (appear <= 0 || pull >= 1) return null;
    return (
      <div
        key={`e${k}`}
        style={{
          position: "absolute",
          left: x,
          top: y,
          translate: "-50% -50%",
          scale: (0.55 + 0.45 * appear) * (1 - pull * 0.85),
          rotate: `${(k % 2 ? 3 : -3) * (1 - pull)}deg`,
          opacity: Math.min(1, appear * 1.5),
          background: k === 1 ? C.mint : C.paper2,
          borderRadius: 999,
          padding: `${echoSize * 0.4 * u}px ${echoSize * 0.66 * u}px`,
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: echoSize * u,
          lineHeight: 1.15,
          color: C.ink,
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ opacity: 1 - prog(pull, 0.2, 0.3) }}>{text}</span>
      </div>
    );
  });

  // ---- bands: flat strips that narrow where they turn edge-on (the half-twists)
  const bandW = 16 * u;
  const steps = 90;
  const bandPoly = (s: number) => {
    const left: string[] = [];
    const right: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const y0 = mix(yTop, yBot, i / steps);
      const x = bandX(s, y0);
      const half = (bandW / 2) * (0.5 + 0.5 * Math.abs(Math.cos(phase(y0))));
      const y = mapY(y0);
      left.push(`${(x - half).toFixed(1)},${y.toFixed(1)}`);
      right.unshift(`${(x + half).toFixed(1)},${y.toFixed(1)}`);
    }
    return [...left, ...right].join(" ");
  };
  const bandsOut = prog(f, 51, 5, ease.in);
  const phoneIn = prog(f, 50, 7, ease.out);
  const cardIn = prog(f, 42, 10, ease.inOut);
  const reveal = bands; // draw the strips from the top
  const clipY = mix(yTop, yBot, reveal);

  return (
    <AbsoluteFill style={{ background: C.greenDeep, overflow: "hidden" }}>
      {wipe > 0 && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: W * wipe, background: C.paper }} />}
      {phoneIn > 0 && (
        <Phone place={{ ...phone, o: phoneIn }} shadow>
          <FootageTrack subs={[{ from: 0, dur: 9999, clip: "09r-chat", src: 3.0, freeze: true }]} offset={0} />
        </Phone>
      )}
      {frags}
      <svg width={W} height={H} style={{ position: "absolute", inset: 0, opacity: 1 - bandsOut }}>
        <defs>
          <clipPath id="ribbon-draw">
            <rect x={0} y={0} width={W} height={Math.max(0, mapY(clipY))} />
          </clipPath>
        </defs>
        {/* rungs grow from band to band; in the match cut they widen into the real cards */}
        {cards.map((c, k) => {
          const grow = prog(f, 26 + k * 1.5, 7, ease.out);
          if (grow <= 0) return null;
          const y = mapY(ry[k]);
          // rungs and cards span the column (cx ± A), so a twist sliding past never collapses them
          const xl = cx - A;
          const xr = cx + A;
          const mid = (xl + xr) / 2;
          const half = (Math.abs(xr - xl) / 2) * grow;
          const ry0 = mix(y, sTop + (c.y0 / 100) * sh, cardIn);
          const ry1 = mix(y, sTop + (c.y1 / 100) * sh, cardIn);
          return (
            <g key={k}>
              {cardIn > 0 && <rect x={Math.min(xl, xr)} y={ry0} width={Math.abs(xr - xl)} height={Math.max(2, ry1 - ry0)} rx={12 * u} fill={C.paper2} opacity={cardIn} />}
              <line x1={mid - half} y1={y} x2={mid + half} y2={y} stroke={C.paper} strokeWidth={3 * u} opacity={0.7 * (1 - cardIn)} />
            </g>
          );
        })}
        <g clipPath="url(#ribbon-draw)">
          <polygon points={bandPoly(0)} fill={C.paper} />
          <polygon points={bandPoly(1)} fill={C.mint} />
        </g>
      </svg>
      {echoes}
      {/* strand labels */}
      {[0, 1].map((s) => {
        const o = prog(f, 26, 6, ease.out) * (1 - prog(f, 40, 6));
        if (o <= 0) return null;
        return (
          <div
            key={s}
            style={{
              position: "absolute",
              left: bandX(s, yTop) - 150 * u,
              width: 300 * u,
              top: yTop - (labelSize + 30) * u,
              textAlign: "center",
              fontFamily: FONT,
              fontWeight: 700,
              fontSize: labelSize * u,
              color: s === 0 ? C.paper : C.mint,
              opacity: o,
            }}
          >
            {s === 0 ? "소매업자" : "사입삼촌"}
          </div>
        );
      })}
      {/* the real record lines, centred on their rungs in off-white pills, then docked as card titles */}
      {cards.map((c, k) => {
        const pop = prog(f, 28 + k * 1.5, 8, ease.overshoot);
        const o = Math.min(1, pop * 1.5) * (1 - prog(f, 54, 4));
        if (o <= 0) return null;
        const y = mapY(ry[k]);
        const size = mix(labelSize * u, 14.5 * u * (phone.h / 930), cardIn);
        const titleX = sLeft + 0.128 * sw;
        const pillPad = (1 - cardIn) * 0.6 * size;
        return (
          <div
            key={k}
            style={{
              position: "absolute",
              top: y,
              left: mix(cx, titleX, cardIn),
              translate: `${mix(-50, 0, cardIn)}% -50%`,
              scale: 0.6 + 0.4 * pop,
              background: cardIn < 1 ? `rgba(245,244,238,${1 - cardIn})` : "transparent",
              borderRadius: 999,
              padding: `${pillPad * 0.55}px ${pillPad}px`,
              fontFamily: FONT,
              fontWeight: 600,
              fontSize: size,
              lineHeight: 1.2,
              color: C.ink,
              whiteSpace: "nowrap",
              opacity: o,
            }}
          >
            {c.title}
          </div>
        );
      })}
      {f < 26 && <Disc x={swarmCx} y={swarmCy} d={44 * u * prog(f + PRE, 0, 5, ease.overshoot) * (1 - prog(f, 20, 5))} color={C.mint} />}
    </AbsoluteFill>
  );
};
