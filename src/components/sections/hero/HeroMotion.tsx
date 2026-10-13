"use client";

import { useEffect, useRef, type ReactNode } from "react";

import type { MapBuildingId } from "@/components/map/views";
import { useSmoothScroll } from "@/components/motion/SmoothScroll";
import { isLowPower, type DeviceHints } from "@/lib/device";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";
import { MQ, PIN_PRIORITY } from "@/lib/gsap-plugins";
import { gsapEase } from "@/lib/motion";
import { useStoryBeats } from "@/lib/story/use-story";

import { DRAW_DURATION_S, INTRO, type DrawPlan, type IntroSchedule } from "./draw-plan";
import { dashFor, screenLength } from "./draw-strokes";
import { LATE_INTRO_MS, PROXY_DONE_AT } from "./hero-config";
import { COPY_SPAN, liftOffset, liftOpacity, MAP_SPAN, planLift, type LiftPlan, type Rect } from "./lift-plan";
import { onIdle } from "./on-idle";

/**
 * S1 motion (spec S1, 3.2, 6.3): the client wrapper that owns the pinned
 * inner element (.hero-pin) around the server-rendered hero.
 *
 * desktopMotion '(min-width: 1024px) and (prefers-reduced-motion: no-preference)':
 * - Draw-in, only under html.js-draw (set before first paint by the inline
 *   head script on desktop motion when the device is not low power): on idle,
 *   every stroke draws over 900ms on the snap curve (draw-strokes.ts: dash
 *   styles from the server's stroke lengths and one read of the map's screen
 *   scale, so no frame measures anything), starting from
 *   청평화 at 40ms per 10 world units (ground lines grow outward from their
 *   point nearest to 청평화); floor ticks fade in last (300ms), the labels and
 *   the uncle chip with them; the dot scales 0 to 1 (400ms); the lens, its
 *   record layer and the readout fade in on the record token. RecordProxies
 *   springs the record cards in on the same clock. Then html.js-draw goes and
 *   every inline draw style is cleared, so nothing depends on it afterwards.
 *   If the motion never runs, hero.css reveals the map at 8s on its own.
 * - Dive: pin +=100%, scrub 0.6. 0-0.6 the frame opens (clip-path inset 20px
 *   round 24 to 0), the map scales 1 to 1.6 of S2's map box (endScale) and
 *   tilts 0 to 10deg (perspective 1200, origin on 청평화's roof; no tilt on
 *   low-power devices; the strokes are non-scaling, so they stay 1px), and
 *   the other buildings fade to 35%. The text block and the honesty
 *   line fade (opacity only: the H1 stays in the accessibility tree) over at
 *   most 0-0.2 while rising up to 64px on an ease-in; lift-plan.ts measures,
 *   on every refresh, how soon the scaling dot reaches the text on this
 *   screen and shortens the fade and the rise until the dot only ever meets
 *   text at 40% opacity or less (1440x900 keeps 0.2 and 64px, 1366x768 fades
 *   faster and barely rises). The other labels and the uncle chip fade over
 *   0.15 and the lens over 0.1, never slower than the text. 0.25-0.88 the
 *   record card proxies fly to the rail slots, aimed at where the slots are
 *   on every tick of the flight (min 1280px; between 1024 and 1279px they
 *   fade out over 0.25-0.55); 0.6-1 the frame's bottom edge fades to the
 *   ground. The pin ends on the dive's payoff: 청평화 and its lit dot at full
 *   strength. Above 0.98 the proxies hide and data-proxy-done tells the rail
 *   to show its own entries; scrolling back undoes all of it.
 * - Settle (after the pin, as S2's heading comes up: the next section's top
 *   from 82% to 50% of the viewport): the map dims to S2's 25% and its strokes
 *   ease to the shared dim value, and 청평화's label and the dot fade over its
 *   first 40% (gone before they scroll under the nav). The hero hands S2 its
 *   first frame only once S2's heading is on screen (data-hero-settled at the
 *   end).
 * - The pinned element sits in its own spacer (.hero-pin-spacer, passed as
 *   pinSpacer), so ScrollTrigger refreshes never move it in the DOM and a
 *   focused building button keeps its focus.
 * - Keyboard focus on a hero control once the dive has begun scrolls back to
 *   the top of the pin (the control is then in full view). The faded
 *   controls stay in the focus order for this (hero.css only takes them off
 *   the pointer), also after the settle: Shift+Tab from S2 comes back here.
 * - Fades of the labels, the uncle chip and the lens parts go through CSS
 *   variables: the draw-in owns --intro-*, the dive owns --dive-* (hero.css
 *   multiplies them), so a refresh during the draw-in never fights it.
 * - Scroll work: the progress callbacks only write (opacity, translate,
 *   transforms through quickSetters, a few custom properties), skipping
 *   values that did not change. Everything measured (the stage probe, the
 *   map's origin, the dot, the text lines) is read once per ScrollTrigger
 *   refresh; only the cards' flight reads the rail slots per tick, before the
 *   tick's writes. A refresh renders with callbacks suppressed, so every
 *   callback-driven state (lift, flight, settle, attributes) is re-applied
 *   from onRefresh.
 * mobileMotion and reduced: no pin, no draw-in (html.js-draw is removed).
 *
 * Story: reports b2200 throughout (its only marker).
 */

