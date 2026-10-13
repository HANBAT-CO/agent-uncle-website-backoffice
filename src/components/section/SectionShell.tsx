import type { ReactNode } from "react";

import type { BeatId, SectionId } from "@/content/story";
import { cn } from "@/lib/cn";

import { SectionActivity } from "./SectionActivity";

/**
 * Every page section's outer element (Server Component).
 *
 *   <SectionShell id="route" titleId="route-title" tone="night">
 *     <h2 id="route-title">...</h2>
 *   </SectionShell>
 *
 * - id: the anchor (#route, #roles, ...) and the section's story id
 * - tone: the ground and role colours (night #07231C, dawn starts at night,
 *   day #EDECE3); see [data-tone] in globals.css
 * - pad: default 80px top and bottom, 128px from 1024px (unpinned sections);
 *   none for pinned or full-bleed stages
 *
 * Never transform this element: pins go on an inner plain div (spec 6.3).
 */

type SectionShellProps = {
  id: SectionId;
  titleId: string;
  tone: "night" | "day" | "dawn";
  pad?: "none" | "default";
  className?: string;
  children: ReactNode;
  /** Beat reported when the section becomes active under reduced motion. Defaults to the section's default beat. */
  reducedBeat?: BeatId;
};

export function SectionShell({ id, titleId, tone, pad = "default", className, children, reducedBeat }: SectionShellProps) {
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      data-section={id}
      data-tone={tone}
      className={cn("relative", pad === "default" && "py-20 lg:py-32", className)}
    >
      {children}
      <SectionActivity id={id} reducedBeat={reducedBeat} />
    </section>
  );
}
