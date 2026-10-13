import type { CSSProperties, ReactNode } from "react";

import { srcSets, type AppStill } from "@/content/media";
import { cn } from "@/lib/cn";

import "./device.css";

/**
 * The phone frame (spec 4.7), a Server Component.
 *
 *   <Device screenWidth={300} label="망원 셀렉트샵의 홈">
 *     <DeviceStill still={APP_STILLS.retailerHome0941} sizes="300px" />
 *   </Device>
 *
 * Children fill the 1320:2868 screen (object-fit cover) under the drawn
 * Dynamic Island. Pixel rule (spec 2): put only real capture stills or
 * footage inside (DeviceStill, DeviceVideo).
 *
 * Accessible as a figure whose caption is `label` (visible below the frame
 * by default, or visually hidden when the section shows its own caption).
 */

type CSSVars = CSSProperties & Record<`--${string}`, string | number>;

/** The capture's screen: 1320 x 2868 px (iPhone 17 Pro Max). */
export const DEVICE_SCREEN = { width: 1320, height: 2868 } as const;

/** Dynamic Island, in percent of the screen (386x120 at 468,38 on 1320x2868). */
export const DEVICE_ISLAND = { left: 35.45, top: 1.32, width: 29.24, height: 4.18 } as const;

export type DeviceProps = {
  /** Screen width: px, or a CSS length for fluid layouts, e.g. "min(86vw, 360px)". */
  screenWidth: number | string;
  /** The figure caption, e.g. 망원 셀렉트샵의 홈. */
  label: string;
  children: ReactNode;
  className?: string;
  caption?: "visible" | "hidden";
};

export function Device({ screenWidth, label, children, className, caption = "visible" }: DeviceProps) {
  const style: CSSVars = { "--device-screen-w": typeof screenWidth === "number" ? `${screenWidth}px` : screenWidth };
  return (
    <figure className={cn("device", className)} style={style} data-device="">
      <div className="device-frame">
        <div className="device-screen">
          {children}
          <span className="device-island" aria-hidden="true" />
        </div>
      </div>
      <figcaption className={caption === "visible" ? "device-caption" : "sr-only"}>{label}</figcaption>
    </figure>
  );
}

export type DeviceStillProps = {
  still: AppStill;
  /** The rendered screen width, e.g. "(min-width: 1024px) 300px, 86vw". */
  sizes: string;
  /** Eager-load a still that is visible on first paint (none on this page: devices start at S7). */
  eager?: boolean;
  className?: string;
};

/** A capture still: AVIF, then WebP, two widths (540, 1080). */
export function DeviceStill({ still, sizes, eager = false, className }: DeviceStillProps) {
  const set = srcSets(still);
  return (
    <picture className={cn("device-still", className)}>
      <source type="image/avif" srcSet={set.avif} sizes={sizes} />
      <source type="image/webp" srcSet={set.webp} sizes={sizes} />
      {/* Pre-encoded AVIF/WebP pair from the media pipeline (spec 11), so no next/image re-encode. */}
      <img
        src={set.fallback}
        srcSet={set.webp}
        sizes={sizes}
        width={set.width}
        height={set.height}
        alt={still.alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
      />
    </picture>
  );
}
