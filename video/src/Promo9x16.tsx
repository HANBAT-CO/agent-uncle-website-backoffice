import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { C } from "./theme";
import { Hud, ledgerTarget } from "./components/Hud";
import { Hit, SFX, Soundtrack } from "./components/Soundtrack";
import { CaptionSpec, DemoScene, DemoSpec } from "./components/Scene";
import { Cam, phoneDims } from "./components/Phone";
import { Nudge, RoleLabelSpec, topClampShift } from "./components/Stage";
import { ChipSpec } from "./components/RecordChip";
import { WipeReveal } from "./components/WipeReveal";
import { SOCIAL, V, VCOMMIT, VD } from "./timeline";
import { CHIP_NUDGE, P } from "./layout";
import { PromoProps } from "./Promo16x9";
import { Problem } from "./segments/Problem";
import { Wordmark } from "./segments/Wordmark";
import { RippleTransit } from "./segments/RippleTransit";
import { BLOCK_RISE, LedgerGrid } from "./segments/LedgerGrid";
import { RecordHelix } from "./segments/RecordHelix";
import { Outro } from "./segments/Outro";
import { CHAT_CARDS, DIALOG_SENTENCE_2, MINT_CARD_06R, REPLY_BOX } from "./segments/MasterDemos";

/*
 * Social cut 9:16, 29.5 s (round 2: <= 30 s; the 미송 answer beat and the handoff type rows are
 * master-only). One phone fills the frame, no two-phone beats. Frames are
 * local to each segment; source times are the same frame-differenced events as the master.
 * Captions are held >= readFrames(text).
 * Round 3 (platform safe zone: nothing critical below y 1600 or within 140 px of the right edge):
 *  - no clip band: punch-ins never lift the device top above y 440 (it grows downward), and every
 *    ROI is framed to sit above y 1600;
 *  - the 업무 기록 chips dock just under the caption block (y 394), centred, taking over the role
 *    label's slot, and fly up into the HUD ledger.
 * Round 4: the caption block sits at y 224, chips dock at 0.82 scale (y 366-441) and the device steps
 * down 26 px while a chip is docked, so the chip never touches the bezel or the island. Captions follow
 * the master's rule (no terminal period).
 */
const W = 1080;
const H = 1920;
const RETAILER = "소매업자 · 망원 셀렉트샵";
const UNCLE = "사입삼촌 · 동대문 박삼촌";
const cap = (from: number, to: number, lines: string[]): CaptionSpec => ({ from, to, lines, x: P.capX, y: P.capY, size: P.capSize });
/** device top of the full-size phone (y 440): punch-ins never rise above it */
const MIN_TOP = P.SINGLE.cy - phoneDims(P.SINGLE.h).devH / 2;
/** 업무 기록 chip docked under the caption block, centred (it replaces the role label there). */
const chip = (at: number, time: string, title: string, extra: Partial<ChipSpec> = {}): ChipSpec => ({
  at,
  time,
  title,
  x: W / 2,
  y: P.chipY,
  align: "center",
  scale: P.chipScale,
  ...extra,
});
/** A chip with a ledger target leaves CHIP_HOLD (24) frames after its commit. */
const LEAVE = 24;
const role = (text: string, from: number, to: number): RoleLabelSpec => ({ text, from, to, top: P.labelTop, size: 26, align: "center" });
const sideKinetic = (from: number, to: number, items: { at: number; label: string; value: string }[], valueSize = 52) => ({
  from,
  to,
  x: P.sideX,
  y: P.capY + 4,
  labelSize: 26,
  valueSize,
  items,
});

/** V02 pre-rolls under the whole 8-frame V01 bar wipe (the device is live on the wipe's first frame). */
const V02_LEAD = 8;

/*
 * Round 6 (critic: the 9:16 framing jumped between 1.0x and 1.5-1.8x on almost every cut): every demo
 * holds >= 1.25x. 1.0x survives only on a segment's first frame where it is a match (V03 landing out of
 * the ring transit, V11 out of the record helix), and both push in from there.
 * A bottom CTA (88-94 % of the screen) cannot sit above the y 1600 safe line at >= 1.25x with the
 * device top clamped at y 440, so instead of zooming out the camera tilts down to it: the device lifts
 * (a negative nudge) and dissolves into the field above FADE_TOP (y 424-476, under the role-label slot),
 * so it never slides under the caption block. Lifts start / end on page changes (cuts, dur 0) or ride
 * the one push-in (V03, V11); a docked 업무 기록 chip always sits over an unlifted device.
 */
