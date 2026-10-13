/**
 * v2 timelines (see .context/video/v2-edl.md §3 and §5, generated from this file by
 * scripts/edl-tables.mjs). Every segment boundary sits on the 120 bpm grid (15 frames = 1 beat).
 *
 * Master = the EDL's plan plus the beats unlocked by the footage filmed for v2:
 *  - S04: the uncle opens the new request with a real tap, and the retailer's phone visibly
 *    changes to 진행 중 after the accept (N5).
 *  - S06B: the retailer answers the 미송, "남은 미송 3장을 어떻게 할까요?" (N1 + N2).
 *  - S08: the receipt lands on both phones, uncle 전달 이력 next to the retailer (N4).
 * Round 3 pacing (critic): S00 is 1.5 s so footage starts at 3.5 s, S04 cuts the frozen accept
 * dialog (src 2.9 → 3.7), S08 loses the static two-phone hold, I2 turns deep green and a 15-frame
 * green question card (Q6) opens S06B, so the middle act gets field swaps on the beat. S06 gains
 * one beat for its second caption (the on-screen mint card line).
 * Round 4 (critic): S00 gains 9 frames so the count clash reads before the converge (footage still
 * starts at 3.6 s, the bed's first downbeat moves with S02); S07 loses one beat (the dead hold on the
 * returned list is gone, the 전달 chip lands in the ledger on the cut into S08); S05 swaps to the
 * green field on the 7th tap (the count becomes the green record) so I2 opens on the same field.
 * Master 51.8 s (<= 55 s).
 * Segment components use local frames (0 = segment start).
 */
export const FPS = 30;
export const BEAT = 15;

export type LedgerKey = "요청" | "확보" | "전달" | "수령";
export const LEDGER_KEYS: LedgerKey[] = ["요청", "확보", "전달", "수령"];

/**
 * A field change that is not a hard cut: the incoming field is revealed by a bar (left to right)
 * or an iris. The HUD splits its ink along the same edge, so it never vanishes over a matching field.
 * `into` is the incoming field. Progress uses the same easing as the segment that draws the wipe.
 */
export type FieldWipe = {
  at: number;
  dur: number;
  kind: "bar" | "iris";
  ease: "inOut" | "in";
  into: "light" | "dark";
  /** iris centre and the radius it reaches at progress 1 (px) */
  cx?: number;
  cy?: number;
  r?: number;
};

export type FilmSpec = {
  total: number;
  /**
   * Ledger values shown dim before they count (round 4): I2 and S06 already show 누적 확보 7장, but
   * the record only counts it once the result is shared, so the HUD holds a dim 7 until the chip lands.
   */
  pending?: { key: LedgerKey; at: number; value: number }[];
  /** HUD fades in over [hudIn, hudIn+12] and out over [hudOut-4, hudOut]. */
  hudIn: number;
  hudOut: number;
  chapters: { from: number; label: string }[];
  ledger: { key: LedgerKey; at: number; value: number }[];
  /** frame ranges (inclusive) over dark fields where the HUD inks off-white */
  lightInk: [number, number][];
  /** soft field changes (bar / iris) at the end of a lightInk range */
  wipes: FieldWipe[];
};

/** Record chips hold this long after the commit, then collapse and fly into the ledger. */
export const CHIP_HOLD = 24;
/** The ledger counter ticks when the chip's dot lands (collapse 2 f + flight 10 f). */
export const CHIP_LAND = CHIP_HOLD + 12;

const place = <K extends string>(segs: [K, number][]) => {
  const out = {} as Record<K | "END", number>;
  const dur = {} as Record<K, number>;
  let at = 0;
  for (const [k, d] of segs) {
    out[k] = at;
    dur[k] = d;
    at += d;
  }
  out.END = at;
  return { at: out, dur };
};

export type MasterSeg = "S00" | "S01" | "S02" | "S03" | "I1" | "S04" | "S05" | "I2" | "S06" | "Q6" | "S06B" | "I3" | "S07" | "S08" | "I5" | "S09" | "S10";
export const MASTER_SEGS: [MasterSeg, number][] = [
  ["S00", 54],
  ["S01", 60],
  ["S02", 90],
  ["S03", 150],
  ["I1", 45],
  ["S04", 120],
  ["S05", 120],
  ["I2", 60],
  ["S06", 135],
  ["Q6", 15],
  ["S06B", 105],
  ["I3", 45],
  ["S07", 120],
  ["S08", 150],
  ["I5", 60],
  ["S09", 120],
  ["S10", 105],
];

