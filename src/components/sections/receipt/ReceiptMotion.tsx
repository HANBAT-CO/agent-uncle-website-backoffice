"use client";

import type { RefObject } from "react";

import { gsap, useGSAP } from "@/lib/gsap";
import { MQ } from "@/lib/gsap-plugins";

/**
 * The slip's scroll entrance (spec S6, after Grail: a paper sheet slides up
 * tilted and straightens). GSAP owns only the plain .receipt-tilt div; the
 * TearTicket and its stub inside are Motion's, so the two engines never touch
 * the same element (spec 6.1).
 *
 * desktopMotion: as the slip's top moves from 100% to 40% of the viewport it
 * rotates -3deg to 0 and rises 12vh to 0 (scrub, no pin). The trigger is the
 * untransformed anchor, so the measured range never depends on the tween.
 * mobileMotion and reduced: no transform.
 *
 * The island keeps the server-rendered anchor and slip mounted; this lazy
 * controller only attaches the desktop entrance animation once the slip is
 * near the viewport.
 */
export function ReceiptMotion({ anchorRef }: { anchorRef: RefObject<HTMLDivElement | null> }) {
  useGSAP(
    () => {
      const anchor = anchorRef.current;
      const tilt = anchor?.querySelector<HTMLElement>(".receipt-tilt");
      if (!anchor || !tilt) return;
      const mm = gsap.matchMedia();
      mm.add(MQ.desktopMotion, () => {
        gsap.fromTo(
          tilt,
          { rotation: -3, y: () => window.innerHeight * 0.12 },
          {
            rotation: 0,
            y: 0,
            ease: "none",
            scrollTrigger: {
              trigger: anchor,
              start: "top bottom",
              end: "top 40%",
              scrub: 0.6,
              invalidateOnRefresh: true,
            },
          },
        );
      });
      return () => mm.revert();
    },
    { scope: anchorRef },
  );

  return null;
}
