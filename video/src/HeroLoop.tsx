import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { z } from "zod";
import { C, FONT, ease, lerp, mix as mixN, prog } from "./theme";
import { ISO_BRAND, ISO_CALM, IsoGrid, IsoSlot, project } from "./components/IsoGrid";
import { GRID_COLS, GRID_ROWS, HOLLOW_SLOTS, RISE_ORDER } from "./segments/LedgerGrid";

export const LOOP_FRAMES = 210; // 7 s at 30 fps

export const heroLoopSchema = z.object({
  palette: z.enum(["calm", "brand"]),
});

/** First block rise (round 6: f18, ~0.6 s after the loop starts; blocks follow every 6 frames). */
const RISE_AT = 18;
/** 전달 (round 4): the dot hops block to block, back row left to right, then the front pair. */
const HOP_ORDER = [0, 1, 2, 3, 4, 9, 8];
const DROP_AT = 100;
const HOP = 4;
/** frame the dot lands on HOP_ORDER[k] */
const landAt = (k: number) => DROP_AT + 4 + k * HOP;

/**
 * Seamless 7 s landing-page loop: the life of one request on the same 5x2 grid as I2.
 * 요청 10 (empty slots) → 확보 7 (blocks rise) → 미송 3 (the dashed front-left slots pulse under the
 * recheck tag) → 전달 7 → 수령 7 (each top face flips to mint and gets a check) → the blocks sink and
 * every counter rolls down with them. Every motion is periodic in LOOP_FRAMES, so frame 210 equals frame 0.
 * Round 4: 전달 stays inside the 10-slot floor. The hero dot drops onto the first block and hops
 * across the 7 (the I3 handoff hop); each landing hands one block over (its top turns mid green, the
 * block gives a little) and ticks 전달 by one. The off-floor lane and track are gone.
 */
