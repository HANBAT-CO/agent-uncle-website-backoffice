"use client";

type ScrollDriver = (y: number) => void;

let scrollDriver: ScrollDriver | null = null;

/**
 * Lets SmoothScroll route programmatic jumps through Lenis (so its animated
 * and target positions follow). Without a driver, window.scrollTo is used.
 */
export function setScrollDriver(driver: ScrollDriver | null): void {
  scrollDriver = driver;
}

export function scrollToY(y: number): void {
  if (Math.abs(window.scrollY - y) < 1) return;
  if (scrollDriver) scrollDriver(y);
  else window.scrollTo({ top: y, behavior: "instant" });
}
