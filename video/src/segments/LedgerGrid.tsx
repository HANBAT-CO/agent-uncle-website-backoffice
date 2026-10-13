import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT, ease, lerp, prog } from "../theme";
import { ISO_BRAND, IsoGrid, IsoSlot, IsoView, project } from "../components/IsoGrid";

/** 5x2 slots; the 3 미송 slots are the front-left ones (same layout as the landing hero loop). */
export const GRID_COLS = 5;
export const GRID_ROWS = 2;
export const HOLLOW_SLOTS = [5, 6, 7];
/**
 * The 7 risen slots in rise order (round 5): sorted by the diagonal (col + row) so the ripple still
 * runs back-left to front-right, ties broken by row. Ranked, not keyed on col + row: slot 4 (col 4,
 * row 0) and slot 8 (col 3, row 1) share a diagonal, and keying on it made them rise on the same
 * frame, so every counter driven by the grid skipped from 4 to 6.
 */
export const RISE_ORDER = Array.from({ length: GRID_COLS * GRID_ROWS }, (_, i) => i)
  .filter((i) => !HOLLOW_SLOTS.includes(i))
  .sort((a, b) => {
    const d = (i: number) => (i % GRID_COLS) + Math.floor(i / GRID_COLS);
    return d(a) - d(b) || Math.floor(a / GRID_COLS) - Math.floor(b / GRID_COLS);
  });
/** Rise start (frames, authored for 45) of each block, one per 2.5 frames by rank; also drives the I2 ticks (one per block). */
export const BLOCK_RISE = RISE_ORDER.map((i, k) => ({ i, at: 8 + k * 2.5 }));

/**
 * I2 · The ledger grid. 요청 10장 = 10 slots. 7 blocks rise mint (누적 확보 7장); 3 stay empty
 * (dashed floor slots) and pulse with the tag "2026-10-12 미송 재확인 / 남은 미송 3장".
 * The numbers equal the demo screens. The S05 highlight rectangle ("남은 미송 3장") is already drawn
 * on the cut frame and expands into the floor (shape-match cut).
 * Round 3: the field is deep green (the hero-loop "brand" palette, block tops mint), so the middle
 * act gets a colour-field swap on the beat; the tag hangs in front of the grid, tied to the centroid
 * of the 3 hollow slots by a leader line, and pops on the slots' first pulse.
 * In 9:16 the grid is 1.35x larger, steeper and centred.
 */
