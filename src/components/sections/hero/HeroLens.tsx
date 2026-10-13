"use client";

import { useEffect } from "react";

import { pickBuilding } from "@/components/map/camera";
import type { MapBuildingId, MapPickView, ScreenPoint } from "@/components/map/views";
import { gsap } from "@/lib/gsap";
import { MQ } from "@/lib/gsap-plugins";
import { duration, gsapEase } from "@/lib/motion";

import { LENS_RADIUS, READOUT_GAP, READOUT_MARGIN, type HeroMapVariant } from "./hero-config";
import {
  clampLens,
  clearOfRects,
  fromViewBox,
  nudgeLens,
  panInto,
  pathCrosses,
  placeReadout,
  toViewBox,
  type Point,
  type ReadoutSide,
  type Rect,
} from "./lens-geometry";
import { lensStore, REST_BUILDING } from "./lens-store";

/**
 * The S1 scanner lens (spec S1, 6.1): a 200px circle (1px mint ring at 50%,
 * an 8px grid at 6% mint) over the map, revealing the record layer through
 * mask-image (hero.css: .hero-record) at --lx/--ly.
 *
 * desktop map, fine pointer, motion allowed: the lens follows the pointer
 * inside the stage (the frame minus the record column, below the nav) via
 * gsap.quickTo (0.45s power3.out), rAF-throttled, writing --lx/--ly and the
 * readout card's corner --rx/--ry on the map box. The card goes 24px beside
 * the ring, never over the text block or the record cards
 * ([data-readout-obstacle]) and, when another side allows, not over the uncle
 * chip, the dot or another building's label ([data-readout-soft], the label
 * slots; see placeReadout); the side it took is mirrored in
 * data-readout-side. Nor does it slide across them on its way: a move whose
 * straight path would cross one fades the card out, jumps and fades it back
 * in (pathCrosses). The building under the lens comes from pickBuilding on
 * the camera's rest footprints (never moving geometry) and goes to the
 * readout through lensStore. Leaving the stage (the frame's margin, the
 * record column, the nav) or moving onto the text block glides the lens back
 * to the selected building (700ms). While it follows, the ring keeps 16px off
 * the text block too: the lens slides to the nearest clear spot (up to 84px
 * from the pointer, so the pointer stays inside the ring; on 남평화's roof,
 * right under the H1's first line, it slides down) and goes home when no
 * spot that near is clear (the pointer between two lines of text).
 *
 * Every other case (touch, reduced motion, phones) is a static lens: building
 * buttons (desktop) or chips (phones) move it, gliding over 700ms or instantly
 * under reduced motion. Buttons also respond to keyboard focus.
 *
 * Resting places: a building's roof, except 청평화 on the desktop map, where
 * the lens drops by up to half the way to the dot on 1층 so the dot sits
 * inside the ring (as far as the text block allows; hero.css lifts the map for
 * it), and a resting lens that reaches into the text block moves by up to
 * 64px in any direction, the roof kept 24px inside the ring (남평화 drops
 * below the H1's first line). Phones pan the map box (--pan-x/--pan-y, 700ms) when the chosen
 * roof lies outside the frame (디오트), under the nav pill or behind the
 * docked readout, so the lens always sits on the building the readout names;
 * labels and the uncle chip that the pan leaves cut by the frame's edges or
 * the nav floor fade out (data-clipped).
 * Desktop building labels the frame cuts off (portrait tablets) are hidden,
 * so neither Tab nor touch reaches a button nobody can see.
 *
 * Placement waits while the hero dives (the text block and labels are moved
 * and faded then, so their rects lie): a resize or a choice made mid-dive is
 * placed when the dive reverses to the top.
 *
 * No React state: positions go straight to CSS variables, written once per
 * GSAP tick while a tween moves them (nothing ticks while the lens rests).
 * Only the variant hero.css shows at the current width runs: the hidden map
 * box neither observes, subscribes nor ticks. Server-rendered defaults in
 * hero.css put the lens on 청평화 before hydration.
 */

