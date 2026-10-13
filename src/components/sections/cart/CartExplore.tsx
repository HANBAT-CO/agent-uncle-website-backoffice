"use client";

import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { REDUCED_MOTION_QUERY } from "@/hooks/use-media-query";

import { CART_REST_READ, parseRead, previewRead, sameRead, type CartRead } from "./cart-host";

/**
 * The one value the S4 islands share: what the cart figure shows right now.
 *
 * The figure is the source of truth. Its read-out (read.textContent, "n·m" or
 * "rest") is reported here; the read-out, the stepper and the home card's last
 * line render from it. The stepper asks the figure to move its unseen pointer
 * (preview) and shows the answer optimistically until the figure confirms.
 * Nothing here touches the story store: exploring is not recording, and the
 * record plate keeps 확보 2 · 남은 미송 4 throughout.
 *
 * - `shown` is what the page shows now. Exploring means the figure reports a
 *   live pointer (`shown.live`), so a pointer or the tour crossing the
 *   record's band stays a grey preview instead of flickering back to ink.
 * - A live report is held for LIVE_HOLD_MS before it shows, and dropped if
 *   "rest" arrives first: a hand leaving the stage downwards crosses the
 *   bottom band (0 secured) on its way out, and that must not flash
 *   확보 0 · 미송 6 on the read-out and the home card.
 * - `announced` trails `shown` until the figure has landed (the 700ms
 *   tweens plus the stagger), and only follows changes a person made (a hand,
 *   a tap or the stepper). The polite live region and the stage's accessible
 *   name render it, so the automatic tour never speaks and never relabels the
 *   figure.
 */

export type CartFigureHandle = {
  /** Holds the figure's unseen pointer on the band that secures `count` bags; the record's own count returns it to rest. */
  setCount(count: number): void;
  /** The visitor is here (the stepper has focus): the tour gives way for good. */
  engage(): void;
};

/** Who moved the figure: the automatic tour, or a person. */
export type CartSource = "tour" | "user";

type CartExploreValue = {
  shown: CartRead;
  announced: CartRead;
  /** The read-out is fully on screen now: the tour may start (the figure also has to be half on screen). */
  readoutInView: boolean;
  /** The stepper: preview `count` secured bags. Clamped to 0..6. */
  preview(count: number): void;
  /** The figure: its read-out text changed. */
  report(text: string, source: CartSource): void;
  /** The stepper took focus: stop the tour before it moves the value under the visitor's focus. */
  engage(): void;
  /** The read-out: whether it is fully on screen now. */
  setReadoutInView(inView: boolean): void;
  /** The figure registers its handle once mounted, and null on teardown. */
  bindFigure(handle: CartFigureHandle | null): void;
};

const CartExploreContext = createContext<CartExploreValue | null>(null);

/** Long enough for the slowest bag: a 700ms tween after a 5 × 40ms stagger. */
const SETTLE_MS = 900;
/** Under reduced motion the figure lands at once. */
const SETTLE_REDUCED_MS = 120;
/** How long a live report waits for a following "rest" before it shows. */
const LIVE_HOLD_MS = 120;

export function useCartExplore(): CartExploreValue {
  const value = use(CartExploreContext);
  if (!value) throw new Error("useCartExplore must be used inside <CartExploreProvider>.");
  return value;
}

type Held = { read: CartRead; source: CartSource };

export function CartExploreProvider({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState<CartRead>(CART_REST_READ);
  const [announced, setAnnounced] = useState<CartRead>(CART_REST_READ);
  const [readoutInView, setReadoutInView] = useState(false);
  const figure = useRef<CartFigureHandle | null>(null);
  const pending = useRef<number | null>(null);
  const engaged = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const held = useRef<Held | null>(null);

  const apply = useCallback((next: CartRead, source: CartSource) => {
    setShown((current) => (sameRead(current, next) ? current : next));
    // The tour moves only what is seen: it never speaks, relabels the figure or cancels what a person did.
    if (source !== "user") return;
    clearTimeout(settleTimer.current);
    const delay = window.matchMedia(REDUCED_MOTION_QUERY).matches ? SETTLE_REDUCED_MS : SETTLE_MS;
    settleTimer.current = setTimeout(() => {
      setAnnounced((current) => (sameRead(current, next) ? current : next));
    }, delay);
  }, []);

  const dropHeld = useCallback(() => {
    clearTimeout(holdTimer.current);
    holdTimer.current = undefined;
    held.current = null;
  }, []);

  const report = useCallback(
    (text: string, source: CartSource) => {
      const next = parseRead(text);
      if (!next.live) {
        dropHeld();
        apply(next, source);
        return;
      }
      held.current = { read: next, source };
      if (holdTimer.current !== undefined) return;
      holdTimer.current = setTimeout(() => {
        holdTimer.current = undefined;
        const latest = held.current;
        held.current = null;
        if (latest) apply(latest.read, latest.source);
      }, LIVE_HOLD_MS);
    },
    [apply, dropHeld],
  );

  const preview = useCallback(
    (value: number) => {
      const next = previewRead(value);
      dropHeld();
      // Move the figure first: stopping a running tour reports its leave, and the preview must land after it.
      if (figure.current) figure.current.setCount(next.secured);
      else pending.current = next.secured;
      apply(next, "user");
    },
    [apply, dropHeld],
  );

  const engage = useCallback(() => {
    engaged.current = true;
    figure.current?.engage();
  }, []);

  const bindFigure = useCallback((handle: CartFigureHandle | null) => {
    figure.current = handle;
    if (!handle) return;
    if (engaged.current) handle.engage();
    if (pending.current === null) return;
    const secured = pending.current;
    pending.current = null;
    handle.setCount(secured);
  }, []);

  useEffect(
    () => () => {
      clearTimeout(settleTimer.current);
      clearTimeout(holdTimer.current);
    },
    [],
  );

  const value = useMemo<CartExploreValue>(
    () => ({ shown, announced, readoutInView, preview, report, engage, setReadoutInView, bindFigure }),
    [shown, announced, readoutInView, preview, report, engage, setReadoutInView, bindFigure],
  );

  return <CartExploreContext value={value}>{children}</CartExploreContext>;
}
