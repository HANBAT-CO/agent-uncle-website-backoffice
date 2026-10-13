import { useSyncExternalStore } from "react";

import { useMediaQuery } from "@/hooks/use-media-query";

/**
 * Device heuristics (spec 6.6). Client components only.
 *
 * lowPower: no ogl sky (CSS gradient), physics bodies halved, map rotateX
 * removed, no video autoplay (posters with play). The inline JS_DRAW script in
 * src/app/(site)/layout.tsx mirrors isLowPower(); change both together.
 */

export type DeviceHints = {
  hardwareConcurrency?: number;
  /** Chromium only, in GB (rounded down, capped at 8). */
  deviceMemory?: number;
  /** Network Information API, Chromium only. */
  connection?: { saveData?: boolean };
  /** Used only to spot iOS / iPadOS, where the core count is clamped. */
  userAgent?: string;
  maxTouchPoints?: number;
};

/**
 * iOS or iPadOS (iPadOS sends a Mac user agent, but with touch points). Every
 * browser there is WebKit, which reports hardwareConcurrency as 4 below 8
 * logical cores and 8 above (a fingerprinting clamp): a 6-core iPhone reads 4,
 * so on these devices a 4 carries no information.
 */
function hasClampedCoreCount(hints: DeviceHints): boolean {
  const ua = hints.userAgent ?? "";
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (hints.maxTouchPoints ?? 0) > 1);
  return ios && hints.hardwareConcurrency === 4;
}

/**
 * Save-Data on, or 4 or fewer cores, or 4 GB or less memory (spec 6.6).
 * Unknown values never count, and WebKit's clamped 4 on iOS / iPadOS is
 * unknown: read literally it would put every iPhone on the low-power path,
 * which the WebKit e2e project (8 cores reported on the Mac) never exercises.
 * Low Power Mode on iOS is still handled: it rejects play(), and players fall
 * back to the poster.
 */
export function isLowPower(hints: DeviceHints): boolean {
  const cores = hasClampedCoreCount(hints) ? 0 : (hints.hardwareConcurrency ?? 0);
  const memory = hints.deviceMemory ?? 0;
  return Boolean(hints.connection?.saveData) || (cores > 0 && cores <= 4) || (memory > 0 && memory <= 4);
}

type NavigatorWithHints = Navigator & {
  deviceMemory?: number;
  connection?: { saveData?: boolean } & EventTarget;
};

function subscribeConnection(onChange: () => void): () => void {
  const connection = (navigator as NavigatorWithHints).connection;
  if (!connection || typeof connection.addEventListener !== "function") return () => {};
  connection.addEventListener("change", onChange);
  return () => connection.removeEventListener("change", onChange);
}

function readLowPower(): boolean {
  return isLowPower(navigator as NavigatorWithHints);
}

/** True on low-power devices. `true` during SSR and hydration (the safe default: no heavy work). */
export function useLowPower(): boolean {
  return useSyncExternalStore(subscribeConnection, readLowPower, () => true);
}

/** True with a precise pointer (mouse, trackpad). `false` during SSR. */
export function useFinePointer(): boolean {
  return useMediaQuery("(pointer: fine)", false);
}