type LensProps = {
  variant: HeroMapVariant;
  /** Camera and rest footprints of the view, for the pick. */
  pick: MapPickView;
  viewBox: { width: number; height: number };
  /** Where the lens sits for each building (roof centres, viewBox units). */
  targets: Readonly<Record<MapBuildingId, ScreenPoint>>;
  /** The building with the lamp dot (청평화): the desktop lens rests between its roof and the dot. */
  focus: MapBuildingId;
};

type Mode = "follow" | "glide" | "instant";
type QuickTo = ReturnType<typeof gsap.quickTo>;

const FOLLOW = { duration: 0.45, ease: "power3.out" } as const;
/** The lens follows a precise pointer when motion is allowed (any width with the desktop map, 768px up). */
const FOLLOW_QUERY = "(pointer: fine) and (prefers-reduced-motion: no-preference)";
/** Space between the phone lens and the frame's sides. */
const PHONE_EDGE = 12;
/** Space between a resting desktop lens and the text block below it. */
const TEXT_CLEARANCE = 16;
/**
 * A pointer-led lens slides at most this far from the pointer to keep off the
 * text, so the pointer stays 16px inside the ring; where that is not enough
 * (the pointer between two lines of text), the lens goes home instead.
 */
const FOLLOW_REACH = LENS_RADIUS.desktop - 16;
/** Where hero.css displays each variant's map box. */
const SHOWN_QUERY: Readonly<Record<HeroMapVariant, string>> = {
  desktop: "(min-width: 768px)",
  mobile: "(max-width: 767.98px)",
};

function relativeRect(element: Element, origin: DOMRect): Rect {
  const rect = element.getBoundingClientRect();
  return { left: rect.left - origin.left, top: rect.top - origin.top, right: rect.right - origin.left, bottom: rect.bottom - origin.top };
}

const visible = (element: HTMLElement) => element.offsetParent !== null;