const BEATS = [[0, "b2200"]] as const;

/** The map's tilt at the end of its dive (deg) and its perspective (px). */
const TILT = 10;
const PERSPECTIVE = 1200;
/** The record card proxies' flight to the rail: still travelling in the pin's last third. */
const FLIGHT = { start: 0.25, end: 0.88 } as const;
/** Between 1024 and 1279px (no rail) the proxies fade over this share of the flight (0.25-0.55 of the pin). */
const NO_RAIL_FADE = 0.48;
/** The lens parts and the other labels fade over at most these shares of the pin, never slower than the text. */
const LENS_FADE = 0.1;
const LABEL_FADE = 0.15;
/** S2's dim copy of the map (words.css). */
const S2_MAP_OPACITY = 0.25;
/** Share of the settle over which 청평화's label and the dot fade. */
const FOCUS_FADE = 0.4;

const round4 = (value: number) => Math.round(value * 1e4) / 1e4;

type HeroMotionProps = {
  plan: DrawPlan;
  schedule: IntroSchedule;
  focus: MapBuildingId;
  children: ReactNode;
};

/**
 * One record card proxy's flight to its rail slot. x/y: the translate last
 * written; dx/dy: the slot's offset from the proxy's untransformed place;
 * opacity/visibility: the inline values last written (null: not yet).
 */
type Flight = {
  element: HTMLElement;
  slot: HTMLElement | null;
  x: number;
  y: number;
  dx: number;
  dy: number;
  opacity: string | null;
  visibility: string | null;
  setX: (value: number) => void;
  setY: (value: number) => void;
};

/** The dive's rest geometry, in px inside the pinned element (offsets: no transform leaks in). */
type Geometry = {
  /** The map's transform origin, from its own top-left corner (null: not measurable). */
  origin: { x: number; y: number } | null;
  /** The map's top-left corner and size. */
  map: { x: number; y: number; width: number; height: number };
  /** The desktop map box's size. */
  box: { width: number; height: number };
  /** S2's stage area (null without the probe). */
  probe: { x: number; y: number; width: number; height: number } | null;
  /** The lamp dot (null when it is not laid out). */
  dot: { left: number; top: number; width: number; height: number } | null;
  /** The text block's lines that are laid out. */
  text: Rect[];
};

/** Layout offset of `element` inside `ancestor` (offsetLeft/Top chain: transforms never leak in). */
function offsetWithin(element: HTMLElement, ancestor: HTMLElement): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = element;
  while (node && node !== ancestor) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * The run of the desktop branch that owns the draw-in. A cleanup reveals the
 * map one tick later unless a newer run has taken over by then: React's
 * development double-invoke (mount, cleanup, mount) and a matchMedia re-run
 * keep the draw-in, a real unmount or a switch to phones shows the map drawn.
 */
const intro = { owner: 0 };

function endDraw(root: ParentNode): void {
  document.documentElement.classList.remove("js-draw");
  for (const path of root.querySelectorAll<SVGElement>("[data-drawable]")) {
    path.style.removeProperty("stroke-dasharray");
    path.style.removeProperty("stroke-dashoffset");
  }
}

