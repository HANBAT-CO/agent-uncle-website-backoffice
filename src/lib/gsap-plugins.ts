/**
 * Scroll conventions shared by every section (spec 3.2, 6.3) and lazy loaders
 * for the GSAP plugins only some sections need. Core plugins (ScrollTrigger,
 * SplitText and the motion-token eases) are registered once in ./gsap.ts.
 *
 *   const { DrawSVGPlugin } = await loadDrawSVG();         // registered on load
 *   gsap.matchMedia().add(MQ.desktopMotion, () => { ... pin with PIN_PRIORITY.route ... });
 *   requestScrollRefresh();                                  // after a lazy island mounts
 *
 * Client only.
 */
import "client-only";

import { gsap, ScrollTrigger } from "./gsap";
import { scrollToY } from "./scroll-driver";

/** refreshPriority per pin: parallel-built sections refresh in page order (higher first). */
export const PIN_PRIORITY = { hero: 50, words: 40, route: 30, dawn: 20, film: 10 } as const;

/** The three gsap.matchMedia branches every animated section uses. Pins only in desktopMotion. */
export const MQ = {
  desktopMotion: "(min-width: 1024px) and (prefers-reduced-motion: no-preference)",
  mobileMotion: "(max-width: 1023px) and (prefers-reduced-motion: no-preference)",
  reduced: "(prefers-reduced-motion: reduce)",
} as const;

type DrawSVG = typeof import("gsap/DrawSVGPlugin").DrawSVGPlugin;
type MotionPath = typeof import("gsap/MotionPathPlugin").MotionPathPlugin;
type ScrambleText = typeof import("gsap/ScrambleTextPlugin").ScrambleTextPlugin;
type FlipType = typeof import("gsap/Flip").Flip;
type DraggableType = typeof import("gsap/Draggable").Draggable;

let drawSVG: Promise<DrawSVG> | null = null;
let motionPath: Promise<MotionPath> | null = null;
let scrambleText: Promise<ScrambleText> | null = null;
let flip: Promise<FlipType> | null = null;
let draggable: Promise<{ Draggable: DraggableType }> | null = null;

/** DrawSVGPlugin (hero, route, roles). */
export function loadDrawSVG(): Promise<DrawSVG> {
  drawSVG ??= import("gsap/DrawSVGPlugin").then(({ DrawSVGPlugin }) => {
    gsap.registerPlugin(DrawSVGPlugin);
    return DrawSVGPlugin;
  });
  return drawSVG;
}

/** MotionPathPlugin (route, dawn). */
export function loadMotionPath(): Promise<MotionPath> {
  motionPath ??= import("gsap/MotionPathPlugin").then(({ MotionPathPlugin }) => {
    gsap.registerPlugin(MotionPathPlugin);
    return MotionPathPlugin;
  });
  return motionPath;
}

/** ScrambleTextPlugin (words). */
export function loadScrambleText(): Promise<ScrambleText> {
  scrambleText ??= import("gsap/ScrambleTextPlugin").then(({ ScrambleTextPlugin }) => {
    gsap.registerPlugin(ScrambleTextPlugin);
    return ScrambleTextPlugin;
  });
  return scrambleText;
}

/** Flip (words, chrome rail). */
export function loadFlip(): Promise<FlipType> {
  flip ??= import("gsap/Flip").then(({ Flip }) => {
    gsap.registerPlugin(Flip);
    return Flip;
  });
  return flip;
}

/** Draggable with InertiaPlugin registered once (roles seam). */
export function loadDraggable(): Promise<{ Draggable: DraggableType }> {
  draggable ??= Promise.all([import("gsap/Draggable"), import("gsap/InertiaPlugin")]).then(
    ([{ Draggable }, { InertiaPlugin }]) => {
      gsap.registerPlugin(Draggable, InertiaPlugin);
      return { Draggable };
    },
  );
  return draggable;
}

const REFRESH_DEBOUNCE_MS = 150;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Debounced safe ScrollTrigger refresh. Call after any lazy island mounts or
 * changes layout, so pins below it re-measure. Many calls in a burst cost one
 * refresh.
 *
 * Safe mode (refresh(true)) shares ScrollTrigger's 200ms resize delay and, if
 * the reader is scrolling, waits for scrollEnd. A forced refresh re-measures
 * every pin with forced style and layout, which cost 100 to 250ms frames when
 * islands mounted mid-scroll (perf audit, 4x CPU).
 */
export function requestScrollRefresh(): void {
  if (typeof window === "undefined") return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = undefined;
    ScrollTrigger.refresh(true);
  }, REFRESH_DEBOUNCE_MS);
}

/* ------------------------------------------------------------------ */
/* Reading place across resizes and motion breakpoints                */
/* ------------------------------------------------------------------ */

/**
 * Where the reader is: the section under the viewport's centre line and how
 * far into it that line sits (0 to 1), or the page's top or bottom edge.
 */
