import React from "react";
import { C, mixColor } from "../theme";

/**
 * Flat 2-tone isometric slot grid (SVG, no 3D gloss). One slot = one 장 of the request.
 * Used by I2 (요청 10 → 확보 7 + 미송 3) and by the landing-page hero loop.
 *
 * Paint order (round 2 depth fix): floor outline → every floor tile → lane tiles and track →
 * hollow 미송 marks (floor level only, so nothing of an empty slot can ever cross a block) →
 * solid blocks back to front. Blocks may slide (dx/dy) without dragging their floor tile along.
 */
export type IsoPalette = {
  floor: string;
  floorStroke: string;
  top: string;
  left: string;
  right: string;
  hollow: string;
  /** fill of a hollow 미송 slot */
  hollowFill: string;
  track: string;
  /** hairline on block edges so the 2-tone faces read */
  edge: string;
  /** top face once the block is handed over (전달, hero loop) */
  topSent: string;
  /** top face after 수령 확인 (hero loop) */
  topDone: string;
  /** check stroke drawn on a received block's top face */
  check: string;
};

export const ISO_CALM: IsoPalette = {
  floor: C.bubble,
  floorStroke: C.ink,
  top: C.green,
  left: C.greenDeep,
  right: C.greenDark,
  hollow: C.greenMid,
  hollowFill: C.tint1,
  track: C.green,
  edge: C.mint,
  topSent: C.greenMid,
  topDone: C.mint,
  check: C.green,
};

export const ISO_BRAND: IsoPalette = {
  floor: "#0F5547",
  floorStroke: C.tint2,
  top: C.mint,
  left: C.tint2,
  right: C.tint1,
  hollow: C.mint,
  hollowFill: "#145E50",
  track: C.mint,
  edge: C.green,
  topSent: C.tint2,
  topDone: C.greenMid,
  check: C.mint,
};

export type IsoSlot = {
  /** 0 = flat, 1 = full height block (values above 1 overshoot) */
  rise: number;
  hollow: boolean;
  /** hollow pulse scale */
  pulse?: number;
  /** block opacity (solid slots only), so a sinking block can vanish without popping */
  opacity?: number;
  /** extra ground offset in cells (the 전달 slide); the floor tile stays in place */
  dx?: number;
  dy?: number;
  /** 0..1 top face flip to palette.topSent (전달) */
  sent?: number;
  /** 0..1 top face flip to palette.topDone (수령) */
  done?: number;
  /** 0..1 draw-on of the check stroke on the top face (수령) */
  check?: number;
};

export type IsoView = { cx: number; cy: number; cell: number; theta: number; elev: number };

export const project = (v: IsoView, gx: number, gy: number, gz: number) => {
  const t = (v.theta * Math.PI) / 180;
  const e = (v.elev * Math.PI) / 180;
  const X = gx * Math.cos(t) - gy * Math.sin(t);
  const Y = gx * Math.sin(t) + gy * Math.cos(t);
  return { x: v.cx + X * v.cell, y: v.cy + Y * Math.sin(e) * v.cell - gz * Math.cos(e) * v.cell, depth: Y };
};

const pts = (ps: { x: number; y: number }[]) => ps.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

const INSET = 0.09;
/** the hollow mark sits inside the tile, so its dashes never touch the tile's ink edge */
const HOLLOW_INSET = 0.2;

