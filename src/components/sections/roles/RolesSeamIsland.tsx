"use client";

import dynamic from "next/dynamic";
import { useCallback, type FocusEvent } from "react";

import { QuantityDot } from "@/components/dot/QuantityDot";
import { AppIcon } from "@/components/icons/AppIcon";
import { useSmoothScroll } from "@/components/motion/SmoothScroll";
import { roles } from "@/content/copy";
import { useInView } from "@/hooks/use-in-view";

import { SEAM, seamValueText } from "./seam-math";

const MASK_ID = "roles-connector-mask";
const LoadedRolesSeam = dynamic(() => import("./RolesSeam").then((module) => module.RolesSeam), { ssr: false });

function useRevealOnKeyboardFocus() {
  const { scrollTo } = useSmoothScroll();
  return useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      const handle = event.currentTarget;
      if (!handle.matches(":focus-visible")) return;
      requestAnimationFrame(() => {
        if (document.activeElement !== handle) return;
        const box = handle.getBoundingClientRect();
        const top = window.scrollY + box.top - Math.max(0, (window.innerHeight - box.height) / 2);
        scrollTo(top, { immediate: true });
      });
    },
    [scrollTo],
  );
}

function RolesSeamFallback({ viewRef }: { viewRef?: (node: HTMLDivElement | null) => void }) {
  const revealOnKeyboardFocus = useRevealOnKeyboardFocus();
  return (
    <div ref={viewRef} className="roles-track" data-roles-track="">
      <div className="roles-seam-line" aria-hidden="true" />
      <svg className="roles-connector" aria-hidden="true" focusable="false">
        <defs>
          <mask id={MASK_ID} maskUnits="userSpaceOnUse">
            <path className="roles-connector-mask" />
          </mask>
        </defs>
        <path className="roles-connector-halo" mask={`url(#${MASK_ID})`} />
        <path className="roles-connector-line" mask={`url(#${MASK_ID})`} data-roles-connector="" />
      </svg>
      <div className="roles-proxy" aria-hidden="true" />
      <div
        role="slider"
        tabIndex={0}
        aria-label={roles.seam.label}
        aria-orientation="horizontal"
        aria-valuemin={SEAM.min}
        aria-valuemax={SEAM.max}
        aria-valuenow={SEAM.initial}
        aria-valuetext={seamValueText(SEAM.initial)}
        aria-controls="roles-side-retailer roles-side-uncle"
        className="roles-handle"
        data-roles-handle=""
        onFocus={revealOnKeyboardFocus}
      >
        <AppIcon name="chevron" size={14} className="roles-handle-chevron" />
        <QuantityDot tone="ink" />
        <AppIcon name="chevron" size={14} className="roles-handle-chevron" />
      </div>
    </div>
  );
}

export function RolesSeamIsland() {
  const [ref, near] = useInView<HTMLDivElement>({ rootMargin: "100%", once: true });
  if (near) return <LoadedRolesSeam />;
  return <RolesSeamFallback viewRef={ref} />;
}
