import React from "react";
import { C, FONT, ease, lerp, prog } from "../theme";
import { CaptionSpec, DemoScene, DemoSpec } from "../components/Scene";
import { ledgerTarget } from "../components/Hud";
import { L, below, sink } from "../layout";
import { COMMIT, MD, S05_SWAP, S07_CHIP_LEAVE } from "../timeline";
import { handoffDotStart } from "./HandoffType";
import { CAM_FULL, phoneDims } from "../components/Phone";
import { hudSafeShift } from "../components/Stage";

/*
 * Master demo segments. Frames are local to each segment (0 = segment start).
 * Footage: `src` is seconds in app-capture/videos/<clip>_1080w30.mp4; event times were found
 * by frame-differencing the clips (see v2-edl.md §2 and the comments below).
 * Screen coordinates are % of the phone screen, measured on gridded frames of the real clips.
 * Ripple tones: mint over deep-green buttons (CTAs, dialog 확인), green over light rows/chips.
 * Captions are verbatim app copy and are held >= readFrames(text) (timeline.ts).
 * Round 4 caption rule: display captions carry no terminal period (questions keep "?"); the only
 * full stop in the film is the hero dot of "사입삼춘.". Two-phone beats always put 소매업자 on the
 * left and 사입삼촌 on the right (S02, S04, S06B, S08).
 */
/** Status badge on the request detail (06a 진행 중 / 06b 미송 대기), measured on the real frames
 * (pill 9.2-18.6 % / 9.2-20.6 % x, 17.9-20.1 % y) and padded 8 source px. */
const BADGE_진행중: [number, number, number, number] = [8.4, 17.6, 19.4, 20.4];
const BADGE_미송대기: [number, number, number, number] = [8.4, 17.6, 21.3, 20.4];

const W = 1920;
const H = 1080;
/** I3's hero dot on its first frame (the S06B chip lands there). */
const I3_DOT = handoffDotStart(W, H, MD.I3);
const RETAILER = "소매업자 · 망원 셀렉트샵";
const UNCLE = "사입삼촌 · 동대문 박삼촌";
const cap = (from: number, to: number, lines: string[], extra: Partial<CaptionSpec> = {}): CaptionSpec => ({
  from,
  to,
  lines,
  x: L.capX,
  y: L.capY,
  size: L.capSize,
  ...extra,
});
/** Secondary caption line under the main caption (44 px, the readable minimum at 1080p). */
const sub = (from: number, to: number, lines: string[], dy = 0, extra: Partial<CaptionSpec> = {}): CaptionSpec => ({
  from,
  to,
  lines,
  x: L.capX,
  y: L.subY + dy,
  size: 44,
  weight: 700,
  color: C.grey800,
  ...extra,
});
// ---------------------------------------------------------------- S02 · 00 연결
// Round 6 (continuity): both phones open on screens that do not give the story away.
// L 10-partners: the 사입삼촌 tab (함께하는 사입삼촌 2명, 연결됨 2, 동대문 박삼촌 card) is static from the
//   tab switch (src 0.90) to the card press (3.33). The shot starts after the switch, so the 채팅 tab
//   (whose preview already shows the S09 reply) is never on screen, and plays that static stretch
//   at 0.7x (src 0.96-3.20 incl. the 6-frame pre-roll).
// R 05-uncle-home: the static home (src 0-2.4) before the scroll exposes 최근 요청 (the 오버핏 셔츠
//   request that S03 has not created yet), at 0.7x (src 0.00-2.24).
const S02_RATE = 0.7;
const S02: DemoSpec = {
  phones: [
    {
      name: "retailer",
      place: below(L.TWO_L),
      // starts 4 frames before the cut, so the phone is already rising on S02's first frame
      placeMoves: [
        { at: -4, dur: 12, to: L.TWO_L, ease: "overshoot" },
        { at: 78, dur: 12, to: L.SINGLE, ease: "inOut" },
      ],
      subs: [{ from: 0, dur: 90, clip: "10-partners", src: 1.1, rate: S02_RATE }],
      highlights: [
        { at: 22, until: 74, box: [5, 41, 34, 46.5] },
        { at: 34, until: 74, box: [4, 79, 96, 88] },
      ],
      label: { text: "소매업자", from: 2, to: 82, size: 36 },
    },
    {
      name: "uncle",
      place: below(L.TWO_R),
      placeMoves: [
        { at: -1, dur: 12, to: L.TWO_R, ease: "overshoot" },
        { at: 76, dur: 12, to: L.OFF_R, ease: "in" },
      ],
      subs: [{ from: 0, dur: 90, clip: "05-uncle-home", src: 0.14, rate: S02_RATE }],
      label: { text: "사입삼촌", from: 5, to: 82, size: 36 },
    },
  ],
  captions: [cap(8, 86, ["요청하고, 확보하고,", "전달해요"], { stagger: 6 })],
};

