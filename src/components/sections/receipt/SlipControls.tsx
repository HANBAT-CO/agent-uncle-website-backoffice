"use client";

import { useCallback, useEffect, type FocusEvent, type MouseEvent, type RefObject } from "react";

import { AppIcon } from "@/components/icons/AppIcon";
import { useSmoothScroll } from "@/components/motion/SmoothScroll";

import { useReceipt } from "./receipt-context";

/**
 * The slip's live parts, rendered inside the server-built slip so the same
 * markup works in the static slip and inside the TearTicket leaf. They read
 * and write only the section's local state (receipt-context); none of them
 * uses Motion or GSAP. The badge pop is a CSS transition (receipt.css).
 */

/** The fixed nav's bottom edge (16px + 56px). */
const NAV_BOTTOM = 72;
/** The highest a revealed slip's top may sit: 8px of air under the nav. */
const MIN_REVEAL_TOP = NAV_BOTTOM + 8;
/** Clearance under the fixed nav and above the mobile record pill. */
const NAV_CLEAR = 88;
const FOCUS_OFFSET = 192;

/**
 * A stable callback ref for a shared ref object. While the static slip and the
 * TearTicket leaf both hold a copy of these controls (during the swap), the
 * copy that unmounts must not clear the ref the other copy set.
 */
function useSharedRef<T>(targetRef: RefObject<T | null>) {
  return useCallback(
    (node: T | null) => {
      if (!node) return;
      targetRef.current = node;
      return () => {
        if (targetRef.current === node) targetRef.current = null;
      };
    },
    [targetRef],
  );
}

/** True when the element sits fully between the nav and the bottom bar. */
function inClearView(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return rect.top >= NAV_CLEAR && rect.bottom <= window.innerHeight - NAV_CLEAR;
}

function revealHead(head: HTMLElement, scrollTo: ReturnType<typeof useSmoothScroll>["scrollTo"]) {
  requestAnimationFrame(() => {
    if (document.activeElement === head && !inClearView(head)) scrollTo(head, { offset: -FOCUS_OFFSET, immediate: true });
  });
}

/**
 * Keyboard focus entering the slip from outside it. The browser scrolls only
 * the focused control into view, which can leave the slip's title row and its
 * question (이번에 받은 2장이 맞나요?) above the viewport or under the nav.
 * Bring the whole slip into clear view, its top at 192px (a little higher on a
 * short viewport, never under the nav). On a viewport shorter than the slip,
 * its top goes to 96px only if the focused control stays in clear view. It
 * only ever scrolls back, so it never crosses the auto-tear line.
 *
 * Measured on the slip's anchor, which GSAP never transforms: the entrance
 * tilt inside it may still be easing out after the browser's focus scroll.
 */
function useRevealSlipOnFocus() {
  const { scrollTo } = useSmoothScroll();
  return (event: FocusEvent<HTMLElement>) => {
    const control = event.currentTarget;
    const slip = control.closest<HTMLElement>("[data-receipt-anchor]");
    const from = event.relatedTarget;
    if (!slip || (from instanceof Node && slip.contains(from)) || !control.matches(":focus-visible")) return;
    // After the browser's own focus scroll, which runs once the focus event is dispatched.
    requestAnimationFrame(() => {
      if (document.activeElement !== control) return;
      const top = slip.getBoundingClientRect().top;
      scrollTo(window.scrollY, { immediate: true });
      if (top >= NAV_BOTTOM) return;
      const fitTop = Math.min(FOCUS_OFFSET, window.innerHeight - NAV_CLEAR - slip.offsetHeight);
      let target = fitTop;
      if (fitTop < MIN_REVEAL_TOP) {
        target = FOCUS_OFFSET;
        if (control.getBoundingClientRect().bottom + target - top > window.innerHeight - NAV_CLEAR) return;
      }
      scrollTo(window.scrollY + Math.round(top - target));
    });
  };
}

