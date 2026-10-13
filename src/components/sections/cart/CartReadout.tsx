"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";

import { cart } from "@/content/copy";
import { cx } from "@/lib/cx";

import { readoutLabel, type CartCount } from "./cart-host";
import { useCartExplore } from "./CartExplore";
import { cartClass } from "./cart-styles";

/**
 * The cart's numbers, outside the drawing (spec S4, 8).
 *
 * At rest the read-out is the record, 확보 2 · 미송 4, in ink. While the
 * visitor explores (the figure reports a live pointer) the whole line turns
 * grey #B6D7C2, the numbers roll in fixed digit cells, and a note says the
 * record has not changed. The visible line is hidden from assistive tech: a
 * polite live region beside it speaks the settled value of changes a person
 * made (never the automatic tour), with the note while it is a preview.
 *
 * The read-out also tells the figure whether it is fully on screen now: the
 * tour starts only then, so it never plays while its explanation is below the
 * fold, nor when a figure it gave way to comes back without it.
 */

/** One number in a fixed-width cell. A new value rolls in from below when it grows and from above when it shrinks. */
export function DigitRoll({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState({ value, direction: 0 });
  if (shown.value !== value) setShown({ value, direction: value > shown.value ? 1 : -1 });
  return (
    <span className={cx(cartClass("cartCell"), className)}>
      <span key={shown.value} className={cartClass("cartDigit")} data-direction={shown.direction}>
        {value}
      </span>
    </span>
  );
}

/** A copy template with {secured} and {backorder} slots set as rolling digits; the rest is the copy, verbatim. */
function CountTemplate({ template, count }: { template: string; count: CartCount }) {
  return template.split(/(\{secured\}|\{backorder\})/).map((part, index) => {
    if (part === "{secured}") return <DigitRoll key={index} value={count.secured} />;
    if (part === "{backorder}") return <DigitRoll key={index} value={count.backorder} />;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

const TONE = "transition-colors duration-(--duration-record) ease-snap";

/**
 * Fully on screen, above the bottom 8% of the viewport (the mobile record
 * pill sits there). A ratio, not isIntersecting: the observer reports
 * isIntersecting as soon as any part enters.
 */
const READOUT_SEEN_MARGIN = "0px 0px -8% 0px";
const READOUT_SEEN_RATIO = 0.98;

export function CartReadout({ className }: { className?: string }) {
  const { shown, announced, setReadoutInView } = useCartExplore();
  const root = useRef<HTMLDivElement>(null);
  const exploring = shown.live;

  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.at(-1);
        if (entry) setReadoutInView(entry.isIntersecting && entry.intersectionRatio >= READOUT_SEEN_RATIO);
      },
      { rootMargin: READOUT_SEEN_MARGIN, threshold: [0, READOUT_SEEN_RATIO, 1] },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      setReadoutInView(false);
    };
  }, [setReadoutInView]);

  return (
    <div
      ref={root}
      className={cx("group flex flex-col items-center gap-1.5 text-center", className)}
      data-cart-readout=""
      data-exploring={exploring ? "" : undefined}
    >
      <p
        className={cx(
          "text-[clamp(2rem,4vw,3.5rem)] leading-[1.2] font-bold tracking-[-0.01em] text-night-ink group-data-exploring:text-night-ink-2",
          TONE,
        )}
        aria-hidden="true"
        data-cart-readout-value=""
      >
        <CountTemplate template={cart.readout.explore} count={shown} />
      </p>
      <p className="text-caption text-night-ink-2">{cart.readout.sub}</p>
      <p
        className={cx(cartClass("cartNote"), "mt-2 max-w-[26rem] text-body-sm text-night-ink-2")}
        data-on={exploring ? "" : undefined}
        aria-hidden="true"
        data-cart-readout-note=""
      >
        {cart.readout.note}
      </p>
      <p className="sr-only" aria-live="polite" aria-atomic="true" data-cart-readout-live="">
        {readoutLabel(cart.readout.explore, announced)}
        {announced.live ? `. ${cart.readout.note}` : null}
      </p>
    </div>
  );
}

/**
 * The home card's last line: 남은 미송 4장 in ink, or the explored value in
 * grey #636363. On the receded card (확보 6 · 미송 0) it takes the card's soft
 * #2D2D2D, so the value the visitor asked for reads as well on the sunk paper
 * as any other line (cart.module.css).
 */
export function CartHomeBackorder({ className }: { className?: string }) {
  const { shown } = useCartExplore();
  return (
    <p
      className={cx(
        "group text-[13px] leading-[1.6] text-ink transition-colors duration-(--duration-record) ease-snap data-exploring:text-grey-600",
        className,
      )}
      data-cart-home-backorder=""
      data-cart-moot-tone="soft"
      data-exploring={shown.live ? "" : undefined}
    >
      <CountTemplate template={cart.homeCard.backorderExplore} count={shown} />
    </p>
  );
}

/**
 * An [app] card that only applies while 미송 remains. In the app the recheck
 * date and its cards exist only while something is still owed (the figure
 * hides its hang-tag at 6 too), so a preview of 확보 6 · 미송 0 recedes them
 * while the note explains the preview: the paper sinks toward the plate and
 * the text holds its weight against it (cart.module.css), never opacity. The
 * strings never change.
 */
export function CartMootCard({ className, children, ...data }: { className?: string; children: ReactNode } & Record<`data-${string}`, string>) {
  const { shown } = useCartExplore();
  return (
    <div className={cx(cartClass("cartMoot"), className)} data-moot={shown.backorder === 0 ? "" : undefined} {...data}>
      {children}
    </div>
  );
}