const BEZEL = phoneDims(P.SINGLE.h).bezel;
/** px to lift the device above the top clamp so that screen y `p` (%) lands on canvas y `Y` at camera scale `s` (cam y >= 50). */
const liftFor = (s: number, p: number, Y: number) => Math.round(MIN_TOP + BEZEL * s + (p / 100) * P.SINGLE.h * s - Y);
/** a bottom CTA (button bottom at 94 %) lands its lower edge here */
const CTA_Y = 1585;
const CAM_13: Cam = { s: 1.3, x: 50, y: 50 };
const CAM_125: Cam = { s: 1.25, x: 50, y: 50 };
/** A lift that cuts in at `at` and out at `until` (page changes), dissolving into the field while engaged. */
const lift = (at: number, until: number, dy: number, dur = 0): Nudge => ({ at, until, dy: -dy, dur, outDur: 0, fade: true });

// V02 · 01 요청: typed fields (match cuts) · 요청 내용 확인 33.53 · cut over the dialog · 확인 37.33 → detail 37.60
const V02: DemoSpec = {
  phones: [
    {
      name: "retailer",
      place: P.SINGLE,
      cam: { s: 1.6, x: 50, y: 27 },
      subs: [
        { from: 0, dur: 12, clip: "04-new-request", src: 10.7 },
        { from: 12, dur: 12, clip: "04-new-request", src: 14.05 },
        { from: 24, dur: 12, clip: "04-new-request", src: 19.05 },
        { from: 36, dur: 12, clip: "04-new-request", src: 21.7 },
        { from: 48, dur: 15, clip: "04-new-request", src: 33.4 },
        { from: 63, dur: 27, clip: "04-new-request", src: 37.2 },
      ],
      // round 6: the 요청 내용 확인 CTA is framed at 1.3x by a tilt down (lift) on the cut at 48 instead of a
      // zoom-out to 1.0x; the dialog (38-62 %) sits in the same framing; the detail (75) drops the lift
      cams: [{ at: 48, dur: 0, to: CAM_13 }],
      // cutAt: first frame of the next screen (dialog fading in 58, detail 75), as master S03
      ripples: [
        { at: 52, x: 50, y: 91, tone: "mint", cutAt: 58 },
        { at: 67, x: 66, y: 60.5, tone: "mint", cutAt: VCOMMIT.V02 },
      ],
      highlights: [{ at: 0, until: 41, box: [4, 24, 96, 31] }],
      label: role(RETAILER, 0, VCOMMIT.V02),
    },
  ],
  captions: [cap(0, 88, ["상품과 수량을", "정확하게 전달해요"])],
  kinetic: [
    sideKinetic(0, 50, [
      { at: 0, label: "시장·상가·건물·층", value: "디오트 2층 B-12" },
      { at: 12, label: "상품명", value: "오버핏 셔츠" },
      { at: 24, label: "색상·사이즈 등 옵션", value: "아이보리 · M" },
      { at: 36, label: "요청 수량", value: "10장" },
    ], 46),
  ],
  chips: [chip(VCOMMIT.V02, "09:37", "새 사입 요청을 보냈어요", { leaveAt: 200 })],
  nudges: [lift(48, VCOMMIT.V02, liftFor(1.3, 94, CTA_Y)), { at: VCOMMIT.V02, until: 999, dy: CHIP_NUDGE }],
};