/** Title row with the 수령 확인 badge. Focus target after a keyboard tear. */
export function SlipHead({ title, badge }: { title: string; badge: string }) {
  const { state, statusRef } = useReceipt();
  const { scrollTo } = useSmoothScroll();
  const ref = useSharedRef(statusRef);
  useEffect(() => {
    const head = statusRef.current;
    if (!state.torn || !head || document.activeElement !== head) return;
    revealHead(head, scrollTo);
  }, [scrollTo, state.torn, statusRef]);

  return (
    <div ref={ref} tabIndex={-1} className="slip-head" data-focus-key="head">
      <p className="slip-title">{title}</p>
      <span className="slip-badge" data-on={state.torn ? "" : undefined} aria-hidden={state.torn ? undefined : true}>
        {badge}
      </span>
    </div>
  );
}

/**
 * The 전달 회차 row's quantity: 이번 확인 until the stub is torn, then 수령
 * 확인됨 (app labels). Both labels share one grid cell, so the cell is always
 * as wide as the longer one and the row never reflows on the tear (at 320px
 * the date wraps the same way in both states).
 */
export function BatchQuantity({ pending, confirmed }: { pending: string; confirmed: string }) {
  const { state } = useReceipt();
  return (
    <dd className="slip-batch-qty">
      <span data-on={state.torn ? undefined : ""}>{pending}</span>
      <span data-on={state.torn ? "" : undefined}>{confirmed}</span>
    </dd>
  );
}

/**
 * The stub's real button (2장 수령 확인). Enter, Space and a click tear the
 * stub; the TearTicket leaf plays the tear. Focus moves to the slip's title
 * row first, because the stub leaves the page. After a keyboard press the
 * page also brings that row (and its 수령 확인 badge) out from under the nav.
 */
export function StubButton({ label }: { label: string }) {
  const { dispatch, statusRef } = useReceipt();
  const { scrollTo } = useSmoothScroll();
  const revealSlip = useRevealSlipOnFocus();
  const space = label.indexOf(" ");
  const count = space > 0 ? label.slice(0, space) : label;
  const action = space > 0 ? label.slice(space + 1) : "";

  const onClick = (event: MouseEvent<HTMLButtonElement>) => {
    const head = statusRef.current;
    if (head && document.activeElement === event.currentTarget) {
      head.focus({ preventScroll: true });
      scrollTo(window.scrollY, { immediate: true });
      // detail 0: a click synthesised from Enter or Space.
      if (event.detail === 0 && !inClearView(head)) scrollTo(head, { offset: -FOCUS_OFFSET, immediate: true });
      revealHead(head, scrollTo);
      window.setTimeout(() => revealHead(head, scrollTo), 220);
      window.setTimeout(() => revealHead(head, scrollTo), 420);
    }
    dispatch({ type: "tear", by: "button" });
  };

  return (
    <button type="button" className="slip-stub-button" data-focus-key="stub" onClick={onClick} onFocus={revealSlip}>
      <span className="slip-stub-count">{count}</span>
      {action ? (
        <>
          {" "}
          <span className="slip-stub-action">{action}</span>
        </>
      ) : null}
    </button>
  );
}

/**
 * 상품이나 수량이 달라요: opens and closes the labelled what-if sample. Once
 * the stub is torn the delivery is confirmed and the app refuses a second
 * look, so the row becomes the app's own line (이미 확인한 전달분이에요...).
 * It keeps the row's 48px box (two lines at most), so the slip never resizes.
 * If the row had focus, the provider's tear() moves it to the title row first.
 */
export function IssueRow({ label, closedLabel }: { label: string; closedLabel: string }) {
  const { state, dispatch, panelId, issueRef } = useReceipt();
  const ref = useSharedRef(issueRef);
  const revealSlip = useRevealSlipOnFocus();
  const open = state.whatIf.open;

  if (state.torn) {
    return (
      <p className="slip-issue slip-issue-closed" data-focus-key="issue">
        {closedLabel}
      </p>
    );
  }

  return (
    <button
      ref={ref}
      type="button"
      className="slip-issue"
      data-focus-key="issue"
      aria-expanded={open}
      aria-controls={panelId}
      onFocus={revealSlip}
      onClick={() => dispatch({ type: open ? "closeWhatIf" : "openWhatIf" })}
    >
      <span>{label}</span>
      <AppIcon name="chevron" size={16} className="slip-issue-chevron" />
    </button>
  );
}
