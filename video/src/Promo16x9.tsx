import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { z } from "zod";
import { C } from "./theme";
import { Hud } from "./components/Hud";
import { WipeReveal } from "./components/WipeReveal";
import { Hit, SFX, Soundtrack } from "./components/Soundtrack";
import { M, MASTER, MD, S00_CONVERGE, S00_TSCALE, S05_SWAP } from "./timeline";
import { L } from "./layout";
import { Problem, CONVERGE } from "./segments/Problem";
import { QuestionCard } from "./segments/QuestionCard";
import { Wordmark } from "./segments/Wordmark";
import { RippleTransit } from "./segments/RippleTransit";
import { BLOCK_RISE, LedgerGrid } from "./segments/LedgerGrid";
import { HandoffType } from "./segments/HandoffType";
import { RecordHelix } from "./segments/RecordHelix";
import { Outro } from "./segments/Outro";
import { CHAT_CARDS, MASTER_SPECS, Q6_LINES, S05_RECT, SegS02, SegS03, SegS04, SegS05, SegS06, SegS06B, SegS07, SegS08, SegS09 } from "./segments/MasterDemos";

export const promoSchema = z.object({
  hud: z.boolean(),
  sfx: z.boolean(),
});
export type PromoProps = z.infer<typeof promoSchema>;

const S02_LEAD = 6;

/** Chat card title positions (% of the screen) in 09r-chat @ 3.0, for the I5 match cut. */
const TITLE_Y = [16.2, 25.6, 35.0, 46.6, 55.8, 74.8];
const HELIX_CARDS = CHAT_CARDS.map((c, i) => ({ ...c, ty: TITLE_Y[i] }));

const masterHits = (): Hit[] => {
  const hits: Hit[] = [];
  // S00 bubble ticks, compressed like the build (authored for CONVERGE frames)
  [2, 7, 11, 16, 21, 24, 27, 30, 33].forEach((at) => hits.push({ at: Math.round((at * S00_CONVERGE) / CONVERGE), src: SFX.click, volume: 0.12 }));
  hits.push({ at: S00_CONVERGE, src: SFX.whoosh, volume: 0.4 });
  hits.push({ at: M.S01, src: SFX.whip, volume: 0.45 });
  hits.push({ at: M.S01 + 17, src: SFX.switch, volume: 0.5 });
  hits.push({ at: M.S01 + MD.S01 - 8, src: SFX.whip, volume: 0.35 });
  hits.push({ at: M.I1, src: SFX.whoosh, volume: 0.5 });
  hits.push({ at: M.I1 + 30, src: SFX.click, volume: 0.22 }); // the request docks on the uncle's row
  // S05: the field swaps to green on the 7th + (on the beat); I2 opens on the same field, then one
  // soft tick per block landing (1:1 choreography)
  hits.push({ at: M.S05 + S05_SWAP, src: SFX.whip, volume: 0.35 });
  BLOCK_RISE.forEach(({ at }) => hits.push({ at: M.I2 + at + 7, src: SFX.click, volume: 0.1 }));
  // Q6: the green question card, a field swap on the beat
  hits.push({ at: M.Q6, src: SFX.whip, volume: 0.35 });
  hits.push({ at: M.I3, src: SFX.whip, volume: 0.5 });
  hits.push({ at: M.I5, src: SFX.whoosh, volume: 0.5 });
  hits.push({ at: M.S10, src: SFX.whoosh, volume: 0.45 });
  hits.push({ at: M.S10 + 21, src: SFX.ding, volume: 0.32 });
  for (const [seg, spec] of Object.entries(MASTER_SPECS)) {
    const at0 = M[seg as keyof typeof M];
    for (const p of spec.phones) for (const r of p.ripples ?? []) hits.push({ at: at0 + r.at, src: SFX.click, volume: 0.25 });
    for (const c of spec.chips ?? []) hits.push({ at: at0 + c.at, src: SFX.switch, volume: 0.5 });
  }
  return hits;
};