/** The link: a green line between the two role labels; the dot runs across (요청) and back (전달). */
const S02Link: React.FC<{ f: number }> = ({ f }) => {
  const { devH } = phoneDims(L.TWO_L.h);
  const y = L.TWO_L.cy - devH / 2 - 56 + 22;
  const x0 = L.TWO_L.cx + 88;
  const x1 = L.TWO_R.cx - 88;
  const draw = prog(f, 16, 10, ease.out);
  const out = prog(f, 74, 8, ease.in);
  if (draw <= 0 || out >= 1) return null;
  const run = f < 46 ? prog(f, 26, 16, ease.inOut) : 1 - prog(f, 50, 16, ease.inOut);
  const land = lerp(f, [40, 42, 48], [0, 1, 0], ease.out) + lerp(f, [64, 66, 72], [0, 1, 0], ease.out);
  const dx = x0 + (x1 - x0) * run;
  const tag = prog(f, 22, 10, ease.out);
  return (
    <div style={{ position: "absolute", left: 0, top: 0, opacity: 1 - out }}>
      <div style={{ position: "absolute", left: x0, top: y - 1.5, width: (x1 - x0) * draw, height: 3, background: C.green }} />
      <div
        style={{
          position: "absolute",
          left: dx - 12,
          top: y - 12,
          width: 24,
          height: 24,
          borderRadius: "50%",
          background: C.green,
          scale: `${1 + land * 0.25} ${1 - land * 0.2}`,
          opacity: prog(f, 24, 3),
        }}
      />
      <div
        style={{
          position: "absolute",
          left: (x0 + x1) / 2 - 100,
          width: 200,
          top: y - 46,
          textAlign: "center",
          fontFamily: FONT,
          fontWeight: 600,
          fontSize: 26,
          color: C.green,
          opacity: tag,
          translate: `0 ${(1 - tag) * 8}px`,
        }}
      >
        연결됨
      </div>
    </div>
  );
};

/** S02 starts under the S01 bar wipe (lead frames before the cut), so the panel never wipes in empty. */
export const SegS02: React.FC<{ lead?: number }> = ({ lead = 0 }) => <DemoScene spec={S02} lead={lead} over={(f) => <S02Link f={f} />} />;

// ---------------------------------------------------------------- S03 · 01 요청
// 04-new-request: 새로 작성 0.90 · typed fields (match cuts) · 요청 내용 확인 33.53 · dialog · 확인 37.33 → detail 37.60
const S03: DemoSpec = {
  phones: [
    {
      name: "retailer",
      place: L.SINGLE,
      subs: [
        { from: 0, dur: 21, clip: "04-new-request", src: 0.85 },
        { from: 21, dur: 15, clip: "04-new-request", src: 10.6 },
        { from: 36, dur: 15, clip: "04-new-request", src: 13.95 },
        { from: 51, dur: 15, clip: "04-new-request", src: 18.95 },
        { from: 66, dur: 15, clip: "04-new-request", src: 21.6 },
        { from: 81, dur: 24, clip: "04-new-request", src: 33.4 },
        { from: 105, dur: 21, clip: "04-new-request", src: 34.4 },
        { from: 126, dur: 24, clip: "04-new-request", src: 37.2 },
      ],
      // one camera state per sub-shot; every reframe is a cut on a footage cut or a page change
      cams: [
        { at: 21, dur: 0, to: { s: 1.6, x: 50, y: 27 } },
        { at: 81, dur: 0, to: { s: 1.25, x: 50, y: 68 } },
        { at: 105, dur: 0, to: { s: 1.6, x: 50, y: 50 } },
        { at: COMMIT.S03, dur: 0, to: { s: 1.2, x: 50, y: 50 } },
      ],
      // cutAt: first frame of the next screen (new form 12, dialog fading in 91, detail 138)
      ripples: [
        { at: 7, x: 25, y: 34, tone: "green", cutAt: 12 },
        { at: 85, x: 50, y: 91, tone: "mint", cutAt: 91 },
        { at: 130, x: 66, y: 60.5, tone: "mint", cutAt: COMMIT.S03 },
      ],
      highlights: [
        { at: 21, until: 74, box: [4, 24, 96, 31] },
        { at: 111, until: 120, box: [17, 48.5, 40, 51] },
      ],
    },
  ],
  captions: [cap(4, 147, ["상품과 수량을", "정확하게 전달해요"])],
  kinetic: [
    {
      from: 21,
      to: 84,
      x: L.capX,
      y: L.subY,
      valueSize: 76,
      labelSize: 30,
      items: [
        { at: 21, label: "시장·상가·건물·층", value: "디오트 2층 B-12" },
        { at: 36, label: "상품명", value: "오버핏 셔츠" },
        { at: 51, label: "색상·사이즈 등 옵션", value: "아이보리 · M" },
        { at: 66, label: "요청 수량", value: "10장" },
      ],
    },
  ],
  chips: [{ at: COMMIT.S03, time: "09:37", title: "새 사입 요청을 보냈어요", x: L.chipX, y: L.chipY, leaveAt: 400 }],
};
export const SegS03: React.FC = () => <DemoScene spec={S03} />;

