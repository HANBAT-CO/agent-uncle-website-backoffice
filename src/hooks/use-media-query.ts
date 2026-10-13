import { useSyncExternalStore } from "react";

/**
 * Subscribe to a media query without effects or resize listeners.
 *
 * `serverValue` is used for SSR and the hydration pass; pick the value that is
 * safest before the browser has answered (for motion: "reduced").
 */
export function useMediaQuery(query: string, serverValue: boolean): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** True when the user asked for reduced motion. `true` during SSR. */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery(REDUCED_MOTION_QUERY, true);
}
