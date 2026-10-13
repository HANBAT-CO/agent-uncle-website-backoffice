"use client";

import { useEffect } from "react";

import { chromeFor } from "@/lib/story/derive";
import { useStorySelector } from "@/lib/story/use-story";

/**
 * Phase sync (spec 5.5): the page's single theme switch. Writes
 * html[data-phase] (night or day) and the theme-color meta (#07231C night,
 * #EDECE3 day) whenever the current beat's phase changes. SSR starts at night
 * (root layout); the chrome's colours follow the attribute through CSS
 * variables with 700ms transitions (chrome.css), so nothing here animates.
 */

const THEME_COLOR = { night: "#07231C", day: "#EDECE3" } as const;

export function PhaseSync() {
  const phase = useStorySelector((s) => chromeFor(s).phase);

  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.phase !== phase) root.dataset.phase = phase;

    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = THEME_COLOR[phase];
  }, [phase]);

  return null;
}