// ---------------------------------------------------------------- S04 · 02 수락 (+ N5)
// L: 04 @ 38.0 (확인 대기; back tap at 41.03), then 06a @ 3.3 (진행 중 · 사입 진행 상황을 확인해요).
// R: 06 @ 0.30: row tap 1.02 → detail 1.12 · 요청 수락 2.47 · dialog 2.50 · [cut 2.90 → 3.70, the
//    dialog is static in between] · 확인 3.80 → 4.00 · CTA swap 4.17.
// Round 3: no punch-in on the two-shot (the role labels stay clear of the phones); one slow push
// holds until the layout glide, and the retailer's status change gets a kinetic echo in the caption
// column with the app's own strings (N5 read at 1080p).
const S04_PUSH = { s: 1.06, x: 50, y: 50 };
/**
 * Round 5: the accept record is shared. Its chip pops out of the uncle's dismissed dialog and arcs
 * onto the retailer's phone in 10 frames; the retailer's screen flips to 진행 중 on the landing frame
 * (the 06a in-point moves from 90 to 97) and the chip rides the retailer's screen until it sinks.
 */
const S04_FLIP = COMMIT.S04 + 10;
const S04_CHIP_K = 0.9;
/** screen % → output px on a two-phone slot under the S04 push */
const s04At = (p: typeof L.TWO_L, x: number, y: number) => {
  const { w, h } = phoneDims(p.h);
  return { x: p.cx + (x / 100 - 0.5) * w * S04_PUSH.s, y: p.cy + (y / 100 - 0.5) * h * S04_PUSH.s };
};
const S04_CHIP = (() => {
  const cardW = (Math.max([..."요청을 수락했어요"].length * 25.5, 300) + 44) * S04_CHIP_K;
  const cardH = 92 * S04_CHIP_K;
  const from = s04At(L.TWO_R, 50, 53.5); // the uncle's dialog 확인
  const to = s04At(L.TWO_L, 50, 76); // low on the retailer's screen, clear of the badge and the 진행 상황 line
  return { from: { x: from.x - cardW / 2, y: from.y - cardH / 2 }, x: to.x - cardW / 2, y: to.y - cardH / 2 };
})();
const S04: DemoSpec = {
  phones: [
    {
      name: "retailer",
      place: L.TWO_L,
      placeMoves: [{ at: 108, dur: 10, to: sink(L.TWO_L), ease: "in" }],
      cams: [
        { at: 8, dur: 70, to: S04_PUSH },
        { at: 106, dur: 12, to: CAM_FULL },
      ],
      subs: [
        // 04 is static from 37.70 until the back tap at 41.03 (this sub ends at 40.97)
        { from: 0, dur: S04_FLIP, clip: "04-new-request", src: 37.77 },
        // N5: the same request after the uncle accepts: 진행 중 · 사입 진행 상황을 확인해요
        { from: S04_FLIP, dur: 120 - S04_FLIP, clip: "06a-retailer-accepted", src: 3.3 },
      ],
      highlights: [
        { at: 30, until: 58, box: [52, 53, 92, 60] },
        { at: S04_FLIP + 2, until: 114, box: BADGE_진행중 },
        { at: S04_FLIP + 5, until: 114, box: [3, 39.5, 55, 43.5] },
      ],
      label: { text: RETAILER, from: 0, to: 112 },
    },
    {
      name: "uncle",
      place: L.TWO_R,
      placeMoves: [{ at: 108, dur: 12, to: L.SINGLE, ease: "inOut" }],
      cams: [
        { at: 8, dur: 70, to: S04_PUSH },
        { at: 106, dur: 12, to: CAM_FULL },
      ],
      subs: [
        { from: 0, dur: 78, clip: "06-acquisition", src: 0.3 },
        { from: 78, dur: 42, clip: "06-acquisition", src: 3.7 },
      ],
      // cutAt: detail page 25, accept dialog fading in 70, dialog dismissing 87
      ripples: [
        { at: 21, x: 37, y: 73.5, tone: "green", cutAt: 25 },
        { at: 65, x: 50, y: 91, tone: "mint", cutAt: 70 },
        { at: 81, x: 66, y: 53.5, tone: "mint", cutAt: COMMIT.S04 },
      ],
      highlights: [{ at: 30, until: 58, box: [52, 53, 92, 60] }],
      label: { text: UNCLE, from: 0, to: 112 },
    },
  ],
  captions: [cap(4, 116, ["거래처와 같은 내용을", "함께 확인하세요"])],
  kinetic: [
    {
      from: 18,
      to: 116,
      x: L.capX,
      y: L.subY,
      valueSize: 76,
      labelSize: 30,
      items: [
        { at: 18, label: "사입삼촌의 확인을 기다려요", value: "확인 대기" },
        // rolls on the 06a in-point, the frame the chip lands and the retailer's phone shows 진행 중
        { at: S04_FLIP, label: "사입 진행 상황을 확인해요", value: "진행 중" },
      ],
    },
  ],
  chips: [
    {
      at: COMMIT.S04,
      time: "09:37",
      title: "요청을 수락했어요",
      x: S04_CHIP.x,
      y: S04_CHIP.y,
      fromXY: S04_CHIP.from,
      travelDur: S04_FLIP - COMMIT.S04,
      scale: S04_CHIP_K,
      // leaves with the retailer's phone (it sinks from 108)
      leaveAt: 108,
    },
  ],
};
export const SegS04: React.FC = () => <DemoScene spec={S04} />;

