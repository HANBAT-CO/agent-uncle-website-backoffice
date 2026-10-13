import React from "react";
import { Sequence, staticFile } from "remotion";
import { Audio } from "@remotion/media";

export type Hit = { at: number; src: string; volume: number };

/** Percussion bed (scripts/make-bed.sh, 120 bpm on the 15-frame grid) + sparse accents. */
export const Soundtrack: React.FC<{ bed: string; hits: Hit[] }> = ({ bed, hits }) => (
  <>
    <Audio src={staticFile(bed)} volume={0.8} />
    {hits.map((h, i) => (
      <Sequence key={i} from={Math.round(h.at)} durationInFrames={45} name={`sfx ${h.src}`}>
        <Audio src={staticFile(h.src)} volume={h.volume} />
      </Sequence>
    ))}
  </>
);

export const SFX = {
  click: "sfx/mouse-click.wav",
  switch: "sfx/switch.wav",
  whoosh: "sfx/whoosh.wav",
  whip: "sfx/whip.wav",
  ding: "sfx/ding.wav",
  page: "sfx/page-turn.wav",
};
