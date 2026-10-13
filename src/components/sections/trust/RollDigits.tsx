"use client";

import { useLayoutEffect, useRef } from "react";

import { cx } from "@/lib/cx";
import { duration, gsapEase } from "@/lib/motion";

/**
 * A number in fixed digit cells that rolls when it changes (spec 4.2, 6.2 roll
 * token: 300ms on out-expo). The old digit slides out and the new one in, up
 * when the value grows and down when it shrinks; only changed digits move.
 *
 * - animate false: changes swap at once (the board arming its 0s off screen).
 * - introDelay: seconds before the first animated change only (the board's
 *   entry roll, 120ms apart per numeral); later changes roll at once.
 * - Reduced motion: every change swaps at once.
 *
 * The digits are the element's text; the outgoing ghosts GSAP creates are
 * aria-hidden and removed when their tween ends. GSAP touches only those
 * ghosts and the inner digit spans, never what React renders around them.
 */

type RollDigitsProps = {
  value: number;
  animate?: boolean;
  introDelay?: number;
  className?: string;
};

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function digitsOf(value: number, width: number): string[] {
  return String(value).padStart(width, " ").split("");
}

export function RollDigits({ value, animate = true, introDelay = 0, className }: RollDigitsProps) {
  const root = useRef<HTMLSpanElement>(null);
  const previous = useRef(value);
  const introDone = useRef(false);
  const digits = String(value).split("");

  useLayoutEffect(() => {
    const from = previous.current;
    previous.current = value;
    const node = root.current;
    if (from === value || !node || !animate || window.matchMedia(REDUCED_MOTION_QUERY).matches) return;

    const delay = introDone.current ? 0 : introDelay;
    introDone.current = true;

    const width = Math.max(String(from).length, String(value).length);
    const before = digitsOf(from, width);
    const after = digitsOf(value, width);
    const cells = [...node.querySelectorAll<HTMLElement>("[data-digit-cell]")];
    const offset = width - cells.length;
    const sign = value > from ? -1 : 1;
    const ghosts: HTMLElement[] = [];
    const tweens: { progress: (value: number) => { kill: () => void } }[] = [];
    let cancelled = false;

    void import("@/lib/gsap").then(({ gsap }) => {
      if (cancelled) return;
      cells.forEach((cell, index) => {
        const old = before[index + offset] ?? " ";
        const next = after[index + offset] ?? " ";
        if (old === next) return;
        const inner = cell.firstElementChild as HTMLElement | null;
        if (!inner) return;

        const ghost = document.createElement("span");
        ghost.setAttribute("aria-hidden", "true");
        ghost.className = "absolute inset-0 block text-center";
        ghost.textContent = old.trim();
        cell.appendChild(ghost);
        ghosts.push(ghost);

        tweens.push(
          gsap.fromTo(
            ghost,
            { yPercent: 0 },
            { yPercent: 100 * sign, duration: duration.roll, delay, ease: gsapEase.outExpo, onComplete: () => ghost.remove() },
          ),
          gsap.fromTo(inner, { yPercent: -100 * sign }, { yPercent: 0, duration: duration.roll, delay, ease: gsapEase.outExpo }),
        );
      });
    });

    return () => {
      cancelled = true;
      for (const tween of tweens) tween.progress(1).kill();
      for (const ghost of ghosts) ghost.remove();
    };
  }, [value, animate, introDelay]);

  return (
    <span ref={root} className={cx("inline-flex", className)} data-value={value}>
      {digits.map((digit, index) => (
        <span key={digits.length - index} data-digit-cell="" className="digit-cell relative overflow-hidden">
          <span className="block">{digit}</span>
        </span>
      ))}
    </span>
  );
}
