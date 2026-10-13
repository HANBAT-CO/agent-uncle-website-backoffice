import React from "react";
import { C, EaseName, FONT, ease, mix, prog } from "../theme";
import { CAM_FULL, Cam, Phone, Place, deviceBounds } from "./Phone";
import { FootageTrack, Sub } from "./Footage";
import { Hl, Marks, Ripple } from "./Marks";

/** A move of the virtual camera. dur 0 = reframe instantly (jump cut). */
export type CamMove = { at: number; dur: number; to: Cam; ease?: EaseName };
/** A move of the phone on the canvas (layout glides between single / two-phone). */
export type PlaceMove = { at: number; dur: number; to: Place; ease?: EaseName };

const mixCam = (a: Cam, b: Cam, t: number): Cam => ({ s: mix(a.s, b.s, t), x: mix(a.x, b.x, t), y: mix(a.y, b.y, t) });
const mixPlace = (a: Place, b: Place, t: number): Place => ({
  cx: mix(a.cx, b.cx, t),
  cy: mix(a.cy, b.cy, t),
  h: mix(a.h, b.h, t),
  o: mix(a.o ?? 1, b.o ?? 1, t),
});

const track = <T,>(f: number, initial: T, moves: { at: number; dur: number; to: T; ease?: EaseName }[], blend: (a: T, b: T, t: number) => T, def: EaseName): T => {
  let cur = initial;
  for (const m of moves) {
    if (f < m.at) break;
    const p = prog(f, m.at, m.dur, ease[m.ease ?? def]);
    if (p >= 1) {
      cur = m.to;
      continue;
    }
    return blend(cur, m.to, p);
  }
  return cur;
};

export const camAt = (f: number, moves: CamMove[] = [], initial: Cam = CAM_FULL) => track(f, initial, moves, mixCam, "inOut");
export const placeAt = (f: number, initial: Place, moves: PlaceMove[] = []) => track(f, initial, moves, mixPlace, "inOut");

export type RoleLabelSpec = { text: string; sub?: string; from: number; to: number; top?: number; size?: number; align?: "center" | "left"; x?: number };

const smooth = (v: number) => {
  const c = Math.min(1, Math.max(0, v));
  return c * c * (3 - 2 * c);
};

/** HUD title band (16:9): a role label never rises into it; it fades out instead. */
const LABEL_MIN_TOP = 84;

export type PhoneTrack = {
  name: string;
  place: Place;
  placeMoves?: PlaceMove[];
  cam?: Cam;
  cams?: CamMove[];
  subs: Sub[];
  ripples?: Ripple[];
  highlights?: Hl[];
  label?: RoleLabelSpec;
};

/**
 * Role label above a phone: "소매업자 · 망원 셀렉트샵" (+ optional role copy).
 * Round 3: it rides above the device *after* the camera move (deviceBounds + shift), so a punch-in
 * can never grow the device up into the label. If riding would push it into the HUD title band
 * it fades out and comes back when the punch eases out. A fixed `top` (9:16) skips the ride.
 */
export const RoleLabel: React.FC<{ f: number; spec: RoleLabelSpec; place: Place; cam?: Cam; shift?: { x: number; y: number }; scale?: number }> = ({
  f,
  spec,
  place,
  cam = CAM_FULL,
  shift,
  scale = 1,
}) => {
  const b = deviceBounds(place, cam);
  const inP = prog(f, spec.from, 10, ease.out);
  const outP = prog(f, spec.to - 6, 6, ease.in);
  const top = spec.top ?? b.top + (shift?.y ?? 0) - (spec.sub ? 92 : 56) * scale;
  const room = spec.top === undefined ? smooth((top - LABEL_MIN_TOP) / 24) : 1;
  const o = inP * (1 - outP) * (place.o ?? 1) * room;
  if (o <= 0) return null;
  const cx = (b.left + b.right) / 2 + (shift?.x ?? 0);
  return (
    <div
      style={{
        position: "absolute",
        left: spec.align === "left" ? spec.x ?? 0 : cx - 300 * scale,
        width: 600 * scale,
        top,
        textAlign: spec.align ?? "center",
        fontFamily: FONT,
        opacity: o,
        translate: `0 ${(1 - inP) * 14 * scale}px`,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: (spec.size ?? 30) * scale, color: C.ink, lineHeight: 1.2, whiteSpace: "nowrap" }}>{spec.text}</div>
      {spec.sub && (
        <div style={{ fontWeight: 500, fontSize: 22 * scale, color: C.grey700, lineHeight: 1.3, marginTop: 6 * scale, whiteSpace: "nowrap" }}>
          {spec.sub}
        </div>
      )}
    </div>
  );
};

/** HUD-safe corner: a punched-in phone keeps its right edge at x <= x0 wherever it reaches below y0. */
export type HudSafe = { x: number; y: number };

/**
 * Horizontal shift that keeps a punched-in device clear of the bottom-right HUD ledger. It ramps in
 * with the punch (cam scale 1 → 1.15) and with the depth below y0, so layout glides are never nudged.
 */
