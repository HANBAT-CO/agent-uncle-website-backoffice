"use client";

import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { useInView } from "@/hooks/use-in-view";

import { useReceipt } from "./receipt-context";

/** Motion + TearTicket, loaded one viewport before the slip arrives (spec 13). */
const ReceiptTear = lazy(() => import("./ReceiptTear"));

type ReceiptSlipProps = {
  /** Accessible name of the slip (상품 수령 확인). */
  label: string;
  /** Server-rendered faces (SlipFace.tsx). */
  body: ReactNode;
  stub: ReactNode;
};

/**
 * The receipt slip. Server HTML and the first paint use the static slip (CSS
 * perforation, a working stub button), which is also the no-JS baseline. One
 * viewport early the TearTicket leaf loads, lays itself out invisibly with the
 * same faces, and takes over once measured, so the swap never shifts layout
 * (and needs no ScrollTrigger refresh); focus inside the static slip moves to
 * the same control in the new one.
 */
export function ReceiptSlip({ label, body, stub }: ReceiptSlipProps) {
  const { state, tear } = useReceipt();
  const [inViewRef, near] = useInView<HTMLDivElement>({ rootMargin: "100%", once: true });
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const restoreKey = useRef<string | null>(null);
  const [preload, setPreload] = useState(false);
  const [tearShown, setTearShown] = useState(false);
  /** TearTicket reports a finished drag (or swipe) here; a repeat after another tear changes nothing. */
  const onDragTear = useCallback(() => tear("drag"), [tear]);

  const setWrap = useCallback(
    (node: HTMLDivElement | null) => {
      wrapRef.current = node;
      return inViewRef(node);
    },
    [inViewRef],
  );

  const onTearReady = useCallback(() => {
    const active = document.activeElement;
    const staticSlip = wrapRef.current?.querySelector(".slip-static");
    restoreKey.current =
      active instanceof HTMLElement && staticSlip?.contains(active) ? (active.dataset.focusKey ?? null) : null;
    setTearShown(true);
  }, []);

  useLayoutEffect(() => {
    if (!tearShown) return;
    const key = restoreKey.current;
    restoreKey.current = null;
    if (key) wrapRef.current?.querySelector<HTMLElement>(`.slip-tear [data-focus-key="${key}"]`)?.focus({ preventScroll: true });
  }, [tearShown]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setPreload(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div ref={setWrap} role="group" aria-label={label} className="receipt-slip">
      {tearShown ? null : <StaticSlip body={body} stub={stub} torn={state.torn} />}
      {near || preload ? (
        <Suspense fallback={null}>
          <ReceiptTear
            body={body}
            stub={stub}
            torn={state.torn}
            tornBy={state.by}
            onTear={onDragTear}
            hidden={!tearShown}
            onReady={onTearReady}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

/** CSS-only slip: same faces, a perforation drawn with masks, the stub hidden once torn. */
function StaticSlip({ body, stub, torn }: { body: ReactNode; stub: ReactNode; torn: boolean }) {
  return (
    <div className="slip-static" data-torn={torn ? "" : undefined}>
      <div className="slip-static-body">{body}</div>
      <div className="slip-static-stub" inert={torn || undefined} aria-hidden={torn || undefined}>
        {stub}
      </div>
    </div>
  );
}
