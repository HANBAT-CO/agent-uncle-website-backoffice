import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { C } from "../theme";
import { Caption, KineticSwap } from "./Caption";
import { ChipSpec, RecordChip } from "./RecordChip";
import { HudSafe, Nudge, PhoneStage, PhoneTrack } from "./Stage";

export type CaptionSpec = {
  from: number;
  to: number;
  lines: string[];
  x: number;
  y: number;
  size?: number;
  weight?: number;
  color?: string;
  stagger?: number;
  align?: "left" | "center";
};

export type KineticSpec = {
  from: number;
  to: number;
  x: number;
  y: number;
  items: { at: number; label: string; value: string; size?: number }[];
  valueSize?: number;
  valueWeight?: number;
  labelSize?: number;
};

export type DemoSpec = {
  field?: string;
  /**
   * Round 4: the field turns to `color` on frame `at` (a hard swap on the beat); captions and kinetic
   * values re-ink for the dark field (paper / mint), chips get the dark shadow.
   */
  fieldSwap?: { at: number; color: string };
  /** 9:16: punch-ins never lift the device top above this y (the device grows downward instead) */
  minTop?: number;
  /** keep punch-ins clear of the HUD ledger (16:9 default: x <= 1490 below y 950) */
  hudSafe?: HudSafe | null;
  phones: PhoneTrack[];
  /**
   * 9:16 (round 4): the device steps down `dy` px while an 업무 기록 chip is docked above it
   * ([at, until], 8-frame inOut each way), so the chip sits between the caption and the device.
   */
  nudges?: Nudge[];
  captions?: CaptionSpec[];
  kinetic?: KineticSpec[];
  chips?: ChipSpec[];
};

/**
 * DemoSegment: real footage in phone frame(s) with punch-ins, highlight frames, tap ripples,
 * captions, kinetic values and 업무 기록 chips. All frames in the spec are local to the segment.
 * `under` / `over` render custom graphics (e.g. the S02 link line) below / above the phones.
 */
export const DemoScene: React.FC<{
  spec: DemoSpec;
  under?: (f: number) => React.ReactNode;
  over?: (f: number) => React.ReactNode;
  /** the Sequence starts this many frames before the segment (local frame 0), e.g. under a wipe */
  lead?: number;
}> = ({ spec, under, over, lead = 0 }) => {
  const f = useCurrentFrame() - lead;
  const { width, height } = useVideoConfig();
  // with a lead-in, each phone's first sub-shot is pre-rolled (earlier source in-point), so the screens are live under the wipe
  const phones = spec.phones.map((p) => ({
    ...p,
    subs: p.subs.map((s) => (s.from === 0 ? { ...s, from: -lead, dur: s.dur + lead, src: Math.max(0, s.src - (lead * (s.rate ?? 1)) / 30) } : s)),
  }));
  const hudSafe = spec.hudSafe === null ? undefined : (spec.hudSafe ?? (width > height ? { x: 1490, y: 950 } : undefined));
  const dark = !!spec.fieldSwap && f >= spec.fieldSwap.at;
  return (
    <AbsoluteFill style={{ background: dark ? spec.fieldSwap!.color : (spec.field ?? C.paper), overflow: "hidden" }}>
      {under?.(f)}
      <PhoneStage f={f} offset={-lead} phones={lead > 0 ? phones : spec.phones} hudSafe={hudSafe} minTop={spec.minTop} nudge={spec.nudges} />
      {spec.captions?.map((c, i) => (
        <Caption key={`c${i}`} f={f} {...c} color={dark ? C.paper : c.color} />
      ))}
      {spec.kinetic?.map((k, i) => (
        <KineticSwap key={`k${i}`} f={f} {...k} color={dark ? C.mint : undefined} labelColor={dark ? C.tint2 : undefined} />
      ))}
      {spec.chips?.map((c, i) => (
        <RecordChip key={`chip${i}`} f={f} chip={c} dark={dark} />
      ))}
      {over?.(f)}
    </AbsoluteFill>
  );
};