// ---------------------------------------------------------------- S05 · 03 확보
// 06: CTA 5.57 → 확보 결과 입력 5.77 · spinner + at 7.23 7.60 7.97 8.43 8.87 9.23 9.70 (0→7)
// Round 4: the spinner sub-shot starts at 6.80 (the page is static from 5.77 to 7.23), so the 7th
// + lands on the beat (local 105) and the field turns green on it: the count becomes the green
// record. I2 then opens on the same green field, with only the "남은 미송 3장" frame carried over.
const PLUS = [31, 42, 53, 67, 80, 91, S05_SWAP];
const S05: DemoSpec = {
  fieldSwap: { at: S05_SWAP, color: C.green },
  phones: [
    {
      name: "uncle",
      place: L.SINGLE,
      subs: [
        { from: 0, dur: 18, clip: "06-acquisition", src: 5.45 },
        { from: 18, dur: 102, clip: "06-acquisition", src: 6.8 },
      ],
      cams: [{ at: 18, dur: 10, to: { s: 1.5, x: 50, y: 63 } }],
      // the CTA opens 확보 결과 입력 at 9; the + taps stay on one page (no cutAt)
      ripples: [{ at: 4, x: 50, y: 91, tone: "mint", cutAt: 9 }, ...PLUS.map((at) => ({ at, x: 62, y: 49, tone: "green" as const }))],
      highlights: [{ at: 107, until: 122, box: [4, 79, 96, 83] }],
    },
  ],
  captions: [cap(1, 118, ["확보부터 수령까지", "함께 확인해요"])],
  kinetic: [
    {
      // round 6: KineticSwap now rolls a rolled-in value out on `to`; the 7장 record holds to the cut
      // into I2 instead (its exit would start on the cut frame)
      from: 16,
      to: MD.S05 + 8,
      x: L.capX,
      y: L.subY,
      valueSize: 150,
      valueWeight: 900,
      labelSize: 30,
      // the app shows the new count on the tap frame, so the numeral rolls one frame ahead of it
      items: [{ at: 16, label: "이번 추가 확보", value: "0장" }, ...PLUS.map((at, i) => ({ at: at - 1, label: "이번 추가 확보", value: `${i + 1}장` }))],
    },
  ],
};
export const SegS05: React.FC = () => <DemoScene spec={S05} />;

/** S05 ends on the "남은 미송 3장" highlight: its output rectangle seeds the I2 floor (shape-match cut). */
export const S05_RECT = (() => {
  const { w, h } = phoneDims(L.SINGLE.h);
  const s = 1.5;
  const dx = hudSafeShift(L.SINGLE, { s, x: 50, y: 63 }, { x: 1490, y: 950 })?.x ?? 0;
  const x = (p: number) => L.SINGLE.cx + dx + ((p - 50) / 100) * w * s;
  const y = (p: number) => L.SINGLE.cy + ((p - 63) / 100) * h * s;
  return { x0: x(4), y0: y(79), x1: x(96), y1: y(83) };
})();

// ---------------------------------------------------------------- S06 · 04 미송 (06r: 소매업자 응답 요청 left ON)
// 06r: scroll to 남은 미송 9.30-10.17 · 미송 사유 typed 12.10-16.90 · 공유 pressed 19.37-19.47 · detail 19.77
// (답변 필요; mint card "2026-10-12 미송 재확인 / 확보한 상품은 먼저 전달할 수 있어요. 남은 미송의 처리
// 방법을 답변해 주세요."). Round 3: each caption echoes what is on screen. The first one rides the
// 재확인일 row and the reason; after the share it swaps to the mint card's own line.
/**
 * Round 6: the mint recheck card, re-measured on 06r @ 19.77-22.0 (stable): fill 3.70-96.30 % x,
 * 62.83-73.66 % y (title + a two-line body, reply ON). The old box was measured on the one-line 06
 * card, so its frame floated above the card and cut through it. 06b's card (retailer, one-line body)
 * ends at 71.82 %.
 */