export function HeroLens({ variant, pick, viewBox, targets, focus }: LensProps) {
  useEffect(() => {
    const shownQuery = window.matchMedia(SHOWN_QUERY[variant]);
    let unmount: (() => void) | null = null;
    const toggle = () => {
      unmount?.();
      unmount = shownQuery.matches ? mount() : null;
    };
    shownQuery.addEventListener("change", toggle);
    toggle();
    return () => {
      shownQuery.removeEventListener("change", toggle);
      unmount?.();
      unmount = null;
    };

    /** Everything the lens does while its map box is on screen; returns the teardown. */
    function mount(): (() => void) | null {
      const lens = document.querySelector<HTMLElement>(`[data-hero-map-box="${variant}"] [data-hero-lens="${variant}"]`);
      const box = lens?.closest<HTMLElement>("[data-hero-map-box]");
      const viewport = box?.closest<HTMLElement>("[data-hero-viewport]");
      const stageElement = viewport?.querySelector<HTMLElement>("[data-hero-stage]");
      const pin = box?.closest<HTMLElement>("[data-hero-pin]");
      const section = box?.closest<HTMLElement>("[data-section]");
      if (!lens || !box || !viewport || !stageElement || !pin || !section) return null;

      const radius = LENS_RADIUS[variant];
      const desktop = variant === "desktop";
      const floatReadout = desktop ? box.querySelector<HTMLElement>('[data-hero-readout="float"] .hero-readout-card') : null;
      const dock = desktop ? null : viewport.querySelector<HTMLElement>('[data-hero-readout="dock"]');
      const dot = box.querySelector<HTMLElement>("[data-hero-dot]");
      const slots = [...box.querySelectorAll<HTMLElement>(".hero-labels .map-label-slot")];
      const copyLines = [...pin.querySelectorAll<HTMLElement>("[data-hero-copy] [data-readout-obstacle]")];
      const followQuery = window.matchMedia(FOLLOW_QUERY);
      const reducedQuery = window.matchMedia(MQ.reduced);

      /** The lens centre (--lx/--ly) and the readout card's corner (--rx/--ry), in map-box px. */
      const lensAt: Point = { x: 0, y: 0 };
      const cardAt: Point = { x: 0, y: 0 };
      const pan: Point = { x: 0, y: 0 };
      let frame = 0;
      let pointer: { x: number; y: number; target: EventTarget | null } | null = null;
      let resting = true;
      let side: ReadoutSide | null = null;
      /** A placement was skipped mid-dive: redo it when the dive reverses to the top. */
      let stale = false;

      const write = () => {
        box.style.setProperty("--lx", `${lensAt.x}px`);
        box.style.setProperty("--ly", `${lensAt.y}px`);
        box.style.setProperty("--rx", `${cardAt.x}px`);
        box.style.setProperty("--ry", `${cardAt.y}px`);
      };
      // The tweens of a move write once per tick, from a one-shot ticker callback.
      let flush: ReturnType<typeof gsap.ticker.add> | null = null;
      const flushStyles = () => {
        flush = null;
        write();
      };
      const markDirty = () => {
        flush ??= gsap.ticker.add(flushStyles, true);
      };

      /** Moves one point: following the pointer (quickTo), gliding on the record token, or at once. */
      const mover = (point: Point) => {
        let quick: { x: QuickTo; y: QuickTo } | null = null;
        let glide: gsap.core.Tween | null = null;
        const stop = () => {
          gsap.killTweensOf(point);
          quick = null;
          glide = null;
        };
        const to = (next: Point, mode: Mode) => {
          if (mode === "instant") {
            stop();
            point.x = next.x;
            point.y = next.y;
            write();
            return;
          }
          if (mode === "glide") {
            stop();
            glide = gsap.to(point, { x: next.x, y: next.y, duration: duration.record, ease: gsapEase.snap, onUpdate: markDirty });
            return;
          }
          if (glide) stop();
          quick ??= {
            x: gsap.quickTo(point, "x", { ...FOLLOW, onUpdate: markDirty }),
            y: gsap.quickTo(point, "y", { ...FOLLOW, onUpdate: markDirty }),
          };
          quick.x(next.x);
          quick.y(next.y);
        };
        return { to, stop };
      };
      const lensMover = mover(lensAt);
      const cardMover = mover(cardAt);

      /*
       * The card never slides across the text block or the record cards: when its
       * straight way to the new spot would cross one, it fades out where it is (fast
       * token), jumps, and fades back in there (record token; hero.css [data-flip]).
       * While it fades out, the jump keeps taking the latest spot.
       */
      const readoutRoot = floatReadout?.closest<HTMLElement>("[data-hero-readout]") ?? null;
      let cardGoal: Point = { x: 0, y: 0 };
      let flip: gsap.core.Tween | null = null;
      const endFlip = () => {
        flip?.kill();
        flip = null;
        readoutRoot?.removeAttribute("data-flip");
      };
      const moveCard = (next: Point, mode: Mode, size: { width: number; height: number }, blocked: readonly Rect[]) => {
        cardGoal = next;
        if (mode === "instant" || !readoutRoot) {
          endFlip();
          cardMover.to(next, "instant");
          return;
        }
        if (flip) return;
        if (!pathCrosses(cardAt, next, size, blocked)) {
          cardMover.to(next, mode);
          return;
        }
        cardMover.stop();
        readoutRoot.setAttribute("data-flip", "");
        flip = gsap.delayedCall(duration.fast, () => {
          flip = null;
          cardMover.to(cardGoal, "instant");
          readoutRoot.removeAttribute("data-flip");
        });
      };

      const diving = () => section.hasAttribute("data-hero-dive");
      const boxSize = () => ({ width: box.clientWidth, height: box.clientHeight });
      const stage = (): Rect => relativeRect(stageElement, box.getBoundingClientRect());
      const targetOf = (id: MapBuildingId): Point => fromViewBox(targets[id], boxSize(), viewBox);

      /** The bottom of the nav clearance band, in page coordinates (the hero sits at the page top). */
      const navFloor = (): number => {
        const clear = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-clear"));
        if (Number.isFinite(clear) && clear > 0) return clear;
        const nav = document.querySelector<HTMLElement>(".au-nav-pill");
        return nav ? nav.getBoundingClientRect().bottom + 8 : 0;
      };

      /** Phones: pan the map box (hero.css transitions it on the record token). */
      const setPan = (next: Point, mode: Mode) => {
        if (Math.abs(next.x - pan.x) < 0.5 && Math.abs(next.y - pan.y) < 0.5) return;
        pan.x = next.x;
        pan.y = next.y;
        if (mode === "instant") box.style.transition = "none";
        box.style.setProperty("--pan-x", `${Math.round(pan.x)}px`);
        box.style.setProperty("--pan-y", `${Math.round(pan.y)}px`);
        if (mode === "instant") {
          void box.offsetWidth;
          box.style.removeProperty("transition");
        }
      };

      /** What the readout must never cover, in map-box px: the text block's lines and the record cards. */
      const obstacles = (origin: DOMRect): Rect[] =>
        [...pin.querySelectorAll<HTMLElement>("[data-readout-obstacle]")].filter(visible).map((element) => relativeRect(element, origin));

      /** What it should rather not cover: the uncle chip, the dot and every other building's label. */
      const softElements = (shown: MapBuildingId | null): HTMLElement[] => [
        ...[...box.querySelectorAll<HTMLElement>("[data-readout-soft]")].filter(visible),
        ...slots.filter((slot) => slot.dataset.building !== shown && visible(slot)),
      ];

      /**
       * When no side keeps clear of them, whatever the card still overlaps fades
       * out under it (hero.css [data-readout-covered]): a whole chip under the
       * paper reads as covered, a sliver peeking out reads as broken text.
       */
      let covered: HTMLElement[] = [];
      const markCovered = (next: HTMLElement[]) => {
        for (const element of covered) if (!next.includes(element)) element.removeAttribute("data-readout-covered");
        for (const element of next) element.setAttribute("data-readout-covered", "");
        covered = next;
      };

      /**
       * Where the lens rests for `id`, in map-box px: the roof, except the dotted
       * building on the desktop map, where it drops by up to half the way to the
       * dot (the dot then sits inside the ring) as far as the text block allows.
       */
      const restOf = (id: MapBuildingId): Point => {
        const roof = targetOf(id);
        if (!desktop || id !== focus || !dot) return roof;
        const dotY = dot.offsetTop + dot.offsetHeight / 2;
        const origin = box.getBoundingClientRect();
        const textTop = Math.min(...copyLines.filter(visible).map((line) => relativeRect(line, origin).top));
        const room = Number.isFinite(textTop) ? textTop - TEXT_CLEARANCE - radius - roof.y : 0;
        return { x: roof.x, y: roof.y + Math.min(Math.max(room, 0), Math.max((dotY - roof.y) / 2, 0)) };
      };

      /*
       * Phones: building labels and the uncle chip that the frame's edges or the nav
       * floor would cut once the pan lands fade out (hero.css [data-clipped]), as the
       * desktop map hides labels its frame cuts off: no stray half-glyph at the edge,
       * no ghost through the translucent nav pill. Rects are taken where the pan will
       * end: the box may still be mid-transition from the last one.
       */
      const edgeItems = desktop ? [] : [...box.querySelectorAll<HTMLElement>("[data-building-label], [data-hero-uncle]")];
      const markClipped = (target: Point, navTop: number) => {
        if (edgeItems.length === 0) return;
        const frameRect = viewport.getBoundingClientRect();
        const boxRect = box.getBoundingClientRect();
        // Under the pill itself, not its clearance band (APM's label rests inside that band by design).
        // The pill is fixed and the hero sits at the page top: compare as if scrolled to the top.
        const pill = document.querySelector<HTMLElement>(".au-nav-pill")?.getBoundingClientRect();
        const cutTop = pill ? Math.min(navTop, pill.bottom - (frameRect.top + window.scrollY)) : navTop;
        // The pan the box shows now (its only transform): where it is minus where layout puts it.
        const dx = target.x - (boxRect.left - frameRect.left - box.offsetLeft);
        const dy = target.y - (boxRect.top - frameRect.top - box.offsetTop);
        const ink = document.createRange();
        for (const element of edgeItems) {
          // The glyphs, not the label's padded pill: a pill whose padding meets the edge reads whole.
          const label = element.matches("[data-hero-uncle]") ? element.querySelector<HTMLElement>(".hero-uncle-name") : element;
          if (!label) continue;
          ink.selectNodeContents(label);
          const rect = ink.getBoundingClientRect();
          const left = rect.left - frameRect.left + dx;
          const top = rect.top - frameRect.top + dy;
          const cut = left < -0.5 || top < cutTop || left + rect.width > frameRect.width + 0.5 || top + rect.height > frameRect.height + 0.5;
          element.toggleAttribute("data-clipped", cut);
        }
      };

      /**
       * Put the lens at `point` (map-box px) and the readout beside it; returns
       * where the lens went. `id` is the building the readout will show (a
       * choice) or undefined for the pointer, whose pick is taken at the lens.
       * Following the pointer, null: no spot near it keeps the ring off the
       * text (nothing moved).
       */
      const place = (point: Point, mode: Mode, id?: MapBuildingId): { centre: Point; shown: MapBuildingId | null } | null => {
        if (!desktop) {
          // Phones: pan so the lens, sitting on the roof, is inside the frame, below the nav
          // and above the docked readout; then clamp (a no-op unless the frame is tiny).
          const width = viewport.clientWidth;
          const height = viewport.clientHeight;
          const top = Math.max(0, navFloor() - (viewport.getBoundingClientRect().top + window.scrollY));
          const dockTop = dock && visible(dock) ? dock.offsetTop : height - PHONE_EDGE;
          // The dotted building also keeps its dot 12px above the docked readout.
          const dotBelow = id === focus && dot ? dot.offsetTop + dot.offsetHeight - point.y : 0;
          const at = { x: box.offsetLeft + point.x, y: box.offsetTop + point.y };
          const nextPan = panInto(at, {
            left: PHONE_EDGE + radius,
            right: width - PHONE_EDGE - radius,
            top: top + radius,
            bottom: dockTop - Math.max(16, dotBelow + 12),
          });
          markClipped(nextPan, top);
          setPan(nextPan, mode);
          const dx = box.offsetLeft + nextPan.x;
          const dy = box.offsetTop + nextPan.y;
          const centre = clampLens(point, { left: PHONE_EDGE - dx, right: width - PHONE_EDGE - dx, top: top - dy, bottom: height - dy }, radius);
          lensMover.to(centre, mode);
          return { centre, shown: id ?? null };
        }

        const origin = box.getBoundingClientRect();
        const area = relativeRect(stageElement, origin);
        // Never under the nav pill.
        area.top = Math.max(area.top, navFloor() - (origin.top + window.scrollY));
        let centre = clampLens(point, area, radius);
        const textRects = copyLines.filter(visible).map((line) => relativeRect(line, origin));
        if (mode === "follow") {
          // The pointer leads, but the ring keeps TEXT_CLEARANCE off the text: it slides to the
          // nearest clear spot (the pick is taken there), or gives way when none is near.
          const clear = clearOfRects(centre, radius, textRects, area, { clearance: TEXT_CLEARANCE, maxReach: FOLLOW_REACH });
          if (!clear) return null;
          centre = { x: Math.round(clear.x * 10) / 10, y: Math.round(clear.y * 10) / 10 };
        } else {
          centre = nudgeLens(centre, point, { radius, rects: textRects, area });
        }
        let shown: MapBuildingId | null = id ?? null;
        if (id === undefined) {
          const [sx, sy] = toViewBox(centre, boxSize(), viewBox);
          shown = pickBuilding(pick, sx, sy);
        }
        if (!floatReadout) {
          lensMover.to(centre, mode);
        } else {
          // Every read before the first write (an instant move writes at once): one layout, not two.
          const size = { width: floatReadout.offsetWidth, height: floatReadout.offsetHeight };
          const soft = softElements(shown).map((element) => ({ element, rect: relativeRect(element, origin) }));
          const blocked = obstacles(origin);
          lensMover.to(centre, mode);
          const placed = placeReadout(centre, size, {
            radius,
            gap: READOUT_GAP,
            margin: READOUT_MARGIN,
            stage: area,
            obstacles: blocked,
            soft: soft.map(({ rect }) => rect),
            // Following the pointer, the card keeps its side through small moves; a choice takes the canonical spot.
            hold: mode === "follow" ? side : null,
          });
          if (placed.side !== side) {
            side = placed.side;
            box.dataset.readoutSide = placed.side;
          }
          moveCard(placed, mode, size, blocked);
          const cardRect: Rect = { left: placed.x, top: placed.y, right: placed.x + size.width, bottom: placed.y + size.height };
          markCovered(
            shown === null
              ? []
              : soft
                  .filter(({ rect }) => rect.left < cardRect.right && cardRect.left < rect.right && rect.top < cardRect.bottom && cardRect.top < rect.bottom)
                  .map(({ element }) => element),
          );
        }
        return { centre, shown };
      };

      /** Place the lens on the selected building (a choice, a resize, the end of a dive). */
      const placeSelected = (mode: Mode) => {
        if (diving()) {
          stale = true;
          box.setAttribute("data-lens-pending", "");
          return;
        }
        box.removeAttribute("data-lens-pending");
        const { selected } = lensStore.getState();
        place(restOf(selected), mode, selected);
      };

      const settleMode = (): Mode => (reducedQuery.matches ? "instant" : "glide");

      const rest = () => {
        if (resting) return;
        resting = true;
        lensStore.rest();
        placeSelected(settleMode());
      };

      // Pointer follow (desktop map only).
      const canFollow = () => desktop && followQuery.matches && box.clientWidth > 0;

      const flushPointer = () => {
        frame = 0;
        const current = pointer;
        if (!current || !canFollow()) return;
        // Diving (the pin has started): the lens is fading out; leave it where it is.
        if (diving()) return;
        if (current.target instanceof Element && current.target.closest("[data-hero-copy] > *")) {
          rest();
          return;
        }
        const origin = box.getBoundingClientRect();
        const point = { x: current.x - origin.left, y: current.y - origin.top };
        // Outside the stage (the frame's margin, the record column's area) counts as leaving.
        const area = stage();
        if (point.x < area.left || point.x > area.right || point.y < area.top || point.y > area.bottom) {
          rest();
          return;
        }
        // No spot near the pointer keeps the ring off the text: as if it had moved onto the text.
        const placed = place(point, "follow");
        if (!placed) {
          rest();
          return;
        }
        resting = false;
        lensStore.show(placed.shown);
      };

      const onPointerMove = (event: PointerEvent) => {
        if (event.pointerType === "touch") return;
        pointer = { x: event.clientX, y: event.clientY, target: event.target };
        if (!frame) frame = requestAnimationFrame(flushPointer);
      };

      const onPointerLeave = () => {
        pointer = null;
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        rest();
      };

      // Building buttons (desktop map): click or keyboard focus moves the lens there.
      const buttonOf = (target: EventTarget | null) =>
        target instanceof Element ? target.closest<HTMLElement>("[data-building-button]") : null;
      const onChoose = (event: Event) => {
        const button = buttonOf(event.target);
        if (!button || !box.contains(button)) return;
        const id = button.dataset.buildingButton as MapBuildingId | undefined;
        if (id && id in targets) lensStore.select(id);
      };

      /**
       * Desktop labels the frame cuts off (a portrait tablet's cover fit) leave
       * the page: a hidden slot takes its button out of Tab and touch. If the
       * chosen building goes, the lens returns to 청평화.
       */
      const hideCutLabels = () => {
        if (!desktop || diving()) return;
        const frameRect = stageElement.getBoundingClientRect();
        if (frameRect.width === 0) return;
        // Measure every label shown (a write only when one was hidden: no forced layout otherwise).
        for (const slot of slots) if (slot.hidden) slot.hidden = false;
        // More than half outside: a label the frame only nicks stays.
        const cut = slots.filter((slot) => {
          const rect = slot.getBoundingClientRect();
          const x = (rect.left + rect.right) / 2;
          const y = (rect.top + rect.bottom) / 2;
          return x < frameRect.left || x > frameRect.right || y < frameRect.top || y > frameRect.bottom;
        });
        for (const slot of cut) slot.hidden = true;
        const { selected } = lensStore.getState();
        if (cut.some((slot) => slot.dataset.building === selected) && selected !== REST_BUILDING) lensStore.select(REST_BUILDING);
      };

      // Store: a select (button, chip, focus) moves this lens; button states follow what is shown.
      const buttons = [...box.querySelectorAll<HTMLElement>("[data-building-button]")];
      let request = lensStore.getState().request;
      let lastShown: MapBuildingId | null | undefined;
      let lastSelected: MapBuildingId | undefined;
      const sync = () => {
        const state = lensStore.getState();
        if (state.shown !== lastShown || state.selected !== lastSelected) {
          lastShown = state.shown;
          lastSelected = state.selected;
          for (const button of buttons) {
            const id = button.dataset.buildingButton;
            button.toggleAttribute("data-active", id === state.shown);
            button.setAttribute("aria-pressed", String(id === state.selected));
          }
        }
        if (state.request !== request) {
          request = state.request;
          resting = true;
          placeSelected(settleMode());
        }
      };
      const unsubscribe = lensStore.subscribe(sync);
      sync();

      /*
       * Placement, without motion, on every resize. The first one (the server's percentage
       * defaults to pixels) is the observer's initial notification: it runs after the next
       * frame's layout and before its paint, so it forces no layout of its own and the
       * defaults are never seen to move.
       */
      const resize = new ResizeObserver(() => {
        hideCutLabels();
        if (resting) placeSelected("instant");
      });
      resize.observe(box);
      resize.observe(stageElement);
      if (floatReadout) resize.observe(floatReadout);
      if (dock) resize.observe(dock);

      // Back at the top after a dive: redo what was skipped (rects measured mid-dive include its transforms).
      const diveWatch = new MutationObserver(() => {
        if (!stale || diving()) return;
        stale = false;
        hideCutLabels();
        placeSelected("instant");
        box.removeAttribute("data-lens-pending");
      });
      diveWatch.observe(section, { attributes: true, attributeFilter: ["data-hero-dive"] });

      if (desktop) {
        pin.addEventListener("pointermove", onPointerMove);
        pin.addEventListener("pointerleave", onPointerLeave);
        box.addEventListener("click", onChoose);
        box.addEventListener("focusin", onChoose);
      }

      return () => {
        unsubscribe();
        resize.disconnect();
        diveWatch.disconnect();
        if (flush) gsap.ticker.remove(flush);
        flush = null;
        lensMover.stop();
        cardMover.stop();
        endFlip();
        box.removeAttribute("data-lens-pending");
        if (frame) cancelAnimationFrame(frame);
        pin.removeEventListener("pointermove", onPointerMove);
        pin.removeEventListener("pointerleave", onPointerLeave);
        box.removeEventListener("click", onChoose);
        box.removeEventListener("focusin", onChoose);
        for (const slot of slots) slot.hidden = false;
        for (const element of edgeItems) element.removeAttribute("data-clipped");
        markCovered([]);
      };
    }
  }, [variant, pick, viewBox, targets, focus]);

  return null;
}
