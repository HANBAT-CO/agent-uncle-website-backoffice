import React from "react";
import { C } from "../theme";

/**
 * The hero dot: one flat round dot, #0C483E on light fields and mint on green fields.
 * It is the converged chaos (S00), the ㅇ of 입 (S01), the link (S02), the request in transit (I1),
 * the record chips' collapse target, the "·" handoff (I3), the swarm nucleus (I5) and the full stop (S10).
 */
export const Disc: React.FC<{
  x: number;
  y: number;
  d: number;
  color?: string;
  scaleX?: number;
  scaleY?: number;
  origin?: "center" | "bottom";
  opacity?: number;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ x, y, d, color = C.green, scaleX = 1, scaleY = 1, origin = "center", opacity = 1, children, style }) => (
  <div
    style={{
      position: "absolute",
      left: x - d / 2,
      top: y - d / 2,
      width: d,
      height: d,
      borderRadius: "50%",
      background: color,
      scale: `${scaleX} ${scaleY}`,
      transformOrigin: origin === "bottom" ? "50% 100%" : "50% 50%",
      opacity,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      ...style,
    }}
  >
    {children}
  </div>
);
