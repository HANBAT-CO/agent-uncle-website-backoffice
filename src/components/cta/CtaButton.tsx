import type { MouseEventHandler, ReactNode } from "react";

import { AppIcon } from "@/components/icons/AppIcon";
import { cx } from "@/lib/cx";

/**
 * The page's call to action (one label per intent: 사전 신청, 영상 보기).
 *
 * primary: full pill, 52px (lg) or 40px (md), label 700 17px, trailing circle
 * holding the app chevron. Hover nudges the chevron 2px right and 1px up;
 * press scales to 0.98 (160ms).
 * - tone night: mint fill, #07231C label, #0C483E circle with a mint chevron
 * - tone day: #0C483E fill, #F5F4EE label, mint circle with a #0C483E chevron
 * - tone phase: follows html[data-phase] through CSS variables (the nav)
 * secondary: a text link with a 1px underline 4px below.
 *
 * Renders <a href> (type "link") or <button type="submit" form> (type
 * "submit"). While `pending`, the circle shows `loader` (e.g. LDRS Treadmill)
 * instead of the chevron and the control is aria-disabled; the caller swaps
 * the label (보내는 중) and blocks resubmission. On tone day the pending
 * circle turns deep green (#07231C) so a mint loader reads inside it (spec 9:
 * mint Treadmill in the submit's deep-green circle). The circle carries
 * data-cta-circle for callers that need to reach it.
 *
 * No hooks and no internal handlers: usable from Server Components. Pass
 * onClick only from a Client Component.
 */

type Tone = "night" | "day" | "phase";

type CommonProps = {
  children: string;
  tone: Tone;
  variant?: "primary" | "secondary";
  size?: "md" | "lg";
  pending?: boolean;
  /** Shown in the trailing circle while pending. */
  loader?: ReactNode;
  className?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement | HTMLButtonElement>;
};

type LinkProps = CommonProps & { type?: "link"; href: string; form?: never };
type SubmitProps = CommonProps & { type: "submit"; form?: string; href?: never };

export type CtaButtonProps = LinkProps | SubmitProps;

/*
 * Press (scale) runs at 160ms and the hover nudge (translate) at 300ms; the
 * phase tone adds a delayed colour swap with matching per-property durations
 * and delays, so the three never collapse into one timing.
 */
const PRIMARY_TONE: Record<Tone, { pill: string; circle: string; pendingCircle?: string }> = {
  night: {
    pill: "bg-mint text-green-950 transition-[scale] duration-(--duration-fast)",
    circle: "bg-green-800 text-mint transition-[translate] duration-300",
  },
  day: {
    pill: "bg-green-800 text-surface transition-[scale] duration-(--duration-fast)",
    circle: "bg-mint text-green-800 transition-[translate] duration-300",
    // Replaces `circle` while pending (cx does not merge, so never both).
    pendingCircle: "bg-green-950 text-mint transition-[translate] duration-300",
  },
  // Fill and label swap together at the chrome's ink flip (--au-ink-flip, chrome.css), as the nav
  // text does: mint and deep green gliding into each other left the label at about 1.1:1 mid-switch.
  phase: {
    pill: "bg-(--cta-phase-bg) text-(--cta-phase-fg) transition-[background-color,color,scale] [transition-duration:0s,0s,var(--duration-fast)] [transition-delay:var(--au-ink-flip,0s),var(--au-ink-flip,0s),0s] focus-visible:outline-(--chrome-focus)",
    circle:
      "bg-(--cta-phase-circle) text-(--cta-phase-icon) transition-[background-color,color,translate] [transition-duration:0s,0s,300ms] [transition-delay:var(--au-ink-flip,0s),var(--au-ink-flip,0s),0s]",
  },
};

const SECONDARY_TONE: Record<Tone, string> = {
  night: "text-night-ink decoration-night-ink/60 hover:decoration-mint hover:text-mint",
  day: "text-ink decoration-ink/40 hover:decoration-green-800 hover:text-green-800",
  phase: "text-chrome-fg decoration-current/50 hover:decoration-current",
};

export function CtaButton(props: CtaButtonProps) {
  const { children, tone, variant = "primary", size = "lg", pending = false, loader, className, onClick } = props;

  const classes =
    variant === "secondary"
      ? cx(
          "inline-flex min-h-11 items-center text-[17px] leading-none font-bold whitespace-nowrap underline decoration-1 underline-offset-4 transition-colors duration-300 ease-snap",
          SECONDARY_TONE[tone],
          className,
        )
      : cx(
          "group/cta inline-flex shrink-0 items-center justify-between gap-3 rounded-pill font-bold whitespace-nowrap select-none",
          "ease-snap active:scale-[0.98]",
          size === "lg"
            ? "h-[52px] pr-2 pl-6 text-[17px]"
            : // 40px as drawn (spec 5.1); an invisible band above and below makes the touch target 44px (spec 14).
              "relative h-10 pr-[5px] pl-[18px] text-[15px] before:absolute before:inset-x-0 before:-inset-y-0.5 before:content-['']",
          PRIMARY_TONE[tone].pill,
          pending && "cursor-progress",
          className,
        );

  const content =
    variant === "secondary" ? (
      children
    ) : (
      <>
        <span>{children}</span>
        <span
          aria-hidden="true"
          data-cta-circle=""
          className={cx(
            "grid shrink-0 place-items-center rounded-pill ease-snap",
            size === "lg" ? "size-9" : "size-[30px]",
            !pending && "group-hover/cta:translate-x-0.5 group-hover/cta:-translate-y-px",
            (pending && PRIMARY_TONE[tone].pendingCircle) || PRIMARY_TONE[tone].circle,
          )}
        >
          {pending && loader ? loader : <AppIcon name="chevron" size={size === "lg" ? 18 : 16} />}
        </span>
      </>
    );

  if (props.type === "submit") {
    return (
      <button
        type="submit"
        form={props.form}
        className={classes}
        aria-disabled={pending || undefined}
        aria-busy={pending || undefined}
        data-pending={pending || undefined}
        onClick={onClick}
      >
        {content}
      </button>
    );
  }

  return (
    <a
      href={props.href}
      className={classes}
      aria-disabled={pending || undefined}
      data-pending={pending || undefined}
      onClick={onClick}
    >
      {content}
    </a>
  );
}
