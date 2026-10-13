"use client";

import { useReducer } from "react";

import { AppIcon } from "@/components/icons/AppIcon";
import { trust } from "@/content/copy";
import { cn } from "@/lib/cn";

import { INITIAL_IDEMPOTENCY, OFFLINE_ERROR, reduceIdempotency } from "./idempotency";
import { SentenceBlocks } from "./lines";
import { RollDigits } from "./RollDigits";

/**
 * 끊겨도 한 번만 (spec S8 proof index, 두 번 생기지 않아요): a native switch
 * (role switch, 연결 끊기), 요청 보내기, and two counters set like the board's
 * numerals (Paperlogy 900 digits, small grey label above, unit after). Offline
 * sends fail with the app's network string (ink, deep-green rule, role alert)
 * and keep the request; once the line is back, the same request is saved
 * exactly once, however often it was sent. The reducer is idempotency.ts
 * (test-first). Local only: nothing is sent anywhere, and the sample line
 * says so (spec 0.3).
 *
 * From 768px the error's slot always holds the error's own height (an
 * invisible copy in the same grid cell), so showing or clearing it never
 * moves the page below: the film's pin keeps its measured start. Below 768px
 * (no pins) the slot collapses when empty, its gap with it; the error only
 * pushes down what is below the controls, never the controls under the finger.
 */

const { idempotency } = trust;

/** "보낸 횟수 {count}번" → ["보낸 횟수", "번"], "저장된 요청 {count}건" → ["저장된 요청", "건"]. */
function around(template: string): [string, string] {
  const [before = "", after = ""] = template.split("{count}");
  return [before.trim(), after];
}

const COUNTERS = [
  { key: "attempts", template: around(idempotency.attempts) },
  { key: "saved", template: around(idempotency.saved) },
] as const;

export function IdempotencyDemo() {
  const [state, dispatch] = useReducer(reduceIdempotency, INITIAL_IDEMPOTENCY);

  return (
    <div className="flex flex-col gap-5 md:gap-6" data-idempotency="">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 text-[15px] leading-none font-bold text-ink select-none">
          <input
            type="checkbox"
            role="switch"
            className="trust-switch"
            checked={!state.online}
            onChange={(event) => dispatch({ type: "setOnline", online: !event.currentTarget.checked })}
            data-idempotency-switch=""
          />
          {idempotency.switch}
        </label>
        <button
          type="button"
          onClick={() => dispatch({ type: "send" })}
          className="inline-flex h-12 items-center gap-2 rounded-pill bg-accent-weak px-5 text-[15px] leading-none font-bold text-green-800 transition-[scale,background-color] duration-(--duration-fast) ease-snap hover:bg-[rgb(12_72_62/0.18)] active:scale-[0.98]"
          data-idempotency-send=""
        >
          <AppIcon name="send" size={18} />
          {idempotency.send}
        </button>
      </div>

      {/* Each press reads the pair: 보낸 횟수 3번 저장된 요청 1건. */}
      <div role="status" aria-live="polite" aria-atomic="true" className="flex flex-wrap gap-x-12 gap-y-4" data-idempotency-counters="">
        {COUNTERS.map(({ key, template: [label, unit] }) => (
          <p key={key} className="flex flex-col gap-2" data-counter={key}>
            <span className="text-caption text-grey-600">{label}</span>{" "}
            <span className="flex items-baseline gap-1 text-ink">
              <RollDigits value={state[key]} className="trust-counter font-black" />
              <span className="text-[15px] leading-none text-grey-600">{unit}</span>
            </span>
          </p>
        ))}
      </div>

      <p className="text-caption text-grey-600">{trust.sample}</p>

      <div className={cn("grid", !state.error && "max-md:-mt-5")}>
        <p aria-hidden="true" className="trust-refusal trust-refusal-reserve invisible col-start-1 row-start-1 max-w-[30rem] max-md:hidden">
          <SentenceBlocks text={OFFLINE_ERROR} />
        </p>
        <div role="alert" aria-atomic="true" className="col-start-1 row-start-1" data-idempotency-error="">
          {state.error ? (
            <p key={state.attempts} className="trust-refusal max-w-[30rem]">
              <SentenceBlocks text={state.error} />
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