// V03 · 02 수락 (after 18 frames of rings): 06 @ 2.0 x1.5: 요청 수락 2.47 · dialog · 확인 3.80 → 4.00
const V03: DemoSpec = {
  field: "transparent",
  phones: [
    {
      name: "uncle",
      place: { ...P.SINGLE, o: 0 },
      placeMoves: [{ at: 17, dur: 1, to: P.SINGLE }],
      subs: [{ from: 18, dur: 57, clip: "06-acquisition", src: 2.0, rate: 1.5 }],
      // round 6: lands at 1.0x out of the ring transit (the match), then one push + tilt to the 요청 수락
      // CTA at 1.25x (18-26); the accept dialog sits in the same framing; the detail (58) drops the lift
      cams: [{ at: 18, dur: 8, to: CAM_125 }],
      // cutAt: accept dialog fading in 31, dialog dismissing 58 (x1.5 footage)
      ripples: [
        { at: 27, x: 50, y: 91, tone: "mint", cutAt: 31 },
        { at: 54, x: 66, y: 53.5, tone: "mint", cutAt: VCOMMIT.V03 },
      ],
      label: role(UNCLE, 18, VCOMMIT.V03),
    },
  ],
  captions: [cap(18, 73, ["요청을 수락할까요?"])],
  chips: [chip(VCOMMIT.V03, "09:37", "요청을 수락했어요", { leaveAt: 120 })],
  nudges: [lift(18, VCOMMIT.V03, liftFor(1.25, 94, CTA_Y), 8), { at: VCOMMIT.V03, until: 999, dy: CHIP_NUDGE }],
};

// V04 · 03 확보: 06 @ 6.55 x2, spinner + at 7.23 7.60 7.97 8.43 8.87 9.23 9.70 (compressed for the social cut)
// Round 6: 1.3x (was 1.1x), lifted so the 남은 미송 3장 row (79-83 %) stays above y 1600 with the
// spinner (49 %) mid-frame; the side numeral carries the count.
const PLUS = [10, 16, 21, 28, 35, 40, 47];
const V04_CAM = CAM_13;
const V04_LIFT = liftFor(V04_CAM.s, 83, 1578);
const V04: DemoSpec = {
  phones: [
    {
      name: "uncle",
      place: P.SINGLE,
      cam: V04_CAM,
      subs: [{ from: 0, dur: 60, clip: "06-acquisition", src: 6.55, rate: 2 }],
      ripples: PLUS.map((at) => ({ at, x: 62, y: 49, tone: "green" as const })),
      highlights: [{ at: 50, until: 62, box: [4, 79, 96, 83] }],
      label: role(UNCLE, 0, 60),
    },
  ],
  captions: [cap(0, 58, ["확보부터 수령까지", "함께 확인해요"])],
  // the 7장 numeral holds to the cut into V05 (its roll-out would start on the cut frame)
  kinetic: [sideKinetic(0, VD.V04 + 8, [{ at: 0, label: "이번 추가 확보", value: "0장" }, ...PLUS.map((at, i) => ({ at, label: "이번 추가 확보", value: `${i + 1}장` }))], 110)],
  nudges: [lift(-1, 999, V04_LIFT)],
};

// V06 · 04 미송: 06r typing (x3) · 공유 pressed 19.37-19.47 · cut over the app's 7-frame stale-version notice · detail 19.77
// Round 3: the caption is about the 재확인일, so the frames point at the 재확인일 row while the reason
// is typed and, after the share, at the mint recheck card.
// Round 6: the share CTA is framed by a tilt (lift) at 1.35x on its cut, not a zoom-out to 1.0x. After the
// share the detail holds 1.25x; once the chip has left (67) the device steps up 26 px (no fade, it stays
// 48 px under the caption block), so the whole re-measured card (62.83-73.66 %) is framed above y 1600.
// (The old title-only box was measured on the one-line 06 card; its lower edge struck through the body.)
const V06_CHIP_OFF = VCOMMIT.V06 + LEAVE;
const V06: DemoSpec = {
  phones: [
    {
      name: "uncle",
      place: P.SINGLE,
      cam: { s: 1.35, x: 50, y: 42 },
      subs: [
        { from: 0, dur: 36, clip: "06r-acquisition-reply-on", src: 12.4, rate: 3 },
        { from: 36, dur: 7, clip: "06r-acquisition-reply-on", src: 19.267 },
        { from: 43, dur: 47, clip: "06r-acquisition-reply-on", src: 19.767 },
      ],
      cams: [
        { at: 36, dur: 0, to: { s: 1.35, x: 50, y: 50 } },
        { at: VCOMMIT.V06, dur: 0, to: CAM_125 },
      ],
      ripples: [{ at: 39, x: 50, y: 91.4, tone: "mint", cutAt: VCOMMIT.V06 }],
      highlights: [
        { at: 0, until: 16, box: [4, 42.5, 96, 48] },
        { at: 18, until: 30, box: [6, 52, 92, 58.5] },
        { at: 58, until: 88, box: [52, 54, 92, 60] },
        // draws as the device settles 26 px up (67-75), the frame's lower edge lands at y ~1590
        { at: 72, until: 88, box: MINT_CARD_06R },
      ],
      label: role(UNCLE, 0, VCOMMIT.V06),
    },
  ],
  captions: [cap(0, 88, ["남은 미송은 재확인일에", "다시 확인해요"])],
  chips: [
    chip(VCOMMIT.V06, "09:38", "확보 7개 · 미송 3개 결과를 공유했어요", { to: ledgerTarget("확보", W, H) }),
  ],
  nudges: [
    lift(36, VCOMMIT.V06, liftFor(1.35, 94.5, CTA_Y)),
    { at: VCOMMIT.V06, until: V06_CHIP_OFF, dy: CHIP_NUDGE },
    { at: V06_CHIP_OFF, until: 999, dy: -liftFor(1.25, 73.66, 1581) },
  ],
};