export const { at: M, dur: MD } = place(MASTER_SEGS);

/** S00 problem build: authored for 52 frames, squeezed into this many (master); the converge plays at x0.6. */
export const S00_CONVERGE = 39;
export const S00_TSCALE = 0.6;

/** Local commit frames (the real screen changes; chips pop here), shared by the HUD ledger and the segments. */
export const COMMIT = {
  S03: 138, // 04 @ 37.60: request detail appears after 확인
  S04: 87, // 06 @ 4.00: accept dialog dismisses (the frozen dialog 2.9-3.7 is cut)
  S06: 75, // 06r @ 19.77: detail after "추가 확보 7장 공유" (cut over a 7-frame app notice)
  S06B: 80, // 06b @ 10.13: detail after "미송 3장 기다리기 확정"
  S07: 90, // 07 @ 10.17: delivery dialog 확인 dismisses (round 4: S07 re-cut to 120 frames)
  S08: 89, // 08 @ 9.30: detail after "7장 수령 확인"
};

/** S07's chip leaves early so its dot lands in the 전달 counter on the cut into S08 (round 4). */
export const S07_CHIP_LEAVE = 108;
/** S05: the field turns green on the 7th + tap (local frame, on the beat). */
export const S05_SWAP = 105;

/** I1 iris centre = the uncle phone (RippleTransit `b`). */
export const I1_IRIS = { cx: 1344, cy: 590 };
/** I5 / V10: RecordHelix wipes the off-white bar in over local f46-54 (authored, not time-scaled). */
export const HELIX_BAR = { at: 46, dur: 8 };

export const MASTER: FilmSpec = {
  total: M.END,
  hudIn: M.S01 + 25,
  hudOut: M.S10,
  chapters: [
    { from: 0, label: "00 연결" },
    { from: M.S03, label: "01 요청" },
    { from: M.S04, label: "02 수락" },
    { from: M.S05, label: "03 확보" },
    { from: M.I2 + 27, label: "04 미송" },
    { from: M.I3, label: "05 전달" },
    { from: M.S08, label: "06 수령" },
    { from: M.I5, label: "07 기록" },
  ],
  ledger: [
    { key: "요청", at: M.S03 + COMMIT.S03, value: 10 },
    { key: "확보", at: M.S06 + COMMIT.S06 + CHIP_LAND, value: 7 },
    { key: "전달", at: M.S07 + S07_CHIP_LEAVE + 12, value: 7 },
    { key: "수령", at: M.S08 + COMMIT.S08 + CHIP_LAND, value: 7 },
  ],
  // the grid's 7th block lands at I2 + 31: the HUD shows a dim 7 until the share is recorded
  pending: [{ key: "확보", at: M.I2 + 31, value: 7 }],
  lightInk: [
    [M.S01, M.S02 - 1],
    [M.I1, M.S04 - 1],
    [M.S05 + S05_SWAP, M.S06 - 1],
    [M.Q6, M.S06B - 1],
    [M.I3, M.S07 - 1],
    // round 5: ends with the I5 bar wipe, not with the segment (the field is off-white from I5 + 54)
    [M.I5, M.I5 + HELIX_BAR.at + HELIX_BAR.dur - 1],
  ],
  wipes: [
    // S01 → S02: the off-white panel wipes in from the left over the last 8 frames (Wordmark)
    { at: M.S02 - 8, dur: 8, kind: "bar", ease: "inOut", into: "light" },
    // I1 → S04: an off-white iris opens out of the uncle phone over the last 10 frames (RippleTransit)
    { at: M.S04 - 10, dur: 10, kind: "iris", ease: "in", into: "light", ...I1_IRIS, r: Math.hypot(1920, 1080) * 1.05 },
    // I5 → S09: an off-white bar wipes in under the card column (RecordHelix, authored f46-54 of 60)
    { at: M.I5 + HELIX_BAR.at, dur: HELIX_BAR.dur, kind: "bar", ease: "inOut", into: "light" },
  ],
};