export const MINT_CARD_06R: [number, number, number, number] = [3.7, 62.83, 96.3, 73.66];
const MINT_CARD_06B: [number, number, number, number] = [3.7, 62.83, 96.3, 71.82];
const S06: DemoSpec = {
  phones: [
    {
      name: "uncle",
      place: L.SINGLE,
      subs: [
        { from: 0, dur: 30, clip: "06r-acquisition-reply-on", src: 9.28 },
        { from: 30, dur: 36, clip: "06r-acquisition-reply-on", src: 12.05, rate: 4 },
        // tap "추가 확보 7장 공유" (pressed 19.37-19.47) ...
        { from: 66, dur: 9, clip: "06r-acquisition-reply-on", src: 19.2 },
        // ... cut to the detail (19.77). The app flashes a stale-version notice for 7 frames
        // in between (19.50-19.73) although the share succeeds; it is cut, not faked.
        { from: 75, dur: 60, clip: "06r-acquisition-reply-on", src: 19.767 },
      ],
      // one camera state per sub-shot, reframed on the cuts
      cams: [
        { at: 5, dur: 12, to: { s: 1.3, x: 50, y: 57.5 } },
        { at: 30, dur: 0, to: { s: 1.4, x: 50, y: 38.5 } },
        { at: 66, dur: 0, to: { s: 1.2, x: 50, y: 62 } },
        { at: 75, dur: 0, to: { s: 1.35, x: 50, y: 60 } },
      ],
      // the share tap's ring ends on the cut to the detail (its 이번 추가 확보 입력 CTA sits under it)
      ripples: [{ at: 71, x: 50, y: 91.4, tone: "mint", cutAt: 75 }],
      highlights: [
        { at: 14, until: 24, box: [4, 56, 96, 63] },
        { at: 32, until: 60, box: [6, 52, 92, 58.5] },
        { at: 80, until: 104, box: [52, 54, 92, 60] },
        { at: 86, until: 132, box: MINT_CARD_06R },
      ],
    },
  ],
  captions: [cap(4, 72, ["남은 미송은 재확인일에", "다시 확인해요"]), cap(78, 132, ["확보한 상품은", "먼저 전달할 수 있어요"])],
  // round 4: the kinetic names the field the frame points at: 재확인일 on the scroll, then the
  // 미송 사유 sentence while it is typed (the app's own text, as typed in 06r)
  kinetic: [
    {
      from: 14,
      to: 72,
      x: L.capX,
      y: L.subY,
      valueSize: 76,
      labelSize: 30,
      items: [
        { at: 14, label: "재확인일", value: "2026-10-12" },
        { at: 31, label: "미송 사유", value: "아이보리 M 3장은\n수요일 재입고 예정이에요", size: 48 },
      ],
    },
  ],
  chips: [
    {
      at: COMMIT.S06,
      time: "09:38",
      title: "확보 7개 · 미송 3개 결과를 공유했어요",
      x: L.chipX,
      y: L.chipY,
      to: ledgerTarget("확보", W, H),
    },
  ],
};
export const SegS06: React.FC = () => <DemoScene spec={S06} />;

// ---------------------------------------------------------------- S06B · 04 미송: the retailer answers (N1 + N2)
// Opens on the Q6 green question card (same caption, same place), so the two-shot is already set on
// frame 0 and the caption carries straight over the field swap.
// L: 06b detail (답변 필요) · 미송 3장 답변하기 6.50 → page 6.67 · 미송 3장 기다리기 확정 9.73 → detail
// 10.13 (미송 대기). R: 06r @ 20.1 (uncle detail 7/7/0/3).
// Round 4: same screen direction as S02/S04 (소매업자 left, 사입삼촌 right); the retailer glides
// from the left slot to centre while the uncle sinks out on the right.
/** 06b @ 9.73: the retailer taps "미송 3장 기다리기 확정" (the ripple frame). */
const S06B_TAP = 67;
/** 06b @ 10.133 (source frame 304): the detail returns with 미송 대기 on this local frame. */
const S06B_FLIP = 79;
const S06B: DemoSpec = {
  phones: [
    {
      name: "uncle",
      place: L.TWO_R,
      placeMoves: [{ at: 25, dur: 7, to: sink(L.TWO_R), ease: "in" }],
      subs: [{ from: 0, dur: 32, clip: "06r-acquisition-reply-on", src: 20.1 }],
      highlights: [{ at: 6, until: 24, box: [52, 54, 92, 60] }],
      label: { text: UNCLE, from: -10, to: 28 },
    },
    {
      name: "retailer",
      place: L.TWO_L,
      placeMoves: [{ at: 30, dur: 10, to: L.SINGLE, ease: "inOut" }],
      // round 5: the detail holds to local 33 (src 6.617, the answer page lands at 6.67), so the
      // 답변하기 tap keeps 4 frames on its own screen before the cut
      subs: [
        { from: 0, dur: 33, clip: "06b-retailer-backorder-reply", src: 5.55 },
        { from: 33, dur: 24, clip: "06b-retailer-backorder-reply", src: 6.7 },
        { from: 57, dur: 48, clip: "06b-retailer-backorder-reply", src: 9.4 },
      ],
      // the glide to single and the punch are one move; the answer sub-shot holds one framing
      cams: [
        { at: 31, dur: 10, to: { s: 1.45, x: 50, y: 28 } },
        { at: 57, dur: 0, to: { s: 1.2, x: 50, y: 55 } },
      ],
      // cutAt: answer page 33 (its 기다리기 확정 CTA sits under the ring), detail 79
      ripples: [
        { at: 29, x: 50, y: 91.4, tone: "mint", cutAt: 33 },
        { at: S06B_TAP, x: 50, y: 91.4, tone: "mint", cutAt: S06B_FLIP },
      ],
      highlights: [
        { at: 6, until: 23, box: [52, 54, 92, 60] },
        { at: 44, until: 51, box: [4, 29.5, 96, 39.5] },
        { at: 84, until: 104, box: BADGE_미송대기 },
        { at: 90, until: 104, box: MINT_CARD_06B },
      ],
      label: { text: RETAILER, from: -10, to: 34 },
    },
  ],
  // already revealed on frame 0: the Q6 card set the same lines in the same place
  captions: [cap(-30, 104, ["남은 미송 3장을", "어떻게 할까요?"])],
  // round 6: the answer gets its kinetic payoff, as S04 does. Under the question, the retailer's status
  // (the app's own badge and mint-card line, 답변 필요 / "남은 미송의 처리 방법을 답변해 주세요") rolls to the answer on the
  // frame the detail returns with 미송 대기 (06b @ 10.13, local 79): "미송 3장 기다리기 확정 / 미송 대기"
  // The label rolls on the 확정 tap (the choice), the value on the badge flip (the status). It rolls out
  // by 100, before the record's dot crosses this slot on its way to I3's "·" (lands 104 at 410,540).
  kinetic: [
    {
      from: 8,
      to: 100,
      x: L.capX,
      y: L.subY,
      valueSize: 76,
      labelSize: 30,
      items: [
        { at: 8, label: "남은 미송의 처리 방법을 답변해 주세요", value: "답변 필요" },
        { at: S06B_TAP, label: "미송 3장 기다리기 확정", value: "답변 필요" },
        { at: S06B_FLIP, label: "미송 3장 기다리기 확정", value: "미송 대기" },
      ],
    },
  ],
  // round 5: the record collapses into the dot, which grows into I3's "·" after 확보 and lands on
  // S06B's last frame; I3 opens with the same dot in the same place (mint on green): the settled
  // 미송 answer is what lets the 7 secured pieces be handed over
  chips: [
    {
      at: COMMIT.S06B,
      time: "09:38",
      title: "미송을 기다리기로 했어요",
      x: L.chipX,
      y: L.chipY,
      leaveAt: MD.S06B - 1 - 12,
      to: { x: I3_DOT.x, y: I3_DOT.y },
      toD: I3_DOT.d,
      keepDot: true,
      // round 6: dips under the kinetic answer (gone by 100) instead of arcing up through it
      arc: 40,
    },
  ],
};
export const SegS06B: React.FC = () => <DemoScene spec={S06B} />;

