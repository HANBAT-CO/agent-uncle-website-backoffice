import HL from "@/vendor/hairline/kernel.mjs";
import { REDUCED_MOTION_QUERY } from "@/hooks/use-media-query";

import {
  CART_CROP,
  CART_GAP,
  CART_POINTER_X,
  CART_REST,
  clampCount,
  clientYToCount,
  countToY,
  tourPointerY,
  viewBoxToClient,
  type CartTourOutcome,
} from "./cart-host";
import type { CartFigureHandle, CartSource } from "./CartExplore";

/**
 * The cart stage's controller: the imperative half of CartFigure, loaded with
 * the kernel and the figure when the section is within 1.5 viewports, so none
 * of it ships in the page's first JS.
 *
 * - The figure is a classic script that reads the global HL and calls the
 *   global hairline(); both are set before it is imported.
 * - The SVG shows CART_CROP of the kernel's 400 x 320 pointer space: the
 *   drawing, without the empty plate the full frame leaves around it.
 * - Tour: the host walks it (tourPointerY in cart-host.ts) with the same
 *   unseen pointer as the stepper, so it is over within 5s and never crosses
 *   band 0; see CART_TOUR_COUNTS. It never starts once a person is here, and
 *   it gives up at rest when the stage leaves the screen under it.
 * - A hand is a trusted mouse pointermove or pointerdown. A stage scrolled
 *   under a parked cursor fires only pointerenter, which is not a hand.
 * - Touch: the kernel would treat every finger that lands on the stage as a
 *   hand, so a scroll gesture through the section would rewrite the preview.
 *   Touch and pen events are kept from the kernel; a tap (a click, which never
 *   follows a scroll) sets the tapped band and holds it, as the stepper does.
 * - Stepper: the kernel's tour would hold a single stop, but only after a
 *   1.2-2.6s start delay, it keeps the frame loop awake while it holds, and it
 *   does nothing under reduced motion. So the stepper dispatches a synthetic
 *   pointermove at the band's middle instead (and a synthetic pointerleave for
 *   the record's own count): the figure answers it as it answers a hand, and
 *   under reduced motion it lands at once.
 */

type ReadTarget = { textContent: string | null };
type FigureInstance = { set(value: number): void; destroy(): void };
type HairlineFigure = {
  name: string;
  range: readonly [number, number, number];
  mount(context: { stage: HTMLElement; svg: SVGSVGElement; read: ReadTarget }, value: number): FigureInstance;
};
type Kernel = {
  inject(root: Document): void;
  mk(tag: "svg", attributes: Record<string, string>, parent: Element): SVGSVGElement;
};
type Tour = { stop(): void };

export type CartStage = {
  /** What the stepper and the provider drive. */
  handle: CartFigureHandle;
  /** A real hand moved on the stage, the stage was tapped, or the stepper was used or focused: the tour gives way for good. */
  readonly engaged: boolean;
  /**
   * Plays the tour now, unless a person is already here or it is under way.
   * It stops at rest and reports "aborted" as soon as isVisible() is false;
   * a person taking over ends it without a report (the tour is spent).
   */
  tour(isVisible: () => boolean, onEnd: (outcome: CartTourOutcome) => void): void;
  destroy(): void;
};

/** The pointer events the kernel listens to on the stage. */
const KERNEL_POINTER_EVENTS = ["pointerdown", "pointermove", "pointerleave"] as const;

/** A smaller pointer move than this (viewBox units) changes nothing worth a dispatch. */
const TOUR_MIN_STEP = 0.25;

/**
 * Walks tourPointerY on the frame clock, once, and leaves. The host has
 * already held the figure in view for CART_TOUR_DELAY_MS. Each frame asks
 * isVisible(): once the stage is less than half on screen, the walk returns
 * the figure to rest and ends "aborted", so the host can arm the tour again
 * instead of spending it unseen. It also stops on its own when the visitor
 * turns reduced motion on mid-walk.
 */
