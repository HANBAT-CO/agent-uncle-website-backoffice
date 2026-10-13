import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT, ease, lerp, mix, prog, rand } from "../theme";
import { GlyphWord, G_TOP, layoutText } from "../components/Glyphs";
import { Disc } from "../components/Disc";
import { Phone, Place } from "../components/Phone";
import { FootageTrack } from "../components/Footage";
import { GLYPHS } from "../generated/glyphs";

const TRACK = -10;
const TAGLINE = "사입 요청부터 상품 수령까지 함께 기록해요"; // official one-liner (round 4: no terminal period; the only full stop is the dot)
const PERIOD = GLYPHS.black.glyphs["."].contours[0].box;
const LOGO_RATIO = 415 / 254;
const OUTRO_AT = 8;

/**
 * S10 · Bridge + outro. The last phone collapses into the green dot while radial speed lines
 * converge; "사입삼춘" pops and the dot lands as its full stop. Then the one-liner types on.
 * The hold after the tagline is ~1.5-2 s and stays alive: the full stop breathes (the record is
 * live) while the block drifts 2 % closer. The last frame is a clean poster.
 */
export const Outro: React.FC<{ phone: Place; stackTagline?: boolean; dur?: number }> = ({ phone, stackTagline = false, dur = 120 }) => {
  const f = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  const portrait = H > W;
  const u = Math.min(W, H) / 1080;
  const o = f - OUTRO_AT;

  // ---- bridge: phone -> dot, speed lines
  const shrink = prog(f, 0, 9, ease.in);
  const bridgePlace: Place = { cx: mix(phone.cx, W / 2, shrink), cy: mix(phone.cy, H / 2, shrink), h: mix(phone.h, 40 * u, shrink), o: 1 - prog(f, 6, 3) };
  const R = Math.hypot(W, H) / 2;
  const lines = Array.from({ length: 28 }, (_, i) => {
    const a = (i / 28) * Math.PI * 2 + rand(i) * 0.14;
    const head = lerp(f, [0, 12], [R * (1.05 + rand(i + 5) * 0.2), R * (0.1 + rand(i + 9) * 0.1)], ease.out);
    const len = R * (0.18 + rand(i + 13) * 0.16) * lerp(f, [0, 5, 14], [0.2, 1, 0]);
    return { a, r0: head, r1: head + len };
  });

  // ---- wordmark
  const word = "사입삼춘.";
  const { items, width: units } = layoutText(word, "black", TRACK);
  // 9:16: ~770 px wide (incl. the 2 % drift), so the full stop stays clear of the right-rail platform buttons (x <= 940)
  const k = Math.min((W * (portrait ? 0.71 : 0.58)) / units, H * 0.00036);
  const size = k * 900;
  const wordW = units * k;
  const wordH = 870 * k;
  const subSize = (portrait ? 40 : 38) * u;
  const logoH = (portrait ? 64 : 58) * u;
  const logoW = logoH * LOGO_RATIO;
  const ruleGap = 64 * k;
  const tagLines = stackTagline ? ["사입 요청부터 상품 수령까지", "함께 기록해요"] : [TAGLINE];
  // full block height, incl. the AGENT UNCLE line, so the block's centre sits at the optical centre
  const agentH = (portrait ? 28 : 22) * u + 15 * u * 1.2;
  const blockH = wordH + ruleGap + 2 + 34 * u + subSize * 1.35 * tagLines.length + (portrait ? logoH + 40 * u : 0) + agentH;
  const left = (W - wordW) / 2;
  const top = (H - blockH) / 2 + (portrait ? 0.01 * H : 0);
  const pi = items.length - 1;
  const pX = left + (items[pi].x + (PERIOD[0] + PERIOD[2]) / 2) * k;
  const pY = top + ((PERIOD[1] + PERIOD[3]) / 2 - G_TOP) * k;
  const pD = 236 * k;
  const fly = prog(o, 0, 13, ease.inOut);
  const arc = Math.sin(fly * Math.PI) * -H * 0.16;
  const dX = mix(W / 2, pX, fly);
  const dY = mix(H / 2, pY, fly) + arc;
  const dD = mix(30 * u, pD, fly);
  const land = lerp(o, [12.5, 13.5, 23], [0, 1, 0], ease.snap);
  const breathe = lerp(o, [20, dur - OUTRO_AT], [1, 1.02], ease.out);
  // the full stop breathes once it has settled (two slow pulses over the hold)
  // (the period is fitted so the last frame, the poster, is back at rest)
  const breathPeriod = Math.max(20, (dur - 1 - OUTRO_AT - 28) / 2);
  const dotBreath = o > 28 ? 1 + 0.07 * Math.sin((Math.PI * (o - 28)) / breathPeriod) ** 2 : 1;
  const rule = prog(o, 19, 14, ease.out);
  const allChars = tagLines.join("\n");
  const typed = Math.floor(lerp(o, [17, 41], [0, [...allChars].length]));
  const brand = prog(o, 33, 12, ease.out);
  const agent = prog(o, 45, 10, ease.out);

  let shown = typed;
  const typedLines = tagLines.map((l) => {
    const c = [...l];
    const n = Math.max(0, Math.min(c.length, shown));
    shown -= c.length + 1;
    return c.slice(0, n).join("");
  });

  return (
    <AbsoluteFill style={{ background: C.paper, overflow: "hidden" }}>
      {f < 15 && (
        <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
          {lines.map((l, i) => (
            <line
              key={i}
              x1={W / 2 + Math.cos(l.a) * l.r0}
              y1={H / 2 + Math.sin(l.a) * l.r0}
              x2={W / 2 + Math.cos(l.a) * l.r1}
              y2={H / 2 + Math.sin(l.a) * l.r1}
              stroke={C.ink}
              strokeWidth={3 * u}
              strokeLinecap="round"
            />
          ))}
        </svg>
      )}
      {f < 9 && (
        <Phone place={bridgePlace}>
          <FootageTrack subs={[{ from: 0, dur: 10, clip: "09r-chat", src: 13.2, freeze: true }]} offset={0} />
        </Phone>
      )}
      <AbsoluteFill style={{ scale: breathe, transformOrigin: "50% 50%" }}>
        {o >= 0 && (
          <div style={{ position: "absolute", left, top }}>
            <GlyphWord
              text={word}
              size={size}
              color={C.ink}
              tracking={TRACK}
              hide={(ci) => ci === pi}
              glyphStyle={(i) => {
                const p = prog(o, 1 + i * 2.2, 9, ease.overshoot);
                return { scale: `${0.6 + 0.4 * p} ${p}`, transformOrigin: "50% 100%", opacity: p > 0 ? 1 : 0 };
              }}
            />
          </div>
        )}
        <div style={{ position: "absolute", left, top: top + wordH + ruleGap, width: wordW }}>
          <div style={{ height: Math.max(2, 2 * u), background: C.ink, scale: `${rule} 1`, transformOrigin: "0 50%" }} />
          <div
            style={{
              marginTop: 34 * u,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              fontFamily: FONT,
              fontWeight: 600,
              fontSize: subSize,
              color: C.grey800,
              whiteSpace: "nowrap",
            }}
          >
            <div>
              {typedLines.map((l, i) => (
                <div key={i} style={{ lineHeight: 1.35, minHeight: subSize * 1.35 }}>
                  {l}
                </div>
              ))}
            </div>
            {!portrait && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 * u }}>
                <div style={{ width: logoW, height: logoH, clipPath: `inset(0 ${(1 - brand) * 100}% 0 0)` }}>
                  <Img src={staticFile("brand/saip_samchun_sc_symbol.svg")} style={{ width: "100%", height: "100%" }} />
                </div>
              </div>
            )}
          </div>
          {portrait && (
            <div style={{ marginTop: 40 * u, width: logoW, height: logoH, clipPath: `inset(0 ${(1 - brand) * 100}% 0 0)` }}>
              <Img src={staticFile("brand/saip_samchun_sc_symbol.svg")} style={{ width: "100%", height: "100%" }} />
            </div>
          )}
          <div
            style={{
              marginTop: (portrait ? 28 : 22) * u,
              fontFamily: FONT,
              fontWeight: 600,
              fontSize: 15 * u,
              letterSpacing: "0.32em",
              color: C.grey600,
              opacity: agent,
            }}
          >
            AGENT UNCLE
          </div>
        </div>
        {f >= 6 && (
          <Disc
            x={o < 0 ? W / 2 : dX}
            y={o < 0 ? H / 2 : dY}
            d={o < 0 ? lerp(f, [6, 8], [10 * u, 30 * u]) : dD * dotBreath}
            scaleX={1 + land * 0.3}
            scaleY={1 - land * 0.3}
            origin="bottom"
            color={C.green}
          />
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