/** Q6 caption, shared by the green question card and S06B (match cut on the field swap). */
export const Q6_LINES = ["남은 미송 3장을", "어떻게 할까요?"];

// ---------------------------------------------------------------- S07 · 05 전달
// 07: 전달할 물품 0.90 → 1.03 · batch 3.13 · 실제 전달한 수량 기록 7.57 → dialog · 확인 10.00 → 10.17 · list 10.67
// Round 4 (120 frames): the caption leads with the batch page's own heading and the 누적 전달 0장 → 7장
// line, and swaps to the dialog's disclaimer on the frame "물품을 전달했나요?" opens. The commit moves
// to local 90 and the chip leaves early, so its dot lands in the 전달 counter on the cut into S08
// (no hold on the returned list).
/**
 * Round 6: the delivery dialog's second sentence only, "소매업자의 수령 확인은 별도로 진행돼요" (the line the
 * caption echoes), not the first, "2개 요청, 총 10개 전달을 기록해요." (both requests: 7 shirts + 3 cardigans,
 * which read as 10 vs the 7 that the chip and the ledger count). The sentence wraps: "소매업자" ends line 1
 * (glyphs x 67.9-79.6 %, y 46.8-48.3 %) and line 2 is "의 수령 확인은 별도로 진행돼요." (x 18.8-61.3 %,
 * y 49.1-50.4 %), measured on 07 @ 9.0. The lines are 10 px apart, so a frame around it would run under
 * the first sentence; it gets marker strokes instead (Hl.marks), one per line.
 */
export const DIALOG_SENTENCE_2: { marks: [number, number, number, number][] } = {
  marks: [
    [67.2, 46.4, 80.3, 48.62],
    [18.2, 48.82, 61.9, 50.8],
  ],
};
/** S07's uncle starts its glide into the two-phone slot here (local). */
const S07_TO_TWO = 108;
/** S07's dialog line, carried over the cut onto S08's 8a (the uncle's 수령 대기 next to the retailer's home). */
const S07_CARRY = ["소매업자의 수령 확인은", "별도로 진행돼요"];
const S07: DemoSpec = {
  phones: [
    {
      name: "uncle",
      place: L.SINGLE,
      // round 5: after the commit the uncle steps into the right two-phone slot (while the chip's dot
      // flies to 전달), so S08 opens with it settled and the retailer rises into an empty left slot
      placeMoves: [{ at: S07_TO_TWO, dur: MD.S07 - S07_TO_TWO, to: L.TWO_R, ease: "inOut" }],
      subs: [
        { from: 0, dur: 21, clip: "07-delivery", src: 0.75 },
        { from: 21, dur: 29, clip: "07-delivery", src: 3.05 },
        { from: 50, dur: 30, clip: "07-delivery", src: 7.45 },
        { from: 80, dur: 40, clip: "07-delivery", src: 9.85 },
      ],
      // punches at 1.4 so the 64 px caption keeps >= 60 px of air to the bezel; one framing per
      // sub-shot (the push at 59 rides the dialog appearing), one pull-out after the commit
      cams: [
        { at: 21, dur: 0, to: { s: 1.4, x: 50, y: 48 } },
        { at: 50, dur: 0, to: { s: 1.2, x: 50, y: 62 } },
        { at: 59, dur: 8, to: { s: 1.4, x: 50, y: 50 } },
        { at: COMMIT.S07 + 2, dur: 10, to: CAM_FULL },
      ],
      // cutAt: batch page 9, delivery dialog fading in 58, dialog dismissing 90
      ripples: [
        { at: 5, x: 30, y: 34.5, tone: "green", cutAt: 9 },
        { at: 54, x: 50, y: 91, tone: "mint", cutAt: 58 },
        { at: 84, x: 66, y: 55.5, tone: "mint", cutAt: COMMIT.S07 },
      ],
      highlights: [
        { at: 9, until: 15, box: [4, 22, 96, 39] },
        { at: 29, until: 44, box: [70, 52.5, 93, 55.5] },
        { at: 68, until: 79, ...DIALOG_SENTENCE_2 },
      ],
    },
  ],
  // caption 2 does not exit: it carries across the cut over S08's 수령 대기 two-shot (S07_CARRY)
  captions: [cap(4, 60, ["실제로 물품을 전달한 뒤", "기록해 주세요"]), cap(60, MD.S07 + 30, S07_CARRY)],
  kinetic: [
    {
      from: 25,
      to: 58,
      x: L.capX,
      y: L.subY,
      valueSize: 76,
      labelSize: 30,
      items: [{ at: 25, label: "누적 전달", value: "0장 → 7장" }],
    },
  ],
  chips: [
    {
      at: COMMIT.S07,
      time: "09:38",
      title: "7개 전달을 기록했어요",
      x: L.chipX,
      y: L.chipY,
      to: ledgerTarget("전달", W, H),
      leaveAt: S07_CHIP_LEAVE,
    },
  ],
};
export const SegS07: React.FC = () => <DemoScene spec={S07} />;

