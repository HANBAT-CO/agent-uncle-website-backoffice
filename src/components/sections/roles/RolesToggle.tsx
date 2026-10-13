"use client";

import { useRef } from "react";

import { mediaManager } from "@/components/device/media-manager";
import { QuantityDot } from "@/components/dot/QuantityDot";
import { roles } from "@/content/copy";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";
import { loadDrawSVG, MQ } from "@/lib/gsap-plugins";
import { gsapEase } from "@/lib/motion";

import { ENTRY_START, pastEntry } from "./entry";
import type { OutlineSide } from "./outline-boxes";

/**
 * The S7 role toggle below 1024px (spec S7): a radiogroup 소매업자 / 사입삼촌
 * whose sliding thumb carries the ink dot. Native radio inputs, so arrow keys
 * work and, through CSS :has(), the toggle switches devices even before (or
 * without) hydration. roles.css crossfades the devices over 700ms on the snap
 * curve; the global reduced-motion rule makes that instant, and under reduced
 * motion the toggle is hidden and both devices stack.
 *
 * This leaf adds what CSS cannot: a switch pauses any playing clip (the
 * hidden device would keep playing, since hiding does not change its
 * visibility ratio; DeviceVideo then puts that device back on its still),
 * and in mobileMotion DrawSVG draws the active device's outline once that
 * device's own card is in view (the retailer's sits higher on its screen than
 * the uncle's; a card already in view when DrawSVG arrives stays as drawn)
 * and redraws it after a switch.
 *
 * roles.css keeps the toggle stuck under the nav while the device below it
 * scrolls past, so the switch and the outlined card are on screen together.
 * Stuck, it sits on a ground-coloured band from the top of the screen, so the
 * device passes under a header rather than showing cut around the toggle.
 */

const SIDES: readonly OutlineSide[] = ["retailer", "uncle"];

export function RolesToggle() {
  const root = useRef<HTMLDivElement>(null);
  const redraw = useRef<((side: OutlineSide) => void) | null>(null);

  useGSAP(
    (_context, contextSafe) => {
      const section = root.current?.closest<HTMLElement>("[data-roles]");
      if (!section || !contextSafe) return;
      const outline = (side: OutlineSide) =>
        section.querySelector<SVGPathElement>(`[data-roles-outline="${side}"]`);
      const activeSide = (): OutlineSide =>
        section.querySelector<HTMLInputElement>('[data-roles-view="uncle"]')?.checked ? "uncle" : "retailer";

      const mm = gsap.matchMedia();
      mm.add(MQ.mobileMotion, () => {
        let cancelled = false;
        let entered = false;
        const entries = new Map<OutlineSide, ScrollTrigger>();
        const killEntries = () => {
          for (const trigger of entries.values()) trigger.kill();
          entries.clear();
        };
        const paths = SIDES.map(outline).filter((path): path is SVGPathElement => path !== null);

        const draw = contextSafe((side: OutlineSide, delay: number) => {
          const path = outline(side);
          if (!path) return;
          gsap.killTweensOf(path);
          gsap
            .timeline({ delay })
            .fromTo(path, { drawSVG: "50% 50%", fillOpacity: 0 }, { drawSVG: "0% 100%", duration: 0.8, ease: gsapEase.inOutQuart })
            .to(path, { fillOpacity: 1, duration: 0.3, ease: gsapEase.snap })
            // A finished DrawSVG keeps a fixed dash; clear it so a resize never cuts the stroke.
            .set(path, { clearProps: "all" });
        });

        void loadDrawSVG().then(
          contextSafe(() => {
            if (cancelled || paths.length === 0) return;
            const enter = (side: OutlineSide, delay: number) => {
              if (entered || side !== activeSide()) return;
              entered = true;
              draw(side, delay);
              killEntries();
            };
            // After a switch the new device's outline draws in as the crossfade lands; before the
            // entry, a switch to a device whose card is already in view enters with it.
            redraw.current = (side) => {
              if (entered) draw(side, 0.15);
              else if ((entries.get(side)?.progress ?? 0) > 0) enter(side, 0.15);
            };

            // DrawSVG arriving with the showing card already past its entry point (a reload
            // mid-page) leaves that outline as the server drew it; switches still draw.
            const showing = outline(activeSide());
            if (showing && pastEntry(showing)) {
              entered = true;
              return;
            }

            gsap.set(paths, { drawSVG: "50% 50%", fillOpacity: 0 });
            // Only the showing device's card starts the draw, once 90% of it is above the viewport's
            // bottom (entry.ts, as on desktop): the retailer's card sits higher on its screen than
            // the uncle's, so each waits for its own and neither shows undrawn on screen.
            for (const side of SIDES) {
              const card = outline(side);
              if (!card || entered) continue;
              entries.set(
                side,
                ScrollTrigger.create({
                  trigger: card,
                  start: ENTRY_START,
                  end: "bottom top",
                  onEnter: () => enter(side, 0),
                  onEnterBack: () => enter(side, 0),
                  onLeave: () => enter(side, 0),
                  onRefresh: (self) => {
                    if (self.progress > 0) enter(side, 0);
                  },
                }),
              );
            }
            // A trigger created on screen enters at once, before the loop above has stored it.
            if (entered) killEntries();
          }),
        );

        return () => {
          cancelled = true;
          redraw.current = null;
          killEntries();
          gsap.killTweensOf(paths);
          gsap.set(paths, { clearProps: "all" });
        };
      });
    },
    { scope: root },
  );

  const onChange = (side: OutlineSide) => {
    mediaManager.pauseAll();
    redraw.current?.(side);
  };

  return (
    <div ref={root} role="radiogroup" aria-label={roles.toggle.label} className="roles-toggle" data-roles-toggle="">
      <span className="roles-toggle-thumb" aria-hidden="true">
        <QuantityDot tone="ink" />
      </span>
      {SIDES.map((side, index) => (
        <label key={side} className="roles-toggle-option">
          <input
            type="radio"
            name="roles-view"
            value={side}
            defaultChecked={index === 0}
            aria-controls={`roles-side-${side}`}
            data-roles-view={side}
            onChange={() => onChange(side)}
          />
          <span>{roles.toggle.options[index]}</span>
        </label>
      ))}
    </div>
  );
}
