"use client";

import dynamic from "next/dynamic";

import { QuantityDot } from "@/components/dot/QuantityDot";
import { roles } from "@/content/copy";
import { useInView } from "@/hooks/use-in-view";

import type { OutlineSide } from "./outline-boxes";

const SIDES: readonly OutlineSide[] = ["retailer", "uncle"];
const LoadedRolesToggle = dynamic(() => import("./RolesToggle").then((module) => module.RolesToggle), { ssr: false });

function RolesToggleFallback({ viewRef }: { viewRef?: (node: HTMLDivElement | null) => void }) {
  return (
    <div ref={viewRef} role="radiogroup" aria-label={roles.toggle.label} className="roles-toggle" data-roles-toggle="">
      <span className="roles-toggle-thumb" aria-hidden="true">
        <QuantityDot tone="ink" />
      </span>
      {SIDES.map((side, index) => (
        <label key={side} className="roles-toggle-option">
          <input
            type="radio"
            name="roles-view"
            value={side}
            defaultChecked={index === 0}
            aria-controls={`roles-side-${side}`}
            data-roles-view={side}
          />
          <span>{roles.toggle.options[index]}</span>
        </label>
      ))}
    </div>
  );
}

export function RolesToggleIsland() {
  const [ref, near] = useInView<HTMLDivElement>({ rootMargin: "100%", once: true });
  if (near) return <LoadedRolesToggle />;
  return <RolesToggleFallback viewRef={ref} />;
}