type ReadingAnchor =
  | { kind: "section"; section: HTMLElement; progress: number }
  | { kind: "edge"; edge: "top" | "bottom" };

function maxScroll(): number {
  return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
}

function captureAnchor(): ReadingAnchor | null {
  if (window.scrollY < 1) return { kind: "edge", edge: "top" };
  if (window.scrollY >= maxScroll() - 1) return { kind: "edge", edge: "bottom" };
  const centre = window.innerHeight / 2;
  for (const section of document.querySelectorAll<HTMLElement>("[data-section]")) {
    const box = section.getBoundingClientRect();
    if (box.height <= 0 || box.top > centre || box.bottom <= centre) continue;
    return { kind: "section", section, progress: (centre - box.top) / box.height };
  }
  return null;
}

/** The scroll position that puts the anchor back where the reader saw it. */
function anchorScrollY(anchor: ReadingAnchor): number | null {
  if (anchor.kind === "edge") return anchor.edge === "top" ? 0 : maxScroll();
  if (!anchor.section.isConnected) return null;
  const box = anchor.section.getBoundingClientRect();
  if (box.height <= 0) return null;
  const y = box.top + window.scrollY + anchor.progress * box.height - window.innerHeight / 2;
  return Math.round(Math.min(Math.max(0, y), maxScroll()));
}

/** A focused form field the reader was typing in stays on screen. */
function keepFocusedFieldVisible(y: number): number {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !active.matches("input, textarea, select, [contenteditable]")) return y;
  const box = active.getBoundingClientRect();
  const top = box.top + window.scrollY;
  if (top >= y && top + box.height <= y + window.innerHeight) return y;
  return Math.max(0, Math.round(top + box.height / 2 - window.innerHeight / 2));
}

/**
 * gsap.addEventListener exists at runtime since 3.11 (matchMedia lifecycle
 * events) but is missing from the 3.15 type definitions.
 */
const gsapEvents = gsap as unknown as {
  addEventListener(type: "matchMediaInit" | "matchMediaRevert" | "matchMedia", callback: () => void): void;
};

/** Layout keeps settling after a resize or branch flip (async pin setup, lazy islands, React re-renders). */
const RESIZE_SETTLE_MS = 2000;

/**
 * Keeps the reader's place when the viewport changes size.
 *
 * Crossing a gsap.matchMedia branch (1024px, an iPad rotation, reduced motion
 * turned on or off) used to throw the reader to the top. ScrollTrigger
 * records the scroll position on matchMediaInit and restores it after the
 * refresh that follows, but the first ScrollTrigger the new branch creates
 * refreshes itself and clears that record (ScrollTrigger 3.15 self.refresh
 * sets scroll.rec = 0), so the branch refresh measures at 0 and stays there.
 * Resizes that stay in one branch keep the raw scrollY, but every pin length
 * is a share of the viewport height, so a shorter window (1440x900 to
 * 1440x700) landed sections away, at worst clamped to the footer.
 *
 * So the place is kept here as a ReadingAnchor, captured whenever the view
 * settles (scrollEnd, every refresh), so it always describes the layout from
 * before the resize; reading it on the resize event would measure a page that
 * has already reflowed. After the branch refresh, and after every refresh in
 * the two seconds after the last resize, until the reader scrolls, types or
 * touches, the same point of the same section goes back on the centre line.
 * A focused form field stays on screen.
 *
 * Note for profiling: every gsap.matchMedia().add() owns a MediaQueryList, and
 * GSAP's 2ms de-duplication does not hold once a refresh takes longer, so one
 * flip runs a full refresh per changed listener (about 28 here, once).
 */