export const HeroLoop: React.FC<z.infer<typeof heroLoopSchema>> = ({ palette }) => {
  const f = useCurrentFrame() % LOOP_FRAMES;
  const { width: W, height: H } = useVideoConfig();
  const u = Math.min(W, H) / 1080;
  const brand = palette === "brand";
  const pal = brand ? ISO_BRAND : ISO_CALM;
  const field = brand ? C.green : C.paper;
  const ink = brand ? C.paper : C.ink;
  const t = (f / LOOP_FRAMES) * Math.PI * 2;
  const view = { cx: W / 2 - 40 * u, cy: H * 0.5, cell: 150 * u * (1 + 0.012 * Math.sin(t)), theta: 46 + 4 * Math.sin(t), elev: 34 };
  const COLS = GRID_COLS;
  const sink = prog(f, 165, 40, ease.inOut); // blocks sink back into the floor, everything resets
  const slots: IsoSlot[] = Array.from({ length: 10 }, (_, i) => {
    if (!HOLLOW_SLOTS.includes(i)) {
      // round 5: one block per step by rank (RISE_ORDER), so 확보 and 수령 count 1, 2, 3 ... 7 with no skip
      // round 6: the first block rises at f18 (was f30), so the loop reads sooner when it autoplays
      const rank = RISE_ORDER.indexOf(i);
      const at = RISE_AT + rank * 6;
      const k = HOP_ORDER.indexOf(i);
      const land = landAt(k);
      // the block gives under the dot's landing, then settles
      const give = lerp(f, [land, land + 1, land + 5], [0, 1, 0], ease.out);
      const rise = lerp(f, [at, at + 8, at + 12], [0, 1.12, 1], ease.out) * (1 - sink) * (1 - 0.07 * give);
      const recv = 135 + rank * 3;
      return {
        rise,
        hollow: false,
        // fade with the last quarter of the rise so the sink back into the floor never pops
        opacity: Math.min(1, rise * 4),
        sent: prog(f, land, 4, ease.out),
        done: prog(f, recv, 8, ease.out),
        check: prog(f, recv + 3, 9, ease.out),
      };
    }
    const breathe = 1 + 0.02 * (0.5 - 0.5 * Math.cos(t * 3));
    const pulse = 1 + 0.07 * (lerp(f, [78, 82, 90], [0, 1, 0], ease.out) + lerp(f, [92, 96, 104], [0, 1, 0], ease.out));
    return { rise: prog(f, 70, 8, ease.out) * (1 - sink), hollow: true, pulse: breathe * pulse };
  });
  // counters: 확보 counts the risen blocks, 전달 ticks on each landing, 수령 on each check, and all
  // three roll down with the sink (never a count without its blocks)
  const down = Math.round(7 * (1 - sink));
  const risen = slots.filter((s) => !s.hollow && s.rise >= 0.9).length;
  const acquired = f >= 165 ? down : risen;
  const delivered = f >= 165 ? down : HOP_ORDER.filter((_, k) => f >= landAt(k)).length;
  const received = f >= 165 ? down : slots.filter((s) => !s.hollow && (s.check ?? 0) >= 0.98).length;
  const tag = prog(f, 80, 8, ease.overshoot) * (1 - prog(f, 165, 12, ease.in));

  // ---- the hero dot: drops onto the first block, hops across the 7, sinks into the last one
  const TOP_Z = 0.9;
  const topOf = (i: number) => ({ gx: (i % COLS) + 0.5 - COLS / 2, gy: Math.floor(i / COLS) + 0.5 - GRID_ROWS / 2 });
  let dot: { x: number; y: number; d: number; sx: number; sy: number } | null = null;
  const lastLand = landAt(HOP_ORDER.length - 1);
  if (f >= DROP_AT && f < lastLand + 6) {
    const dd = 0.34 * view.cell;
    const zLift = 0.12;
    let gx: number;
    let gy: number;
    let gz: number;
    let flying = false;
    if (f < landAt(0)) {
      // drop from above onto the first block (gravity)
      const p = prog(f, DROP_AT, 4, ease.in);
      ({ gx, gy } = topOf(HOP_ORDER[0]));
      gz = TOP_Z + zLift + (1 - p) * 1.6;
      flying = true;
    } else {
      const k = Math.min(HOP_ORDER.length - 1, Math.floor((f - landAt(0)) / HOP));
      const a = topOf(HOP_ORDER[k]);
      const b = topOf(HOP_ORDER[Math.min(HOP_ORDER.length - 1, k + 1)]);
      const p = k >= HOP_ORDER.length - 1 ? 0 : prog(f, landAt(k), HOP, ease.inOut);
      gx = mixN(a.gx, b.gx, p);
      gy = mixN(a.gy, b.gy, p);
      gz = TOP_Z + zLift + Math.sin(p * Math.PI) * 0.55;
      flying = p > 0 && p < 1;
    }
    const pt = project(view, gx, gy, gz);
    const since = (f - landAt(0)) % HOP;
    const squash = !flying && f >= landAt(0) ? lerp(since, [0, 1, 3], [1, 1, 0], ease.out) : 0;
    const absorb = prog(f, lastLand + 1, 5, ease.in);
    dot = { x: pt.x, y: pt.y, d: dd * (1 - absorb) * prog(f, DROP_AT, 2), sx: flying ? 0.86 : 1 + 0.25 * squash, sy: flying ? 1.18 : 1 - 0.22 * squash };
  }
  // the recheck tag hangs in front of the grid, tied to the centroid of the 3 hollow slots (round 3)
  const anchor = project(view, 1.5 - GRID_COLS / 2, 1.5 - GRID_ROWS / 2, 0);
  const tagW = 330 * u;
  const tagCx = anchor.x - 150 * u;
  const tagTop = anchor.y + 120 * u;
  const leadX = Math.min(Math.max(anchor.x, tagCx - tagW / 2 + 36 * u), tagCx + tagW / 2 - 36 * u);
  const leader = prog(f, 77, 6, ease.out) * (1 - prog(f, 165, 12, ease.in));
  const counters: [string, number][] = [
    ["요청", 10],
    ["확보", acquired],
    ["전달", delivered],
    ["수령", received],
  ];
  return (
    <AbsoluteFill style={{ background: field }}>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <IsoGrid
          view={view}
          cols={COLS}
          rows={GRID_ROWS}
          slots={slots}
          palette={pal}
          strokeW={2 * u}
        />
        {leader > 0 && (
          <g opacity={leader}>
            <line x1={anchor.x} y1={anchor.y} x2={mixN(anchor.x, leadX, leader)} y2={mixN(anchor.y, tagTop, leader)} stroke={brand ? C.mint : C.green} strokeWidth={2.5 * u} strokeLinecap="round" />
            <circle cx={anchor.x} cy={anchor.y} r={7 * u} fill={brand ? C.mint : C.green} />
          </g>
        )}
        {dot && dot.d > 0.5 && (
          <ellipse
            cx={dot.x}
            cy={dot.y}
            rx={(dot.d / 2) * dot.sx}
            ry={(dot.d / 2) * dot.sy}
            fill={C.mint}
            stroke={brand ? C.greenMid : C.green}
            strokeWidth={3 * u}
          />
        )}
      </svg>
      <div
        style={{
          position: "absolute",
          left: tagCx - tagW / 2,
          width: tagW,
          boxSizing: "border-box",
          textAlign: "center",
          top: tagTop,
          transformOrigin: `${leadX - (tagCx - tagW / 2)}px 0`,
          scale: tag,
          opacity: Math.min(1, tag * 2),
          background: brand ? C.paper2 : C.mint,
          border: `${1.5 * u}px solid ${C.tint2}`,
          borderRadius: 24 * u,
          padding: `${14 * u}px ${24 * u}px`,
          fontFamily: FONT,
          whiteSpace: "nowrap",
        }}
      >
        {/* round 6: the same two-line tag as I2, so the 3 hollow slots keep their label on the landing page */}
        <div style={{ fontSize: 24 * u, fontWeight: 700, color: C.ink, lineHeight: 1.3 }}>2026-10-12 미송 재확인</div>
        <div style={{ fontSize: 20 * u, fontWeight: 500, color: C.grey700, lineHeight: 1.3, marginTop: 2 * u }}>남은 미송 3장</div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 120 * u,
          display: "flex",
          justifyContent: "center",
          gap: 18 * u,
          fontFamily: FONT,
          fontWeight: 600,
          fontSize: 28 * u,
          letterSpacing: "0.1em",
          color: ink,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {counters.map(([k, v], i) => (
          <React.Fragment key={k}>
            {i > 0 && <span style={{ opacity: 0.5 }}>·</span>}
            <span>
              {k} <span style={{ fontWeight: 800, color: v > 0 && k !== "요청" ? (brand ? C.mint : C.greenMid) : ink }}>{v}</span>
            </span>
          </React.Fragment>
        ))}
      </div>
    </AbsoluteFill>
  );
};