export const IsoGrid: React.FC<{
  view: IsoView;
  cols: number;
  rows: number;
  slots: IsoSlot[];
  palette: IsoPalette;
  /** 0..1 draw-on of the floor outlines */
  draw?: number;
  height?: number;
  strokeW?: number;
  /** thin track drawn along the front edge (전달), 0..1 */
  track?: number;
  /** extra floor cells beyond the grid (the 전달 lane), with their opacity */
  lane?: { cells: [number, number][]; o: number };
  /** optional morph source for the floor outline (screen rect corners) */
  floorFrom?: { pts: { x: number; y: number }[]; t: number };
}> = ({ view, cols, rows, slots, palette, draw = 1, height = 0.9, strokeW = 2, track = 0, lane, floorFrom }) => {
  const ox = -cols / 2;
  const oy = -rows / 2;
  const t = (view.theta * Math.PI) / 180;
  const cellOf = (i: number) => ({ ci: i % cols, ri: Math.floor(i / cols) });
  const ground = (gx: number, gy: number, inset: number, z = 0) => [
    project(view, gx + inset, gy + inset, z),
    project(view, gx + 1 - inset, gy + inset, z),
    project(view, gx + 1 - inset, gy + 1 - inset, z),
    project(view, gx + inset, gy + 1 - inset, z),
  ];

  const floor = [project(view, ox, oy, 0), project(view, ox + cols, oy, 0), project(view, ox + cols, oy + rows, 0), project(view, ox, oy + rows, 0)];
  const floorPts = floorFrom
    ? floor.map((p, k) => ({ x: floorFrom.pts[k].x + (p.x - floorFrom.pts[k].x) * floorFrom.t, y: floorFrom.pts[k].y + (p.y - floorFrom.pts[k].y) * floorFrom.t }))
    : floor;

  const tileEl = (key: string, gx: number, gy: number, opacity = 1, dashed = false) => (
    <polygon
      key={key}
      points={pts(ground(gx, gy, INSET))}
      fill={palette.floor}
      stroke={palette.floorStroke}
      strokeWidth={strokeW}
      strokeLinejoin="round"
      pathLength={1}
      strokeDasharray={dashed ? undefined : 1}
      strokeDashoffset={dashed ? undefined : 1 - draw}
      fillOpacity={draw}
      opacity={opacity}
    />
  );

  // [nx, ny, corner a, corner b] over the 4 ground corners 0:(x0,y0) 1:(x1,y0) 2:(x1,y1) 3:(x0,y1)
  const sides: [number, number, number, number][] = [
    [0, -1, 0, 1],
    [1, 0, 1, 2],
    [0, 1, 2, 3],
    [-1, 0, 3, 0],
  ];

  const blocks = slots
    .map((s, i) => ({ s, i, ...cellOf(i) }))
    .filter(({ s }) => !s.hollow && s.rise > 0.001)
    .map((b) => ({ ...b, depth: project(view, ox + b.ci + 0.5 + (b.s.dx ?? 0), oy + b.ri + 0.5 + (b.s.dy ?? 0), 0).depth }))
    .sort((a, b) => a.depth - b.depth);

  return (
    <g>
      {/* floor outline (morphs from the S05 highlight rectangle) */}
      {/* with a morph source the outline is the previous shot's highlight frame: fully drawn on the cut frame */}
      <polygon
        points={pts(floorPts)}
        fill="none"
        stroke={palette.floorStroke}
        strokeWidth={floorFrom ? strokeW * (2 - floorFrom.t) : strokeW}
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={floorFrom ? 0 : 1 - Math.min(1, draw * 1.2)}
        opacity={floorFrom ? 1 - 0.5 * floorFrom.t : 0.5}
      />
      {slots.map((_, i) => {
        const { ci, ri } = cellOf(i);
        return tileEl(`t${i}`, ox + ci, oy + ri);
      })}
      {lane && lane.o > 0 && lane.cells.map(([ci, ri], k) => tileEl(`l${k}`, ox + ci, oy + ri, lane.o))}
      {track > 0 && (
        <polygon
          points={pts([
            project(view, ox - 0.2, oy + rows + 0.18, 0),
            project(view, ox - 0.2 + (cols + 1.4) * track, oy + rows + 0.18, 0),
            project(view, ox - 0.2 + (cols + 1.4) * track, oy + rows + 0.3, 0),
            project(view, ox - 0.2, oy + rows + 0.3, 0),
          ])}
          fill={palette.track}
        />
      )}
      {/* 미송: an empty, dashed slot on the floor. No volume, so it can never cut across a block. */}
      {slots.map((s, i) => {
        if (!s.hollow || s.rise <= 0.001) return null;
        const { ci, ri } = cellOf(i);
        const k = s.pulse ?? 1;
        const mx = ox + ci + 0.5;
        const my = oy + ri + 0.5;
        const half = (0.5 - HOLLOW_INSET) * k;
        const c = [
          project(view, mx - half, my - half, 0),
          project(view, mx + half, my - half, 0),
          project(view, mx + half, my + half, 0),
          project(view, mx - half, my + half, 0),
        ];
        return (
          <polygon
            key={`h${i}`}
            points={pts(c)}
            fill={palette.hollowFill}
            fillOpacity={0.9}
            stroke={palette.hollow}
            strokeWidth={strokeW * 1.6}
            strokeDasharray={`${6 * strokeW} ${4.5 * strokeW}`}
            strokeLinejoin="round"
            opacity={Math.min(1, s.rise)}
          />
        );
      })}
      {blocks.map(({ s, i, ci, ri }) => {
        const gx0 = ox + ci + (s.dx ?? 0);
        const gy0 = oy + ri + (s.dy ?? 0);
        const base = ground(gx0, gy0, INSET);
        const hz = height * s.rise;
        const top = ground(gx0, gy0, INSET, hz);
        const faces = sides
          .map(([nx, ny, a, b]) => ({ nyR: nx * Math.sin(t) + ny * Math.cos(t), nxR: nx * Math.cos(t) - ny * Math.sin(t), a, b }))
          .filter((f) => f.nyR > 0.001)
          .map(({ nxR, a, b }, q) => (
            <polygon key={q} points={pts([base[a], base[b], top[b], top[a]])} fill={nxR < 0 ? palette.left : palette.right} stroke={palette.edge} strokeWidth={strokeW * 0.75} strokeOpacity={0.35} strokeLinejoin="round" />
          ));
        const done = s.done ?? 0;
        const sent = s.sent ?? 0;
        const chk = s.check ?? 0;
        const topFill = done > 0 ? mixColor(sent > 0 ? palette.topSent : palette.top, palette.topDone, done) : sent > 0 ? mixColor(palette.top, palette.topSent, sent) : palette.top;
        const cp = (u: number, v: number) => project(view, gx0 + INSET + u * (1 - 2 * INSET), gy0 + INSET + v * (1 - 2 * INSET), hz);
        const check = [cp(0.24, 0.5), cp(0.44, 0.72), cp(0.78, 0.3)];
        return (
          <g key={i} opacity={s.opacity ?? 1}>
            {faces}
            <polygon points={pts(top)} fill={topFill} stroke={palette.edge} strokeWidth={strokeW * 0.75} strokeOpacity={0.5} strokeLinejoin="round" />
            {chk > 0 && (
              <polyline
                points={pts(check)}
                fill="none"
                stroke={palette.check}
                strokeWidth={strokeW * 2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - chk}
              />
            )}
          </g>
        );
      })}
    </g>
  );
};
