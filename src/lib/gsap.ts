/**
 * The one place GSAP plugins are registered. Import GSAP from here, not from
 * "gsap" directly, so registration happens exactly once:
 *
 *   import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";
 *
 * Client only. Use from "use client" components inside useGSAP() so tweens and
 * ScrollTriggers are reverted on unmount.
 */
import "client-only";

import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

import { cubicBezier, easing, gsapEase, type EasingName } from "./motion";

let registered = false;

function register(): void {
  if (registered || typeof window === "undefined") return;
  registered = true;

  gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);

  // The CSS curves as plain ease functions: CustomEase would add about 7 KB
  // gzip (it parses SVG paths) to the initial bundle for five fixed beziers.
  for (const name of Object.keys(easing) as EasingName[]) {
    gsap.registerEase(gsapEase[name], cubicBezier(easing[name]));
  }

  gsap.defaults({ ease: gsapEase.outExpo, duration: 0.9 });
  // Mobile URL bar show/hide should not trigger a full refresh.
  ScrollTrigger.config({ ignoreMobileResize: true });
}

register();

export { gsap, ScrollTrigger, SplitText, useGSAP };
