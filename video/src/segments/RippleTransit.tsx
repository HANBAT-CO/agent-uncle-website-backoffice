import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT, ease, lerp, mix, prog } from "../theme";
import { Phone, Place, phoneDims } from "../components/Phone";
import { ClipId, FootageTrack } from "../components/Footage";
import { placeAt } from "../components/Stage";
import { Disc } from "../components/Disc";

type Ring = { r: number; w: number; color: string };
/** v1 Tunnel ring definitions, flattened to 2D and recoloured to the green family. */
const RING_SET: Ring[] = [
  { r: 1.0, w: 10, color: C.paper },
  { r: 0.86, w: 3, color: C.mint },
  { r: 0.72, w: 6, color: C.greenMid },
  { r: 0.58, w: 14, color: C.greenDeep },
];

const Still: React.FC<{ src: string }> = ({ src }) => (
  <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
);

/**
 * I1 · The request in transit. On the beat the field cuts to deep green; flat concentric
 * rings ripple out of the retailer's phone and the mint dot (the record) leaves it carrying
 * "새 사입 요청을 보냈어요" in a deep-green pill. The label only lives in the gap between the
 * phones (it never crosses a screen); the dot alone docks into the uncle's 업무 list on the row
 * of the new request, which is the row S04 taps next. An iris returns the field to off-white.
 * `bClip` is the frozen footage the arriving phone shows (it must equal the next demo's first frame).
 */
