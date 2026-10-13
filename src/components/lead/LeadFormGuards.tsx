"use client";

import { useCallback } from "react";

// constants.ts, not schema.ts: keeps zod out of the client bundle.
import { LEAD_HIDDEN_FIELDS, UTM_KEYS } from "@/lib/lead/constants";
import { leadFillMs } from "@/lib/lead/fill-time";

/*
 * Hidden inputs every lead form renders inside its <form>:
 * honeypot, the fill time for the timing check, the form's placement
 * (`source`) and any utm_* params from the current URL.
 *
 * Values are written from ref callbacks: nothing differs between server and
 * client HTML (no hydration mismatch), and React's automatic form reset after
 * an action keeps them (utm goes to `defaultValue`; the fill time is added to
 * the FormData itself).
 */

/** Epoch ms of the visitor's first edit of the form's draft, read at submit time; null when there is none. */
export type FirstEditClock = () => number | null;

/**
 * Adds the fill time to every submission (leadFillMs): the time since the
 * form mounted, or since the visitor's first edit when the form keeps a draft
 * across reloads and that is longer. `new FormData(form)` fires `formdata` on
 * the form, so the value is computed at submit time on the visitor's own
 * clocks (no skew against the server).
 */
function trackFillTime(input: HTMLInputElement | null, firstEditAt: FirstEditClock | undefined) {
  const form = input?.form;
  if (!form) return;
  const mountedAt = performance.now();
  const onFormData = (event: FormDataEvent) => {
    const fillMs = leadFillMs({
      sinceMount: performance.now() - mountedAt,
      firstEditAt: firstEditAt?.() ?? null,
      now: Date.now(),
    });
    event.formData.set(LEAD_HIDDEN_FIELDS.fillMs, String(fillMs));
  };
  form.addEventListener("formdata", onFormData);
  return () => form.removeEventListener("formdata", onFormData);
}

function fillFromUrl(key: string) {
  return (input: HTMLInputElement | null) => {
    if (!input || input.defaultValue) return;
    const value = new URLSearchParams(window.location.search).get(key);
    if (value) input.defaultValue = value.slice(0, 120);
  };
}

const utmRefs = UTM_KEYS.map((key) => ({ key, ref: fillFromUrl(key) }));

export function LeadFormGuards({
  source,
  firstEditAt,
}: {
  source: string;
  /**
   * For forms that restore a saved draft: when the visitor first edited it.
   * Pass a stable function (a store method), or the clock restarts on render.
   */
  firstEditAt?: FirstEditClock;
}) {
  const fillTimeRef = useCallback((input: HTMLInputElement | null) => trackFillTime(input, firstEditAt), [firstEditAt]);
  return (
    <>
      <div
        aria-hidden="true"
        style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}
      >
        <label>
          홈페이지 주소
          <input type="text" name={LEAD_HIDDEN_FIELDS.honeypot} tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <input type="hidden" name={LEAD_HIDDEN_FIELDS.fillMs} ref={fillTimeRef} />
      <input type="hidden" name={LEAD_HIDDEN_FIELDS.source} value={source.slice(0, 120)} />
      {utmRefs.map(({ key, ref }) => (
        <input key={key} type="hidden" name={key} ref={ref} />
      ))}
    </>
  );
}
