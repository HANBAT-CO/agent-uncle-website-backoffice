"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { cart } from "@/content/copy";
import { useInView } from "@/hooks/use-in-view";
import { usePrefersReducedMotion } from "@/hooks/use-media-query";
import { cx } from "@/lib/cx";

import { CART_TOUR_DELAY_MS, CART_TOUR_MIN_VISIBLE, readoutLabel } from "./cart-host";
import { useCartExplore } from "./CartExplore";
import type { CartStage } from "./cart-stage";
import { cartClass } from "./cart-styles";

/**
 * The hairline 손수레 (spec 8) on the vendored kernel.
 *
 * This island is the light half: the stage box, its accessible name and the
 * caption. The stage controller (cart-stage.ts), the kernel and the figure
 * load when the section is within 1.5 viewports. Until then the stage is an
 * empty box of its final size on the section plate, so mounting shifts
 * nothing and asks for no ScrollTrigger refresh.
 *
 * Tour: once, seen. It starts after the read-out is fully on screen and the
 * stage at least half on screen for CART_TOUR_DELAY_MS together (so the
 * figure, the numbers and the note are seen together), unless a real hand
 * has moved on the stage or the stepper has been touched or focused; never
 * under reduced motion. If the stage drops below half on screen mid-walk, the
 * walk returns to rest and the tour is armed again, so a passing scroll never
 * spends it unseen.
 */

/** A lazy chunk can fail on a flaky connection: two more tries, 1.5s apart, before the failure is reported. */
const LOAD_RETRIES = 2;
const LOAD_RETRY_MS = 1500;
/**
 * Observer thresholds around CART_TOUR_MIN_VISIBLE. A crossing upwards
 * reports a ratio at or above it, a crossing downwards one below it (0.497
 * for a 500px stage), so the ratio is compared as is.
 */
const STAGE_THRESHOLDS = [0, CART_TOUR_MIN_VISIBLE, 1] as const;

export function CartFigure({ className }: { className?: string }) {
  const { announced, readoutInView, report, bindFigure } = useCartExplore();
  const reduced = usePrefersReducedMotion();
  const [nearRef, near] = useInView<HTMLDivElement>({
    rootMargin: "150%",
    once: true,
  });
  const [seenRef, , seenRatio] = useInView<HTMLDivElement>({ threshold: STAGE_THRESHOLDS });
  const stageVisible = seenRatio >= CART_TOUR_MIN_VISIBLE;
  /** What a running walk reads each frame. */
  const stageVisibleNow = useRef(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const controller = useRef<CartStage | null>(null);
  const toured = useRef(false);
  const [mounted, setMounted] = useState(false);
  /** Bumped when a walk is aborted, so the start conditions are read again. */
  const [armed, setArmed] = useState(0);

  const setStage = useCallback(
    (node: HTMLDivElement | null) => {
      stageRef.current = node;
      const stopNear = nearRef(node);
      const stopSeen = seenRef(node);
      return () => {
        stageRef.current = null;
        if (typeof stopNear === "function") stopNear();
        if (typeof stopSeen === "function") stopSeen();
      };
    },
    [nearRef, seenRef],
  );

  useEffect(() => {
    stageVisibleNow.current = stageVisible;
  }, [stageVisible]);

  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const live = () => !cancelled && stageRef.current !== null;

    const load = (triesLeft: number) => {
      import("./cart-stage")
        .then(({ mountCartStage }) => {
          const stage = stageRef.current;
          return stage && live() ? mountCartStage(stage, report, live) : null;
        })
        .then(
          (mountedStage) => {
            if (!mountedStage) return;
            if (cancelled) {
              mountedStage.destroy();
              return;
            }
            controller.current = mountedStage;
            bindFigure(mountedStage.handle);
            setMounted(true);
          },
          (error: unknown) => {
            if (cancelled) return;
            if (triesLeft > 0) {
              retryTimer = setTimeout(() => load(triesLeft - 1), LOAD_RETRY_MS);
              return;
            }
            console.error("The hairline cart figure failed to load.", error);
          },
        );
    };
    load(LOAD_RETRIES);

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      const current = controller.current;
      if (!current) return;
      controller.current = null;
      bindFigure(null);
      current.destroy();
    };
  }, [near, report, bindFigure]);

  useEffect(() => {
    if (!mounted || !readoutInView || !stageVisible || reduced || toured.current) return;
    // Any change of the conditions before this fires clears it (the cleanup) and reads them again.
    const timer = setTimeout(() => {
      const current = controller.current;
      if (!current || current.engaged || toured.current) return;
      // Focus reached the stepper before the tour began: the visitor is already here.
      if (document.activeElement?.closest("[data-cart-stepper]")) {
        current.handle.engage();
        return;
      }
      toured.current = true;
      current.tour(
        () => stageVisibleNow.current,
        (outcome) => {
          if (outcome !== "aborted") return;
          toured.current = false;
          setArmed((count) => count + 1);
        },
      );
    }, CART_TOUR_DELAY_MS);
    return () => clearTimeout(timer);
  }, [mounted, readoutInView, stageVisible, reduced, armed]);

  return (
    <figure className={cx("flex flex-col gap-2 lg:gap-3", className)}>
      <div
        ref={setStage}
        className={cartClass("cartStage")}
        data-hairline="cart"
        data-mounted={mounted ? "" : undefined}
        role="img"
        aria-label={readoutLabel(cart.figureLabel, announced)}
      />
      <figcaption className="text-center text-caption text-night-ink-2">{cart.figureCaption}</figcaption>
    </figure>
  );
}