/**
 * Social cut 9:16, <= 30 s for vertical placements (critic round 2): the 미송 answer beat (V06B) and
 * the handoff type rows (V07) are master-only, the spinner plays at 2x, every demo ends 1-1.5 s
 * after its commit, I5 keeps its full 2 s (readable chat echoes + record lines) and the outro holds
 * ~1.4 s after the tagline. 29.5 s.
 */
export type SocialSeg = "V00" | "V01" | "V02" | "V03" | "V04" | "V05" | "V06" | "V08" | "V09" | "V10" | "V11" | "V12";
export const SOCIAL_SEGS: [SocialSeg, number][] = [
  ["V00", 60],
  ["V01", 45],
  ["V02", 90],
  ["V03", 75],
  ["V04", 60],
  ["V05", 45],
  ["V06", 90],
  ["V08", 90],
  ["V09", 90],
  ["V10", 60],
  ["V11", 90],
  ["V12", 90],
];
export const { at: V, dur: VD } = place(SOCIAL_SEGS);

export const VCOMMIT = {
  V02: 75, // 04 @ 37.60
  V03: 58, // 06 @ 4.00 (x1.5 from 2.00, starting at local 18)
  V06: 43, // 06r @ 19.77
  V08: 47, // 07 @ 10.17
  V09: 47, // 08 @ 9.30
};

export const SOCIAL: FilmSpec = {
  total: V.END,
  hudIn: V.V01 + 35,
  hudOut: V.V12 - 2,
  chapters: [
    { from: 0, label: "01 요청" },
    { from: V.V03, label: "02 수락" },
    { from: V.V04, label: "03 확보" },
    { from: V.V05 + 18, label: "04 미송" },
    { from: V.V08, label: "05 전달" },
    { from: V.V09, label: "06 수령" },
    { from: V.V10, label: "07 기록" },
  ],
  ledger: [
    { key: "요청", at: V.V02 + VCOMMIT.V02, value: 10 },
    { key: "확보", at: V.V06 + VCOMMIT.V06 + CHIP_LAND, value: 7 },
    { key: "전달", at: V.V08 + VCOMMIT.V08 + CHIP_LAND, value: 7 },
    { key: "수령", at: V.V09 + VCOMMIT.V09 + CHIP_LAND, value: 7 },
  ],
  pending: [{ key: "확보", at: V.V05 + 31, value: 7 }],
  lightInk: [
    [V.V01, V.V02 - 1],
    [V.V03, V.V03 + 17],
    [V.V05, V.V06 - 1],
    [V.V10, V.V10 + HELIX_BAR.at + HELIX_BAR.dur - 1],
  ],
  wipes: [
    { at: V.V02 - 8, dur: 8, kind: "bar", ease: "inOut", into: "light" },
    // the 18-frame portrait ring transit plays the 45-frame choreography x2.5: iris at 14-18
    { at: V.V03 + 14, dur: 4, kind: "iris", ease: "in", into: "light", cx: 540, cy: 1080, r: Math.hypot(1080, 1920) * 1.05 },
    { at: V.V10 + HELIX_BAR.at, dur: HELIX_BAR.dur, kind: "bar", ease: "inOut", into: "light" },
  ],
};

export const chapterAt = (spec: FilmSpec, frame: number) => {
  let c = spec.chapters[0];
  for (const ch of spec.chapters) if (frame >= ch.from) c = ch;
  return c;
};

/**
 * Off-white HUD ink at `frame`. A wipe into light that starts inside a lightInk range ends that range
 * when it completes (round 5), so the range and the wipe can never drift apart again: the HUD never
 * inks off-white on the off-white field the wipe just revealed.
 */
export const lightInkAt = (spec: FilmSpec, frame: number) =>
  spec.lightInk.some(
    ([a, b]) => frame >= a && frame <= b && !spec.wipes.some((w) => w.into === "light" && w.at >= a && w.at <= b && frame >= w.at + w.dur),
  );

/** The field wipe running at `frame`, if any. */
export const wipeAt = (spec: FilmSpec, frame: number) => spec.wipes.find((w) => frame >= w.at && frame < w.at + w.dur);

/** Minimum hold for a caption: ~0.25 s per syllable cluster (a Hangul syllable or a run of digits) + 0.6 s, in frames. */
export const readFrames = (text: string) => Math.ceil(7.5 * (text.match(/[가-힣]|[0-9]+/g)?.length ?? 0) + 18);