// V08 · 05 전달: 07 @ 7.3: 기록 tap 7.57 · dialog (static, cut) · @ 9.6: 확인 10.00 → 10.17 · list 10.67
// Round 6: opens at 1.3x tilted down to the 기록 CTA (lift) and holds that one framing through the dialog
// (body 46.8-50.4 %, 확인 55.5 %); the dialog dismissing (48) drops the lift. The frame takes in the
// dialog's second sentence only (DIALOG_SENTENCE_2), not "2개 요청, 총 10개 전달을 기록해요".
const V08: DemoSpec = {
  phones: [
    {
      name: "uncle",
      place: P.SINGLE,
      subs: [
        { from: 0, dur: 30, clip: "07-delivery", src: 7.3 },
        { from: 30, dur: 60, clip: "07-delivery", src: 9.6 },
      ],
      cam: CAM_13,
      // cutAt: delivery dialog fading in 13, dialog dismissing 48
      ripples: [
        { at: 8, x: 50, y: 91, tone: "mint", cutAt: 13 },
        { at: 42, x: 66, y: 55.5, tone: "mint", cutAt: 48 },
      ],
      highlights: [{ at: 20, until: 41, ...DIALOG_SENTENCE_2 }],
      label: role(UNCLE, 0, VCOMMIT.V08),
    },
  ],
  captions: [cap(0, 88, ["소매업자의 수령 확인은", "별도로 진행돼요"])],
  chips: [chip(VCOMMIT.V08, "09:38", "7개 전달을 기록했어요", { to: ledgerTarget("전달", W, H) })],
  // the dialog dismisses on 48 (the chip pops on 47, over the lifted device's faded top)
  nudges: [lift(-1, 48, liftFor(1.3, 94, CTA_Y)), { at: 48, until: VCOMMIT.V08 + LEAVE, dy: CHIP_NUDGE }],
};

// V09 · 06 수령: 08 수령 확인 CTA 5.68 → page 5.867 (local 8) · 7장 수령 확인 8.90 → detail 9.30 (local 47)
// Round 6: both CTA taps are framed at 1.3x by a lift (tilt down) that starts and ends on page changes;
// no 1.0x frame. The receipt page holds 1.35x on "이번에 받은 7장이 맞나요?", the detail 1.3x.
const V09: DemoSpec = {
  phones: [
    {
      name: "retailer",
      place: P.SINGLE,
      subs: [
        { from: 0, dur: 30, clip: "08-receipt", src: 5.6 },
        { from: 30, dur: 60, clip: "08-receipt", src: 8.75 },
      ],
      cam: CAM_13,
      cams: [
        { at: 8, dur: 0, to: { s: 1.35, x: 50, y: 34.5 } },
        { at: 30, dur: 0, to: CAM_13 },
        { at: VCOMMIT.V09, dur: 0, to: { s: 1.3, x: 50, y: 56 } },
      ],
      // cutAt: receipt page 8, detail after 7장 수령 확인 47
      ripples: [
        { at: 2, x: 50, y: 91, tone: "mint", cutAt: 8 },
        { at: 34, x: 50, y: 91, tone: "mint", cutAt: VCOMMIT.V09 },
      ],
      highlights: [
        { at: 14, until: 24, box: [4, 40.5, 96, 44] },
        { at: 58, until: 88, box: [8, 54, 40, 60] },
        { at: 58, until: 88, box: [52, 54, 92, 60] },
      ],
      label: role(RETAILER, 0, VCOMMIT.V09),
    },
  ],
  captions: [cap(0, 88, ["이번에 받은 7장이", "맞나요?"])],
  chips: [chip(VCOMMIT.V09, "09:38", "7개 수령을 확인했어요", { to: ledgerTarget("수령", W, H) })],
  nudges: [
    lift(-1, 8, liftFor(1.3, 94, CTA_Y)),
    lift(30, VCOMMIT.V09, liftFor(1.3, 94, CTA_Y)),
    { at: VCOMMIT.V09, until: VCOMMIT.V09 + LEAVE, dy: CHIP_NUDGE },
  ],
};

