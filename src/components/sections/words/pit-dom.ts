/**
 * DOM side of the S2 pit, shared by WordsMotion (scroll re-cut) and Pit
 * (physics). Client only.
 *
 * Each pill is server-rendered as four nested boxes so the writers never
 * fight over one transform:
 *
 *   .pit-body  [data-body]   translate3d(x, y): physics, then the flights
 *     .pit-lift  [data-lift]   translateY: the vocabulary drop through the floor
 *       .pit-rotor [data-rotor]  rotate(angle): physics, then the flights
 *         .pit-skin  [data-skin]   the bubble or pill itself (skin classes)
 *       .pit-gloss [data-gloss]  glossary caption, upright, positioned by placeGloss
 *
 * In heap mode (server render, reduced motion) CSS places the bodies from
 * their heap spots. In live mode the bodies sit at the pit's top-left and the
 * writers move them; x, y are the body box's top-left in pit pixels.
 */
import "client-only";

import { glossLayout, rotatedHalfExtents, type Bin, type PitItemKind, type PitSize, type Pose } from "./pit-physics";

export type PitBodyEls = {
  readonly id: string;
  readonly kind: PitItemKind;
  readonly desktopOnly: boolean;
  readonly ledgerIndex: number | null;
  readonly wrapper: HTMLElement;
  readonly lift: HTMLElement;
  readonly rotor: HTMLElement;
  readonly skin: HTMLElement;
  /** Bubbles: the text node holder the scramble rewrites. */
  readonly text: HTMLElement | null;
  readonly gloss: HTMLElement | null;
};

function child(scope: HTMLElement, selector: string): HTMLElement {
  const element = scope.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`words pit: ${scope.dataset.body ?? "body"} is missing ${selector}`);
  return element;
}

/** Every pill in the pit, in DOM order (bubbles by ledger row, then the vocabulary pills). */
export function collectBodies(pit: HTMLElement): PitBodyEls[] {
  return Array.from(pit.querySelectorAll<HTMLElement>("[data-body]")).map((wrapper) => {
    const kind: PitItemKind = wrapper.dataset.kind === "vocab" ? "vocab" : "bubble";
    const ledger = wrapper.dataset.ledgerIndex;
    return {
      id: wrapper.dataset.body ?? "",
      kind,
      desktopOnly: wrapper.hasAttribute("data-desktop-only"),
      ledgerIndex: ledger === undefined ? null : Number(ledger),
      wrapper,
      lift: child(wrapper, "[data-lift]"),
      rotor: child(wrapper, "[data-rotor]"),
      skin: child(wrapper, "[data-skin]"),
      text: wrapper.querySelector<HTMLElement>("[data-skin-text]"),
      gloss: wrapper.querySelector<HTMLElement>("[data-gloss]"),
    };
  });
}

export function setPitMode(pit: HTMLElement, mode: "heap" | "live"): void {
  pit.dataset.pitMode = mode;
}

export function pitSize(pit: HTMLElement): PitSize {
  return { width: pit.clientWidth, height: pit.clientHeight };
}

/** The pill's untransformed box (what the physics body is sized from). */
export function bodySize(body: PitBodyEls): { width: number; height: number } {
  return { width: body.wrapper.offsetWidth, height: body.wrapper.offsetHeight };
}

const round = (value: number) => Math.round(value * 100) / 100;

/** Live mode: put the body's box top-left at (x, y) with the given tilt. */
export function writeFrame(body: PitBodyEls, x: number, y: number, angle: number): void {
  body.wrapper.style.transform = `translate3d(${round(x)}px, ${round(y)}px, 0)`;
  body.rotor.style.transform = `rotate(${round(angle * (180 / Math.PI))}deg)`;
}

/** Live mode: put the body's centre at the pose. */
export function writePose(body: PitBodyEls, pose: Pose, size: { width: number; height: number }): void {
  writeFrame(body, pose.x - size.width / 2, pose.y - size.height / 2, pose.angle);
}

/** Back to the heap layout: drop every inline transform and live-mode flag. */
export function clearBodies(bodies: readonly PitBodyEls[]): void {
  for (const body of bodies) {
    body.wrapper.style.removeProperty("transform");
    body.rotor.style.removeProperty("transform");
    body.lift.style.removeProperty("transform");
    delete body.wrapper.dataset.pitHidden;
    delete body.wrapper.dataset.pitSkip;
    delete body.wrapper.dataset.landed;
    delete body.wrapper.dataset.flying;
  }
}

export function setFlag(
  body: PitBodyEls,
  flag: "pitHidden" | "pitSkip" | "landed" | "flying" | "glossOpen",
  on: boolean,
): void {
  if (on) body.wrapper.dataset[flag] = "";
  else delete body.wrapper.dataset[flag];
}

/** The heap frame (the floor-anchored box the heap spots are relative to), in pit pixels. */
export function heapFrame(pit: HTMLElement): { left: number; top: number; width: number; height: number } {
  const frame = pit.querySelector<HTMLElement>("[data-pit-frame]");
  if (!frame) throw new Error("words pit: missing [data-pit-frame]");
  return { left: frame.offsetLeft, top: frame.offsetTop, width: frame.offsetWidth, height: frame.offsetHeight };
}

/** The bin the pile lives in: the heap frame's horizontal extent (the whole pit unless CSS narrows it). */
export function binOf(pit: HTMLElement): Bin {
  const frame = heapFrame(pit);
  return { left: frame.left, width: frame.width };
}

/** Open or close a vocabulary pill's glossary caption (a toggletip: aria-expanded follows). */
export function setGloss(body: PitBodyEls, pit: HTMLElement, open: boolean): void {
  setFlag(body, "glossOpen", open);
  if (body.kind === "vocab") body.skin.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) placeGloss(body, pit);
}

/**
 * Position a vocabulary pill's glossary caption 16px under (or over) the
 * pill's rotated box. With a pose (physics), the box is computed; without one
 * (heap, frozen) it is measured.
 */
export function placeGloss(body: PitBodyEls, pit: HTMLElement, pose?: Pose): void {
  const gloss = body.gloss;
  if (!gloss) return;
  const size = { width: gloss.offsetWidth, height: gloss.offsetHeight };
  const area = pitSize(pit);
  let box: { left: number; top: number; right: number; bottom: number };
  let origin: { x: number; y: number };

  if (pose) {
    const half = rotatedHalfExtents(bodySize(body), pose.angle);
    box = { left: pose.x - half.x, right: pose.x + half.x, top: pose.y - half.y, bottom: pose.y + half.y };
    const own = bodySize(body);
    origin = { x: pose.x - own.width / 2, y: pose.y - own.height / 2 };
  } else {
    const pitRect = pit.getBoundingClientRect();
    const rotor = body.rotor.getBoundingClientRect();
    const lift = body.lift.getBoundingClientRect();
    box = {
      left: rotor.left - pitRect.left,
      right: rotor.right - pitRect.left,
      top: rotor.top - pitRect.top,
      bottom: rotor.bottom - pitRect.top,
    };
    origin = { x: lift.left - pitRect.left, y: lift.top - pitRect.top };
  }

  const layout = glossLayout(box, origin, area, size);
  gloss.style.left = `${round(layout.left)}px`;
  gloss.style.top = `${round(layout.top)}px`;
  gloss.dataset.side = layout.side;
}