function walkTour(
  point: (y: number | null) => void,
  isVisible: () => boolean,
  onEnd: (outcome: CartTourOutcome) => void,
): Tour {
  const reducedQuery = window.matchMedia(REDUCED_MOTION_QUERY);
  let frame = 0;
  let start = -1;
  let last: number | null = null;
  let gone = false;

  const stop = () => {
    if (gone) return;
    gone = true;
    cancelAnimationFrame(frame);
    if (last !== null) point(null);
  };
  const step = (now: number) => {
    if (!isVisible()) {
      stop();
      onEnd("aborted");
      return;
    }
    if (start < 0) start = now;
    const y = reducedQuery.matches ? null : tourPointerY(now - start);
    if (y === null) {
      stop();
      onEnd("done");
      return;
    }
    if (last === null || Math.abs(y - last) >= TOUR_MIN_STEP) {
      last = y;
      point(y);
    }
    frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  return { stop };
}

/**
 * The figure registers itself once, when its chunk first evaluates. The
 * registry lives on globalThis, beside HL and hairline(), so a re-evaluated
 * copy of this module (Fast Refresh) still finds the figure the bundler will
 * not evaluate again.
 */
type HairlineScope = typeof globalThis & {
  HL?: unknown;
  hairline?: (figure: HairlineFigure) => void;
  __hairlineFigures?: Map<string, HairlineFigure>;
};

let loading: Promise<HairlineFigure> | null = null;

function loadFigure(): Promise<HairlineFigure> {
  if (loading) return loading;
  const attempt = (async () => {
    const scope = globalThis as HairlineScope;
    const registry = (scope.__hairlineFigures ??= new Map<string, HairlineFigure>());
    scope.HL = HL;
    scope.hairline = (figure) => {
      registry.set(figure.name, figure);
    };
    // @ts-expect-error The figure is a classic script: it reads the global HL, calls the global hairline() and exports nothing.
    await import("@/vendor/hairline/figures/cart.js");
    const figure = registry.get("cart");
    if (!figure) throw new Error("The hairline cart figure did not register itself.");
    return figure;
  })();
  loading = attempt;
  // A failed chunk load may be tried again.
  attempt.catch(() => {
    if (loading === attempt) loading = null;
  });
  return attempt;
}

/**
 * Loads the figure and mounts it on `stage`. Resolves to null when `isLive`
 * turns false while the figure loads (the island unmounted), so nothing is
 * drawn on a stage that is gone.
 */
export async function mountCartStage(
  stage: HTMLDivElement,
  report: (text: string, source: CartSource) => void,
  isLive: () => boolean,
): Promise<CartStage | null> {
  const figure = await loadFigure();
  if (!isLive()) return null;
  const kernel = HL as Kernel;

  kernel.inject(document);
  const svg = kernel.mk(
    "svg",
    {
      viewBox: `${CART_CROP.x} ${CART_CROP.y} ${CART_CROP.width} ${CART_CROP.height}`,
      "aria-hidden": "true",
      focusable: "false",
    },
    stage,
  );

  let engaged = false;
  let tour: Tour | null = null;

  /** Holds the stage's unseen pointer at a viewBox y (it reads y only), or returns the figure to rest. */
  const point = (y: number | null) => {
    if (y === null) {
      // A mouse leave: the kernel returns the figure to rest at once (a touch leave would wait 1.4s).
      stage.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse", isPrimary: true }));
      return;
    }
    const { clientX, clientY } = viewBoxToClient(stage.getBoundingClientRect(), CART_POINTER_X, y);
    stage.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX,
        clientY,
        bubbles: true,
        cancelable: true,
        pointerType: "mouse",
        isPrimary: true,
      }),
    );
  };

  /**
   * Stops a running tour for good. Its leave is a mouse pointerleave, which
   * the kernel applies a task later, so a hand or the stepper moving the
   * figure in the same breath cancels it: the read-out goes from the tour's
   * value straight to the visitor's, never back to the record in between.
   */
  const stopTour = () => {
    const current = tour;
    if (!current) return;
    tour = null;
    current.stop();
  };

  let text = "rest";
  const read: ReadTarget = {
    get textContent() {
      return text;
    },
    set textContent(value: string | null) {
      text = value ?? "";
      report(text, tour ? "tour" : "user");
    },
  };

  const handle: CartFigureHandle = {
    setCount(count) {
      engaged = true;
      stopTour();
      const secured = clampCount(count);
      // The record's own count is the figure at rest, not a held preview of it.
      point(secured === CART_REST ? null : countToY(secured));
    },
    engage() {
      engaged = true;
      stopTour();
    },
  };

  // Registered before the figure mounts, so these run before the kernel's own listeners on the stage.
  let downType = "";
  const onPointer = (event: PointerEvent) => {
    if (!event.isTrusted) return;
    if (event.type === "pointerdown") downType = event.pointerType;
    if (event.pointerType !== "mouse") {
      event.stopImmediatePropagation();
      return;
    }
    if (event.type === "pointerleave") return;
    engaged = true;
    stopTour();
  };
  const onTap = (event: MouseEvent) => {
    // WebKit reports a tap's click as a mouse click: the pointerdown before it tells.
    if (!event.isTrusted || downType === "" || downType === "mouse") return;
    downType = "";
    handle.setCount(clientYToCount(stage.getBoundingClientRect(), event.clientY));
  };
  for (const type of KERNEL_POINTER_EVENTS) stage.addEventListener(type, onPointer, { capture: true });
  stage.addEventListener("click", onTap);

  const instance = figure.mount({ stage, svg, read }, CART_GAP);

  return {
    handle,
    get engaged() {
      return engaged;
    },
    tour(isVisible, onEnd) {
      if (engaged || tour) return;
      // The first frame comes after this returns, so `walk` is set before onEnd can run.
      const walk = walkTour(point, isVisible, (outcome) => {
        if (tour === walk) tour = null;
        onEnd(outcome);
      });
      tour = walk;
    },
    destroy() {
      for (const type of KERNEL_POINTER_EVENTS) stage.removeEventListener(type, onPointer, { capture: true });
      stage.removeEventListener("click", onTap);
      tour?.stop();
      tour = null;
      instance.destroy();
      svg.remove();
    },
  };
}