export const LedgerGrid: React.FC<{ fromRect?: { x0: number; y0: number; x1: number; y1: number }; dur?: number }> = ({ fromRect, dur = 45 }) => {
  // authored for 45 frames: shorter slots compress it, longer slots hold the end state (the tag stays readable)
  const raw = useCurrentFrame();
  const f = dur < 45 ? (raw * 45) / dur : raw;
  const span = Math.max(45, dur);
  const { width: W, height: H } = useVideoConfig();
  const portrait = H > W;
  const u = Math.min(W, H) / 1080;
  const orbit = portrait ? lerp(f, [0, span], [56, 64], ease.inOut) : lerp(f, [0, span], [40, 52], ease.inOut);
  const push = lerp(f, [0, span], [1, 1.04], ease.inOut);
  const view: IsoView = {
    cx: W / 2 + (portrait ? 20 * u : 60 * u),
    cy: portrait ? H * 0.57 : H * 0.6,
    cell: (portrait ? 205 : 158) * u * push,
    theta: orbit,
    elev: 34,
  };
  const COLS = GRID_COLS;
  const ROWS = GRID_ROWS;
  // already part-drawn on the cut frame (no empty field on frame 0)
  const draw = prog(f, -3, 8, ease.out);
  const slots: IsoSlot[] = Array.from({ length: 10 }, (_, i) => {
    const rise = BLOCK_RISE.find((b) => b.i === i);
    if (rise) {
      const at = rise.at;
      return { rise: lerp(f, [at, at + 7, at + 10], [0, 1.12, 1], ease.out), hollow: false };
    }
    const pulse = 1 + 0.08 * (lerp(f, [27, 30, 36], [0, 1, 0], ease.out) + lerp(f, [39, 42, 48], [0, 1, 0], ease.out) + lerp(f, [51, 54, 60], [0, 1, 0.4], ease.out));
    return { rise: prog(f, 20, 6, ease.out), hollow: true, pulse };
  });
  const risen = slots.filter((s) => !s.hollow && s.rise >= 1).length;
  const floorFrom = fromRect
    ? {
        pts: [
          { x: fromRect.x0, y: fromRect.y0 },
          { x: fromRect.x1, y: fromRect.y0 },
          { x: fromRect.x1, y: fromRect.y1 },
          { x: fromRect.x0, y: fromRect.y1 },
        ],
        t: prog(f, 0, 7, ease.inOut),
      }
    : undefined;
  // label anchors
  // centre of the 3 front-left 미송 slots (columns 0-2 of the front row)
  const anchor = project(view, 1.5 - COLS / 2, 1.5 - ROWS / 2, 0);
  const tagIn = prog(f, 27, 8, ease.overshoot);
  const leader = prog(f, 25, 6, ease.out);
  const labelIn = prog(f, -2, 8, ease.out);
  const text: React.CSSProperties = { fontFamily: FONT, whiteSpace: "nowrap", position: "absolute" };
  // 9:16 type is 1.3x so the labels read on a phone
  const tk = portrait ? 1.3 : 1;
  // tag in front of (below-left of) the hollow slots, clear of every block; leader to their centroid
  // 9:16: the steeper view puts the front blocks right of the slots, so the tag drops below the grid
  const tagW = (portrait ? 440 : 360) * u;
  const tagCx = Math.max(tagW / 2 + 40 * u, anchor.x - (portrait ? 130 : 150) * u);
  const tagTop = anchor.y + (portrait ? 395 : 120) * u;
  const leadX = Math.min(Math.max(anchor.x, tagCx - tagW / 2 + 40 * u), tagCx + tagW / 2 - 40 * u);
  return (
    <AbsoluteFill style={{ background: C.green }}>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <IsoGrid view={view} cols={COLS} rows={ROWS} slots={slots} palette={ISO_BRAND} draw={draw} strokeW={2 * u} floorFrom={floorFrom} />
        {leader > 0 && (
          <g opacity={leader}>
            <line
              x1={anchor.x}
              y1={anchor.y}
              x2={anchor.x + (leadX - anchor.x) * leader}
              y2={anchor.y + (tagTop - anchor.y) * leader}
              stroke={C.mint}
              strokeWidth={2.5 * u}
              strokeLinecap="round"
            />
            <circle cx={anchor.x} cy={anchor.y} r={7 * u} fill={C.mint} />
          </g>
        )}
      </svg>
      <div
        style={{
          ...text,
          left: portrait ? 80 * u : 150 * u,
          top: portrait ? 300 * u : 300 * u,
          opacity: labelIn,
          translate: `0 ${(1 - labelIn) * 12 * u}px`,
        }}
      >
        <div style={{ fontSize: 30 * u * tk, fontWeight: 600, color: C.tint2 }}>요청 10장</div>
        <div style={{ fontSize: (portrait ? 92 : 80) * u, fontWeight: 800, color: C.paper, marginTop: 10 * u, letterSpacing: "-0.02em", opacity: prog(f, 10, 4) }}>
          누적 확보 <span style={{ color: C.mint, fontVariantNumeric: "tabular-nums" }}>{risen}</span>장
        </div>
      </div>
      {/* recheck tag, tied to the hollow slots by the leader line */}
      <div
        style={{
          ...text,
          left: tagCx - tagW / 2,
          width: tagW,
          boxSizing: "border-box",
          top: tagTop,
          scale: tagIn,
          transformOrigin: `${leadX - (tagCx - tagW / 2)}px 0`,
          opacity: Math.min(1, tagIn * 2),
          background: C.mint,
          borderRadius: 24 * u,
          padding: `${16 * u * tk}px ${20 * u * tk}px`,
          color: C.ink,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 26 * u * tk, fontWeight: 700 }}>2026-10-12 미송 재확인</div>
        <div style={{ fontSize: 22 * u * tk, fontWeight: 500, color: C.grey700, marginTop: 4 * u }}>남은 미송 3장</div>
      </div>
    </AbsoluteFill>
  );
};
