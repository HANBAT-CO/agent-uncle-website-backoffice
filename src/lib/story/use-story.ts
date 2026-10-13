import { useCallback, useLayoutEffect, useRef } from "react";
import { useSyncExternalStoreWithSelector } from "use-sync-external-store/with-selector";

import type { BeatId, SectionId } from "@/content/story";

import { beatForProgress } from "./derive";
import { story, type StoryState } from "./store";

/**
 * React bindings for the story store. Client components only.
 *
 *   const chrome = useStorySelector(chromeFor);          // chrome reads
 *   const report = useStoryBeats("route", MARKERS);      // sections report
 *   ScrollTrigger.create({ ..., onUpdate: (self) => report(self.progress) });
 *
 * The server snapshot is the store's initial state (active hero, nothing
 * reported), so SSR and the hydration pass render the 22:00 state.
 */

/** Object.is for primitives; one level deep for arrays and plain objects. */
export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && Object.is(left[key], right[key]));
}

/**
 * Subscribe to a slice of the story state. The selection is kept while it
 * stays shallow-equal, so selectors may return fresh objects or arrays
 * (chromeFor, currentLedger, railEntries) without re-rendering every tick.
 */
export function useStorySelector<T>(
  selector: (s: StoryState) => T,
  isEqual: (a: T, b: T) => boolean = shallowEqual,
): T {
  return useSyncExternalStoreWithSelector(story.subscribe, story.getState, story.getServerState, selector, isEqual);
}

export type BeatMarkers = ReadonlyArray<readonly [number, BeatId]>;

/**
 * A stable callback for a section's own scroll progress (0..1). It maps the
 * progress to the last marker at or below it and reports that beat only when
 * it differs from the beat the store already holds for the section, so it can
 * be called from every ScrollTrigger onUpdate.
 */
export function useStoryBeats(section: SectionId, markers: BeatMarkers): (progress: number) => void {
  const markersRef = useRef(markers);

  useLayoutEffect(() => {
    markersRef.current = markers;
  }, [markers]);

  return useCallback(
    (progress: number) => {
      const beat = beatForProgress(markersRef.current, progress);
      if (beat === null || story.getState().beats[section] === beat) return;
      story.reportBeat(section, beat);
    },
    [section],
  );
}