// ---------------------------------------------------------------- S08 · 06 수령 (+ N4)
// 8a R: 07 @ 11.8 (수령 대기 11.87 → 12.03, 확인한 수량 0장) · L: 08 home (2건 받은 상품 확인)
// 8b 08: 이번 전달분 수령 확인 5.68 → 5.77 "이번에 받은 7장이 맞나요?"
// 8c 08: 7장 수령 확인 8.90 → detail 9.30
// 8d R: 08b 전달 이력 (수령 확인 badge) · L: 08 전달·수령 내역 (scroll lands 13.4, scrolls back 14.2)
// Round 3: the static two-phone hold in 8a is cut to 32 frames; the glide to single and the punch
// are one move; 8c holds one framing; 8d pulls out with the layout glide.
// Round 4: screen direction as in S02/S04/S06B: the uncle (centre in S07) steps right, the retailer
// rises into the left slot (it rises in place like S02, so nothing sweeps through the caption).
const S08: DemoSpec = {
  phones: [
    {
      name: "retailer",
      place: below(L.TWO_L),
      placeMoves: [
        { at: 1, dur: 10, to: L.TWO_L, ease: "overshoot" },
        { at: 32, dur: 10, to: L.SINGLE, ease: "inOut" },
        { at: 105, dur: 10, to: L.TWO_L, ease: "inOut" },
      ],
      subs: [
        { from: 0, dur: 32, clip: "08-receipt", src: 0.1 },
        { from: 32, dur: 42, clip: "08-receipt", src: 5.55 },
        { from: 74, dur: 31, clip: "08-receipt", src: 8.8 },
        // 8d rides the real 전달·수령 내역 scroll (lands 13.4) and cuts before it scrolls back (14.2)
        { from: 105, dur: 45, clip: "08-receipt", src: 12.7 },
      ],
      cams: [
        { at: 33, dur: 10, to: { s: 1.45, x: 50, y: 34.5 } },
        { at: 74, dur: 0, to: { s: 1.2, x: 50, y: 60 } },
        { at: 105, dur: 10, to: CAM_FULL },
      ],
      // cutAt: receipt page 42, detail after 7장 수령 확인 89
      ripples: [
        { at: 36, x: 50, y: 91, tone: "mint", cutAt: 42 },
        { at: 77, x: 50, y: 91, tone: "mint", cutAt: COMMIT.S08 },
      ],
      highlights: [
        { at: 10, until: 26, box: [3, 48, 94, 56] },
        { at: 52, until: 68, box: [4, 40.5, 96, 44] },
        // every fade ends on the cut to the next screen (round 4: no frame on the wrong page)
        { at: 93, until: 99, box: [8, 54, 40, 60] },
        { at: 93, until: 99, box: [52, 54, 92, 60] },
        { at: 124, until: 147, box: [4, 72, 96, 97] },
      ],
      label: { text: RETAILER, from: 3, to: 32 },
    },
    {
      name: "uncle",
      // round 5: already in the right slot on the cut (it glided there at the end of S07)
      place: L.TWO_R,
      placeMoves: [
        { at: 28, dur: 7, to: sink(L.TWO_R), ease: "in" },
        // rises once the retailer's glide has cleared the right slot (no ghost over it)
        { at: 110, dur: 10, to: L.TWO_R, ease: "out" },
      ],
      subs: [
        // the 수령 대기 tab and list switch on source frame 356 (11.867): in-point 11.467 (frame 344) puts
        // the tap at local 8, after the retailer's rise, and the list change at local 12
        { from: 0, dur: 35, clip: "07-delivery", src: 11.467 },
        // N4: the uncle's 전달 이력 after the receipt, badge 수령 확인
        { from: 103, dur: 47, clip: "08b-uncle-delivery-history", src: 3.0 },
      ],
      ripples: [{ at: 8, x: 37, y: 18, tone: "green", cutAt: 12 }],
      highlights: [
        { at: 15, until: 27, box: [4, 38.5, 96, 41.5] },
        { at: 121, until: 147, box: [4, 22.5, 96, 46] },
      ],
      label: { text: UNCLE, from: 2, to: 30 },
    },
  ],
  // round 5: 8a carries S07's line (the uncle's 수령 대기 next to the retailer's home); the question
  // rises with the receipt-CTA tap, as the receipt page "이번에 받은 7장이 맞나요?" opens
  captions: [cap(-60, 30, S07_CARRY), cap(36, 88, ["이번에 받은 7장이", "맞나요?"]), cap(90, 148, ["회차별 진행 상황을", "함께 확인해요"])],
  // round 6: the two-phone close echoes the three highlighted rows (both phones show them: the uncle's
  // 전달 이력 from 103, the retailer's 전달·수령 내역 once the scroll lands at 126) in the caption column,
  // as S04 does, so the 7 / 7 / 7 reads at landing-page embed size
  kinetic: [
    {
      from: 112,
      to: 148,
      x: L.capX,
      y: L.subY,
      valueSize: 76,
      labelSize: 30,
      items: [{ at: 112, label: "이번 전달 · 확인한 수량 · 실제 받은 수량", value: "7장 · 7장 · 7장" }],
    },
  ],
  chips: [
    { at: COMMIT.S08, time: "09:38", title: "7개 수령을 확인했어요", x: L.chipX, y: L.chipY, to: ledgerTarget("수령", W, H) },
  ],
};

