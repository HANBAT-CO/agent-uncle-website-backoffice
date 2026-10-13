import { cx } from "@/lib/cx";

/**
 * The quantity dot (spec 4.6): one visual object with local instances, a 16px
 * circle that stands for the request moving through the night.
 * - lamp (night): mint fill plus a 1px mint ring at 30% opacity, 4px out.
 *   A halo ring, never a glow.
 * - ink (day): deep-green fill, no ring.
 *
 * Sections position and animate their own instance (GSAP on the outer span:
 * transform, background-color). It never idles, pulses or loops.
 */

type QuantityDotProps = {
  tone: "lamp" | "ink";
  /** Diameter in px. */
  size?: number;
  className?: string;
};

export function QuantityDot({ tone, size = 16, className }: QuantityDotProps) {
  return (
    <span
      aria-hidden="true"
      data-dot={tone}
      className={cx(
        "relative inline-block shrink-0 rounded-full",
        tone === "lamp"
          ? "bg-mint after:pointer-events-none after:absolute after:-inset-[5px] after:rounded-full after:border after:border-mint/30"
          : "bg-green-800",
        className,
      )}
      style={{ width: size, height: size }}
    />
  );
}
