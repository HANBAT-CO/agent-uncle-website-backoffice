"use client";

import { useEffect } from "react";

/**
 * A reload in the middle of the form comes back to the form (spec 10: the
 * draft is kept, so the place must be too).
 *
 * The browser's own scroll restoration cannot do it on this page: it restores
 * the raw scrollY into the server-rendered layout, before the pins above (hero,
 * words, route, dawn, film) add their spacers. Chromium clamps it to that
 * shorter page and the pins then push the reader about nine viewports up, into
 * dawn, with a 1.0 layout shift; WebKit lands about 75px off.
 *
 * So while signup or what follows it (the footer) is on screen, leaving the
 * page (pagehide) saves the place as a distance from the section's top and
 * turns the browser's restoration off for this entry. Arriving again by reload
 * or back/forward, the page jumps there as soon as the pins have grown it
 * enough (an earlier jump would clamp to the footer and then shift with the
 * page), and holds the place through every later layout change (pins, lazy
 * islands) until the reader scrolls, types or touches, or HOLD_MS after load.
 * The hold answers a ResizeObserver on the body, every ScrollTrigger refresh
 * and every scroll it did not ask for, all before paint, so nothing visibly
 * shifts. Anywhere above signup the browser's own restoration is left as it
 * was (keeping the reading place across a reload for every section belongs to
 * the shared scroll layer, src/lib/gsap-plugins.ts).
 *
 * Renders nothing. Client only.
 */

const PLACE_KEY = "au:signup-place";
/** How long after the load event the place is held (pins can arrive late on a slow device). */
const HOLD_MS = 6000;
const READER_INPUT = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
const DESKTOP_MOTION_QUERY = "(min-width: 1024px) and (prefers-reduced-motion: no-preference)";

type Place = { offset: number };
type ScrollTriggerStatic = {
  clearScrollMemory: (mode: "auto") => void;
  addEventListener: (type: "refresh", callback: () => void) => void;
  removeEventListener: (type: "refresh", callback: () => void) => void;
};

function sessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readPlace(raw: string | null): Place | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value === "object" && value !== null && "offset" in value && Number.isFinite(value.offset)) {
      return { offset: Number(value.offset) };
    }
  } catch {
    // A malformed entry is no place.
  }
  return null;
}

function sectionTop(section: HTMLElement): number {
  return section.getBoundingClientRect().top + window.scrollY;
}

function maxScroll(): number {
  return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
}

/**
 * Hand restoration back to the browser. ScrollTrigger re-applies the value it
 * read at startup ("manual" after a held reload) after every refresh, so it is
 * told too.
 */
function restoreAuto(ScrollTrigger: ScrollTriggerStatic): void {
  ScrollTrigger.clearScrollMemory("auto");
}

function arrivedAgain(): boolean {
  const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  return entry?.type === "reload" || entry?.type === "back_forward";
}

