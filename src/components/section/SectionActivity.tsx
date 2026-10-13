"use client";

import { useEffect, useRef } from "react";

import { SECTION_DEFAULT_BEAT, type BeatId, type SectionId } from "@/content/story";
import { story } from "@/lib/story/store";

/**
 * Tells the story store which section holds the viewport's horizontal centre
 * line (spec 3.3): one ScrollTrigger per section from 'top center' to
 * 'bottom center'. Adjacent sections tile, so exactly one is active.
 *
 * Under reduced motion, sections render their final composed state and
 * report their final beat when active (spec 6.5); `reducedBeat` defaults to
 * the section's default beat.
 *
 * Renders an empty hidden marker inside its section and measures the
 * enclosing [data-section] element. refreshPriority -1: computed after every
 * pin above it has added its spacing.
 */
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function SectionActivity({ id, reducedBeat }: { id: SectionId; reducedBeat?: BeatId }) {
  const marker = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const section = marker.current?.closest<HTMLElement>(`[data-section="${id}"]`);
    if (!section) return;
    const finalBeat = reducedBeat ?? SECTION_DEFAULT_BEAT[id];
    let trigger: { kill: () => void } | null = null;
    let cancelled = false;

    void import("@/lib/gsap").then(({ ScrollTrigger }) => {
      if (cancelled) return;
      const activate = () => {
        story.setActive(id);
        if (window.matchMedia(REDUCED_MOTION_QUERY).matches) story.reportBeat(id, finalBeat);
      };
      trigger = ScrollTrigger.create({
        trigger: section,
        start: "top center",
        end: "bottom center",
        refreshPriority: -1,
        onToggle: ({ isActive }: { isActive: boolean }) => {
          if (isActive) activate();
        },
        onUpdate: ({ isActive }: { isActive: boolean }) => {
          if (isActive) activate();
        },
        onRefresh: ({ isActive }: { isActive: boolean }) => {
          if (isActive) activate();
        },
      });
      ScrollTrigger.update();
    });

    return () => {
      cancelled = true;
      trigger?.kill();
    };
  }, [id, reducedBeat]);

  return <span ref={marker} hidden data-section-activity={id} />;
}