/** The 미송 answer (V06B) is master-only, so its record line is not in the social ribbon or highlights. */
const SOCIAL_CARDS = CHAT_CARDS.filter((c) => c.title !== "미송을 기다리기로 했어요");

// V11 · 07 기록: 09r thread with the 업무 기록 cards · live reply 12.20
const V11: DemoSpec = {
  phones: [
    {
      name: "retailer",
      place: P.SINGLE,
      subs: [
        { from: 0, dur: 33, clip: "09r-chat", src: 3.0 },
        { from: 33, dur: 57, clip: "09r-chat", src: 11.7 },
      ],
      // round 6: the match cut out of the record helix is 1.0x on frame 0, then one push to 1.25x (0-10) that
      // holds for both sub-shots; a 92 px lift keeps the last card and the reply (to 77.8 %) above y 1600
      cams: [{ at: 0, dur: 10, to: CAM_125 }],
      highlights: [
        ...SOCIAL_CARDS.map((c, i) => ({ at: 3 + i * 4, until: 27, box: [6, c.y0, 94, c.y1] as [number, number, number, number] })),
        { at: 52, until: 88, box: REPLY_BOX },
      ],
      label: role(RETAILER, 0, 90),
    },
  ],
  captions: [cap(0, 88, ["요청과 대화를", "이어가요"])],
  nudges: [lift(0, 999, liftFor(1.25, 77.8, 1579), 10)],
};

export const SOCIAL_SPECS = { V02, V03, V04, V06, V08, V09, V11 };

const TITLE_Y = [16.2, 25.6, 35.0, 46.6, 55.8, 74.8];
const HELIX_CARDS = CHAT_CARDS.map((c, i) => ({ ...c, ty: TITLE_Y[i] })).filter((c) => SOCIAL_CARDS.includes(CHAT_CARDS.find((k) => k.title === c.title)!));
/** V04 ends on the "남은 미송 3장" highlight (cam V04_CAM + top clamp + V04_LIFT): it seeds the V05 floor. */
const V04_RECT = (() => {
  const { w, h } = phoneDims(P.SINGLE.h);
  const { s, x: cx, y: cy } = V04_CAM;
  const dy = (topClampShift(P.SINGLE, V04_CAM, MIN_TOP)?.y ?? 0) - V04_LIFT;
  const x = (p: number) => P.SINGLE.cx + ((p - cx) / 100) * w * s;
  const y = (p: number) => P.SINGLE.cy + dy + ((p - cy) / 100) * h * s;
  return { x0: x(4), y0: y(79), x1: x(96), y1: y(83) };
})();

const socialHits = (): Hit[] => {
  const hits: Hit[] = [];
  // S00 bubble ticks, compressed like the build (converge at 40 instead of 52)
  [2, 7, 11, 16, 21, 24, 27, 30, 33].forEach((at) => hits.push({ at: Math.round((at * 40) / 52), src: SFX.click, volume: 0.12 }));
  hits.push({ at: 40, src: SFX.whoosh, volume: 0.4 });
  hits.push({ at: V.V01, src: SFX.whip, volume: 0.45 });
  hits.push({ at: V.V01 + 17, src: SFX.switch, volume: 0.5 });
  hits.push({ at: V.V03, src: SFX.whoosh, volume: 0.45 });
  hits.push({ at: V.V05, src: SFX.whip, volume: 0.35 });
  BLOCK_RISE.forEach(({ at }) => hits.push({ at: V.V05 + at + 7, src: SFX.click, volume: 0.1 }));
  hits.push({ at: V.V10, src: SFX.whoosh, volume: 0.5 });
  hits.push({ at: V.V12, src: SFX.whoosh, volume: 0.45 });
  hits.push({ at: V.V12 + 21, src: SFX.ding, volume: 0.32 });
  for (const [seg, spec] of Object.entries(SOCIAL_SPECS)) {
    const at0 = V[seg as keyof typeof V];
    for (const p of spec.phones) for (const r of p.ripples ?? []) hits.push({ at: at0 + r.at, src: SFX.click, volume: 0.25 });
    for (const c of spec.chips ?? []) hits.push({ at: at0 + c.at, src: SFX.switch, volume: 0.5 });
  }
  return hits;
};

