import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, ease, lerp, prog } from "../theme";
import { Caption } from "../components/Caption";
import { L } from "../layout";

/**
 * Q6 · The question card (15 frames, deep green): the app's own question to the retailer,
 * "남은 미송 3장을 / 어떻게 할까요?", set exactly where S06B's caption sits, so the cut into S06B is a
 * pure field swap on the beat while the words stay put. Under it, the 3 dashed hollow slots of the I2
 * grid (the 3 장 still open) pop in and pulse once: the question is about these three.
 */
export const QuestionCard: React.FC<{ lines: string[] }> = ({ lines }) => {
  const f = useCurrentFrame();
  const size = 66;
  const gap = 22;
  const top = L.subY + 14;
  return (
    <AbsoluteFill style={{ background: C.green, overflow: "hidden" }}>
      {/* the reveal is pre-rolled 5 frames, so the cut frame already carries the words */}
      <Caption f={f} from={-5} to={999} lines={lines} x={L.capX} y={L.capY} size={L.capSize} color={C.paper} />
      {[0, 1, 2].map((i) => {
        const pop = prog(f, -1 + i * 2, 7, ease.overshoot);
        const pulse = 1 + 0.08 * lerp(f, [10, 12, 15], [0, 1, 0], ease.out);
        if (pop <= 0) return null;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: L.capX + i * (size + gap),
              top,
              width: size,
              height: size,
              boxSizing: "border-box",
              borderRadius: 14,
              border: `4px dashed ${C.mint}`,
              background: "#145E50",
              scale: `${pop * pulse}`,
              opacity: Math.min(1, pop * 1.5),
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
