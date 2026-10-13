import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT, lerp, ease, prog } from "../theme";
import { FilmSpec, FieldWipe, LEDGER_KEYS, LedgerKey, chapterAt, lightInkAt, wipeAt } from "../timeline";

const pad2 = (n: number) => String(Math.floor(n)).padStart(2, "0");

/** Paperlogy metrics (em): Hangul advance 0.88, digits are tabular at 0.667. */
const HANGUL_EM = 0.88;
const DIGIT_EM = 0.667;
const LABEL_TRACK = 0.16;

/**
 * HUD geometry, shared with the record chips that fly into the ledger counters.
 * Ledger items read "요청 10 · 확보 7 · 전달 0 · 수령 0". Each value sits 9 px after its own label in a
 * tabular slot exactly as wide as the digits it shows *now* (round 3: no reserved blank after a
 * single digit), and every "·" is centred in the gap. The row is anchored at the right margin, so
 * only 요청 (the leftmost item) moves when its count gains a digit, and the chip targets never move.
 * `digits` may be fractional while a slot widens (6-frame ease after the tick).
 */
export const hudGeom = (W: number, H: number, digits: Partial<Record<LedgerKey, number>> = {}) => {
  const u = Math.min(W, H) / 1080;
  const portrait = H > W;
  const sx = (portrait ? 56 : 64) * u;
  const size = 15 * u;
  const ls = size * 0.92; // ledger font size
  const labelInk = (2 * HANGUL_EM + LABEL_TRACK) * ls; // 2 syllables, tracking between them
  const gap = 9 * u;
  const sep = 26 * u;
  const items = LEDGER_KEYS.map((k) => ({ k, valueW: (digits[k] ?? 1) * DIGIT_EM * ls }));
  const ledgerW = items.reduce((a, it) => a + labelInk + gap + it.valueW, 0) + sep * (items.length - 1);
  const ledgerX = W - sx - ledgerW;
  let x = ledgerX;
  const slots = items.map((it, i) => {
    const slot = { k: it.k, labelX: x, valueX: x + labelInk + gap, valueW: it.valueW, sepX: 0 };
    x = slot.valueX + it.valueW;
    slot.sepX = i < items.length - 1 ? x + sep / 2 : 0;
    x += sep;
    return slot;
  });
  // ledger text vertical centre
  const ledgerCy = portrait ? 150 * u : H - 44 * u - 26 * u - size * 0.5;
  const titleTop = portrait ? 90 * u : 44 * u;
  return { u, portrait, sx, size, ls, sep, ledgerW, ledgerX, slots, ledgerCy, titleTop };
};

/** Screen position of a ledger counter (the number), for chips to fly into. */
export const ledgerTarget = (key: LedgerKey, W: number, H: number) => {
  const g = hudGeom(W, H);
  const s = g.slots.find((sl) => sl.k === key)!;
  return { x: s.valueX + (DIGIT_EM * g.ls) / 2, y: g.ledgerCy };
};

type LedgerValue = { value: number; prev: number; since: number; pending: boolean; settled: boolean };

/**
 * Counter state per key. A pending value (round 4) is shown dim from its frame until the real tick;
 * when the tick then lands on the same value it does not roll again, it only turns solid (`settled`).
 */
const ledgerAt = (spec: FilmSpec, frame: number) => {
  const zero = (): LedgerValue => ({ value: 0, prev: 0, since: -99, pending: false, settled: false });
  const values: Record<LedgerKey, LedgerValue> = { 요청: zero(), 확보: zero(), 전달: zero(), 수령: zero() };
  for (const k of spec.ledger) {
    if (frame < k.at) continue;
    const p = spec.pending?.find((q) => q.key === k.key && q.at < k.at && q.value === k.value);
    values[k.key] = { value: k.value, prev: values[k.key].value, since: k.at, pending: false, settled: !!p };
  }
  for (const p of spec.pending ?? []) {
    const real = spec.ledger.find((k) => k.key === p.key && k.at > p.at);
    if (frame >= p.at && (!real || frame < real.at)) values[p.key] = { value: p.value, prev: values[p.key].value, since: p.at, pending: true, settled: false };
  }
  return values;
};

/** Chapter label slot roll (frames; the boundary frame is already one step in). */
const ROLL = 8;

