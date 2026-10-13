"use client";

import { useCallback, useRef, type FocusEvent, type KeyboardEvent } from "react";

import { QuantityDot } from "@/components/dot/QuantityDot";
import { AppIcon } from "@/components/icons/AppIcon";
import { useSmoothScroll } from "@/components/motion/SmoothScroll";
import { roles } from "@/content/copy";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";
import { loadDraggable, loadDrawSVG, MQ } from "@/lib/gsap-plugins";
import { duration, gsapEase } from "@/lib/motion";

import { ENTRY_START, pastEntry } from "./entry";
import { OUTLINE_BOXES, boxCentreY } from "./outline-boxes";
import {
  SEAM,
  connectorPath,
  connectorPoints,
  knobZone,
  pxToSeam,
  seamBounds,
  seamForPlay,
  seamFromClick,
  seamFromKey,
  seamLayout,
  seamToPx,
  seamValueNow,
  seamValueText,
  type ConnectorEnds,
  type SeamGeometry,
} from "./seam-math";

/**
 * The S7 seam (spec S7), a GSAP leaf for 1024px and up. Renders the seam
 * line, the role slider (the ink dot on a 44px knob) and the dashed connector
 * into the stage that index.tsx lays out; the devices themselves stay server
 * HTML. Pointer and keyboard write one CSS variable, --seam, on the stage
 * (roles.css derives the device positions, clips, label opacities and the
 * narrower side's dimming from it) and the connector's path; nothing here
 * re-renders React while dragging.
 *
 * The knob is a small horizontal pill: the ink dot between two chevrons, so
 * it reads as something that slides. A click on a chevron moves the seam to
 * the next stop on that side (25, 50, 75) and a click on the dot goes back
 * to 50/50: the single-pointer alternative to dragging (WCAG 2.5.7).
 *
 * A play on the narrower side brings the seam back to 50/50 (seamForPlay),
 * so the footage the reader asked for plays whole and undimmed.
 *
 * - desktopMotion: Draggable (type x, InertiaPlugin) on an invisible proxy,
 *   triggered by the knob and the seam line, bounded to 25-75% of the stage.
 *   The plugins load once the stage is within one viewport, not at hydration
 *   (data-roles-drag on the track marks the drag as ready).
 *   Arrow keys step 5% and knob clicks snap on the record token (700ms). On
 *   entry DrawSVG draws both outlines out of their seam-facing sides in
 *   800ms, their weak-green fill settles in, then the connector draws. The
 *   entry plays as soon as either card is on screen (90% of its height above
 *   the viewport's bottom, entry.ts), in practice the retailer's, the upper
 *   one, so a landing that shows one card, the nav jump included, sees it
 *   drawn. Plugins that arrive with a card already past that point leave the
 *   outlines and connector as drawn, with no entry.
 * - reduced (1024px and up): 50/50 at rest, no drag, outlines and connector
 *   static; keys and knob clicks still move the seam, jumping without
 *   animation.
 * - below 1024px the seam is hidden; RolesToggle owns the section.
 */

const MASK_ID = "roles-connector-mask";
const WIDE = "(min-width: 1024px)";
const WIDE_REDUCED = "(min-width: 1024px) and (prefers-reduced-motion: reduce)";
/** DeviceVideo phases in which a clip is starting or on screen (data-state on .device-media; isBusyPhase in device/video-phase.ts). */
const BUSY: ReadonlySet<string> = new Set(["loading", "playing"]);

type KeyHandler = (event: KeyboardEvent<HTMLDivElement>) => void;
type DraggableInstance = InstanceType<Awaited<ReturnType<typeof loadDraggable>>["Draggable"]>;