export function HeroMotion({ plan, schedule, focus, children }: HeroMotionProps) {
  const root = useRef<HTMLDivElement>(null);
  const spacer = useRef<HTMLDivElement>(null);
  const report = useStoryBeats("hero", BEATS);
  // Read from inside the motion setup without making it a dependency (it changes with Lenis).
  const { scrollTo } = useSmoothScroll();
  const scrollToRef = useRef(scrollTo);
  useEffect(() => {
    scrollToRef.current = scrollTo;
  });

  useGSAP(
    () => {
      const pin = root.current;
      const pinSpacer = spacer.current;
      const section = pin?.closest<HTMLElement>('[data-section="hero"]');
      if (!pin || !pinSpacer || !section) return;
      report(0);

      const desktopBox = pin.querySelector<HTMLElement>('[data-hero-map-box="desktop"]');
      const html = document.documentElement;
      const mm = gsap.matchMedia();

      mm.add(MQ.desktopMotion, (context) => {
        if (!desktopBox) return;
        const map = desktopBox.querySelector<HTMLElement>("[data-hero-map]");
        const shift = desktopBox.querySelector<HTMLElement>("[data-hero-map-shift]");
        const base = desktopBox.querySelector<SVGSVGElement>('[data-map-layer="base"]');
        if (!map || !shift || !base) return;

        /* ---------------- Draw-in ---------------- */
        intro.owner += 1;
        const run = intro.owner;
        let cancelIdle: (() => void) | null = null;
        let introDone = false;
        let introTimeline: gsap.core.Timeline | null = null;
        /** The page has left the top: a draw-in there would run on a map the dive already moves. */
        const leftTop = () => window.scrollY > 4;
        /** The drawn end state: no dash styles, ticks and dot at rest, labels and lens at full. */
        const finishIntro = () => {
          introDone = true;
          cancelIdle?.();
          cancelIdle = null;
          introTimeline = null;
          endDraw(desktopBox);
          gsap.set(desktopBox.querySelectorAll("[data-draw-fade], [data-hero-dot]"), { clearProps: "opacity,transform" });
          desktopBox.style.removeProperty("--intro-labels");
          desktopBox.style.removeProperty("--intro-lens");
        };
        /**
         * The draw-in timeline. One read up front (the map's screen scale: the strokes are
         * non-scaling, so their dashes run in screen px), then only writes: each stroke's
         * length is its server-side --len times that scale (draw-strokes.ts).
         */
        const startIntro = () => {
          const ctm = base.getScreenCTM();
          const scale = ctm ? Math.hypot(ctm.a, ctm.b) : 0;
          const strokeOf = (path: SVGElement) => ({
            style: path.style,
            length: screenLength(Number.parseFloat(path.style.getPropertyValue("--len")), scale),
          });
          type Stroke = ReturnType<typeof strokeOf>;
          /** Show the stretch from `start` to `end` (fractions of each stroke). */
          const paint = (strokes: readonly Stroke[], start: number, end: number) => {
            for (const { style, length } of strokes) {
              const dash = dashFor(start * length, end * length, length);
              style.strokeDasharray = dash.dasharray;
              style.strokeDashoffset = dash.dashoffset;
            }
          };
          const timeline = gsap.timeline({ onComplete: finishIntro });
          introTimeline = timeline;
          const draw = { duration: DRAW_DURATION_S, ease: gsapEase.snap };
          for (const step of plan.buildings) {
            const strokes = [...base.querySelectorAll<SVGElement>(`[data-building="${step.id}"] [data-drawable]`)].map(strokeOf);
            const state = { p: 0 };
            paint(strokes, 0, 0);
            timeline.to(state, { p: 1, ...draw, onUpdate: () => paint(strokes, 0, state.p) }, step.delay);
          }
          for (const line of plan.lines) {
            const path =
              line.kind === "stream"
                ? base.querySelectorAll<SVGElement>(".map-stream")[line.index]
                : base.querySelector<SVGElement>(`[data-road="${line.name}"]`);
            if (!path) continue;
            // Grows outward from `from` to both ends.
            const strokes = [strokeOf(path)];
            const { from } = line;
            const state = { p: 0 };
            paint(strokes, from, from);
            timeline.to(state, { p: 1, ...draw, onUpdate: () => paint(strokes, from * (1 - state.p), from + (1 - from) * state.p) }, line.delay);
          }
          const fade = { opacity: 1, ease: gsapEase.snap };
          timeline.fromTo(base.querySelectorAll("[data-draw-fade]"), { opacity: 0 }, { ...fade, duration: INTRO.tickFade }, schedule.ticks);
          // Labels, the uncle chip and the lens parts fade through --intro-* (hero.css multiplies them with the dive's --dive-*).
          timeline.fromTo(
            desktopBox,
            { "--intro-labels": 0 },
            { "--intro-labels": 1, duration: INTRO.labelFade, ease: gsapEase.snap },
            schedule.labels,
          );
          timeline.fromTo(
            desktopBox.querySelector("[data-hero-dot]"),
            { scale: 0, opacity: 0 },
            { scale: 1, opacity: 1, duration: INTRO.dotScale, ease: gsapEase.snap },
            schedule.dot,
          );
          timeline.fromTo(
            desktopBox,
            { "--intro-lens": 0 },
            { "--intro-lens": 1, duration: INTRO.lensFade, ease: gsapEase.snap },
            schedule.lens,
          );
        };
        if (html.classList.contains("js-draw")) {
          if (performance.now() > LATE_INTRO_MS) {
            endDraw(desktopBox);
          } else {
            cancelIdle = onIdle(() => {
              cancelIdle = null;
              // The draw-in is for a reader looking at the hero. A deep link or a
              // restored scroll position lands further down, where the map may
              // already be tilted by the dive (its screen scale is then no measure
              // of the strokes at rest): show it drawn instead.
              const hash = window.location.hash;
              if (leftTop() || (hash.length > 1 && hash !== "#top")) {
                finishIntro();
                return;
              }
              context.add(startIntro);
            });
          }
        }

        /* ---------------- Dive ---------------- */
        const lowPower = isLowPower(navigator as Navigator & DeviceHints);
        const frame = pin.querySelector<HTMLElement>("[data-hero-frame]");
        const frameLine = pin.querySelector<HTMLElement>("[data-hero-frame-line]");
        const frameFade = pin.querySelector<HTMLElement>("[data-hero-frame-fade]");
        const copy = pin.querySelector<HTMLElement>("[data-hero-copy]");
        const honesty = pin.querySelector<HTMLElement>("[data-hero-honesty]");
        const stageProbe = pin.querySelector<HTMLElement>("[data-hero-stage-probe]");
        const dot = desktopBox.querySelector<HTMLElement>("[data-hero-dot]");
        const textLines = [...pin.querySelectorAll<HTMLElement>("[data-hero-copy] [data-readout-obstacle]")];
        const lifted = [copy, honesty].filter((element): element is HTMLElement => element !== null);
        const others = base.querySelectorAll(`:scope > g > [data-building]:not([data-building="${focus}"])`);
        const proxies = [...pin.querySelectorAll<HTMLElement>("[data-rail-proxy]")];
        const wide = window.matchMedia("(min-width: 1280px)");

        let flights: Flight[] = [];
        let flying = false;
        let done = false;
        let diving = false;
        let dived = false;
        const flight = { u: 0 };
        let dive: gsap.core.Timeline | null = null;

        /**
         * Aim each proxy at its rail slot as the slot is now: its sub-pixel rect (a rounded
         * offset made the hand-off jump by up to 1px) minus the slot's own entrance offset,
         * against the proxy's untransformed place. Reads only. Returns whether any aim moved.
         */
        const aim = (): boolean => {
          let moved = false;
          for (const item of flights) {
            if (!item.slot) continue;
            const slot = item.slot.getBoundingClientRect();
            const shift = Number(gsap.getProperty(item.slot, "y")) || 0;
            const at = item.element.getBoundingClientRect();
            const dx = slot.left - (at.left - item.x);
            const dy = slot.top - shift - (at.top - item.y);
            if (Math.abs(dx - item.dx) > 0.1 || Math.abs(dy - item.dy) > 0.1) moved = true;
            item.dx = dx;
            item.dy = dy;
          }
          return moved;
        };

        /** Find the rail slots, size the proxies to them and aim (every refresh): all reads, then the writes, then the aim. */
        const measure = () => {
          const slots = proxies.map((proxy) =>
            document.querySelector<HTMLElement>(`[data-rail-slot="${proxy.dataset.railProxy ?? ""}"]`),
          );
          flying = wide.matches && slots.every((slot) => slot !== null && slot.offsetParent !== null);
          const widths = slots.map((slot) => (flying && slot ? slot.getBoundingClientRect().width : null));
          flights = proxies.map((element, index) => {
            const width = widths[index];
            if (width !== null && width !== undefined) element.style.width = `${width}px`;
            else element.style.removeProperty("width");
            return {
              element,
              slot: flying ? (slots[index] ?? null) : null,
              x: Number(gsap.getProperty(element, "x")) || 0,
              y: Number(gsap.getProperty(element, "y")) || 0,
              dx: 0,
              dy: 0,
              opacity: null,
              visibility: null,
              setX: gsap.quickSetter(element, "x", "px") as (value: number) => void,
              setY: gsap.quickSetter(element, "y", "px") as (value: number) => void,
            };
          });
          aim();
        };

        /*
         * While the cards fly, the aim follows the slots on every tick, read before the
         * tick's writes (a prioritized ticker callback: the layout is still clean then).
         * A refresh can run far down the page, where the rail is slid off or holds other
         * entries; a fling back up then flew the cards to that stale spot. Tracking also
         * follows a rail that is still sliding back in, or that settles while the scroll rests.
         */
        let tracking = false;
        const track = () => {
          if (aim()) applyFlight();
        };
        const setTracking = (on: boolean) => {
          if (on === tracking) return;
          tracking = on;
          if (on) {
            aim();
            gsap.ticker.add(track, false, true);
          } else {
            gsap.ticker.remove(track);
          }
        };

        /** Writes only, and only what changed. */
        function applyFlight() {
          const { u } = flight;
          setTracking(flying && u > 0 && !done);
          for (const item of flights) {
            const { element } = item;
            // The first write after a measure always goes out (the transform may have been cleared under GSAP).
            const first = item.opacity === null;
            const x = flying ? item.dx * u : 0;
            const y = flying ? item.dy * u : 0;
            if (first || x !== item.x) {
              item.x = x;
              item.setX(x);
            }
            if (first || y !== item.y) {
              item.y = y;
              item.setY(y);
            }
            // 1024-1279px (no rail): fade out over 0.25-0.55 of the pin.
            const opacity = done ? "0" : flying ? "" : String(round4(1 - clamp01(u / NO_RAIL_FADE)));
            if (opacity !== item.opacity) {
              item.opacity = opacity;
              element.style.opacity = opacity;
            }
            const visibility = done ? "hidden" : "";
            if (visibility !== item.visibility) {
              item.visibility = visibility;
              element.style.visibility = visibility;
            }
          }
        }

        /*
         * The text block's lift goes through a plain object over the fixed 0-0.2 window, so
         * its fade and rise (lift-plan.ts) can change on every refresh without rebuilding the
         * timeline: lift.p is the pin progress inside that window. --dive-lens and
         * --dive-labels follow the same clock, never slower than the text.
         */
        const lift = { p: 0 };
        let liftPlan: LiftPlan = { fade: COPY_SPAN, rise: 64 };
        /** Custom properties on the map box, as last written (null: removed); a write that changes nothing is skipped. */
        const boxVars = new Map<string, string | null>();
        const boxVar = (name: string, value: string | null) => {
          if (boxVars.has(name) && boxVars.get(name) === value) return;
          boxVars.set(name, value);
          if (value === null) desktopBox.style.removeProperty(name);
          else desktopBox.style.setProperty(name, value);
        };
        const fadeVar = (name: string, value: number) => boxVar(name, value >= 1 ? null : String(round4(value)));
        /** The text block's opacity and rise as last written (null: at rest, inline styles removed). */
        let liftWritten: { opacity: string; translate: string } | null | undefined;
        const applyLift = () => {
          const { p } = lift;
          const opacity = liftOpacity(liftPlan, p);
          const next = opacity >= 1 ? null : { opacity: String(round4(opacity)), translate: `0 ${round4(liftOffset(liftPlan, p))}px` };
          if (liftWritten === undefined || next?.opacity !== liftWritten?.opacity || next?.translate !== liftWritten?.translate) {
            liftWritten = next;
            for (const element of lifted) {
              if (next === null) {
                element.style.removeProperty("opacity");
                element.style.removeProperty("translate");
              } else {
                element.style.opacity = next.opacity;
                element.style.translate = next.translate;
              }
            }
          }
          fadeVar("--dive-lens", 1 - clamp01(p / Math.min(LENS_FADE, liftPlan.fade)));
          fadeVar("--dive-labels", 1 - clamp01(p / Math.min(LABEL_FADE, liftPlan.fade)));
        };

        const timeline = gsap.timeline({
          defaults: { ease: "none", immediateRender: false },
          scrollTrigger: {
            trigger: pin,
            start: "top top",
            end: "+=100%",
            pin: true,
            // Our own spacer, already the pinned element's parent: refreshes never move the
            // pinned element in the DOM, so a focused building button keeps its focus.
            pinSpacer,
            scrub: 0.6,
            invalidateOnRefresh: true,
            refreshPriority: PIN_PRIORITY.hero,
            onUpdate: (self) => {
              report(self.progress);
              // Scrolling into the dive before or during the draw-in: drop it and show the map
              // drawn, before the scrub tilts it (the stroke lengths were taken at rest, also
              // while it waits for idle: no timeline yet, but one must not start). Test the
              // real scroll position, not the progress: every ScrollTrigger refresh (fonts
              // ready, lazy islands) reverts and updates the trigger at the top too, and must
              // not end it. ScrollTrigger's own scroll value: window.scrollY would force a layout.
              if (!introDone && self.scroll() > 4 && html.classList.contains("js-draw")) {
                introTimeline?.kill();
                finishIntro();
              }
            },
            onRefresh: () => {
              measure();
              applyFlight();
              // A refresh can run inside the timeline's own constructor, before the dive's measures exist.
              if (dive) replanLift();
              syncState();
            },
          },
          onUpdate: () => syncState(),
        });

        /**
         * The section's dive attributes follow the timeline's progress. Also run after
         * every refresh: a refresh renders the timeline with its callbacks suppressed (a
         * jump straight to the end of the pin left the map at the end state while the
         * attributes still said "at rest", so the rail never took over).
         */
        function syncState() {
          // A refresh can run inside the timeline's own constructor, before it is assigned.
          if (!dive) return;
          const progress = dive.progress();
          const nextDiving = progress > 0.001;
          if (nextDiving !== diving) {
            diving = nextDiving;
            section?.toggleAttribute("data-hero-dive", diving);
          }
          // The text block, the labels and the lens parts are fully faded from 20%: off the pointer too.
          const nextDived = progress >= 0.2;
          if (nextDived !== dived) {
            dived = nextDived;
            section?.toggleAttribute("data-hero-dived", dived);
          }
          const nextDone = progress > PROXY_DONE_AT;
          if (nextDone !== done) {
            done = nextDone;
            section?.toggleAttribute("data-proxy-done", done);
            applyFlight();
          }
        }
        dive = timeline;
        ScrollTrigger.addEventListener("refresh", syncState);

        /*
         * The rest geometry the dive is planned from: the map's transform origin, the map,
         * the box, S2's stage area (the probe), the dot and the text lines. Reads only, and
         * offsets inside the pinned element, so transforms never leak in and it measures
         * the same whether a pin is applied or reverted during a refresh. Read once per
         * ScrollTrigger refresh (refreshInit forgets it) and shared by the dive's
         * function-based values and the lift plan: a refresh lays the page out for it once.
         */
        let geometry: Geometry | null = null;
        const forgetGeometry = () => {
          geometry = null;
        };
        const geo = (): Geometry => {
          if (geometry) return geometry;
          const [originX, originY] = getComputedStyle(map).transformOrigin.split(" ").map(Number.parseFloat);
          const mapAt = offsetWithin(map, pin);
          const probeAt = stageProbe ? offsetWithin(stageProbe, pin) : null;
          geometry = {
            origin: Number.isFinite(originX) && Number.isFinite(originY) ? { x: originX, y: originY } : null,
            map: { x: mapAt.x, y: mapAt.y, width: map.offsetWidth, height: map.offsetHeight },
            box: { width: desktopBox.offsetWidth, height: desktopBox.offsetHeight },
            probe: stageProbe && probeAt ? { x: probeAt.x, y: probeAt.y, width: stageProbe.offsetWidth, height: stageProbe.offsetHeight } : null,
            dot: dot && dot.offsetWidth > 0 ? { left: dot.offsetLeft, top: dot.offsetTop, width: dot.offsetWidth, height: dot.offsetHeight } : null,
            text: textLines
              .filter((line) => line.offsetParent !== null)
              .map((line) => {
                const at = offsetWithin(line, pin);
                return { left: at.x, top: at.y, right: at.x + line.offsetWidth, bottom: at.y + line.offsetHeight };
              }),
          };
          return geometry;
        };
        ScrollTrigger.addEventListener("refreshInit", forgetGeometry);

        /*
         * Match cut to S2 (spec S2: its map is "transformed exactly like the hero's end
         * state"). S2 and S3 frame the map in the stage area (the viewport minus the
         * record column from 1280px) with 청평화's focus at the view's focus fractions;
         * the hero frames it in the whole frame. While the camera dives, the map also
         * pans so the focus point (the transform origin, fixed under the scale and the
         * tilt) lands where S2's sits.
         */
        const stageShift = (axis: "x" | "y"): number => {
          const { origin, map: at, probe } = geo();
          if (!probe || !origin || at.width === 0 || at.height === 0) return 0;
          if (axis === "x") return Math.round(probe.x + probe.width * (origin.x / at.width) - (at.x + origin.x));
          return Math.round(probe.y + probe.height * (origin.y / at.height) - (at.y + origin.y));
        };

        /*
         * The end scale: 1.6 of S2's map box (words.css: the stage area cover-fitted,
         * max(stage width, 100vh x ratio)), measured against the hero's own box. The two
         * boxes cover different rects (the frame here, the stage there; 4:3 screens cap the
         * hero's), so a flat 1.6 would leave S2's map a little larger than the hero's end.
         */
        const endScale = (): number => {
          const { box, probe } = geo();
          if (!probe || box.width === 0 || box.height === 0) return 1.6;
          const words = Math.max(probe.width, probe.height * (box.width / box.height));
          return Math.round(((1.6 * words) / box.width) * 1e4) / 1e4;
        };

        /**
         * How the text block leaves on this screen (lift-plan.ts): from the dot's path under
         * the dive's own end pan, scale and tilt, against the text's rest rects.
         */
        const replanLift = () => {
          const { origin, map: at, dot: lamp, text } = geo();
          if (lamp && origin) {
            liftPlan = planLift({
              origin: { x: at.x + origin.x, y: at.y + origin.y },
              dot: { x: lamp.left + lamp.width / 2 - origin.x, y: lamp.top + lamp.height / 2 - origin.y },
              size: lamp.width,
              shift: { x: stageShift("x"), y: stageShift("y") },
              scale: endScale(),
              tilt: lowPower ? 0 : TILT,
              perspective: PERSPECTIVE,
              text,
            });
          }
          applyLift();
        };

        timeline
          .fromTo(frame, { clipPath: "inset(20px round 24px)" }, { clipPath: "inset(0px round 0px)", duration: MAP_SPAN }, 0)
          .fromTo(frameLine, { autoAlpha: 1 }, { autoAlpha: 0, duration: MAP_SPAN }, 0)
          // Transforms only: the strokes are non-scaling, so nothing inside needs to know the scale.
          .fromTo(
            map,
            { scale: 1, rotationX: 0, transformPerspective: PERSPECTIVE },
            { scale: endScale, rotationX: lowPower ? 0 : TILT, transformPerspective: PERSPECTIVE, duration: MAP_SPAN },
            0,
          )
          .fromTo(shift, { x: 0, y: 0 }, { x: () => stageShift("x"), y: () => stageShift("y"), duration: MAP_SPAN }, 0)
          .fromTo(others, { opacity: 1 }, { opacity: 0.35, duration: MAP_SPAN }, 0)
          // The text block lifts and fades, and the other labels and the lens go, before the
          // scaling map carries the dot and 남평화 into the text's band (no double exposure).
          // Opacity only: the H1 stays the page's heading for assistive technology all the
          // way down, and the CTAs stay in the focus order; from 20% (data-hero-dived)
          // hero.css takes the text and the faded labels off the pointer.
          .fromTo(lift, { p: 0 }, { p: COPY_SPAN, duration: COPY_SPAN, onUpdate: applyLift }, 0)
          .fromTo(flight, { u: 0 }, { u: 1, duration: FLIGHT.end - FLIGHT.start, onUpdate: applyFlight }, FLIGHT.start)
          // 0.6-1: the frame's bottom edge fades to the ground, so the section ends without a seam.
          .fromTo(frameFade, { opacity: 0 }, { opacity: 1, duration: 1 - MAP_SPAN }, MAP_SPAN)
          .set({}, {}, 1);

        /*
         * After the pin, as S2's heading comes up, settle into S2's first frame (its dimmed
         * copy of this map): the map dims to S2's 25%, its strokes ease from the hero's boost
         * to the shared dim value (--map-boost, hero.css), and 청평화's label and the dot go.
         * Measured on the next section's top, so a section pulled up under the pin still gets
         * its heading on screen before the payoff dims. A plain object: a custom-property
         * fromTo reverts to the value GSAP read before it first ran, and it read unset as 0.
         * Re-applied on every refresh: a refresh sets the tween's progress with callbacks
         * suppressed, so a jump over the whole settle with a refresh landing mid-scrub (lazy
         * islands mounting) left the map undimmed and 청평화's label up over S2.
         */
        const settle = { u: 0 };
        let settleWritten: number | null = null;
        let settled = false;
        const applySettle = () => {
          const u = round4(settle.u);
          if (u !== settleWritten) {
            settleWritten = u;
            if (u <= 0) {
              boxVar("--map-boost", null);
              boxVar("--dive-focus", null);
              map.style.removeProperty("opacity");
            } else {
              boxVar("--map-boost", String(round4(1 - u)));
              boxVar("--dive-focus", String(round4(1 - clamp01(u / FOCUS_FADE))));
              map.style.opacity = String(round4(1 - (1 - S2_MAP_OPACITY) * u));
            }
          }
          const nextSettled = u >= 0.999;
          if (nextSettled !== settled) {
            settled = nextSettled;
            section.toggleAttribute("data-hero-settled", settled);
          }
        };
        const next = section.nextElementSibling instanceof HTMLElement ? section.nextElementSibling : null;
        gsap.fromTo(
          settle,
          { u: 0 },
          {
            u: 1,
            ease: "none",
            immediateRender: false,
            onUpdate: applySettle,
            scrollTrigger: {
              ...(next ? { trigger: next, start: "top 82%", end: "top 50%" } : { trigger: pinSpacer, start: "bottom 82%", end: "bottom 50%" }),
              scrub: 0.6,
              invalidateOnRefresh: true,
              // After the hero's pin has set its spacing, before S2's pin.
              refreshPriority: PIN_PRIORITY.hero - 1,
              onRefresh: applySettle,
            },
          },
        );

        measure();
        applyFlight();
        replanLift();

        /*
         * Keyboard focus landing on a CTA or a building button while the dive has begun
         * (Tab from the nav mid-pin, Shift+Tab back up the page) scrolls back to the top
         * of the pin, where that control is in full view. Pointer focus does not: a click
         * on a CTA starts its own jump.
         */
        const onFocusIn = (event: FocusEvent) => {
          const target = event.target;
          if (!(target instanceof Element) || !target.matches(":focus-visible")) return;
          if (!target.closest("[data-hero-copy], [data-hero-map-box]")) return;
          const trigger = timeline.scrollTrigger;
          if (!trigger || timeline.progress() <= 0.001) return;
          scrollToRef.current(trigger.start);
        };
        pin.addEventListener("focusin", onFocusIn);

        return () => {
          pin.removeEventListener("focusin", onFocusIn);
          setTracking(false);
          ScrollTrigger.removeEventListener("refresh", syncState);
          ScrollTrigger.removeEventListener("refreshInit", forgetGeometry);
          cancelIdle?.();
          introDone = true;
          window.setTimeout(() => {
            if (intro.owner === run) endDraw(desktopBox);
          }, 0);
          section.removeAttribute("data-hero-dive");
          section.removeAttribute("data-hero-dived");
          section.removeAttribute("data-proxy-done");
          section.removeAttribute("data-hero-settled");
          for (const property of ["--map-boost", "--dive-focus", "--dive-lens", "--dive-labels"]) desktopBox.style.removeProperty(property);
          map.style.removeProperty("opacity");
          for (const element of lifted) {
            element.style.removeProperty("opacity");
            element.style.removeProperty("translate");
          }
          for (const proxy of proxies) {
            for (const property of ["width", "opacity", "visibility", "transform", "translate"]) proxy.style.removeProperty(property);
          }
        };
      });

      // Phones, tablets and reduced motion: the map is shown drawn, nothing pins.
      mm.add(`${MQ.mobileMotion}, ${MQ.reduced}`, () => {
        endDraw(pin);
      });

      return () => mm.revert();
    },
    { scope: root, dependencies: [plan, schedule, focus, report] },
  );

  return (
    <div ref={spacer} className="hero-pin-spacer" data-hero-pin-spacer>
      <div ref={root} className="hero-pin" data-hero-pin>
        {/* S2's stage area (hero.css), measured for the dive's end position. */}
        <span className="hero-stage-probe" data-hero-stage-probe aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}