/** 사입삼춘 promo v2, 9:16 social cut. */
export const Promo9x16: React.FC<PromoProps> = ({ hud, sfx }) => (
  <AbsoluteFill style={{ background: C.paper }}>
    <Sequence name="V00 problem" from={V.V00} durationInFrames={VD.V00}>
      <Problem converge={40} tScale={0.75} />
    </Sequence>
    <Sequence name="V01 wordmark" from={V.V01} durationInFrames={VD.V01}>
      <Wordmark stacked dur={VD.V01} />
    </Sequence>
    {/* round 5: V02 starts under the V01 bar wipe (as master S02), so the panel never wipes in empty */}
    <Sequence name="V02 요청" from={V.V02 - V02_LEAD} durationInFrames={VD.V02 + V02_LEAD} premountFor={30}>
      <WipeReveal at={V02_LEAD - 8} dur={8}>
        <DemoScene spec={{ ...V02, minTop: MIN_TOP }} lead={V02_LEAD} />
      </WipeReveal>
    </Sequence>
    <Sequence name="V03 transit" from={V.V03} durationInFrames={18} premountFor={30}>
      <RippleTransit
        portrait
        dur={18}
        from={P.SINGLE}
        a={{ cx: 540, cy: 1180, h: 900 }}
        b={P.SINGLE}
        toA={{ cx: 540, cy: 1180, h: 900, o: 0 }}
        toB={P.SINGLE}
        bClip={{ clip: "06-acquisition", src: 2.0 }}
      />
    </Sequence>
    <Sequence name="V03 수락" from={V.V03} durationInFrames={VD.V03} premountFor={30}>
      <DemoScene spec={{ ...V03, minTop: MIN_TOP }} />
    </Sequence>
    <Sequence name="V04 확보" from={V.V04} durationInFrames={VD.V04} premountFor={30}>
      <DemoScene spec={{ ...V04, minTop: MIN_TOP }} />
    </Sequence>
    <Sequence name="V05 grid" from={V.V05} durationInFrames={VD.V05}>
      <LedgerGrid dur={VD.V05} fromRect={V04_RECT} />
    </Sequence>
    <Sequence name="V06 미송" from={V.V06} durationInFrames={VD.V06} premountFor={30}>
      <DemoScene spec={{ ...V06, minTop: MIN_TOP }} />
    </Sequence>
    <Sequence name="V08 전달" from={V.V08} durationInFrames={VD.V08} premountFor={30}>
      <DemoScene spec={{ ...V08, minTop: MIN_TOP }} />
    </Sequence>
    <Sequence name="V09 수령" from={V.V09} durationInFrames={VD.V09} premountFor={30}>
      <DemoScene spec={{ ...V09, minTop: MIN_TOP }} />
    </Sequence>
    <Sequence name="V10 record" from={V.V10} durationInFrames={VD.V10} premountFor={30}>
      <RecordHelix phone={P.SINGLE} cards={HELIX_CARDS} dur={VD.V10} labelSize={32} ribbonW={640} pitch={150} twistPitch={210} echoSize={44} />
    </Sequence>
    <Sequence name="V11 기록" from={V.V11} durationInFrames={VD.V11} premountFor={30}>
      <DemoScene spec={{ ...V11, minTop: MIN_TOP }} />
    </Sequence>
    <Sequence name="V12 outro" from={V.V12} durationInFrames={VD.V12} premountFor={30}>
      <Outro phone={P.SINGLE} stackTagline dur={VD.V12} />
    </Sequence>
    {hud && <Hud spec={SOCIAL} />}
    {sfx && <Soundtrack bed="audio/bed-social.wav" hits={socialHits()} />}
  </AbsoluteFill>
);
