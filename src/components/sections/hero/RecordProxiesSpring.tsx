"use client";

import { useEffect } from "react";

import { gsap } from "@/lib/gsap";
import { MQ } from "@/lib/gsap-plugins";
import { gsapEase } from "@/lib/motion";

import { INTRO } from "./draw-plan";
import { onIdle } from "./on-idle";

export function RecordProxiesSpring({ at }: { at: number }) {
  useEffect(() => {
    const node = document.querySelector<HTMLOListElement>("[data-hero-proxies]");
    if (!node) return;
    if (!document.documentElement.classList.contains("js-draw")) return;
    if (!window.matchMedia(MQ.desktopMotion).matches) return;
    const cards = node.querySelectorAll<HTMLElement>("[data-proxy-card]");
    // Held at the start pose until idle: inline styles win over the js-draw rule.
    gsap.set(cards, { y: 16, opacity: 0 });
    let tween: gsap.core.Tween | null = null;
    const cancel = onIdle(() => {
      tween = gsap.to(cards, {
        y: 0,
        opacity: 1,
        duration: INTRO.cardSpring,
        ease: gsapEase.snap,
        stagger: INTRO.cardStagger,
        delay: at,
      });
    });
    return () => {
      cancel();
      tween?.kill();
      gsap.set(cards, { clearProps: "transform,opacity" });
    };
  }, [at]);

  return null;
}
