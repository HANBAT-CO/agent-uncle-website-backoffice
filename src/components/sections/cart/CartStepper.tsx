"use client";

import { useId, type KeyboardEvent } from "react";

import { cart } from "@/content/copy";
import { cx } from "@/lib/cx";

import { CART_TOTAL, countForKey, readoutLabel } from "./cart-host";
import { useCartExplore } from "./CartExplore";
import { DigitRoll } from "./CartReadout";

/**
 * 확보 수량 미리 보기: minus, n, plus (spec S4). The keyboard and touch path to the
 * figure, shown on every viewport. It drives the figure's unseen pointer, so
 * the cart, the read-out and the home card answer exactly as they answer a
 * hand. It cannot pass 0 or 6: the ends refuse (aria-disabled) and keep focus.
 * Arrow keys step by one, Page Up and Page Down by two, Home and End jump to
 * the ends (the APG spinbutton keys). Focus anywhere in it stops the tour,
 * so the automatic walk never moves the value under the visitor's focus.
 *
 * The visible label names the spinbutton only: a labelled group around it
 * would announce the same name twice more.
 */

function StepButton({
  label,
  glyph,
  refused,
  onStep,
}: {
  label: string;
  glyph: "minus" | "plus";
  refused: boolean;
  onStep: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={refused}
      onClick={() => {
        if (!refused) onStep();
      }}
      className={cx(
        "grid size-12 shrink-0 place-items-center rounded-pill text-night-ink",
        "transition-[background-color,transform,opacity] duration-(--duration-fast) ease-snap",
        "hover:bg-[rgb(242_255_232/0.08)] active:scale-[0.98]",
        "aria-disabled:cursor-not-allowed aria-disabled:opacity-35 aria-disabled:hover:bg-transparent aria-disabled:active:scale-100",
      )}
    >
      <span aria-hidden="true" className="relative block size-4">
        <span className="absolute inset-x-0 top-1/2 h-[1.5px] -translate-y-1/2 rounded-pill bg-current" />
        {glyph === "plus" ? (
          <span className="absolute inset-y-0 left-1/2 w-[1.5px] -translate-x-1/2 rounded-pill bg-current" />
        ) : null}
      </span>
    </button>
  );
}

export function CartStepper({ className }: { className?: string }) {
  const { shown, preview, engage } = useCartExplore();
  const labelId = useId();
  const secured = shown.secured;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = countForKey(event.key, secured);
    if (next === null) return;
    event.preventDefault();
    if (next !== secured) preview(next);
  };

  return (
    <div
      onKeyDown={onKeyDown}
      onFocus={engage}
      className={cx("flex flex-col items-center gap-2.5", className)}
      data-cart-stepper=""
    >
      <p id={labelId} className="text-caption text-night-ink-2">
        {cart.stepper.label}
      </p>
      <div className="inline-flex items-center gap-1 rounded-pill p-1 ring-1 ring-[rgb(242_255_232/0.16)] ring-inset">
        <StepButton label={cart.stepper.decrement} glyph="minus" refused={secured <= 0} onStep={() => preview(secured - 1)} />
        <span
          role="spinbutton"
          tabIndex={0}
          aria-labelledby={labelId}
          aria-valuemin={0}
          aria-valuemax={CART_TOTAL}
          aria-valuenow={secured}
          aria-valuetext={readoutLabel(cart.readout.explore, shown)}
          className="grid h-12 min-w-14 place-items-center rounded-pill text-[22px] leading-none font-bold text-night-ink tabular-nums"
          data-cart-stepper-value=""
        >
          <DigitRoll value={secured} />
        </span>
        <StepButton
          label={cart.stepper.increment}
          glyph="plus"
          refused={secured >= CART_TOTAL}
          onStep={() => preview(secured + 1)}
        />
      </div>
    </div>
  );
}