/** Dim ink of a pending ledger value. */
const PENDING_OPACITY = 0.36;

const digitsOf = (n: number) => String(n).length;

/** Clip styles for the two halves of a field wipe: `inside` = the incoming field, `outside` = the rest. */
const wipeClips = (w: FieldWipe, frame: number, W: number) => {
  const p = prog(frame, w.at, w.dur, ease[w.ease]);
  if (w.kind === "bar") {
    const x = W * p;
    return {
      inside: { clipPath: `inset(0 ${W - x}px 0 0)` } as React.CSSProperties,
      outside: { clipPath: `inset(0 0 0 ${x}px)` } as React.CSSProperties,
    };
  }
  const r = (w.r ?? W) * p;
  const at = `${w.cx ?? 0}px ${w.cy ?? 0}px`;
  const mask = `radial-gradient(circle at ${at}, transparent ${r}px, black ${r + 0.5}px)`;
  return {
    inside: { clipPath: `circle(${r}px at ${at})` } as React.CSSProperties,
    outside: { maskImage: mask, WebkitMaskImage: mask } as React.CSSProperties,
  };
};

/**
 * Persistent HUD chrome (reference craft, brand colours): title (top-left), running timecode
 * (top-right), chapter label (bottom-left) and the live ledger in the app's own format
 * "요청 {q} · 확보 {a} · 전달 {d} · 수령 {r}" over a thin progress bar (bottom-right).
 * In portrait the chapter row moves to the top (platform safe zone).
 * Over a bar / iris field wipe the HUD is drawn twice and split along the wipe edge, so its ink
 * always matches the field under it (round 3: it no longer vanishes into the incoming panel).
 */
