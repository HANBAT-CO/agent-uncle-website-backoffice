import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { ease, prog } from "../theme";

/**
 * Clips its children to the left-to-right bar wipe [at, at+dur] (local frames, inOut), then shows them whole.
 * Used to start a demo under the Wordmark's off-white panel wipe (master S02, social V02), so the
 * panel never wipes in over an empty field.
 */
export const WipeReveal: React.FC<{ at: number; dur: number; children: React.ReactNode }> = ({ at, dur, children }) => {
  const f = useCurrentFrame();
  const { width } = useVideoConfig();
  const p = prog(f, at, dur, ease.inOut);
  return <AbsoluteFill style={{ clipPath: p < 1 ? `inset(0 ${width * (1 - p)}px 0 0)` : undefined }}>{children}</AbsoluteFill>;
};
