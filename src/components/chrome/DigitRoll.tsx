"use client";

import { useLayoutEffect, useRef } from "react";

import { cx } from "@/lib/cx";
import { gsap } from "@/lib/gsap";
import { MQ } from "@/lib/gsap-plugins";
import { duration, gsapEase } from "@/lib/motion";

/**
 * A number that rolls (spec 5.3, 6.2 roll token): each digit sits in a fixed
 * digit-cell (0.62em) so nothing jitters; on change, the old digit slides out
 * and the new one in, 300ms on out-expo. Up when the value grows, down when it
 * shrinks (reverse scroll). Only changed digits move. Under reduced motion the
 * value swaps at once. The first render never animates.
 *
 * GSAP only touches the spans this component creates (the outgoing ghosts) and
 * the inner digit spans; React owns the rest.
 */

type DigitRollProps = {
  value: number;
  className?: string;
};

function digitsOf(value: number, width: number): string[] {
  return String(value).padStart(width, " ").split("");
}

export function DigitRoll({ value, className }: DigitRollProps) {
  const root = useRef<HTMLSpanElement>(null);
  const previous = useRef(value);
  const digits = String(value).split("");

  useLayoutEffect(() => {
    const from = previous.current;
    previous.current = value;
    const node = root.current;
    if (from === value || !node || window.matchMedia(MQ.reduced).matches) return;

    const width = Math.max(String(from).length, String(value).length);
    const before = digitsOf(from, width);
    const after = digitsOf(value, width);
    const cells = [...node.querySelectorAll<HTMLElement>("[data-digit-cell]")];
    const offset = width - cells.length;
    const sign = value > from ? -1 : 1;
    const ghosts: HTMLElement[] = [];
    const tweens: gsap.core.Tween[] = [];

    cells.forEach((cell, index) => {
      const old = before[index + offset];
      const next = after[index + offset];
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
        gsap.fromTo(ghost, { yPercent: 0 }, { yPercent: 100 * sign, duration: duration.roll, ease: gsapEase.outExpo, onComplete: () => ghost.remove() }),
        gsap.fromTo(inner, { yPercent: -100 * sign }, { yPercent: 0, duration: duration.roll, ease: gsapEase.outExpo }),
      );
    });

    return () => {
      for (const tween of tweens) tween.progress(1).kill();
      for (const ghost of ghosts) ghost.remove();
    };
  }, [value]);

  return (
    <span ref={root} className={cx("inline-flex", className)}>
      <span className="sr-only">{value}</span>
      <span aria-hidden="true" className="inline-flex">
        {digits.map((digit, index) => (
          <span key={digits.length - index} data-digit-cell className="digit-cell relative overflow-hidden">
            <span className="block">{digit}</span>
          </span>
        ))}
      </span>
    </span>
  );
}
