"use client";

import { Treadmill } from "ldrs/react";
import "ldrs/react/Treadmill.css";
import { useEffect, useRef, useState } from "react";

import { CtaButton } from "@/components/cta/CtaButton";
import { signup } from "@/content/copy";
import { useMediaQuery, usePrefersReducedMotion } from "@/hooks/use-media-query";
import { cn } from "@/lib/cn";

import { LEAD_FORM_ID, useSignupStatus } from "./signup-status";

/**
 * The form's submit control, 사전 신청 (the page's one label for the
 * signup intent). It submits #lead-form through the form attribute, so it
 * works from the form (its own copy under the consent row) and from the
 * mobile bar alike.
 *
 * Pending: the label reads 보내는 중, the width holds (min-width), and the
 * trailing circle turns deep green with the LDRS Treadmill in mint: a
 * conveyor while the request travels. At size 30 the cube is 6px and its arc
 * (radius 12px about the track) stays inside the 36px circle; the circle clips
 * anyway so nothing can spill. Under reduced motion the circle stays empty and
 * the label alone says it (spec S10).
 */
export function LeadSubmitButton({ pending, className }: { pending: boolean; className?: string }) {
  const reducedMotion = usePrefersReducedMotion();
  return (
    <CtaButton
      type="submit"
      form={LEAD_FORM_ID}
      tone="day"
      pending={pending}
      loader={
        reducedMotion ? (
          <span className="block size-[30px]" />
        ) : (
          <Treadmill size={30} speed={1.25} color="var(--color-mint)" />
        )
      }
      className={cn("min-w-[10.5rem]", pending && "[&_[data-cta-circle]]:overflow-hidden", className)}
    >
      {pending ? signup.pending : signup.submit}
    </CtaButton>
  );
}

/**
 * Below 768px: a fixed bottom bar (safe-area padded) holding a second copy of
 * the submit button while the form is in view, not yet sent, and the form's
 * own 사전 신청 (the in-flow button under the consent row, LeadForm's
 * [data-lead-submit-dock]) is still below the fold (spec S10).
 *
 * - Starts once the first role card stands whole above the bar (the island's
 *   top is FORM_START_PX above the viewport bottom), so the bar never offers a
 *   send while only the sheet's empty top edge shows.
 * - Hands over when the form's own button rises to where the bar's button
 *   rests: the bar steps aside at once (data-snap, no slide) over the same
 *   button box, and comes back the same way when it sinks below again, so
 *   a submit is on screen all the way past the consent row and two never
 *   show at once. Arriving from and leaving towards the top of the form, the
 *   bar slides.
 * - While the form's own button is on screen, data-dock-shown lets the nav's
 *   사전 신청 (only a jump to the section once the footer is the active
 *   section) step aside (signup.css): one label, one action.
 *
 * Rendered inside the form's lazy island (SignupIslands.tsx). Inert and hidden
 * from assistive tech while away. On a short screen (a landscape phone, or
 * 400% zoom) a fixed bar would cover a third of the view and the focused field
 * under it (WCAG 2.4.11, 1.4.10), so there it never shows (signup.css): the
 * form's own button is the only one.
 */
const PHONE_QUERY = "(max-width: 767px)";
const SHORT_SCREEN_QUERY = "(max-width: 767px) and (max-height: 500px)";

/**
 * The island's top must be this far above the viewport bottom: the role
 * question (about 47px from the island's top) and the first card (99px at
 * 390px, its line on two rows), clear of the bar (about 77px) with a gap.
 */
const FORM_START_PX = 236;

/** Below the floating nav pill (16px from the top, 56px tall) with a gap. */
const NAV_CLEAR_PX = 88;

/** away: before the role cards (or no form); up: the bar shows; docked: the form's own button has taken over. */
type BarMode = "away" | "up" | "docked";
const AWAY = { mode: "away", snap: false } as const;

export function StickySubmit() {
  const { pending, sentAt } = useSignupStatus();
  const phone = useMediaQuery(PHONE_QUERY, false);
  const shortScreen = useMediaQuery(SHORT_SCREEN_QUERY, false);
  const [bar, setBar] = useState<{ mode: BarMode; snap: boolean }>(AWAY);
  const [dockShown, setDockShown] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  // Measured on scroll and whenever the island changes: the form mounts after
  // this chunk (or remounts after 다시 신청하기), and errors, the banner or a
  // growing message move the form's own button.
  useEffect(() => {
    const island = document.querySelector<HTMLElement>("[data-lead-island]");
    const element = barRef.current;
    if (!phone || !island || !element) return;
    let frame = 0;
    let last: BarMode = "away";
    const measure = () => {
      frame = 0;
      const dock = island.querySelector<HTMLElement>("[data-lead-submit-dock]");
      const viewport = window.innerHeight;
      const box = dock?.getBoundingClientRect();
      const started = island.getBoundingClientRect().top < viewport - FORM_START_PX;
      // Where the bar's button rests (offsets: the bar may still be sliding).
      const restTop = viewport - element.offsetHeight + (element.querySelector("button")?.offsetTop ?? 0);
      const mode: BarMode = !box || !started ? "away" : box.top > restTop ? "up" : "docked";
      if (mode !== last) {
        // Between the bar and the form's own button the swap is instant: the two sit in the same place.
        const snap = (mode === "up" && last === "docked") || (mode === "docked" && last === "up");
        last = mode;
        setBar({ mode, snap });
      }
      setDockShown(box !== undefined && box.top < (shortScreen ? viewport : restTop + 1) && box.bottom > NAV_CLEAR_PX);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const resizes = new ResizeObserver(schedule);
    resizes.observe(island);
    const mutations = new MutationObserver(schedule);
    mutations.observe(island, { childList: true, subtree: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      resizes.disconnect();
      mutations.disconnect();
    };
  }, [phone, shortScreen]);

  const visible = sentAt === null && phone && !shortScreen && bar.mode === "up";
  const docked = sentAt === null && phone && dockShown;

  return (
    <div
      ref={barRef}
      data-lead-sticky=""
      data-visible={visible ? "" : undefined}
      data-snap={bar.snap ? "" : undefined}
      data-dock-shown={docked ? "" : undefined}
      aria-hidden={visible ? undefined : true}
      inert={!visible}
      className="lead-sticky fixed inset-x-0 bottom-0 z-(--z-sticky) md:hidden"
    >
      <div className="lead-sticky-inner border-t border-grey-200 bg-paper pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <LeadSubmitButton pending={pending} className="w-full" />
      </div>
    </div>
  );
}