/** Puts the saved place back once the page is long enough, holds it while the page builds up, then ends itself. */
function holdPlace(section: HTMLElement, place: Place, ScrollTrigger: ScrollTriggerStatic): void {
  let done = false;
  let placed = false;
  let endTimer: ReturnType<typeof setTimeout> | undefined;
  let frame = 0;
  let lastTop = Number.NaN;

  const target = () => Math.round(Math.max(0, sectionTop(section) + place.offset));

  /**
   * The first jump waits for a frame in which the section did not move: a
   * jump in the same frame as a pin growing the page reads as the section
   * shifting into view, not as a scroll. It also waits for the page to reach
   * the place (a jump before that would clamp to the footer).
   */
  function placeWhenStill() {
    frame = 0;
    if (done || placed) return;
    const top = sectionTop(section);
    const still = Math.abs(top - lastTop) < 1;
    lastTop = top;
    if (!still) {
      frame = window.requestAnimationFrame(placeWhenStill);
      return;
    }
    const y = target();
    if (y > maxScroll() + 1) return; // the next layout change tries again
    placed = true;
    window.scrollTo({ top: y, behavior: "instant" });
  }
  /** Layout changed or something scrolled: before the first jump, look again next frame; after it, put the place back before paint. */
  function apply() {
    if (done) return;
    if (!placed) {
      if (!frame) frame = window.requestAnimationFrame(placeWhenStill);
      return;
    }
    const y = target();
    if (Math.abs(window.scrollY - y) >= 1) window.scrollTo({ top: Math.min(y, maxScroll()), behavior: "instant" });
  }
  function stop() {
    if (done) return;
    done = true;
    clearTimeout(endTimer);
    if (frame) window.cancelAnimationFrame(frame);
    resizes.disconnect();
    ScrollTrigger.removeEventListener("refresh", apply);
    window.removeEventListener("scroll", apply);
    window.removeEventListener("load", startEndTimer);
    for (const type of READER_INPUT) window.removeEventListener(type, stop);
    restoreAuto(ScrollTrigger);
  }
  function end() {
    // A page that never grew long enough (it is shorter now): the nearest place.
    if (!done && !placed) window.scrollTo({ top: Math.min(target(), maxScroll()), behavior: "instant" });
    stop();
  }
  function startEndTimer() {
    clearTimeout(endTimer);
    endTimer = setTimeout(end, HOLD_MS);
  }

  const resizes = new ResizeObserver(apply);
  resizes.observe(document.body);
  ScrollTrigger.addEventListener("refresh", apply);
  // A pin created after the first refresh refreshes itself alone: it measures
  // at the top and scrolls back to a position clamped by the page it had just
  // shortened, with no refresh event and no net size change. The scroll event
  // comes before the next paint.
  window.addEventListener("scroll", apply, { passive: true });
  for (const type of READER_INPUT) window.addEventListener(type, stop, { passive: true });
  if (document.readyState === "complete") startEndTimer();
  else window.addEventListener("load", startEndTimer, { once: true });

  // Without pins (below 1024px, reduced motion) the page already has its
  // length: jump now, before the first ScrollTrigger refresh records the top
  // of the page as the active section (the record rail would then re-lay out
  // under the reader), unless hydration has just moved the section (the jump
  // would read as a shift). With pins, wait for them (placeWhenStill).
  const y = target();
  const unmoved = firstTop !== null && Math.abs(sectionTop(section) - firstTop) < 1;
  if (unmoved && !window.matchMedia(DESKTOP_MOTION_QUERY).matches && y <= maxScroll() + 1) {
    placed = true;
    window.scrollTo({ top: y, behavior: "instant" });
  } else {
    apply();
  }
}

/**
 * Signup's document top in the server-rendered layout, read when this module
 * first runs (before hydration), or null when the section was not parsed yet.
 */
const firstTop = (() => {
  if (typeof document === "undefined") return null;
  const section = document.getElementById("signup");
  return section ? sectionTop(section) : null;
})();

/** Once per page load: the saved place is read and dropped on the first mount (Strict Mode mounts twice). */
let arrivalHandled = false;

export function SignupPlace() {
  useEffect(() => {
    const section = document.getElementById("signup");
    const store = sessionStore();
    if (!section || !store) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    void import("@/lib/gsap").then(({ ScrollTrigger }) => {
      if (cancelled) return;

      if (!arrivalHandled) {
        arrivalHandled = true;
        const saved = readPlace(store.getItem(PLACE_KEY));
        store.removeItem(PLACE_KEY);
        if (saved && arrivedAgain()) holdPlace(section, saved, ScrollTrigger);
      }

      const leave = () => {
        // Signup's top above the viewport bottom: the reader is at the form or below it.
        if (section.getBoundingClientRect().top < window.innerHeight) {
          // Unrounded: the section's top may sit on a fraction of a pixel.
          const offset = Math.round((window.scrollY - sectionTop(section)) * 100) / 100;
          store.setItem(PLACE_KEY, JSON.stringify({ offset }));
          window.history.scrollRestoration = "manual";
        } else {
          store.removeItem(PLACE_KEY);
          window.history.scrollRestoration = "auto";
        }
      };
      // Back from the back/forward cache: the page kept its place, so the entry is the browser's again.
      const show = (event: PageTransitionEvent) => {
        if (!event.persisted) return;
        store.removeItem(PLACE_KEY);
        restoreAuto(ScrollTrigger);
      };
      window.addEventListener("pagehide", leave);
      window.addEventListener("pageshow", show);
      cleanup = () => {
        window.removeEventListener("pagehide", leave);
        window.removeEventListener("pageshow", show);
      };
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return null;
}
