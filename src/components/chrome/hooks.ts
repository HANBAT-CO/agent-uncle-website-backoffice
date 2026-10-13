import { useEffect, useSyncExternalStore } from "react";

import { useSmoothScroll } from "@/components/motion/SmoothScroll";

import { formatClock, msToNextMinute, type EntryJump } from "./chrome-model";

/**
 * Client hooks shared by the record chrome. None of them keeps continuous
 * values in React state: the clock ticks once a minute and the hero-CTA flag
 * flips on an IntersectionObserver crossing.
 */

const noopSubscribe = () => () => {};

/** False during SSR and the hydration pass, true afterwards: the chrome's data-hydrated gate. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/* ---------- Visitor-local clock (signup and footer: 지금 HH:MM) ---------- */

let clockText = "";
let clockTimer: ReturnType<typeof setTimeout> | undefined;
const clockListeners = new Set<() => void>();

function scheduleClock(): void {
  clockTimer = setTimeout(() => {
    clockText = formatClock(new Date());
    for (const listener of clockListeners) listener();
    scheduleClock();
  }, msToNextMinute(new Date()));
}

function subscribeClock(listener: () => void): () => void {
  clockListeners.add(listener);
  if (clockListeners.size === 1) {
    clockText = formatClock(new Date());
    scheduleClock();
  }
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0) clearTimeout(clockTimer);
  };
}

function readClock(): string {
  if (!clockText) clockText = formatClock(new Date());
  return clockText;
}

const emptyText = () => "";

/**
 * The visitor's local HH:MM while `enabled`, "" otherwise. It ticks on each
 * minute boundary only while `live` (the clock is on screen); off screen it
 * keeps the last value without a timer, and catches up when it shows again.
 */
export function useNowClock(enabled: boolean, live = true): string {
  return useSyncExternalStore(enabled && live ? subscribeClock : noopSubscribe, enabled ? readClock : emptyText, emptyText);
}

/* ---------- Hero CTAs in view (mobile pill waits until they leave) ---------- */

let ctasOut = false;
const ctaListeners = new Set<() => void>();
let ctaObserver: IntersectionObserver | null = null;

function subscribeHeroCtas(listener: () => void): () => void {
  ctaListeners.add(listener);
  if (!ctaObserver) {
    const target = document.querySelector("[data-hero-ctas]");
    if (!target) {
      // No hero CTAs on the page: nothing to wait for.
      ctasOut = true;
    } else {
      ctaObserver = new IntersectionObserver((entries) => {
        const entry = entries.at(-1);
        if (!entry) return;
        const next = !entry.isIntersecting;
        if (next === ctasOut) return;
        ctasOut = next;
        for (const notify of ctaListeners) notify();
      });
      ctaObserver.observe(target);
    }
  }
  return () => {
    ctaListeners.delete(listener);
    if (ctaListeners.size === 0) {
      ctaObserver?.disconnect();
      ctaObserver = null;
    }
  };
}

/** True once the hero's [data-hero-ctas] block has left the viewport. False during SSR. */
export function useHeroCtasOut(): boolean {
  return useSyncExternalStore(
    subscribeHeroCtas,
    () => ctasOut,
    () => false,
  );
}

/* ---------- Scrolling to a section ---------- */

/** Fallback for --nav-clear (globals.css): nav top 16 + pill 56 + 16. */
const NAV_CLEAR_PX = 88;

/** The band under the fixed nav that headings and focus keep clear of (--nav-clear, a registered <length>). */
export function navClearance(): number {
  const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-clear"));
  return Number.isFinite(value) && value > 0 ? value : NAV_CLEAR_PX;
}

function documentTop(element: HTMLElement): number {
  return element.getBoundingClientRect().top + window.scrollY;
}

function headingOf(element: HTMLElement): HTMLElement | null {
  const id = element.dataset.section;
  return (id ? document.getElementById(`${id}-title`) : null) ?? element.querySelector<HTMLElement>("h1, h2");
}

/**
 * Document position for a jump to `element`: where a native fragment jump
 * lands, its top minus its scroll-margin-top. Sections set that margin
 * (globals.css: their own top from 1024px, 2rem above it below; route and film
 * reach into their pins with an inline margin), so the nav, the rail and a
 * deep link all land on the same frame, and a pinned section lands on its pin
 * start rather than short of it. With a margin of zero or more, the section's
 * heading is also kept below the nav band.
 */
export function jumpTarget(element: HTMLElement): number {
  const margin = Number.parseFloat(getComputedStyle(element).scrollMarginTop) || 0;
  let y = documentTop(element) - margin;
  const heading = margin >= 0 ? headingOf(element) : null;
  if (heading) {
    const clear = navClearance();
    const landsAt = documentTop(heading) - y;
    if (landsAt < clear) y -= clear - landsAt;
  }
  return Math.max(0, Math.round(y));
}

/**
 * Document position where `section` has reported every beat it holds: the end
 * of its pin, or (no pin: phones, reduced motion) the last position at which it
 * is still the active section (its bottom just under the viewport's centre).
 */
export async function sectionEndTarget(section: HTMLElement): Promise<number> {
  const { ScrollTrigger } = await import("@/lib/gsap");
  let end = Number.NEGATIVE_INFINITY;
  for (const trigger of ScrollTrigger.getAll()) {
    const pin = trigger.pin;
    if (pin instanceof HTMLElement && section.contains(pin)) end = Math.max(end, trigger.end - 1);
  }
  if (end === Number.NEGATIVE_INFINITY) end = documentTop(section) + section.offsetHeight - window.innerHeight / 2 - 2;
  return Math.max(jumpTarget(section), Math.round(end));
}