export function RolesSeam() {
  const root = useRef<HTMLDivElement>(null);
  const hitRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const lineRef = useRef<SVGPathElement>(null);
  const haloRef = useRef<SVGPathElement>(null);
  const maskRef = useRef<SVGPathElement>(null);
  const proxyRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const onKey = useRef<KeyHandler | null>(null);
  const { scrollTo } = useSmoothScroll();
  const revealOnKeyboardFocus = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      const handle = event.currentTarget;
      if (!handle.matches(":focus-visible")) return;
      requestAnimationFrame(() => {
        if (document.activeElement !== handle) return;
        const box = handle.getBoundingClientRect();
        const top = window.scrollY + box.top - Math.max(0, (window.innerHeight - box.height) / 2);
        scrollTo(top, { immediate: true });
      });
    },
    [scrollTo],
  );

  useGSAP(
    (_context, contextSafe) => {
      const track = root.current;
      const stage = track?.closest<HTMLElement>("[data-roles-seam]");
      const hit = hitRef.current;
      const svg = svgRef.current;
      const line = lineRef.current;
      const halo = haloRef.current;
      const maskPath = maskRef.current;
      const proxy = proxyRef.current;
      const handle = handleRef.current;
      if (!track || !stage || !hit || !svg || !line || !halo || !maskPath || !proxy || !handle || !contextSafe) return;

      const outlines = Array.from(stage.querySelectorAll<SVGPathElement>("[data-roles-outline]"));
      const state: { value: number } = { value: SEAM.initial };
      let ariaNow: number = SEAM.initial;
      let geometry: SeamGeometry = { stage: 0, device: 0 };
      let ends: ConnectorEnds | null = null;
      let drag: DraggableInstance | null = null;
      let animateKeys = false;
      let keyTarget: number | null = null;
      let pressPoint: { x: number; y: number } | null = null;
      // Set when a press turned into a drag, so the click that may follow it does not snap the seam.
      let dragged = false;

      const setAria = (value: number) => {
        const now = seamValueNow(value);
        if (now === ariaNow) return;
        ariaNow = now;
        handle.setAttribute("aria-valuenow", String(now));
        handle.setAttribute("aria-valuetext", seamValueText(value));
      };

      const drawConnector = () => {
        if (!ends || geometry.stage <= 0) return;
        const d = connectorPath(connectorPoints(seamLayout(geometry, state.value), ends, OUTLINE_BOXES));
        line.setAttribute("d", d);
        halo.setAttribute("d", d);
        maskPath.setAttribute("d", d);
      };

      const apply = (value: number, aria = true) => {
        state.value = value;
        stage.style.setProperty("--seam", String(value / 100));
        drawConnector();
        if (aria) setAria(value);
      };

      const syncProxy = () => {
        if (!drag || geometry.stage <= 0) return;
        gsap.set(proxy, { x: seamToPx(state.value, geometry.stage) });
        drag.update();
      };

      const measure = () => {
        const column = stage.querySelector<HTMLElement>(".roles-col");
        const screen = column?.querySelector<HTMLElement>(".device-screen");
        const width = stage.clientWidth;
        if (!column || !screen || width <= 0) return;
        const device = column.offsetWidth;
        const screenWidth = screen.offsetWidth;
        const screenHeight = screen.offsetHeight;
        // Columns only ever move along x, so vertical offsets are stable.
        const screenTop = screen.getBoundingClientRect().top - track.getBoundingClientRect().top;
        geometry = { stage: width, device };
        ends = {
          screenLeft: (device - screenWidth) / 2,
          screenWidth,
          retailerY: screenTop + (screenHeight * boxCentreY(OUTLINE_BOXES.retailer)) / 100,
          uncleY: screenTop + (screenHeight * boxCentreY(OUTLINE_BOXES.uncle)) / 100,
          dotY: handle.offsetTop + handle.offsetHeight / 2,
        };
        svg.setAttribute("viewBox", `0 0 ${width} ${Math.max(1, track.clientHeight)}`);
        drawConnector();
        if (drag) {
          drag.applyBounds(seamBounds(width));
          syncProxy();
        }
      };

      /** Move the seam to a stop: a 700ms snap in motion, a jump under reduced motion. */
      const goTo = (next: number) => {
        gsap.killTweensOf(state);
        gsap.killTweensOf(proxy);
        setAria(next);
        if (Math.abs(next - state.value) < 0.01) {
          keyTarget = null;
          apply(next, false);
          syncProxy();
          return;
        }
        if (!animateKeys) {
          keyTarget = null;
          apply(next, false);
          syncProxy();
          return;
        }
        keyTarget = next;
        gsap.to(state, {
          value: next,
          duration: duration.record,
          ease: gsapEase.snap,
          onUpdate: () => apply(state.value, false),
          onComplete: () => {
            keyTarget = null;
            syncProxy();
          },
        });
      };

      onKey.current = contextSafe((event: KeyboardEvent<HTMLDivElement>) => {
        // Presses during a tween step from where the seam is heading, not from where it is.
        const next = seamFromKey(keyTarget ?? state.value, event.key);
        if (next === null) return;
        event.preventDefault();
        // Keyboard in use: show the ring even if focus came from a drag (focusVisible false).
        handle.setAttribute("data-keyed", "");
        goTo(next);
      });

      const onKnobPointerDown = contextSafe((event: PointerEvent) => {
        if (event.button !== 0) return;
        pressPoint = { x: event.clientX, y: event.clientY };
      });

      // A tap/click on the knob (no drag in between): chevron to the next stop, dot back to 50/50.
      const onKnobPointerUp = contextSafe((event: PointerEvent) => {
        if (event.button !== 0) return;
        const started = pressPoint;
        pressPoint = null;
        if (dragged) {
          dragged = false;
          return;
        }
        if (started && Math.hypot(event.clientX - started.x, event.clientY - started.y) > 6) return;
        const box = handle.getBoundingClientRect();
        goTo(seamFromClick(keyTarget ?? state.value, knobZone(event.clientX - (box.left + box.width / 2))));
      });

      // A clip the reader starts on the narrower side would play cut at the seam and dimmed:
      // the seam comes back to 50/50 on the record token (a jump under reduced motion).
      const onMediaState = contextSafe((records: MutationRecord[]) => {
        for (const record of records) {
          const media = record.target as Element;
          if (!BUSY.has(media.getAttribute("data-state") ?? "") || BUSY.has(record.oldValue ?? "")) continue;
          const side = media.closest<HTMLElement>("[data-side]")?.dataset.side;
          if (side !== "retailer" && side !== "uncle") continue;
          const current = keyTarget ?? state.value;
          const next = seamForPlay(current, side);
          if (next !== current) goTo(next);
        }
      });

      const mm = gsap.matchMedia();

      mm.add(WIDE, () => {
        apply(state.value);
        measure();
        // The devices also follow the viewport height (roles.css), which leaves the stage width alone.
        const observer = new ResizeObserver(() => measure());
        observer.observe(stage);
        const column = stage.querySelector<HTMLElement>(".roles-col");
        if (column) observer.observe(column);
        const playback = new MutationObserver(onMediaState);
        playback.observe(stage, { subtree: true, attributeFilter: ["data-state"], attributeOldValue: true });
        handle.addEventListener("pointerdown", onKnobPointerDown);
        handle.addEventListener("pointerup", onKnobPointerUp);
        return () => {
          observer.disconnect();
          playback.disconnect();
          handle.removeEventListener("pointerdown", onKnobPointerDown);
          handle.removeEventListener("pointerup", onKnobPointerUp);
        };
      });

      mm.add(WIDE_REDUCED, () => {
        animateKeys = false;
        keyTarget = null;
        gsap.killTweensOf(state);
        apply(state.value);
      });

      mm.add(MQ.desktopMotion, () => {
        animateKeys = true;
        let cancelled = false;
        let entries: ScrollTrigger[] = [];
        let timeline: gsap.core.Timeline | null = null;
        const killEntries = () => {
          for (const trigger of entries) trigger.kill();
          entries = [];
        };

        const start = contextSafe(([{ Draggable }]: [Awaited<ReturnType<typeof loadDraggable>>, unknown]) => {
          if (cancelled) return;
          measure();

          const follow = () => {
            if (drag) apply(pxToSeam(drag.x, geometry.stage));
          };
          drag =
            Draggable.create(proxy, {
              type: "x",
              trigger: [handle, hit],
              bounds: seamBounds(geometry.stage),
              inertia: true,
              cursor: "ew-resize",
              activeCursor: "ew-resize",
              zIndexBoost: false,
              onPress() {
                dragged = false;
                if (keyTarget !== null) {
                  apply(keyTarget);
                  syncProxy();
                }
                gsap.killTweensOf(state);
                keyTarget = null;
                handle.removeAttribute("data-keyed");
                // Arrow keys keep working after a drag, without a keyboard focus ring.
                handle.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
              },
              onDrag: () => {
                dragged = true;
                follow();
              },
              onThrowUpdate: follow,
            })[0] ?? null;
          syncProxy();
          track.setAttribute("data-roles-drag", "");

          // Plugins that arrive with a card already past its entry point (a slow connection, a
          // reload mid-page) leave the outlines and the connector as the server drew them.
          if (outlines.some(pastEntry)) return;

          // Entry: both outlines grow out of the side that faces the seam, their tint settles, then the connector.
          gsap.set(outlines, { drawSVG: "50% 50%", fillOpacity: 0 });
          gsap.set(maskPath, { drawSVG: "0% 0%" });
          timeline = gsap
            .timeline({ paused: true })
            .to(outlines, { drawSVG: "0% 100%", duration: 0.8, ease: gsapEase.inOutQuart })
            .to(outlines, { fillOpacity: 1, duration: 0.3, ease: gsapEase.snap })
            // A finished DrawSVG keeps a fixed dash; clear it so resizes and drags never cut the stroke.
            .set(outlines, { clearProps: "all" })
            .to(maskPath, { drawSVG: "0% 100%", duration: 0.6, ease: gsapEase.outQuart })
            .set(maskPath, { clearProps: "all" });

          let played = false;
          const play = () => {
            if (played) return;
            played = true;
            timeline?.play();
            killEntries();
          };
          // One trigger per card: the first card on screen starts the draw for both, so a landing
          // that cuts the lower card off (the nav jump at 1440x900) still sees it.
          for (const card of outlines.length > 0 ? outlines : [stage]) {
            if (played) break;
            entries.push(
              ScrollTrigger.create({
                trigger: card,
                start: card === stage ? "top 70%" : ENTRY_START,
                end: "bottom top",
                onEnter: play,
                onEnterBack: play,
                onLeave: play,
                onRefresh: (self) => {
                  if (self.progress > 0) play();
                },
              }),
            );
          }
          // A trigger created on screen plays at once, before the loop above has stored it.
          if (played) killEntries();
        });

        // Draggable, Inertia and DrawSVG load once the stage is within a viewport (spec 13). Until
        // then the seam rests at 50/50 and the knob's keys and clicks already move it (WIDE branch).
        const near = new IntersectionObserver(
          (entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            near.disconnect();
            void Promise.all([loadDraggable(), loadDrawSVG()]).then(start);
          },
          { rootMargin: "100% 0px" },
        );
        near.observe(stage);

        return () => {
          cancelled = true;
          near.disconnect();
          animateKeys = false;
          keyTarget = null;
          drag?.kill();
          drag = null;
          track.removeAttribute("data-roles-drag");
          killEntries();
          timeline?.kill();
          timeline = null;
          gsap.killTweensOf(state);
          gsap.set([...outlines, maskPath, proxy], { clearProps: "all" });
        };
      });

      return () => {
        onKey.current = null;
      };
    },
    { scope: root },
  );

  return (
    <div ref={root} className="roles-track" data-roles-track="">
      <div ref={hitRef} className="roles-seam-line" aria-hidden="true" />
      <svg ref={svgRef} className="roles-connector" aria-hidden="true" focusable="false">
        <defs>
          <mask id={MASK_ID} maskUnits="userSpaceOnUse">
            <path ref={maskRef} className="roles-connector-mask" />
          </mask>
        </defs>
        {/* A paper halo under the dashes, so the line still reads where it crosses the black bezels. */}
        <path ref={haloRef} className="roles-connector-halo" mask={`url(#${MASK_ID})`} />
        <path ref={lineRef} className="roles-connector-line" mask={`url(#${MASK_ID})`} data-roles-connector="" />
      </svg>
      <div ref={proxyRef} className="roles-proxy" aria-hidden="true" />
      <div
        ref={handleRef}
        role="slider"
        tabIndex={0}
        aria-label={roles.seam.label}
        aria-orientation="horizontal"
        aria-valuemin={SEAM.min}
        aria-valuemax={SEAM.max}
        aria-valuenow={SEAM.initial}
        aria-valuetext={seamValueText(SEAM.initial)}
        aria-controls="roles-side-retailer roles-side-uncle"
        className="roles-handle"
        data-roles-handle=""
        onKeyDown={(event) => onKey.current?.(event)}
        onFocus={revealOnKeyboardFocus}
        onBlur={(event) => event.currentTarget.removeAttribute("data-keyed")}
      >
        <AppIcon name="chevron" size={14} className="roles-handle-chevron" />
        <QuantityDot tone="ink" />
        <AppIcon name="chevron" size={14} className="roles-handle-chevron" />
      </div>
    </div>
  );
}
