"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { MQ, PIN_PRIORITY, loadMotionPath } from "@/lib/gsap-plugins";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useLowPower } from "@/lib/device";
import { gsapEase } from "@/lib/motion";
import { useStoryBeats } from "@/lib/story/use-story";

import { rulerHours } from "./ruler-scale";
import { createSkyLink } from "./sky-link";
import {
  BAND_RANGE,
  DOT_INK_RAMP,
  FALLBACK_HEIGHT,
  FALLBACK_RANGE,
  HORIZON,
  HORIZON_CURVE,
  ROUTE_V,
  fallbackShift,
  lightState,
  lightThresholds,
  progressWhenRampReaches,
  rampGradient,
} from "./sky-ramp";

/**
 * S5 dawn motion (spec S5, 3.2, 6.3, 6.5). Client wrapper around the
 * server-rendered stage: it owns the scene (the element the desktop pin
 * holds), the sky layer with its CSS gradient, the lazy WebGL sky, and one
 * gsap.matchMedia with the three branches every section uses.
 *
 * desktopMotion: pin +=120%, scrub 1. Beats [0 b0307] [0.30 b0553]
 *   [0.62 b0553d]; PhaseSync turns b0553d into the page's one theme switch.
 *   0-0.30 the confirm card (opaque from the approach on) rises y 24 to 0,
 *   확인 is fully pressed by 0.25 and held, the ruler slides 03:07 to 05:53 under
 *   the playhead; at 0.30 the card compresses into the 1차 slot (au.snap),
 *   then the slot grows to --dawn-slot-scale; 0.30-0.70 the dot rides the
 *   route (MotionPath) and inks as the sky behind it passes the lamp/ink
 *   crossover (within the spec's 0.50-0.60); the sky rises to the morning
 *   canvas by 0.70 and holds. Each text or stroke on the sky steps through
 *   four light states (sky-ramp.ts lightThresholds) as the horizon passes it.
 * mobileMotion: no pin, no WebGL; a 160vh band; the dot descends with a CSS
 *   view() timeline (three IntersectionObserver steps where unsupported);
 *   b0553 when the card centres, b0553d when the band middle crosses centre.
 * reduced: two static bands; b0553 in the night band (SectionShell
 *   reducedBeat), b0553d in the day band.
 */

const DawnSky = dynamic(() => import("./DawnSky"), { ssr: false });

const DESKTOP_BEATS = [
  [0, "b0307"],
  [0.3, "b0553"],
  [0.62, "b0553d"],
] as const;

/** Mobile and reduced report a stage: 0 before the card, 1 card (night band), 2 day. */
const STAGE_BEATS = [
  [0, "b0307"],
  [1, "b0553"],
  [2, "b0553d"],
] as const;

/** Ruler position (hours since 20:00) under the playhead as the pin starts and from 0.30 on. */
const RULER_FROM = rulerHours("03:07");
const RULER_AT = rulerHours("05:53");

/** Timeline positions (fractions of the pin). */
const AT = {
  cardIn: 0.02,
  press: 0.235,
  compress: 0.3,
  slotFill: 0.345,
  slotGrow: 0.37,
  route: 0.3,
} as const;

/**
 * The lamp inks while the sky behind the route passes the point where a mint
 * and an ink dot read equally (about 0.55): a short switch, so the dot never
 * fades into the sky mid-way.
 */
const INK_AT = progressWhenRampReaches(ROUTE_V, DOT_INK_RAMP);
const INK_SPAN = 0.012;

const SKY_STYLE = {
  "--dawn-ramp-tall": rampGradient(FALLBACK_RANGE),
  "--dawn-ramp-band": rampGradient(BAND_RANGE),
  "--dawn-ramp-height": `${FALLBACK_HEIGHT * 100}%`,
  "--dawn-ramp-shift": `${fallbackShift(0)}%`,
} as CSSProperties;

/** Layout offset of `el` inside `ancestor` (sums offsetLeft/Top, so transforms never leak in). */
function offsetWithin(el: HTMLElement, ancestor: HTMLElement): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== ancestor) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