/** Jumps longer than this many viewports run for a fixed time instead of easing across the whole night. */
const LONG_JUMP_VIEWPORTS = 3;
const LONG_JUMP_S = 1.1;
const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

/**
 * Scroll to a document position: Lenis when it runs (capped at 1.1s for long
 * jumps, so 사전 신청 from the hero does not replay every chapter for three
 * seconds), native otherwise (instant under reduced motion).
 */
export function useJumpScroll(): (y: number) => void {
  const { lenis, scrollTo } = useSmoothScroll();
  return (y: number) => {
    if (lenis && Math.abs(y - window.scrollY) > LONG_JUMP_VIEWPORTS * window.innerHeight) {
      lenis.scrollTo(y, { duration: LONG_JUMP_S, easing: easeOutExpo });
      return;
    }
    scrollTo(y);
  };
}

/* ---------- Key scrolls never lose to a smooth tail (spec 14) ---------- */

/** Keys whose default action scrolls the page. */
const SCROLL_KEYS = new Set(["Home", "End", "PageUp", "PageDown", " ", "ArrowUp", "ArrowDown"]);

/** Fields and widgets that keep these keys for themselves. */
const OWNS_SCROLL_KEYS = [
  "input",
  "textarea",
  "select",
  '[contenteditable]:not([contenteditable="false"])',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="listbox"]',
  '[role="grid"]',
  '[role="tree"]',
  '[role="menu"]',
  "video",
  "audio",
].join(", ");

/** Controls that Space activates rather than pages. */
const SPACE_ACTS = [
  "a[href]",
  "button",
  "summary",
  "label",
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="radio"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
].join(", ");

/** True when the browser is about to scroll the page for this key press. */
function scrollsPage(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.isComposing || !SCROLL_KEYS.has(event.key)) return false;
  const target = event.target;
  if (!(target instanceof Element) || target === document.body || target === document.documentElement) return true;
  return target.closest(event.key === " " ? `${OWNS_SCROLL_KEYS}, ${SPACE_ACTS}` : OWNS_SCROLL_KEYS) === null;
}

/**
 * Home, End, PageUp, PageDown, Space and the arrows always move the page
 * (spec 14), even right after a wheel scroll. Lenis ignores native scroll
 * events while its smooth tail runs and writes its own position on the next
 * frame, so a key jump pressed during the tail (the page already looks still)
 * was undone. When the browser is about to scroll for a key and the tail
 * still runs, Lenis drops it at the current position (stop + start: reset,
 * both public), and the key's native scroll then drives Lenis as usual.
 * Never while Lenis is stopped (the sheet holds the page), and only in the
 * bubble phase on window, after sections have had their say (route's
 * keyboard paging prevents the default and scrolls through Lenis itself).
 *
 * Workaround owned by the chrome: the natural home is SmoothScroll
 * (src/components/motion), which other packages own.
 */
export function useKeyScrollSync(): void {
  const { lenis } = useSmoothScroll();
  useEffect(() => {
    let endTarget = 0;
    const keepEndAligned = (scroll: (top: number) => void) => {
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      if (max <= endTarget || window.scrollY < endTarget - 4) return;
      endTarget = max;
      scroll(max);
    };
    if (!lenis) {
      const onNativeKey = (event: KeyboardEvent) => {
        if (event.key !== "End" || !scrollsPage(event)) return;
        endTarget = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        const align = () => keepEndAligned((top) => window.scrollTo({ top, behavior: "instant" }));
        requestAnimationFrame(align);
        window.setTimeout(align, 250);
        window.setTimeout(align, 900);
      };
      window.addEventListener("keydown", onNativeKey);
      return () => window.removeEventListener("keydown", onNativeKey);
    }
    const onKey = (event: KeyboardEvent) => {
      if (lenis.isStopped || lenis.isScrolling !== "smooth" || !scrollsPage(event)) return;
      if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        const target = event.key === "Home" ? 0 : Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        lenis.scrollTo(target, { immediate: true, force: true });
        if (event.key === "End") {
          endTarget = target;
          const align = () => keepEndAligned((top) => lenis.scrollTo(top, { immediate: true, force: true }));
          requestAnimationFrame(align);
          window.setTimeout(align, 250);
          window.setTimeout(align, 900);
        }
        return;
      }
      lenis.stop();
      lenis.start();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lenis]);
}

/** Move focus to an element without scrolling, as a fragment jump would (a temporary tabindex). */
export function focusWithoutScroll(element: HTMLElement): void {
  if (element.tabIndex < 0 && !element.hasAttribute("tabindex")) {
    element.setAttribute("tabindex", "-1");
    element.style.outline = "none";
    element.addEventListener(
      "blur",
      () => {
        element.removeAttribute("tabindex");
        element.style.removeProperty("outline");
      },
      { once: true },
    );
  }
  element.focus({ preventScroll: true });
}

/**
 * Scroll to where an entry happened and hand that section the focus, so
 * keyboard users continue from where the jump landed. Records that a section
 * adds part way through land at its end, where they still exist (EntryJump).
 */
export function useScrollToEntry(): (jump: EntryJump) => void {
  const scroll = useJumpScroll();
  return ({ section: id, at }: EntryJump) => {
    const section = document.querySelector<HTMLElement>(`[data-section="${id}"]`);
    if (!section) return;
    const finish = (y: number) => {
      scroll(y);
      focusWithoutScroll(section);
    };
    if (at === "end") void sectionEndTarget(section).then(finish);
    else finish(jumpTarget(section));
  };
}