export const Hud: React.FC<{ spec: FilmSpec }> = ({ spec }) => {
  const frame = useCurrentFrame();
  const { width: W, height: H, fps } = useVideoConfig();
  const visible = lerp(frame, [spec.hudIn, spec.hudIn + 12], [0, 1], ease.out) * lerp(frame, [spec.hudOut - 4, spec.hudOut], [1, 0]);
  if (visible <= 0) return null;

  const led = ledgerAt(spec, frame);
  const digits = Object.fromEntries(
    LEDGER_KEYS.map((k) => {
      const v = led[k];
      const grow = prog(frame - v.since, 0, 6, ease.out);
      return [k, lerp(grow, [0, 1], [digitsOf(v.prev), digitsOf(v.value)])];
    }),
  ) as Record<LedgerKey, number>;
  const g = hudGeom(W, H, digits);
  const chapter = chapterAt(spec, frame);
  const local = frame - chapter.from;
  // round 6: the old label slot-rolls up and out while the new one rolls in under it. The roll is
  // already a step along on the boundary frame, so both labels share the slot there: no frame of the
  // film has an empty chapter label (it used to roll in from fully hidden, a 1-frame blank)
  const prev = spec.chapters[spec.chapters.indexOf(chapter) - 1];
  const roll = prog(local + 1, 0, ROLL, ease.out);
  const rollPx = g.size * 1.3;
  const progress = frame / (spec.total - 1);
  const timecode = `${pad2(frame / fps)}:${pad2(frame % fps)}`;
  const bottomRowY = g.portrait ? g.ledgerCy - g.size / 2 : H - 44 * g.u - g.size;
  const chapterInk = (label: string) => {
    const [num, ...rest] = label.split(" ");
    return (
      <>
        <span>{num}</span>
        <span style={{ marginLeft: g.size * 0.9 }}>{rest.join(" ")}</span>
      </>
    );
  };

  const layer = (dark: boolean, clip?: React.CSSProperties, key?: string) => {
    const ink = dark ? C.paper : C.ink;
    const hot = dark ? C.mint : C.greenMid;
    const text: React.CSSProperties = {
      fontFamily: FONT,
      fontWeight: 600,
      fontSize: g.size,
      letterSpacing: "0.32em",
      lineHeight: 1,
      color: ink,
      whiteSpace: "nowrap",
      fontVariantNumeric: "tabular-nums",
    };
    return (
      <AbsoluteFill key={key} style={{ pointerEvents: "none", ...clip }}>
        {/* title: the separator is a drawn hairline, not a dash glyph */}
        <div style={{ position: "absolute", left: g.sx, top: g.titleTop, display: "flex", alignItems: "center", gap: 14 * g.u }}>
          <span style={text}>사입삼춘</span>
          <span style={{ width: 26 * g.u, height: Math.max(1, 1.5 * g.u), background: ink, opacity: 0.9 }} />
          <span style={text}>AGENT UNCLE</span>
        </div>
        <div style={{ position: "absolute", right: g.sx - g.size * 0.32, top: g.titleTop, ...text }}>{timecode}</div>
        {/* chapter label (slot roll: previous up and out, current up and in) */}
        <div style={{ position: "absolute", left: g.sx, top: bottomRowY, height: g.size * 1.2, width: 400 * g.u, overflow: "hidden" }}>
          {prev && roll < 1 && (
            <div style={{ ...text, position: "absolute", left: 0, top: 0, translate: `0 ${-roll * rollPx}px` }}>{chapterInk(prev.label)}</div>
          )}
          <div style={{ ...text, position: "absolute", left: 0, top: 0, translate: `0 ${(prev ? 1 - roll : 0) * rollPx}px` }}>
            {chapterInk(chapter.label)}
          </div>
        </div>
        {/* ledger: label, 9 px, value (tabular slot as wide as its digits), centred "·" */}
        {g.slots.map((sl, i) => {
          const v = led[sl.k];
          const age = frame - v.since;
          // a pending value rolls in dim; when it is recorded it turns solid in place (no second roll)
          const flip = v.settled ? 0 : lerp(age, [0, 6], [1, 0], ease.out);
          const isHot = !v.pending && age >= 0 && age < 18;
          const pulse = lerp(age, [0, 3, 12], [1, 1.35, 1], ease.out);
          const solid = v.pending ? PENDING_OPACITY * (1 - flip * 0.8) : v.settled ? lerp(age, [0, 4], [PENDING_OPACITY, 1], ease.out) : 1 - flip * 0.8;
          const row: React.CSSProperties = { ...text, position: "absolute", top: g.ledgerCy - g.ls * 0.5, fontSize: g.ls, height: g.ls, lineHeight: `${g.ls}px` };
          return (
            <React.Fragment key={sl.k}>
              <span style={{ ...row, left: sl.labelX, letterSpacing: `${LABEL_TRACK}em` }}>{sl.k}</span>
              <span style={{ ...row, left: sl.valueX, width: sl.valueW, overflow: "visible" }}>
                <span
                  style={{
                    display: "inline-block",
                    letterSpacing: 0,
                    color: isHot ? hot : ink,
                    translate: `0 ${flip * g.ls * 0.9}px`,
                    opacity: solid,
                    scale: isHot ? pulse : 1,
                    transformOrigin: "30% 50%",
                    fontWeight: 800,
                  }}
                >
                  {v.value}
                </span>
              </span>
              {i < g.slots.length - 1 && (
                <span style={{ ...row, left: sl.sepX - 20, width: 40, textAlign: "center", letterSpacing: 0, opacity: 0.55 }}>·</span>
              )}
            </React.Fragment>
          );
        })}
        {/* progress bar: faint track + solid fill, as wide as the ledger row */}
        <div
          style={{
            position: "absolute",
            right: g.sx,
            top: g.portrait ? g.ledgerCy + g.size * 1.2 : H - 44 * g.u - 4 * g.u,
            width: g.ledgerW,
            height: Math.max(2, 4 * g.u),
          }}
        >
          <div style={{ position: "absolute", left: 0, right: 0, top: "50%", height: Math.max(1, 1.5 * g.u), translate: "0 -50%", background: ink, opacity: 0.3 }} />
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${progress * 100}%`, background: ink }} />
        </div>
      </AbsoluteFill>
    );
  };

  const dark = lightInkAt(spec, frame);
  const w = wipeAt(spec, frame);
  return (
    <AbsoluteFill style={{ opacity: visible, pointerEvents: "none" }}>
      {w
        ? (() => {
            const clips = wipeClips(w, frame, W);
            return [layer(dark, clips.outside, "out"), layer(w.into === "dark", clips.inside, "in")];
          })()
        : layer(dark)}
    </AbsoluteFill>
  );
};