function keepReadingPlaceAcrossResizes(): void {
  let anchor: ReadingAnchor | null = null;
  let restoring: ReadingAnchor | null = null;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  let scrollCaptureTimer: ReturnType<typeof setTimeout> | undefined;
  let lastRestoreScrollAt = -Infinity;
  let width = window.innerWidth;
  let height = window.innerHeight;
  let lastResizeAt = 0;

  // A fullscreen film resizes the window too; the page under it is not being read.
  const capture = () => {
    if (!restoring && !document.fullscreenElement) anchor = captureAnchor();
  };
  const restore = () => {
    if (!restoring) return;
    const y = anchorScrollY(restoring);
    if (y !== null) {
      lastRestoreScrollAt = performance.now();
      scrollToY(keepFocusedFieldVisible(y));
    }
  };
  const finish = () => {
    if (!restoring) return;
    restoring = null;
    clearTimeout(settleTimer);
    ScrollTrigger.removeEventListener("refresh", restore);
    for (const type of READER_INPUT) window.removeEventListener(type, finish);
    anchor = captureAnchor();
  };
  const begin = () => {
    if (!restoring) {
      if (!anchor) return;
      restoring = anchor;
      ScrollTrigger.addEventListener("refresh", restore);
      for (const type of READER_INPUT) window.addEventListener(type, finish, { passive: true });
    }
    clearTimeout(settleTimer);
    settleTimer = setTimeout(finish, RESIZE_SETTLE_MS);
  };

  window.addEventListener(
    "scroll",
    () => {
      clearTimeout(scrollCaptureTimer);
      scrollCaptureTimer = setTimeout(() => {
        if (document.fullscreenElement) return;
        if (performance.now() - lastRestoreScrollAt < 400) return;
        if (restoring) finish();
        else capture();
      }, 180);
    },
    { passive: true },
  );
  ScrollTrigger.addEventListener("scrollEnd", capture);
  ScrollTrigger.addEventListener("refresh", capture);
  window.addEventListener("resize", () => {
    const changedWidth = window.innerWidth !== width;
    const changedHeight = Math.abs(window.innerHeight - height) > window.innerHeight * 0.25;
    width = window.innerWidth;
    height = window.innerHeight;
    lastResizeAt = performance.now();
    // Same rule as ScrollTrigger's ignoreMobileResize: on touch-only devices a
    // URL bar showing or hiding is not a resize to answer (no refresh follows).
    if (ScrollTrigger.isTouch === 1 && !changedWidth && !changedHeight) return;
    if (document.fullscreenElement) return;
    begin();
  });
  gsapEvents.addEventListener("matchMediaInit", () => {
    const sizeChanged = window.innerWidth !== width || window.innerHeight !== height;
    if (sizeChanged) lastResizeAt = performance.now();
    // A flip with no resize (reduced motion toggled): measure now, before any revert.
    // During a real resize, the current raw scrollY may already be clamped
    // against a half-reverted pin layout, so keep the last settled anchor.
    if (!sizeChanged && performance.now() - lastResizeAt > 250) anchor = captureAnchor() ?? anchor;
    begin();
  });
  // Runs after ScrollTrigger's own branch refresh (its listener was added first).
  gsapEvents.addEventListener("matchMedia", restore);
}

/**
 * Deep links on first load (spec 6.3): the browser jumps to #signup or #film
 * before any pin exists. After each refresh with real fonts, jump again so the
 * target lands where the measured layout puts it. Lenis follows native scroll
 * jumps, so this works with and without it.
 */
function scrollToHashTarget(): void {
  const id = decodeURIComponent(window.location.hash.slice(1));
  if (!id) return;
  const target = document.getElementById(id);
  target?.scrollIntoView({ behavior: "instant", block: "start" });
}

/**
 * Focus survives refreshes. To measure, ScrollTrigger takes every pinned
 * element out of its generated .pin-spacer and puts it back, which drops the
 * focus of anything inside a pin (a building button, a vocabulary pill, a film
 * control) whenever a lazy island or font load triggers a refresh. The hero
 * avoids the move with its own pinSpacer; for every other pin, the element
 * focused when a refresh starts gets its focus back when the refresh ends, if
 * it is still in the page and focus has not gone anywhere else meanwhile.
 */
function keepFocusAcrossRefresh(): void {
  let focused: HTMLElement | null = null;
  ScrollTrigger.addEventListener("refreshInit", () => {
    const active = document.activeElement;
    focused = active instanceof HTMLElement && active !== document.body ? active : null;
  });
  ScrollTrigger.addEventListener("refresh", () => {
    const element = focused;
    focused = null;
    if (!element || !element.isConnected || document.activeElement === element) return;
    const current = document.activeElement;
    if (current && current !== document.body && current !== document.documentElement) return;
    element.focus({ preventScroll: true });
  });
}

if (typeof window !== "undefined") keepFocusAcrossRefresh();

/** How long after load a refresh may still move the reader back to the hash target. */
const HASH_SETTLE_MS = 6000;
const READER_INPUT = ["wheel", "touchstart", "keydown", "pointerdown"] as const;

/**
 * Pins and lazy islands keep arriving after the first refresh (a section's
 * chunk can hydrate later on a slow device, and every pin adds its spacer
 * above the target), so one re-scroll is not enough: the reader would land a
 * few sections early. Every refresh in the first seconds after load re-scrolls
 * to the hash target, until the reader scrolls, types or touches on their own.
 */
function keepHashTargetInPlace(): void {
  if (!window.location.hash.slice(1)) return;
  let done = false;
  const onRefresh = () => {
    if (!done) scrollToHashTarget();
  };
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    ScrollTrigger.removeEventListener("refresh", onRefresh);
    for (const type of READER_INPUT) window.removeEventListener(type, finish);
  };
  const timer = setTimeout(finish, HASH_SETTLE_MS);
  for (const type of READER_INPUT) window.addEventListener(type, finish, { passive: true });
  ScrollTrigger.addEventListener("refresh", onRefresh);
}

if (typeof window !== "undefined") keepReadingPlaceAcrossResizes();

if (typeof window !== "undefined" && "fonts" in document) {
  keepHashTargetInPlace();
  void document.fonts.ready.then(() => requestScrollRefresh());
}