/** 사입삼춘 promo v2, 16:9 master. Real app footage is the backbone; mograph only between demos. */
export const Promo16x9: React.FC<PromoProps> = ({ hud, sfx }) => (
  <AbsoluteFill style={{ background: C.paper }}>
    <Sequence name="S00 problem" from={M.S00} durationInFrames={MD.S00}>
      <Problem converge={S00_CONVERGE} tScale={S00_TSCALE} />
    </Sequence>
    <Sequence name="S01 wordmark" from={M.S01} durationInFrames={MD.S01}>
      <Wordmark dur={MD.S01} tagline="사입의 시작부터 수령까지" />
    </Sequence>
    {/* S02 starts 6 frames early, revealed only inside the S01 bar wipe (same edge as the off-white panel) */}
    <Sequence name="S02 연결" from={M.S02 - S02_LEAD} durationInFrames={MD.S02 + S02_LEAD} premountFor={30}>
      <WipeReveal at={S02_LEAD - 8} dur={8}>
        <SegS02 lead={S02_LEAD} />
      </WipeReveal>
    </Sequence>
    <Sequence name="S03 요청" from={M.S03} durationInFrames={MD.S03} premountFor={30}>
      <SegS03 />
    </Sequence>
    <Sequence name="I1 transit" from={M.I1} durationInFrames={MD.I1} premountFor={30}>
      <RippleTransit
        dur={MD.I1}
        from={L.SINGLE}
        a={{ cx: 576, cy: 590, h: 700 }}
        b={{ cx: 1344, cy: 590, h: 700 }}
        toA={L.TWO_L}
        toB={L.TWO_R}
        bClip={{ clip: "06-acquisition", src: 0.3 }}
      />
    </Sequence>
    <Sequence name="S04 수락" from={M.S04} durationInFrames={MD.S04} premountFor={30}>
      <SegS04 />
    </Sequence>
    <Sequence name="S05 확보" from={M.S05} durationInFrames={MD.S05} premountFor={30}>
      <SegS05 />
    </Sequence>
    <Sequence name="I2 ledger grid" from={M.I2} durationInFrames={MD.I2}>
      <LedgerGrid dur={MD.I2} fromRect={S05_RECT} />
    </Sequence>
    <Sequence name="S06 미송" from={M.S06} durationInFrames={MD.S06} premountFor={30}>
      <SegS06 />
    </Sequence>
    <Sequence name="Q6 question card" from={M.Q6} durationInFrames={MD.Q6}>
      <QuestionCard lines={Q6_LINES} />
    </Sequence>
    <Sequence name="S06B 미송 답변" from={M.S06B} durationInFrames={MD.S06B} premountFor={30}>
      <SegS06B />
    </Sequence>
    <Sequence name="I3 handoff" from={M.I3} durationInFrames={MD.I3}>
      <HandoffType dur={MD.I3} />
    </Sequence>
    <Sequence name="S07 전달" from={M.S07} durationInFrames={MD.S07} premountFor={30}>
      <SegS07 />
    </Sequence>
    <Sequence name="S08 수령" from={M.S08} durationInFrames={MD.S08} premountFor={30}>
      <SegS08 />
    </Sequence>
    <Sequence name="I5 record" from={M.I5} durationInFrames={MD.I5} premountFor={30}>
      <RecordHelix phone={L.SINGLE} cards={HELIX_CARDS} dur={MD.I5} />
    </Sequence>
    <Sequence name="S09 기록" from={M.S09} durationInFrames={MD.S09} premountFor={30}>
      <SegS09 />
    </Sequence>
    <Sequence name="S10 outro" from={M.S10} durationInFrames={MD.S10} premountFor={30}>
      <Outro phone={{ ...L.SINGLE }} dur={MD.S10} />
    </Sequence>
    {hud && <Hud spec={MASTER} />}
    {sfx && <Soundtrack bed="audio/bed-master.wav" hits={masterHits()} />}
  </AbsoluteFill>
);
