"use client";

/**
 * Below-fold client leaves use this wrapper so a height change can refresh
 * ScrollTrigger without putting GSAP in the initial route bundle.
 */
export function requestScrollRefresh(): void {
  if (typeof window === "undefined") return;
  void import("./gsap-plugins").then((module) => module.requestScrollRefresh());
}
