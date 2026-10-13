import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT, ease, lerp, prog } from "../theme";
import { GlyphWord, G_TOP, layoutText } from "../components/Glyphs";
import { Disc } from "../components/Disc";
import { GLYPHS } from "../generated/glyphs";

const TRACK = -10;
// ㅇ of 입 in Paperlogy Black: contours #1 (outer) and #2 (counter).
const IEUNG = GLYPHS.black.glyphs["입"].contours[1].box;
const IEUNG_CX = (IEUNG[0] + IEUNG[2]) / 2;
const IEUNG_CY = (IEUNG[1] + IEUNG[3]) / 2;
const DISC_UNITS = 452;

/**
 * S01 · Wordmark. The converged dot (one record) swells into the deep-green field,
 * "사입삼춘" pops, and a mint dot drops into the ㅇ of 입: the record is the heart of the name.
 * With `tagline` (master), a rule draws and the app's own line "사입의 시작부터 수령까지"
 * (login heading) reveals under the name, so the title says what the app is.
 * Then the wordmark lifts away and an off-white panel wipes in for the demo.
 */
export const Wordmark: React.FC<{ stacked?: boolean; dur?: number; tagline?: string }> = ({ stacked = false, dur = 45, tagline }) => {
  const f = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  const u = Math.min(W, H) / 1080;
  const lines = stacked ? ["사입", "삼춘"] : ["사입삼춘"];
  const lay = lines.map((l) => layoutText(l, "black", TRACK));
  const maxUnits = Math.max(...lay.map((l) => l.width));
  const k = Math.min(stacked ? H * 0.00026 : H * 0.00034, (W * (stacked ? 0.78 : 0.62)) / maxUnits);
  const lineH = 870 * k;
  const blockW = maxUnits * k;
  const tagSize = 46 * u;
  const tagGap = 44 * u;
  const blockH = lineH * lines.length + (tagline ? tagGap + 3 * u + 28 * u + tagSize * 1.3 : 0);
  const left = (W - blockW) / 2;
  const top = (H - blockH) / 2;
  // the rule and the tagline start as the dot lands (f17), so the line reads for ~1 s before the wipe
  const rule = prog(f, 16, 12, ease.out);
  const tagIn = prog(f, 18, 12, ease.out);

  // the ㅇ slot of 입 (first line, second glyph)
  const slotX = left + (lay[0].items[1].x + IEUNG_CX) * k;
  const slotY = top + (IEUNG_CY - G_TOP) * k;
  const d = DISC_UNITS * k;

  // f0-5: the green dot from S00 swells past the camera
  const swell = prog(f, 0, 6, ease.in);
  const swellD = lerp(swell, [0, 1], [160 * u, Math.hypot(W, H) * 1.15]);

  // mint dot drop: lands at f17, squash, settles by f23
  const fall = prog(f, 9, 8, ease.inQuad);
  const dropY = lerp(fall, [0, 1], [-slotY - d, 0]);
  const landed = f >= 17;
  const squash = lerp(f, [17, 18, 23], [0, 1, 0], ease.snap);
  const sy = landed ? 1 - 0.2 * squash : 1 + 0.45 * fall;
  const sx = landed ? 1 + 0.25 * squash : 1 - 0.15 * fall;
  const jolt = lerp(f, [17, 19, 24], [0, -18 * u, 0], ease.out);

  const exit = prog(f, dur - 8, 8, ease.in);
  const wipe = prog(f, dur - 8, 8, ease.inOut);

  return (
    <AbsoluteFill style={{ background: swell >= 1 ? C.green : C.paper, overflow: "hidden" }}>
      {swell < 1 && <Disc x={W / 2} y={H / 2} d={swellD} color={C.green} />}
      <AbsoluteFill style={{ translate: `0 ${-exit * H * 0.6}px`, opacity: 1 - exit * 0.4 }}>
        {lines.map((line, li) => (
          <div key={li} style={{ position: "absolute", left: left + (blockW - lay[li].width * k) / 2 * (stacked ? 0 : 1), top: top + li * lineH }}>
            <GlyphWord
              text={line}
              size={k * 900}
              color={C.paper}
              tracking={TRACK}
              hide={li === 0 ? (ci, cn) => ci === 1 && (cn === 1 || cn === 2) : undefined}
              glyphStyle={(i) => {
                const idx = li * 2 + i;
                const p = prog(f, 5 + idx * 3, 8, ease.overshoot);
                return {
                  scale: `${0.5 + 0.5 * p} ${p}`,
                  transformOrigin: "50% 100%",
                  opacity: p > 0 ? 1 : 0,
                  translate: li === 0 && i === 1 ? `0 ${jolt}px` : undefined,
                };
              }}
            />
          </div>
        ))}
        {/* ghost frames of the falling dot */}
        {!landed &&
          f >= 9 &&
          [2, 1].map((g) => {
            const gp = prog(f - g, 9, 8, ease.inQuad);
            return <Disc key={g} x={slotX} y={slotY + lerp(gp, [0, 1], [-slotY - d, 0])} d={d} color={C.mint} opacity={0.16 * (3 - g)} scaleX={sx} scaleY={sy} />;
          })}
        {f >= 9 && <Disc x={slotX} y={slotY + dropY} d={d} color={C.mint} scaleX={sx} scaleY={sy} origin="bottom" />}
        {tagline && (
          <div style={{ position: "absolute", left, top: top + lineH * lines.length + tagGap, width: blockW }}>
            <div style={{ height: Math.max(2, 3 * u), background: C.mint, opacity: 0.8, scale: `${rule} 1`, transformOrigin: "0 50%" }} />
            <div style={{ marginTop: 28 * u, height: tagSize * 1.3, overflow: "hidden" }}>
              <div
                style={{
                  translate: `0 ${(1 - tagIn) * 105}%`,
                  fontFamily: FONT,
                  fontWeight: 600,
                  fontSize: tagSize,
                  lineHeight: 1.3,
                  letterSpacing: "-0.01em",
                  color: C.paper,
                  opacity: 0.85,
                  whiteSpace: "nowrap",
                }}
              >
                {tagline}
              </div>
            </div>
          </div>
        )}
      </AbsoluteFill>
      {/* deep green -> off-white panel wipe (left to right) reveals the demo */}
      {wipe > 0 && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: W * wipe, background: C.paper }} />}
    </AbsoluteFill>
  );
};
