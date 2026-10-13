import React from "react";
import { C, FONT, ease, lerp, mix, prog } from "../theme";
import { CHIP_HOLD } from "../timeline";

export type ChipSpec = {
  /** commit frame: the chip pops here */
  at: number;
  time: string;
  title: string;
  /** pop position (top-left of the card, output px; with align "center", x is the card's centre) */
  x: number;
  y: number;
  align?: "left" | "center";
  /** optional start position to fly in from (e.g. from the other phone) */
  fromXY?: { x: number; y: number };
  /** frames the fromXY arc takes (default 12); S04 lands on the frame the other phone updates */
  travelDur?: number;
  /** optional target (a ledger counter, or the next shot's dot): the chip collapses into a dot that flies there */
  to?: { x: number; y: number };
  /** dot diameter on landing (round 5, default: it shrinks to 11 px into a ledger counter) */
  toD?: number;
  /** keep the landed dot drawn to the end of the segment, so a match cut carries it across (round 5) */
  keepDot?: boolean;
  /** frame the chip starts leaving (collapse) when it has a target; otherwise when it fades */
  leaveAt?: number;
  scale?: number;
  /** the dot's flight arc at mid-flight (px, negative = up; default -90). Round 6: S06B dips (+40) so its
   * dot passes under the kinetic answer instead of through it */
  arc?: number;
};

/**
 * Token of the real 업무 기록 card (09-chat): "업무 기록 · 09:37" over the record title.
 * Pops at the commit frame (overshoot, 10 f), holds, then collapses into a green dot that flies
 * (inOut, 10 f) into the HUD ledger counter it changes. The counter ticks when the dot lands
 * (timeline CHIP_LAND = CHIP_HOLD + 12 frames after the commit).
 * Round 5, every chip goes where its record goes: S04's card arcs from the uncle's phone onto the
 * retailer's, landing on the frame the retailer's status flips to 진행 중 (the shared record), and
 * S06B's dot grows into the "·" of I3 and is held on the cut (match cut into the handoff hop).
 */
export const RecordChip: React.FC<{ f: number; chip: ChipSpec; dark?: boolean }> = ({ f, chip, dark = false }) => {
  const k = chip.scale ?? 1;
  const t = f - chip.at;
  if (t < 0) return null;
  const leave = chip.leaveAt ?? (chip.to ? chip.at + CHIP_HOLD : chip.at + 40);
  const pop = prog(f, chip.at, 10, ease.overshoot);
  const travel = chip.fromXY ? prog(f, chip.at, chip.travelDur ?? 12, ease.inOut) : 1;
  const collapse = prog(f, leave, 5, ease.in);
  const fly = prog(f, leave + 2, 10, ease.inOut);
  const fadeOnly = !chip.to ? prog(f, leave, 6, ease.in) : 0;
  if (fadeOnly >= 1 || (fly >= 1 && f > leave + 14 && !chip.keepDot)) return null;

  // Hangul at 26 px is close to 1 em per syllable; used to aim the collapse at the card centre
  const cardW = (Math.max([...chip.title].length * 25.5, 300) + 44) * k;
  const left = chip.align === "center" ? chip.x - cardW / 2 : chip.x;
  const x = chip.fromXY ? mix(chip.fromXY.x, left, travel) : left;
  const arc = chip.fromXY ? Math.sin(travel * Math.PI) * -60 * k : 0;
  const y = (chip.fromXY ? mix(chip.fromXY.y, chip.y, travel) : chip.y) + arc;
  const cardH = 92 * k;
  const cx = x + cardW / 2;
  const cy = y + cardH / 2;
  const dotD = 22 * k;
  const dotX = chip.to ? mix(cx, chip.to.x, fly) : cx;
  const dotY = chip.to ? mix(cy, chip.to.y, fly) + Math.sin(fly * Math.PI) * (chip.arc ?? -90) * k : cy;
  const dotScale = !chip.to ? 0 : chip.toD ? lerp(fly, [0, 1], [1, chip.toD / dotD]) : lerp(fly, [0, 0.85, 1], [1, 0.75, 0.5]);
  const showDot = chip.to && collapse > 0.5;
  return (
    <>
      {collapse < 1 && (
        <div
          style={{
            position: "absolute",
            left: x,
            top: y,
            minHeight: cardH,
            boxSizing: "border-box",
            padding: `${16 * k}px ${22 * k}px`,
            borderRadius: 16 * k,
            background: C.paper2,
            border: `${Math.max(1, k)}px solid ${C.hair}`,
            boxShadow: `0 ${10 * k}px ${28 * k}px rgba(7,35,28,${dark ? 0.3 : 0.12})`,
            fontFamily: FONT,
            scale: `${(0.6 + 0.4 * pop) * (1 - collapse * 0.85)}`,
            transformOrigin: "50% 50%",
            opacity: Math.min(1, pop * 1.5) * (1 - fadeOnly) * (1 - collapse * 0.6),
          }}
        >
          <div style={{ fontSize: 20 * k, fontWeight: 500, color: C.grey600, lineHeight: 1.2, whiteSpace: "nowrap" }}>업무 기록 · {chip.time}</div>
          <div style={{ fontSize: 26 * k, fontWeight: 600, color: C.ink, lineHeight: 1.3, marginTop: 6 * k, whiteSpace: "nowrap" }}>{chip.title}</div>
        </div>
      )}
      {showDot && (fly < 1 || chip.keepDot) && (
        <div
          style={{
            position: "absolute",
            left: dotX - dotD / 2,
            top: dotY - dotD / 2,
            width: dotD,
            height: dotD,
            borderRadius: "50%",
            background: dark ? C.mint : C.green,
            scale: dotScale,
          }}
        />
      )}
    </>
  );
};