/** Role labels for the 8d two-phone return (the per-phone label already served 8a). */
const S08Labels: React.FC<{ f: number }> = ({ f }) => {
  const o = prog(f, 112, 8, ease.out) * (1 - prog(f, 142, 6, ease.in));
  if (o <= 0) return null;
  const { devH } = phoneDims(L.TWO_L.h);
  const top = L.TWO_L.cy - devH / 2 - 56;
  const style: React.CSSProperties = {
    position: "absolute",
    top,
    width: 600,
    textAlign: "center",
    fontFamily: FONT,
    fontWeight: 700,
    fontSize: 30,
    color: C.ink,
    opacity: o,
    whiteSpace: "nowrap",
    translate: `0 ${(1 - o) * 14}px`,
  };
  return (
    <>
      <div style={{ ...style, left: L.TWO_L.cx - 300 }}>{RETAILER}</div>
      <div style={{ ...style, left: L.TWO_R.cx - 300 }}>{UNCLE}</div>
    </>
  );
};
export const SegS08: React.FC = () => <DemoScene spec={S08} over={(f) => <S08Labels f={f} />} />;

// ---------------------------------------------------------------- S09 · 07 기록 (09r: chat incl. the 미송 answer card)
// 09r: thread 2.67 · send ~9.77 → bubble · keyboard down 10.47-10.83 (skipped) · live reply 12.20
export const CHAT_CARDS: { title: string; y0: number; y1: number }[] = [
  { title: "새 사입 요청을 보냈어요", y0: 14.6, y1: 19.6 },
  { title: "요청을 수락했어요", y0: 21.5, y1: 29 },
  { title: "확보 7개 · 미송 3개 결과를 공유했어요", y0: 31, y1: 40 },
  { title: "미송을 기다리기로 했어요", y0: 42.5, y1: 49.5 },
  { title: "7개 전달을 기록했어요", y0: 52, y1: 59 },
  { title: "7개 수령을 확인했어요", y0: 70.5, y1: 77.5 },
];

/** The live reply in 09r-chat @ 12.2+ (measured on f1440): bubble to ~75 %, timestamp 76.1-77.4 % (y); the frame takes both in. */
export const REPLY_BOX: [number, number, number, number] = [4, 68, 66, 77.8];

const S09: DemoSpec = {
  phones: [
    {
      name: "retailer",
      place: L.SINGLE,
      subs: [
        { from: 0, dur: 45, clip: "09r-chat", src: 3.0 },
        { from: 45, dur: 30, clip: "09r-chat", src: 9.3 },
        { from: 75, dur: 45, clip: "09r-chat", src: 11.7 },
      ],
      cams: [
        { at: 45, dur: 0, to: { s: 1.4, x: 50, y: 50 } },
        { at: 75, dur: 0, to: { s: 1.25, x: 50, y: 55 } },
      ],
      // the send button stays put while the thread scrolls (no cut there); the ring ends on the footage cut at 75
      ripples: [{ at: 58, x: 83.5, y: 62, tone: "mint", cutAt: 75 }],
      highlights: [
        ...CHAT_CARDS.map((c, i) => ({ at: 3 + i * 5, until: 38, box: [6, c.y0, 94, c.y1] as [number, number, number, number] })),
        // the live reply bubble and its "09:39" timestamp (round 5: the frame used to cut through it)
        { at: 96, until: 119, box: REPLY_BOX },
      ],
    },
  ],
  captions: [cap(4, 116, ["요청과 대화를", "이어가요"]), sub(14, 116, ["처리 기록을 함께 남겨요"])],
};
export const SegS09: React.FC = () => <DemoScene spec={S09} />;

/** Every demo spec by segment id (for the soundtrack: ripples -> clicks, chips -> commits). */
export const MASTER_SPECS = { S02, S03, S04, S05, S06, S06B, S07, S08, S09 };