function required<T extends Element>(scope: ParentNode, selector: string): T {
  const element = scope.querySelector<T>(selector);
  if (!element) throw new Error(`DawnMotion: missing ${selector}`);
  return element;
}

export function DawnMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [link] = useState(createSkyLink);
  const [skyHost, setSkyHost] = useState<HTMLDivElement | null>(null);
  const [near, setNear] = useState(false);
  const [skyFailed, setSkyFailed] = useState(false);
  const desktopMotion = useMediaQuery(MQ.desktopMotion, false);
  const lowPower = useLowPower();

  const reportProgress = useStoryBeats("dawn", DESKTOP_BEATS);
  const reportStage = useStoryBeats("dawn", STAGE_BEATS);

  const onSkyFallback = useCallback(() => setSkyFailed(true), []);
  const showSky = desktopMotion && !lowPower && near && !skyFailed && skyHost !== null;

  // Lazy gate (spec 13): the sky chunk and MotionPath load once the cart
  // section enters, or the dawn is within a viewport (deep links from below).
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const onEnter = (entries: IntersectionObserverEntry[]) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      cartObserver.disconnect();
      selfObserver.disconnect();
      setNear(true);
      link.markNear();
    };
    const cartObserver = new IntersectionObserver(onEnter);
    const selfObserver = new IntersectionObserver(onEnter, { rootMargin: "100% 0px" });
    const cart = document.getElementById("cart");
    if (cart) cartObserver.observe(cart);
    selfObserver.observe(element);
    return () => {
      cartObserver.disconnect();
      selfObserver.disconnect();
    };
  }, [link]);

  // Below 1024px the ruler's two slots are a sideways scroll-snap row. While it
  // overflows it must be reachable by keyboard (WCAG 2.1.1: arrow keys scroll a
  // focused region), so it becomes a tab stop. On desktop the slots sit
  // absolutely on the ruler track (overflow visible, nothing scrolls), so the
  // row stays out of the tab order there, and on phones where both slots fit.
  useEffect(() => {
    const slots = root.current?.querySelector<HTMLElement>("[data-dawn-slots]");
    if (!slots) return;
    const sync = () => {
      const scrolls = /auto|scroll/.test(getComputedStyle(slots).overflowX);
      if (scrolls && slots.scrollWidth > slots.clientWidth + 1) slots.tabIndex = 0;
      else slots.removeAttribute("tabindex");
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(slots);
    return () => {
      observer.disconnect();
      slots.removeAttribute("tabindex");
    };
  }, []);

  useGSAP(
    () => {
      const scope = root.current;
      if (!scope) return;
      const section = scope.closest<HTMLElement>("section") ?? scope;
      const scene = required<HTMLElement>(scope, "[data-dawn-scene]");
      const mm = gsap.matchMedia();

      mm.add(MQ.desktopMotion, (context) => {
        const sky = required<HTMLElement>(scene, "[data-dawn-sky]");
        const ramp = required<HTMLElement>(scene, "[data-dawn-ramp]");
        const card = required<HTMLElement>(scene, "[data-dawn-card]");
        const cardContent = required<HTMLElement>(scene, "[data-dawn-card-content]");
        const confirm = required<HTMLElement>(scene, "[data-dawn-confirm]");
        const ruler = required<HTMLElement>(scene, "[data-dawn-ruler]");
        const rulerWindow = required<HTMLElement>(scene, "[data-dawn-window]");
        const slot = required<HTMLElement>(scene, '[data-dawn-slot="active"]');
        const slotFill = required<HTMLElement>(scene, "[data-dawn-slot-fill]");
        const route = required<HTMLElement>(scene, "[data-dawn-route]");
        const routeSvg = required<SVGSVGElement>(route, "svg");
        const litLine = required<SVGLineElement>(route, "[data-dawn-lit-line]");
        const dot = required<HTMLElement>(route, "[data-dot]");
        const litTargets = gsap.utils.toArray<HTMLElement>("[data-dawn-lit]", scene);
        const firstLines = gsap.utils.toArray<HTMLElement>("[data-dawn-lit-first]", scene);
        let thresholds: (readonly [number, number, number])[] = litTargets.map(() => [1, 1, 1]);
        let firstThresholds: (readonly [number, number, number])[] = firstLines.map(() => [1, 1, 1]);

        // Each element steps night, night-strong, day-strong, day from the ramp
        // behind its own edges (sky-ramp.ts), so a label never waits for its
        // container and no secondary ink sits on a mid-tone sky. The shader's
        // horizon sags towards the frame edges (HORIZON_CURVE), so an element
        // near an edge takes the light that much later. A paragraph marked
        // data-dawn-lit-first takes it line by line: its first line on its own
        // (::first-line), the rest from the second line down, so the horizon
        // never has to cross two lines that share one ink.
        const measureLight = () => {
          const height = scene.offsetHeight || 1;
          const width = scene.offsetWidth || 1;
          const span = (el: HTMLElement, from: number, to: number) => {
            const offset = offsetWithin(el, scene);
            const x = ((offset.x + el.offsetWidth / 2) / width - 0.5) * (width / height);
            const sag = HORIZON_CURVE * x * x;
            return lightThresholds((offset.y + from) / height - sag, (offset.y + to) / height - sag);
          };
          const firstLine = (el: HTMLElement) => Math.min(el.offsetHeight, Number.parseFloat(getComputedStyle(el).lineHeight) || el.offsetHeight);
          thresholds = litTargets.map((el) => {
            const line = el.hasAttribute("data-dawn-lit-first") ? firstLine(el) : 0;
            return span(el, el.offsetHeight - line >= line / 2 ? line : 0, el.offsetHeight);
          });
          firstThresholds = firstLines.map((el) => span(el, 0, firstLine(el)));
        };
        const applyLight = (progress: number) => {
          litTargets.forEach((el, index) => {
            const next = lightState(thresholds[index], progress);
            if (el.dataset.dawnLit !== next) el.dataset.dawnLit = next;
          });
          firstLines.forEach((el, index) => {
            const next = lightState(firstThresholds[index], progress);
            if (el.dataset.dawnLitFirst !== next) el.dataset.dawnLitFirst = next;
          });
        };

        // The landed slot's scale comes from CSS (larger on tall viewports).
        const slotScale = () => Number.parseFloat(getComputedStyle(slot).getPropertyValue("--dawn-slot-scale")) || 1.25;

        // The motion path, in the dot's own translate space: from the 청평화
        // origin (where CSS centres the dot) to the destination node. A function,
        // so it is measured when the tween re-initialises after each refresh (the
        // pin's inline width is stale during refreshInit); no align, so a refresh
        // mid-route never mixes in the dot's current transform.
        const routeData = () => `M0 0 H${Math.max(1, routeSvg.clientWidth)}`;
        measureLight();

        // Where the card lands: the 1차 slot centred under the playhead (0.30 on).
        const landing = () => {
          const from = offsetWithin(card, scene);
          const windowAt = offsetWithin(rulerWindow, scene);
          const slotAt = offsetWithin(slot, scene);
          const cardWidth = card.offsetWidth || 1;
          const cardHeight = card.offsetHeight || 1;
          return {
            x: windowAt.x + rulerWindow.offsetWidth / 2 - (from.x + cardWidth / 2),
            y: slotAt.y + slot.offsetHeight / 2 - (from.y + cardHeight / 2),
            scaleX: slot.offsetWidth / cardWidth,
            scaleY: slot.offsetHeight / cardHeight,
          };
        };

        const tl = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: {
            trigger: scene,
            start: "top top",
            end: "+=120%",
            pin: scene,
            scrub: 1,
            invalidateOnRefresh: true,
            refreshPriority: PIN_PRIORITY.dawn,
            onUpdate: (self) => reportProgress(self.progress),
            onToggle: () => link.wake(),
            onRefresh: (self) => {
              measureLight();
              applyLight(self.animation?.progress() ?? self.progress);
              link.wake();
            },
          },
          onUpdate: () => {
            applyLight(tl.progress());
            link.wake();
          },
        });

        // The sky's CSS fallback: one transform per frame, on the shader's own
        // horizon curve (ease-in t^power). y 0: GSAP would otherwise keep the
        // stylesheet's translateY as pixels and add yPercent on top.
        tl.fromTo(
          ramp,
          { y: 0, yPercent: fallbackShift(0) },
          { yPercent: fallbackShift(HORIZON.until), ease: (t: number) => t ** HORIZON.power, duration: HORIZON.until },
          0,
        );

        // The cart's plate feathers into the night; the feather leaves before the light comes.
        tl.fromTo(sky, { "--dawn-seam": 1 }, { "--dawn-seam": 0, duration: 0.1 }, 0);

        // 0-0.30: the confirm card (opaque, a record surface) rises; 확인 is
        // pressed by 0.25 and held until the card compresses.
        tl.fromTo(card, { y: 24 }, { y: 0, duration: 0.2 }, AT.cardIn);
        tl.fromTo(
          confirm,
          { scale: 1, backgroundColor: "#0C483E", boxShadow: "inset 0 0 0 0px rgba(242, 255, 232, 0)" },
          { scale: 0.96, backgroundColor: "#093A32", boxShadow: "inset 0 0 0 2px rgba(242, 255, 232, 0.5)", duration: 0.015 },
          AT.press,
        );

        // The ruler slides from 03:07 to 05:53 under the playhead and stays.
        tl.fromTo(ruler, { "--ruler-at": RULER_FROM }, { "--ruler-at": RULER_AT, duration: AT.compress }, 0);

        // 0.30: the card compresses into the 1차 slot, which takes over as paper.
        tl.fromTo(
          card,
          { x: 0, y: 0, scaleX: 1, scaleY: 1 },
          {
            x: () => landing().x,
            y: () => landing().y,
            scaleX: () => landing().scaleX,
            scaleY: () => landing().scaleY,
            ease: gsapEase.snap,
            duration: 0.07,
            immediateRender: false,
          },
          AT.compress,
        );
        tl.fromTo(cardContent, { opacity: 1 }, { opacity: 0, duration: 0.035, immediateRender: false }, AT.compress);
        tl.fromTo(card, { opacity: 1 }, { opacity: 0, duration: 0.02, immediateRender: false }, AT.slotFill + 0.005);
        tl.fromTo(slotFill, { opacity: 0 }, { opacity: 1, duration: 0.025 }, AT.slotFill);
        tl.fromTo(slot, { scale: 1 }, { scale: () => slotScale(), ease: gsapEase.snap, duration: 0.08 }, AT.slotGrow);

        // 0.30-0.70: the route lights behind the dot; the lamp inks as it crosses the horizon.
        tl.fromTo(litLine, { attr: { x2: "0%" } }, { attr: { x2: "100%" }, duration: 0.4 }, AT.route);
        tl.fromTo(
          dot,
          { backgroundColor: "#F2FFE8", "--dawn-ring": 1 },
          { backgroundColor: "#0C483E", "--dawn-ring": 0, duration: INK_SPAN },
          INK_AT - INK_SPAN / 2,
        );

        // Hold to 1.
        tl.set({}, {}, 1);

        const trigger = tl.scrollTrigger;
        // Running: the pin is active, or the scrubbed timeline still lags the scroll.
        link.setSource({
          progress: () => tl.progress(),
          running: () => Boolean(trigger?.isActive) || Math.abs(tl.progress() - (trigger?.progress ?? tl.progress())) > 1e-4,
        });

        // MotionPath is lazy (spec 13): the dot waits at the origin until it loads.
        let alive = true;
        const cancelNear = link.whenNear(() => {
          void loadMotionPath().then(
            () => {
              if (!alive) return;
              context.add(() => {
                tl.to(
                  dot,
                  {
                    motionPath: { path: routeData },
                    duration: 0.4,
                    immediateRender: false,
                  },
                  AT.route,
                );
                tl.render(tl.totalTime(), true, true);
              });
            },
            () => {
              if (!alive) return;
              context.add(() => {
                tl.to(
                  dot,
                  {
                    x: () => Math.max(1, routeSvg.clientWidth),
                    duration: 0.4,
                    immediateRender: false,
                  },
                  AT.route,
                );
                tl.render(tl.totalTime(), true, true);
              });
            },
          );
        });

        return () => {
          alive = false;
          cancelNear();
          link.setSource(null);
          for (const el of litTargets) el.dataset.dawnLit = "night";
          for (const el of firstLines) el.dataset.dawnLitFirst = "night";
        };
      });

      mm.add(MQ.mobileMotion, () => {
        const card = required<HTMLElement>(scene, "[data-dawn-card]");
        const route = required<HTMLElement>(scene, "[data-dawn-route]");
        const destCard = required<HTMLElement>(scene, ".dawn-dest-card");

        // The band grows past 160vh when its content needs it (landscape
        // phones, large text): the route, its colour split and the view()
        // ranges follow the measured band, and the route ends at the
        // destination card's middle.
        const measureBand = () => {
          const height = scene.offsetHeight;
          const destMiddle = offsetWithin(destCard, scene).y + destCard.offsetHeight / 2;
          scene.style.setProperty("--dawn-band-h", `${height}px`);
          scene.style.setProperty("--dawn-route-bottom", `${Math.max(0, Math.round(height - destMiddle))}px`);
        };
        measureBand();
        const bandObserver = new ResizeObserver(measureBand);
        bandObserver.observe(scene);
        bandObserver.observe(destCard);

        // Beats are a pure function of scroll: compare against the trigger starts.
        const cardCentre = ScrollTrigger.create({ trigger: card, start: "center center" });
        const bandMiddle = ScrollTrigger.create({ trigger: scene, start: "center center" });
        const sync = (scroll: number) => reportStage(scroll >= bandMiddle.start ? 2 : scroll >= cardCentre.start ? 1 : 0);
        ScrollTrigger.create({
          trigger: scene,
          start: "top bottom",
          end: "bottom top",
          onUpdate: (self) => sync(self.scroll()),
          onRefresh: (self) => sync(self.scroll()),
        });

        const cleanBand = () => {
          bandObserver.disconnect();
          scene.style.removeProperty("--dawn-band-h");
          scene.style.removeProperty("--dawn-route-bottom");
        };

        // The dot descends with a CSS view() timeline; elsewhere it steps at 25, 50 and 75%.
        if (typeof CSS !== "undefined" && CSS.supports("animation-timeline: view()")) return cleanBand;
        const steps = gsap.utils.toArray<HTMLElement>("[data-dawn-step]", route);
        // Root: the top half of the viewport. A sentinel (its step to the route's
        // end) enters it as its step crosses the centre line, whatever the jump.
        const centreLine = new IntersectionObserver(
          () => {
            const centre = window.innerHeight / 2;
            const passed = steps.filter((step) => step.getBoundingClientRect().top < centre).length;
            route.dataset.step = String(passed);
          },
          { rootMargin: "0px 0px -50% 0px" },
        );
        for (const step of steps) centreLine.observe(step);
        return () => {
          cleanBand();
          centreLine.disconnect();
          delete route.dataset.step;
        };
      });

      mm.add(MQ.reduced, () => {
        const dayBand = required<HTMLElement>(scene, '[data-dawn-band="day"]');
        // SectionActivity reports b0553 when the section becomes active; this
        // corrects it to b0553d in the day band. Deferred so it always lands last.
        ScrollTrigger.create({
          trigger: dayBand,
          start: "top center",
          endTrigger: section,
          end: "bottom center",
          onToggle: (self) => {
            const scroll = self.scroll();
            const start = self.start;
            queueMicrotask(() => reportStage(scroll >= start ? 2 : 1));
          },
        });
      });

      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <div ref={root} className="dawn-root">
      <div className="dawn-scene" data-dawn-scene>
        <div ref={setSkyHost} className="dawn-sky" data-dawn-sky data-sky="css" aria-hidden="true" style={SKY_STYLE}>
          <div className="dawn-sky-ramp" data-dawn-ramp />
        </div>
        {showSky && skyHost ? <DawnSky host={skyHost} link={link} onFallback={onSkyFallback} /> : null}
        {children}
      </div>
    </div>
  );
}