export const RippleTransit: React.FC<{
  from: Place;
  a: Place;
  b: Place;
  toA: Place;
  toB: Place;
  portrait?: boolean;
  dur?: number;
  bClip: { clip: ClipId; src: number };
  /** dock point inside phone B, in % of its screen (landscape) */
  dock?: { x: number; y: number };
}> = ({ from, a, b, toA, toB, portrait = false, dur = 45, bClip, dock = { x: 37, y: 73.5 } }) => {
  // choreography is authored for 45 frames and time-scaled to `dur`
  const f = (useCurrentFrame() * 45) / dur;
  const { width: W, height: H } = useVideoConfig();
  const u = Math.min(W, H) / 1080;
  const end = 45;
  const pa = placeAt(f, from, [
    { at: 0, dur: 8, to: a, ease: "inOut" },
    { at: end - 10, dur: 10, to: toA, ease: "inOut" },
  ]);
  const pbIn = placeAt(f, { ...b, cx: portrait ? b.cx : W + 400, cy: portrait ? H + 1200 : b.cy }, portrait
    ? [
        { at: 26, dur: 9, to: b, ease: "overshoot" },
        { at: end - 10, dur: 10, to: toB, ease: "inOut" },
      ]
    : [
        { at: 12, dur: 10, to: b, ease: "overshoot" },
        { at: end - 10, dur: 10, to: toB, ease: "inOut" },
      ]);
  const A = phoneDims(a.h);
  const B = phoneDims(b.h);
  const aRight = a.cx + A.devW / 2;
  const bLeft = b.cx - B.devW / 2;
  // dot path. Landscape: out of A's right edge, arcing over the gap, docking on the request row in B.
  // Portrait: the request rises out of A.
  const p0 = portrait ? { x: a.cx, y: a.cy - A.devH / 2 - 40 * u } : { x: aRight + 18 * u, y: a.cy - 70 * u };
  const p2 = portrait
    ? { x: a.cx, y: H * 0.2 }
    : { x: b.cx - B.w / 2 + (dock.x / 100) * B.w, y: b.cy - B.h / 2 + (dock.y / 100) * B.h };
  const p1 = portrait ? { x: a.cx, y: (p0.y + p2.y) / 2 } : { x: (aRight + bLeft) / 2, y: a.cy - 300 * u };
  const travel = prog(f, 8, 22, ease.inOut);
  const q = (t: number) => ({
    x: (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x,
    y: (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y,
  });
  const dot = q(travel);
  const moving = travel > 0 && travel < 1;
  const dotIn = prog(f, 1, 6, ease.overshoot);
  // landscape: the dot lands on the row (squash), rings once, then sinks into the screen
  const landed = !portrait && travel >= 1;
  // the hero-dot colour rule: mint over the green field, green once it is over B's light screen
  const overB = !portrait && dot.x > b.cx - B.w / 2 && dot.y > b.cy - B.h / 2;
  const squash = landed ? lerp(f, [30, 31, 35], [0, 1, 0], ease.snap) : 0;
  const dotGone = portrait ? prog(f, 32, 4, ease.in) : prog(f, 33, 4, ease.in);
  const dockRing = portrait ? 0 : prog(f, 30, 10, ease.out);
  // ring bursts: out of A every half beat, then converging into B
  const R = Math.hypot(W, H) * 0.42;
  const bursts: { cx: number; cy: number; p: number; inward: boolean }[] = [];
  for (let k = 0; k < 4; k++) bursts.push({ cx: a.cx, cy: a.cy, p: prog(f, 6 + k * 7.5, 18, ease.out), inward: false });
  for (let k = 0; k < 2; k++) bursts.push({ cx: b.cx, cy: b.cy, p: prog(f, 24 + k * 6, 12, ease.in), inward: true });
  const iris = prog(f, end - 10, 10, ease.in);
  const irisR = iris * Math.hypot(W, H) * 1.05;
  // the label rides above the dot but is clamped to the gap and fades before the dot reaches B
  const labelSize = (portrait ? 34 : 28) * u;
  const labelW = 360 * u;
  const label = prog(f, 9, 8, ease.out) * (portrait ? 1 - prog(f, 30, 5, ease.in) : 1 - prog(travel, 0.5, 0.14, ease.in));
  const labelCx = portrait ? dot.x : Math.min(Math.max(dot.x, aRight + 16 * u + labelW / 2), bLeft - 16 * u - labelW / 2);
  const labelTop = dot.y - (portrait ? 108 : 86) * u;
  return (
    <AbsoluteFill style={{ background: C.green, overflow: "hidden" }}>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        {bursts.map((bu, i) =>
          bu.p > 0 && bu.p < 1
            ? RING_SET.map((ring, j) => {
                const sc = bu.inward ? 1 - bu.p : bu.p;
                const r = Math.max(1, ring.r * R * (0.18 + sc * 1.1));
                const o = bu.inward ? Math.min(1, bu.p * 3) : 1 - bu.p * 0.85;
                return <circle key={`${i}-${j}`} cx={bu.cx} cy={bu.cy} r={r} fill="none" stroke={ring.color} strokeWidth={ring.w * u * (0.6 + sc)} opacity={o} />;
              })
            : null,
        )}
      </svg>
      {irisR > 0 && <Disc x={b.cx} y={b.cy} d={irisR * 2} color={C.paper} />}
      <Phone place={pa}>
        <Still src="app/still/retailer-sent.jpg" />
      </Phone>
      <Phone place={pbIn}>
        <FootageTrack subs={[{ from: 0, dur: 9999, clip: bClip.clip, src: bClip.src, freeze: true }]} offset={0} />
      </Phone>
      {dockRing > 0 && dockRing < 1 && (
        <svg width={W} height={H} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <circle cx={p2.x} cy={p2.y} r={(14 + 70 * dockRing) * u} fill="none" stroke={C.green} strokeWidth={(5 - 4 * dockRing) * u} opacity={1 - dockRing} />
        </svg>
      )}
      {label > 0 && (
        <div
          style={{
            position: "absolute",
            left: labelCx - labelW / 2,
            width: labelW,
            top: labelTop,
            display: "flex",
            justifyContent: "center",
            opacity: label,
            translate: `0 ${(1 - Math.min(1, label * 1.4)) * 10 * u}px`,
          }}
        >
          <div
            style={{
              background: C.greenDeep,
              borderRadius: 999,
              padding: `${10 * u}px ${20 * u}px`,
              fontFamily: FONT,
              fontWeight: 600,
              fontSize: labelSize,
              lineHeight: 1.2,
              color: C.mint,
              whiteSpace: "nowrap",
            }}
          >
            새 사입 요청을 보냈어요
          </div>
        </div>
      )}
      {dotGone < 1 && (
        <Disc
          x={dot.x}
          y={dot.y}
          d={26 * u * dotIn * (1 - dotGone)}
          color={landed || overB ? C.green : C.mint}
          scaleX={moving ? 1.3 : 1 + squash * 0.3}
          scaleY={moving ? 0.82 : 1 - squash * 0.3}
        />
      )}
    </AbsoluteFill>
  );
};

export const lerpPlace = (p: Place, q: Place, t: number): Place => ({
  cx: mix(p.cx, q.cx, t),
  cy: mix(p.cy, q.cy, t),
  h: mix(p.h, q.h, t),
  o: lerp(t, [0, 1], [p.o ?? 1, q.o ?? 1]),
});