export const hudSafeShift = (place: Place, cam: Cam, safe?: HudSafe) => {
  if (!safe) return undefined;
  const b = deviceBounds(place, cam);
  const over = Math.max(0, b.right - safe.x);
  if (over <= 0) return undefined;
  const k = smooth((b.bottom - safe.y) / 30) * smooth((cam.s - 1) / 0.15);
  return k > 0 ? { x: -over * k, y: 0 } : undefined;
};

/**
 * 9:16 top clamp (round 3, replaces the hard clip band): a punch-in never lifts the device top
 * above `minTop`; the device grows downward instead, so the status bar, the island and the app
 * header are never sliced. ROIs are chosen so they stay above the platform UI (y 1600).
 */
export const topClampShift = (place: Place, cam: Cam, minTop?: number) => {
  if (minTop === undefined) return undefined;
  const b = deviceBounds(place, cam);
  return b.top < minTop ? { x: 0, y: minTop - b.top } : undefined;
};

/** Total canvas shift of a phone: HUD-safe nudge (16:9) or top clamp (9:16). */
export const stageShift = (place: Place, cam: Cam, hudSafe?: HudSafe, minTop?: number) => {
  const a = hudSafeShift(place, cam, hudSafe);
  const b = topClampShift(place, cam, minTop);
  if (!a && !b) return undefined;
  return { x: (a?.x ?? 0) + (b?.x ?? 0), y: (a?.y ?? 0) + (b?.y ?? 0) };
};

/**
 * A temporary vertical step of the whole device (9:16). A positive `dy` steps it down (the chip dock);
 * a negative `dy` lifts it above the top clamp (round 6: a bottom CTA is framed at >= 1.25x by tilting
 * down to it instead of zooming out to 1.0x). `dur` / `outDur` ease in / out (0 = a cut on a page
 * change); `fade` lets the device dissolve into the field above `FADE_TOP` while lifted, so it never
 * slides under the caption block or a role label.
 */
export type Nudge = { at: number; until: number; dy: number; dur?: number; outDur?: number; fade?: boolean };

const nudgeP = (f: number, n: Nudge) => prog(f, n.at, n.dur ?? 8, ease.inOut) - prog(f, n.until, n.outDur ?? n.dur ?? 8, ease.inOut);

export const nudgeAt = (f: number, nudges: Nudge[] = []) => nudges.reduce((a, n) => a + n.dy * nudgeP(f, n), 0);

/**
 * 0..1: how far the top fade mask is engaged at `f`. It follows the lift in px, not its progress, and is
 * full once the device has risen 36 px, so a device rising through a push never shows its top through
 * the caption block (a half-faded bezel over the caption read as a glitch).
 */
export const liftFadeAt = (f: number, nudges: Nudge[] = []) => {
  const px = nudges.reduce((a, n) => a + (n.fade ? -n.dy * nudgeP(f, n) : 0), 0);
  const t = Math.min(1, Math.max(0, px / 36));
  return t * t * (3 - 2 * t);
};

/**
 * 9:16 top fade of a lifted device (canvas px): transparent above `from`, solid below `to`. It sits just
 * under the role-label slot (y 388-420), so labels and captions always stay on clean paper.
 */
export const FADE_TOP = { from: 424, to: 476 };

/** Renders phones with real footage, camera moves, ripples, highlights and role labels. */
export const PhoneStage: React.FC<{ f: number; offset: number; phones: PhoneTrack[]; hudSafe?: HudSafe; minTop?: number; nudge?: Nudge[] }> = ({
  f,
  offset,
  phones,
  hudSafe,
  minTop,
  nudge,
}) => {
  const fade = liftFadeAt(f, nudge);
  // round 6: a lifted 9:16 device dissolves into the field above FADE_TOP (soft, never a hard band)
  const mask = fade > 0 ? `linear-gradient(to bottom, rgba(0,0,0,${1 - fade}) ${FADE_TOP.from}px, #000 ${FADE_TOP.to}px)` : undefined;
  return (
    <>
      {phones.map((p) => {
        const place = placeAt(f, p.place, p.placeMoves);
        const cam = camAt(f, p.cams, p.cam);
        const base = stageShift(place, cam, hudSafe, minTop);
        const dy = nudgeAt(f, nudge);
        const shift = dy ? { x: base?.x ?? 0, y: (base?.y ?? 0) + dy } : base;
        // the wrapper is always there (a stable tree, so the footage never remounts when the mask engages)
        return (
          <React.Fragment key={p.name}>
            <div style={{ position: "absolute", inset: 0, maskImage: mask, WebkitMaskImage: mask }}>
              <Phone place={place} cam={cam} shift={shift} overlay={<Marks f={f} ripples={p.ripples} highlights={p.highlights} />}>
                <FootageTrack subs={p.subs} offset={offset} />
              </Phone>
            </div>
            {p.label && <RoleLabel f={f} spec={p.label} place={place} cam={cam} shift={shift} />}
          </React.Fragment>
        );
      })}
    </>
  );
};
