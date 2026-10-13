"use client";

import Lenis, { type LenisOptions } from "lenis";
import {
  createContext,
  use,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { usePrefersReducedMotion } from "@/hooks/use-media-query";
import { setScrollDriver } from "@/lib/scroll-driver";
import { requestScrollRefresh } from "@/lib/scroll-refresh";

/*
 * Lenis smooth scrolling driven by GSAP's ticker, so Lenis and every
 * ScrollTrigger advance on the same frame. Under prefers-reduced-motion Lenis
 * is never created: the page uses native scrolling and ScrollTrigger keeps
 * working off native scroll events.
 *
 * Mount once, high in the tree (src/app/(site)/layout.tsx). Children stay Server
 * Components. Read it with useSmoothScroll() or useLenis().
 */

type ScrollTarget = number | string | HTMLElement;

type ScrollToOptions = {
  /** Pixels added to the target position (negative = stop above it). */
  offset?: number;
  /** Jump without animating. Forced on under reduced motion. */
  immediate?: boolean;
};

type LenisStore = {
  get: () => Lenis | null;
  set: (next: Lenis | null) => void;
  subscribe: (listener: () => void) => () => void;
};

declare global {
  interface Window {
    __auScrollTo?: (y: number) => void;
  }
}

type SmoothScrollContextValue = {
  store: LenisStore;
  reducedMotion: boolean;
};

function createLenisStore(): LenisStore {
  let current: Lenis | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set(next) {
      current = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const SmoothScrollContext = createContext<SmoothScrollContextValue | null>(null);

type SmoothScrollProps = {
  children: ReactNode;
  /** Lenis smoothing, 0..1. Lower is smoother. Lenis default is 0.1. */
  lerp?: number;
  /** Let Lenis animate same-page #anchor links. Off by default to keep the skip link native. */
  anchors?: boolean;
};

export function SmoothScroll({ children, lerp = 0.1, anchors = false }: SmoothScrollProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [store] = useState(createLenisStore);

  useEffect(() => {
    if (reducedMotion) return;

    const options: LenisOptions = {
      autoRaf: false,
      lerp,
      anchors,
      smoothWheel: true,
      // Touch keeps native momentum; smoothing it feels laggy on phones.
      syncTouch: false,
    };
    const lenis = new Lenis(options);
    let cleanupTicker: (() => void) | undefined;
    let cleanupScroll: (() => void) | undefined;
    let destroyed = false;

    store.set(lenis);
    if (process.env.NODE_ENV !== "production") {
      window.__auScrollTo = (y: number) => {
        lenis.resize();
        lenis.scrollTo(Math.max(0, y), { immediate: true, force: true });
      };
    }
    // Programmatic jumps (the reading place kept across motion breakpoints)
    // go through Lenis, measured fresh so a resize cannot clamp them.
    setScrollDriver((y) => {
      lenis.resize();
      lenis.scrollTo(y, { immediate: true, force: true });
    });
    void Promise.all([import("@/lib/gsap"), import("@/lib/gsap-plugins")]).then(([{ gsap, ScrollTrigger }]) => {
      if (destroyed) return;
      cleanupScroll = lenis.on("scroll", ScrollTrigger.update);
      const tick = (time: number) => {
        lenis.raf(time * 1000);
      };
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);
      cleanupTicker = () => {
        gsap.ticker.remove(tick);
        gsap.ticker.lagSmoothing(500, 33);
      };
      // Lenis does not change layout; a safe, coalesced refresh is enough (a
      // forced one here was a 200ms task during hydration).
      requestScrollRefresh();
    });

    return () => {
      destroyed = true;
      store.set(null);
      if (window.__auScrollTo) delete window.__auScrollTo;
      setScrollDriver(null);
      cleanupTicker?.();
      cleanupScroll?.();
      lenis.destroy();
      requestScrollRefresh();
    };
  }, [reducedMotion, lerp, anchors, store]);

  const value = useMemo(() => ({ store, reducedMotion }), [store, reducedMotion]);

  return <SmoothScrollContext value={value}>{children}</SmoothScrollContext>;
}

function useSmoothScrollContext(hook: string): SmoothScrollContextValue {
  const context = use(SmoothScrollContext);
  if (!context) throw new Error(`${hook} must be used inside <SmoothScroll>.`);
  return context;
}

/** The live Lenis instance, or null (reduced motion, SSR, or not mounted yet). */
export function useLenis(): Lenis | null {
  const { store } = useSmoothScrollContext("useLenis");
  return useSyncExternalStore(store.subscribe, store.get, () => null);
}

/**
 * Document y of a target's border-box top. Elements and selectors resolve here,
 * not inside Lenis: Lenis 1.3 subtracts the target's scroll-margin-top (5rem on
 * every [id], globals.css) and the native fallback does not, so the same call
 * landed 80px apart with and without Lenis. Resolved here, offset means exactly
 * "pixels from the target's top" on both paths.
 */
function resolveTop(target: ScrollTarget): number | null {
  if (typeof target === "number") return target;
  let element: HTMLElement | null = null;
  if (typeof target === "string") {
    try {
      element = document.querySelector<HTMLElement>(target);
    } catch {
      return null; // not a valid selector
    }
  } else {
    element = target;
  }
  if (!element) return null;
  return element.getBoundingClientRect().top + window.scrollY;
}

/**
 * Scroll controls that work with or without Lenis.
 *
 *   const { scrollTo, stop, start, enabled } = useSmoothScroll();
 *   scrollTo("#lead-form", { offset: -80 }); // form top 80px below the viewport top
 *
 * Targets: a document y, an element or a selector. Element and selector
 * targets ignore scroll-margin-top on both paths (see resolveTop).
 */
export function useSmoothScroll() {
  const { store, reducedMotion } = useSmoothScrollContext("useSmoothScroll");
  const lenis = useSyncExternalStore(store.subscribe, store.get, () => null);

  function scrollTo(target: ScrollTarget, { offset = 0, immediate = false }: ScrollToOptions = {}) {
    const top = resolveTop(target);
    if (top === null) return;
    const y = Math.max(0, top + offset);
    const jump = immediate || reducedMotion;
    const instance = store.get();
    if (instance) {
      instance.scrollTo(y, { immediate: jump, force: jump });
      return;
    }
    window.scrollTo({ top: y, behavior: jump ? "auto" : "smooth" });
  }

  /** Freeze page scroll (e.g. while a modal is open). No-op without Lenis. */
  function stop() {
    store.get()?.stop();
  }

  function start() {
    store.get()?.start();
  }

  return { lenis, enabled: lenis !== null, reducedMotion, scrollTo, stop, start };
}
