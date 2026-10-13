"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { useSmoothScroll } from "@/components/motion/SmoothScroll";
import { isLowPower, type DeviceHints } from "@/lib/device";
import { gsap, ScrollTrigger, SplitText, useGSAP } from "@/lib/gsap";
import { MQ, PIN_PRIORITY, loadDrawSVG, loadMotionPath, requestScrollRefresh } from "@/lib/gsap-plugins";
import { duration, gsapEase } from "@/lib/motion";
import { useStoryBeats } from "@/lib/story/use-story";

import {
  CAMERA_END,
  DESKTOP_BEATS,
  ENTRY_LIT,
  LAMP_ON,
  PIN_LENGTH,
  PUSH,
  STAGE_BEATS,
  arrivedCount,
  cameraShift,
  captionIndex,
  frameRound,
  headingClearance,
  inverseScaleEase,
  pageRest,
  pushShift,
  routeLegs,
  type CaptionIndex,
  type DoorTag,
} from "./route-script";

/**
 * S3 route motion (spec S3, 3.2, 6.3 to 6.5). Client wrapper around the
 * server-rendered section; one gsap.matchMedia with the three branches.
 *
 * desktopMotion: switches the section to its pinned layout
 *   ([data-route-mode="pinned"]) and pins the scene for +=180%, scrub 1,
 *   refreshPriority PIN_PRIORITY.route. The camera starts at the S2 end state
 *   (the words section's background: the same covering box, scale 1.6 and
 *   rotateX 10deg about 청평화's roof, the drawing at 25%, the other buildings
 *   at 35%) and settles by 0.15 on the round framing: APM, 청평화, the round and
 *   both tags centred in the band between the heading and the captions, at
 *   scale 1 unless a short or narrow screen needs less (frameRound, tags
 *   budgeted in pixels). The drawing comes back to full strength while the
 *   section enters (ENTRY_LIT), so the pin never opens on a faint stage; the
 *   lamp switches on at the junction from 0.10, as the round starts. A map
 *   name the settle carries across the heading waits unseen until the camera
 *   has carried it clear (headingClearance). The route's mask path is drawn
 *   with DrawSVG and the lamp rides the dashed route with MotionPath, ease
 *   none per leg (route-script.ts). Through the
 *   청평화 hold the camera pushes in about its door. Captions, tags, the lit
 *   floor ticks and the story beats all follow the scrubbed timeline, so the
 *   plate, the rail and the caption change exactly when the lamp gets there,
 *   in both directions.
 * mobileMotion: no pin. The heading reveals; each stop block reports its beat
 *   when its centre crosses the viewport centre. Dots are static.
 * reduced: no pin, no reveal; the static end state; beats per block as above.
 *
 * Leaving the desktop branch (a resize below 1024px, a tablet rotating, or
 * reduced motion switched on) never strands the film's inline styles: the
 * desktop callbacks stop as soon as its query no longer matches, and the
 * other branches start from the server-rendered state.
 *
 * Keyboard paging (PageDown, PageUp, Space) through the pin never steps over
 * a whole stop (pageRest): a native page is about half the pin, so from 02:16
 * it would land on 03:07 and the 03:06 frame would never be a resting frame.
 */

/** The S2 end state the camera starts from (spec S1 dive end, S2 background). */
const START = { scale: 1.6, tilt: 10, opacity: 0.25 } as const;
/** Buildings other than 청평화 at the end of the hero's dive. */
const OFF_FOCUS_OPACITY = 0.35;
const PERSPECTIVE = 1200;
/** The round's centre lands mid-stage across, mid-way between the heading and the captions down. */
const FRAME_AT_X = 0.5;
/** Air kept above (under the heading) and below (over the captions) the framed round, px. */
const FRAME_MARGIN = { top: 40, bottom: 28 } as const;
/** The share of the stage width the framed round may take. */
const FRAME_MAX_WIDTH = 0.9;

/** Vertical travel of a caption as it swaps, and the gap above the current caption. */
const CAPTION_SHIFT = 24;
/**
 * The previous caption stays above the current one at this opacity: #EDECE3
 * on #07231C at 0.42 is about 3.5:1, above the 3:1 large-text floor for the
 * 22px bold caption and the 28px time. Its small lines are clipped away.
 */
const CAPTION_GHOST = 0.42;

/**
 * Caption swap timing, seconds (route.css mirrors CAPTION_OUT as
 * --route-swap-out and CAPTION_IN + CAPTION_LINES_IN as --route-lines-in).
 * What leaves the screen (a caption, or the small lines under a caption
 * becoming the ghost) is wiped away by its clip within CAPTION_OUT; what
 * arrives, or moves down into the place a caption just left, waits
 * CAPTION_IN. So two captions never print over each other, in either
 * direction. Text is shown and hidden by its clip, never faded: every line on
 * screen is at full strength or the ghost's, both above AA.
 */
const CAPTION_OUT = 0.18;
const CAPTION_IN = 0.2;
/**
 * A ghost becoming current brightens over CAPTION_BRIGHTEN as it starts down;
 * the small lines (and, below 1280px, the record) it gets back wait
 * CAPTION_LINES_IN more, until it is at full strength.
 */
const CAPTION_BRIGHTEN = 0.12;
const CAPTION_LINES_IN = 0.1;
/** How far the open clip reaches past the caption block on every side, px. */
const CLIP_PAD = 32;

type CaptionRole = "current" | "ghost" | "above" | "below";

/** Where stop `n` stands when `index` is the current caption. */
function captionRole(n: number, index: number): CaptionRole {
  if (n === index) return "current";
  if (n > index) return "below";
  return n === index - 1 ? "ghost" : "above";
}

const TAG_FROM_SCALE = 0.8;
const TAG_POP = 0.4;
/**
 * A tag unfolds from its corner at the door (its transform origin) as it pops,
 * and folds back into it, instead of fading: its count is never on screen at
 * a fraction of its contrast.
 */
const TAG_OPEN = "inset(0% 0% 0% 0%)";
/** A tag unfolds a beat after the lamp reaches its door, once 남평화's name has given way (route.css). */
const TAG_DELAY = 0.06;
const tagFolded = (tag: HTMLElement) =>
  Number.parseFloat(getComputedStyle(tag).transformOrigin) > tag.offsetWidth / 2 ? "inset(0% 0% 100% 100%)" : "inset(0% 100% 100% 0%)";

/**
 * A map name the settle carries across the heading (APM's, under its second
 * line, on most desktop screens) waits unseen while it is within this many px
 * of the heading, and fades back over this share of the settle once clear.
 */
const NAME_CLEARANCE = { margin: 8, ramp: 0.2 } as const;

type Region = readonly [number, number, number, number];

type RouteMotionProps = {
  /** Route fraction of the APM stop (the generated view's stops). */
  apmFraction: number;
  /** [x0, y0, x1, y1] viewBox units: the drawing the camera frames (APM, 청평화 and the round). */
  shapes: Region;
  viewBox: { readonly width: number; readonly height: number };
  /** 청평화's roof in percent of the map box: the camera's transform-origin. */
  focus: { readonly x: number; readonly y: number };
  children: ReactNode;
};

type Arrival = { tick: SVGPathElement; slot: HTMLElement; tag: HTMLElement; on: boolean | null };

type Frame = {
  x: number;
  y: number;
  scale: number;
  push: { x: number; y: number; scale: number };
  /** The lamp's inverse-scale eases for the settle and the push. */
  lampSettle: (t: number) => number;
  lampPush: (t: number) => number;
  /** Per map name (in DOM order): its opacity over the settle, 0 while it crosses the heading. */
  names: ReadonlyArray<(t: number) => number>;
};

/** A map name: its slot (which counter-scales against the camera) and the text in it. */
type MapName = { slot: HTMLElement; text: HTMLElement };

/** The map names' text, which the film fades while the settle carries one across the heading. */
const NAME_TEXT = "[data-route-camera] .route-labels [data-building] > *";

function required<T extends Element>(scope: ParentNode, selector: string): T {
  const element = scope.querySelector<T>(selector);
  if (!element) throw new Error(`RouteMotion: missing ${selector}`);
  return element;
}

const percent = (fraction: number) => `${Math.round(fraction * 1e5) / 1e3}%`;

/** The two arrival ticks: APM 럭스 4층 (02:16) and 청평화 1층 (03:06). */
const ARRIVAL_TICKS = {
  apm: 'svg [data-building="apm"] [data-floor="4"]',
  cheongpyeonghwa: 'svg [data-building="cheongpyeonghwa"] [data-floor="1"]',
} as const;

/**
 * The farthest a native keyboard page goes, as a share of the viewport. The
 * real step varies (Chromium pages the viewport minus 40px, less under a fixed
 * header), so pages are judged at this bound: a rest is never more than one
 * viewport away, and never past where a skipping page would have landed.
 */
const PAGE_REACH = 1;

/** Fields, widgets and dialogs that own Page Up and Page Down themselves. */
const OWNS_PAGE_KEYS = [
  "input",
  "textarea",
  "select",
  '[contenteditable]:not([contenteditable="false"])',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="listbox"]',
  '[role="grid"]',
  '[role="tree"]',
  '[role="menu"]',
  "dialog",
  '[role="dialog"]',
].join(", ");

/** Controls that Space activates (or types into) rather than pages. */
const SPACE_ACTS = [
  "a[href]",
  "button",
  "summary",
  "label",
  "video",
  "audio",
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="radio"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
].join(", ");

/**
 * The direction of a key press that pages the document: 1 down, -1 up, 0 for
 * anything else. Not from a field, a widget, a dialog or inside a box that
 * scrolls on its own, and Space not from a control it activates.
 */
function pageKey(event: KeyboardEvent): 1 | -1 | 0 {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return 0;
  const space = event.key === " ";
  if (!space && event.key !== "PageDown" && event.key !== "PageUp") return 0;
  const target = event.target;
  if (!(target instanceof Element)) return 0;
  if (target !== document.body && target !== document.documentElement) {
    if (target.closest(space ? `${OWNS_PAGE_KEYS}, ${SPACE_ACTS}` : OWNS_PAGE_KEYS)) return 0;
    for (let box: Element | null = target; box && box !== document.body; box = box.parentElement) {
      const { overflowY } = getComputedStyle(box);
      if ((overflowY === "auto" || overflowY === "scroll") && box.scrollHeight > box.clientHeight) return 0;
    }
  }
  if (space) return event.shiftKey ? -1 : 1;
  return event.key === "PageDown" ? 1 : -1;
}

/** H2 line-mask reveal at entry (spec 6.2 reveal): plays on the way down, resets above the section. */
function revealHeading(scope: HTMLElement, section: HTMLElement): () => void {
  const heading = required<HTMLElement>(scope, "[data-route-head] h2");
  const split = SplitText.create(heading, {
    type: "lines",
    mask: "lines",
    autoSplit: true,
    onSplit: (self) =>
      gsap.fromTo(
        self.lines,
        { yPercent: 105 },
        {
          yPercent: 0,
          duration: duration.record,
          ease: gsapEase.snap,
          stagger: 0.06,
          scrollTrigger: { trigger: section, start: "top 75%", toggleActions: "play none none reset" },
        },
      ),
  });
  return () => split.revert();
}

/**
 * Back to the server-rendered layout: every caption and tag visible with no
 * inline state, both arrival ticks lit, the round drawn and the lamp at
 * 청평화. The phone and reduced branches start here, so a page that leaves the
 * pinned film mid-way (a resize, a tablet rotating, reduced motion switched
 * on) shows every block.
 *
 * The film's own leftovers on the camera's mask, lamp and map names are
 * cleared here too, not left to GSAP's revert: every refresh re-initialises
 * the film's tweens (invalidateOnRefresh), and DrawSVG then records the
 * mask's inline dash of that moment as the state to revert to (often the
 * first leg's undrawn "0% 0%"), so a film built a second time would revert to
 * a hidden route; a name refreshed mid-settle would likewise come back
 * unseen. Only the camera's mask: the phone crops draw theirs from --len.
 */
function restoreStatic(scope: HTMLElement): void {
  const items = gsap.utils.toArray<HTMLElement>("[data-route-stop], [data-route-camera] [data-route-tag]", scope);
  gsap.killTweensOf(items);
  gsap.set(items, { clearProps: "all" });
  for (const item of items) item.removeAttribute("data-current");
  scope.querySelector<HTMLElement>("[data-route-camera]")?.removeAttribute("data-cp-arrived");
  for (const selector of Object.values(ARRIVAL_TICKS)) scope.querySelector(`[data-route-camera] ${selector}`)?.setAttribute("data-lit", "");

  gsap.set(gsap.utils.toArray<HTMLElement>(NAME_TEXT, scope), { clearProps: "opacity" });

  for (const mask of scope.querySelectorAll<SVGPathElement>("[data-route-camera] .map-route-mask")) {
    mask.style.removeProperty("stroke-dasharray");
    mask.style.removeProperty("stroke-dashoffset");
  }
  const dot = scope.querySelector<HTMLElement>("[data-route-camera] [data-route-dot]");
  if (dot) {
    gsap.killTweensOf(dot);
    gsap.set(dot, { clearProps: "transform,opacity,visibility" });
  }
}

/**
 * Phones and reduced motion: the beat is the number of stop blocks whose
 * centre is above the viewport centre (a pure function of scroll). Under
 * reduced motion SectionActivity reports the section default when the section
 * becomes active; the deferred report lands after it.
 */
function blockBeats(scope: HTMLElement, section: HTMLElement, report: (stage: number) => void, defer: boolean): void {
  const blocks = gsap.utils.toArray<HTMLElement>("[data-stop-beat]", scope);
  let centres: ScrollTrigger[] = [];
  const sync = () => {
    const scroll = centres[0]?.scroll() ?? 0;
    report(centres.filter((centre) => scroll >= centre.start).length);
  };
  const schedule = defer ? () => queueMicrotask(sync) : sync;
  centres = blocks.map((block) => ScrollTrigger.create({ trigger: block, start: "center center", onToggle: schedule }));
  ScrollTrigger.create({
    trigger: section,
    start: "top bottom",
    end: "bottom top",
    onUpdate: schedule,
    onToggle: schedule,
    onRefresh: schedule,
  });
}

export function RouteMotion({ apmFraction, shapes, viewBox, focus, children }: RouteMotionProps) {
  const root = useRef<HTMLDivElement>(null);
  const reportProgress = useStoryBeats("route", DESKTOP_BEATS);
  const reportStage = useStoryBeats("route", STAGE_BEATS);
  // The page's own scroll (Lenis), for keyboard paging: read when a key is pressed.
  const smooth = useSmoothScroll();
  const scroller = useRef(smooth);
  useEffect(() => {
    scroller.current = smooth;
  });

  useGSAP(
    () => {
      const scope = root.current;
      if (!scope) return;
      const section = scope.closest<HTMLElement>("section") ?? scope;
      const mm = gsap.matchMedia();

      mm.add(MQ.desktopMotion, (context) => {
        // Callbacks stop once the branch is leaving: when the query no longer matches,
        // the context's revert renders the timeline back to 0 and would otherwise start
        // new caption tweens (and report 23:30) after the next branch has set its layout.
        const query = window.matchMedia(MQ.desktopMotion);
        let alive = true;
        const live = () => alive && query.matches;

        scope.dataset.routeMode = "pinned";

        const spacer = required<HTMLElement>(scope, "[data-route-pin-spacer]");
        const scene = required<HTMLElement>(scope, "[data-route-scene]");
        const head = required<HTMLElement>(scope, "[data-route-head]");
        const stopList = required<HTMLElement>(scope, "[data-route-stops]");
        const camera = required<HTMLElement>(scope, "[data-route-camera]");
        const dot = required<HTMLElement>(camera, "[data-route-dot]");
        const maskPath = required<SVGPathElement>(camera, ".map-route-mask");
        const routePath = required<SVGPathElement>(camera, ".map-route");
        const drawing = gsap.utils.toArray<Element>(":scope > svg, :scope > .route-labels", camera);
        const stops = gsap.utils.toArray<HTMLElement>("[data-route-stop]", scope);
        const texts = stops.map((stop) => required<HTMLElement>(stop, "[data-route-text]"));
        const ghostEnds = stops.map((stop) => required<HTMLElement>(stop, "[data-ghost-end]"));
        const apmShapes = gsap.utils.toArray<Element>('svg [data-building="apm"], .route-labels [data-building="apm"]', camera);
        const names: MapName[] = gsap.utils
          .toArray<HTMLElement>(".route-labels [data-building]", camera)
          .map((slot) => ({ slot, text: required<HTMLElement>(slot, ":scope > *") }));
        const arrival = (building: keyof typeof ARRIVAL_TICKS): Arrival => {
          const slot = required<HTMLElement>(camera, `.route-tags [data-building="${building}"]`);
          return { tick: required(camera, ARRIVAL_TICKS[building]), slot, tag: required(slot, "[data-route-tag]"), on: null };
        };
        const atCheongpyeonghwa = arrival("cheongpyeonghwa");
        const arrivals: Arrival[] = [arrival("apm"), atCheongpyeonghwa];
        // The push holds 청평화's door (its tag's slot) still on screen.
        const pushAnchor = atCheongpyeonghwa.slot;
        const tilt = !isLowPower(navigator as Navigator & DeviceHints);
        const unreveal = revealHeading(scope, section);

        // A previous caption keeps its first lines down to [data-ghost-end] (route.css fades the rest).
        const ghostHeight = (n: number) => {
          const end = ghostEnds[n];
          const text = texts[n];
          return end && text ? end.offsetTop + end.offsetHeight - text.offsetTop : 0;
        };
        const hiddenBelow = (n: number) => (texts[n]?.offsetHeight ?? 0) - ghostHeight(n);

        // The map names' boxes, px from the camera origin's place: read with the camera's transform
        // taken off and put straight back (nothing paints in between). A name counter-scales against
        // the camera, so its box at scale 1 is its size at every scale, about its centre.
        const nameBoxes = (origin: { x: number; y: number }) => {
          const transform = camera.style.transform;
          const mapScale = camera.style.getPropertyValue("--map-scale");
          camera.style.transform = "none";
          camera.style.setProperty("--map-scale", "1");
          const base = camera.getBoundingClientRect();
          const ox = base.left + origin.x;
          const oy = base.top + origin.y;
          const boxes = names.map(({ slot, text }) => {
            const around = slot.getBoundingClientRect();
            const glyphs = text.getBoundingClientRect();
            return {
              centre: { x: (around.left + around.right) / 2 - ox, y: (around.top + around.bottom) / 2 - oy },
              label: [glyphs.left - ox, glyphs.top - oy, glyphs.right - ox, glyphs.bottom - oy] as const,
            };
          });
          camera.style.transform = transform;
          if (mapScale) camera.style.setProperty("--map-scale", mapScale);
          else camera.style.removeProperty("--map-scale");
          return boxes;
        };

        // The round framing, from untransformed layout boxes (no transform leaks in): the drawing
        // and both door tags centred in the free band between the heading and the tallest pair of
        // stacked captions, at scale 1 (spec S3) unless a short or narrow screen needs less.
        const measureFrame = (): Frame => {
          const box = { left: camera.offsetLeft, top: camera.offsetTop, width: camera.offsetWidth, height: camera.offsetHeight };
          // The box covers the stage with the focus at focus.x% of both (route.css), so the
          // stage's width follows from the box: left = fx * (stage - box).
          const stageWidth = box.left / (focus.x / 100) + box.width;
          const k = box.width / viewBox.width;
          const stack = Math.max(
            ...stops.map((stop, n) =>
              n === 0 ? stop.offsetHeight : Math.max(stop.offsetHeight, (texts[n]?.offsetHeight ?? 0) + CAPTION_SHIFT + ghostHeight(n - 1)),
            ),
          );
          const top = head.offsetTop + head.offsetHeight + FRAME_MARGIN.top;
          const bottom = stopList.offsetTop + stopList.offsetHeight - stack - FRAME_MARGIN.bottom;
          const doorTags: DoorTag[] = arrivals.map(({ slot, tag }) => ({
            door: { x: slot.offsetLeft, y: slot.offsetTop },
            box: [tag.offsetLeft, tag.offsetTop, tag.offsetLeft + tag.offsetWidth, tag.offsetTop + tag.offsetHeight],
          }));
          const { scale, centre } = frameRound({
            shapes: [shapes[0] * k, shapes[1] * k, shapes[2] * k, shapes[3] * k],
            tags: doorTags,
            space: { width: stageWidth * FRAME_MAX_WIDTH, height: bottom - top },
          });
          const origin = { x: (box.width * focus.x) / 100, y: (box.height * focus.y) / 100 };
          const shift = cameraShift({ box, origin, scale, centre, target: { x: stageWidth * FRAME_AT_X, y: (top + bottom) / 2 } });
          const pushed = scale * PUSH.scale;
          const anchor = { x: pushAnchor.offsetLeft, y: pushAnchor.offsetTop };
          const delta = pushShift({ anchor, origin, from: scale, to: pushed });
          // Everything from here on in px from the camera origin's place with no transform.
          const ox = box.left + origin.x;
          const oy = box.top + origin.y;
          const heading = [head.offsetLeft - ox, head.offsetTop - oy, head.offsetLeft + head.offsetWidth - ox, head.offsetTop + head.offsetHeight - oy] as const;
          const settle = {
            from: { x: 0, y: 0, scale: START.scale, tilt: tilt ? START.tilt : 0 },
            to: { x: shift.x, y: shift.y, scale, tilt: 0 },
            perspective: PERSPECTIVE,
          };
          return {
            ...shift,
            scale,
            push: { x: shift.x + delta.x, y: shift.y + delta.y, scale: pushed },
            lampSettle: inverseScaleEase(START.scale, scale),
            lampPush: inverseScaleEase(scale, pushed, gsap.parseEase("power1.inOut")),
            names: nameBoxes(origin).map(({ label, centre }) =>
              headingClearance({ label, centre, heading, ...settle, ...NAME_CLEARANCE }),
            ),
          };
        };
        let frame: Frame | null = null;
        const framing = () => (frame ??= measureFrame());

        // Captions: the current one in the slot, the previous one above it as a ghost (its
        // meaningful lines only, so its offset counts only what stays visible). Each caption
        // block is clipped (route.css: --route-clip-top / --route-clip-bottom, px into the
        // block): open on the current one, cut at [data-ghost-end] on the ghost, closed on
        // the hidden ones (above: shut at the ghost's last line; below: shut from the top).
        const captionState = (n: number, role: CaptionRole, current: number, previous: number) => {
          const height = texts[n]?.offsetHeight ?? 0;
          const below = hiddenBelow(n);
          const clip = (top: number, bottom: number) => ({ "--route-clip-top": `${top}px`, "--route-clip-bottom": `${bottom}px` });
          switch (role) {
            case "current":
              return { y: 0, opacity: 1, clip: clip(-CLIP_PAD, -CLIP_PAD) };
            case "ghost":
              return { y: -(current + CAPTION_SHIFT) + below, opacity: CAPTION_GHOST, clip: clip(-CLIP_PAD, below) };
            case "above":
              return { y: -(current + previous + 2 * CAPTION_SHIFT) + below, opacity: 0, clip: clip(height - below, below) };
            case "below":
              return { y: CAPTION_SHIFT, opacity: 0, clip: clip(-CLIP_PAD, height + CLIP_PAD) };
          }
        };

        // Each stop goes from where it actually is (a fast scrub can cross a second threshold
        // before the first swap has played out), so a caption still waiting to arrive counts
        // as hidden, and one still leaving as on screen.
        let caption = -1;
        const showCaption = (index: CaptionIndex, immediate: boolean) => {
          if (index === caption || !live()) return;
          caption = index;
          const current = texts[index]?.offsetHeight ?? 0;
          const previous = ghostHeight(index - 1);
          const record = { duration: duration.record, ease: gsapEase.snap };
          stops.forEach((stop, n) => {
            const role = captionRole(n, index);
            const { y, opacity, clip } = captionState(n, role, current, previous);
            stop.toggleAttribute("data-current", role === "current");
            gsap.killTweensOf(stop);
            const shown = role === "current" || role === "ghost";
            const onScreen = stop.style.visibility !== "hidden" && Number(gsap.getProperty(stop, "opacity")) > 0;
            const at = Number(gsap.getProperty(stop, "y"));
            if (immediate || (!shown && !onScreen)) {
              gsap.set(stop, { y, autoAlpha: opacity, ...clip });
            } else if (!shown) {
              // Leaving: wiped away by its clip while it moves off, then hidden. Only the current
              // caption drops (CAPTION_SHIFT); a ghost leaving downward (a fast scrub back) is
              // wiped where it is, never carried across the slot.
              const drops = y - at > CAPTION_SHIFT + 0.5;
              if (!drops) gsap.to(stop, { y, ...record });
              gsap.to(stop, { ...clip, duration: CAPTION_OUT, ease: "power2.in" });
              gsap.set(stop, { autoAlpha: 0, ...(drops ? { y } : {}), delay: CAPTION_OUT });
            } else if (!onScreen) {
              // Arriving: once the leaving text is gone, it rises (or comes down) into place,
              // drawn open by its clip at full strength. A caption coming back down into the
              // ghost's place starts from the stack above (in step with the caption below it)
              // and opens a beat later, once it has left the map's tags behind; one that never
              // reached the slot (a fast scrub on) opens in the ghost's place.
              const opens = role === "ghost" ? CAPTION_IN + CAPTION_LINES_IN : CAPTION_IN;
              if (role === "ghost" && at > y) gsap.set(stop, { y });
              else gsap.to(stop, { y, ...record, delay: CAPTION_IN });
              gsap.set(stop, { autoAlpha: opacity, delay: opens });
              gsap.to(stop, { ...clip, ...record, delay: opens });
            } else if (y > at + 0.5) {
              // Coming down (the ghost into the slot the current caption just left): it waits
              // for that caption to be wiped, brightens, then gets its small lines back.
              gsap.to(stop, { y, ...record, delay: CAPTION_IN });
              gsap.to(stop, { autoAlpha: opacity, duration: CAPTION_BRIGHTEN, ease: "power2.out", delay: CAPTION_IN });
              gsap.to(stop, { ...clip, ...record, delay: CAPTION_IN + CAPTION_LINES_IN });
            } else {
              // Going up (the current caption into the ghost's place): at once, in step with
              // the ghost leaving above it; its small lines are wiped before it dims (the dim
              // starts slow), so they are never seen faint.
              gsap.to(stop, { y, ...record });
              gsap.to(stop, { autoAlpha: opacity, duration: duration.record, ease: "power2.inOut" });
              gsap.to(stop, { ...clip, duration: CAPTION_OUT, ease: "power2.in" });
            }
          });
        };

        // Arrivals: the tag pops and the floor tick takes the bright stroke.
        const showArrivals = (count: number, immediate: boolean) => {
          if (!live()) return;
          camera.toggleAttribute("data-cp-arrived", count > 1);
          arrivals.forEach((arrival, index) => {
            const on = count > index;
            if (arrival.on === on) return;
            arrival.on = on;
            arrival.tick.toggleAttribute("data-lit", on);
            gsap.killTweensOf(arrival.tag);
            const folded = tagFolded(arrival.tag);
            if (immediate) {
              gsap.set(arrival.tag, { autoAlpha: on ? 1 : 0, scale: on ? 1 : TAG_FROM_SCALE, clipPath: on ? TAG_OPEN : folded });
            } else if (on) {
              gsap.set(arrival.tag, { scale: TAG_FROM_SCALE, clipPath: folded });
              gsap.set(arrival.tag, { autoAlpha: 1, delay: TAG_DELAY });
              gsap.to(arrival.tag, { scale: 1, duration: TAG_POP, ease: gsapEase.overshoot, delay: TAG_DELAY });
              gsap.to(arrival.tag, { clipPath: TAG_OPEN, duration: TAG_POP, ease: gsapEase.snap, delay: TAG_DELAY });
            } else {
              gsap.to(arrival.tag, { scale: TAG_FROM_SCALE, clipPath: folded, duration: duration.fast, ease: "power2.in" });
              gsap.set(arrival.tag, { autoAlpha: 0, delay: duration.fast });
            }
          });
        };

        // Everything on the stage follows the timeline (not the raw scroll), so the plate and
        // the rail never lead the lamp; at rest it is still a pure function of scroll.
        const follow = (immediate: boolean) => {
          if (!live()) return;
          const progress = tl.progress();
          reportProgress(progress);
          showCaption(captionIndex(progress), immediate);
          showArrivals(arrivedCount(progress), immediate);
        };

        gsap.set(camera, { transformOrigin: `${focus.x}% ${focus.y}%`, transformPerspective: PERSPECTIVE });

        const tl = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: {
            trigger: scene,
            start: "top top",
            end: `+=${PIN_LENGTH * 100}%`,
            pin: scene,
            pinSpacer: spacer,
            scrub: 1,
            invalidateOnRefresh: true,
            refreshPriority: PIN_PRIORITY.route,
            onRefreshInit: () => {
              frame = null;
            },
            onRefresh: () => {
              caption = -1;
              follow(true);
            },
          },
          onUpdate: () => follow(false),
        });

        // 0 to 0.15: from the S2 end state to the round framing.
        tl.fromTo(
          camera,
          { x: 0, y: 0, scale: START.scale, rotationX: tilt ? START.tilt : 0, "--map-scale": START.scale },
          {
            x: () => framing().x,
            y: () => framing().y,
            scale: () => framing().scale,
            rotationX: 0,
            "--map-scale": () => framing().scale,
            duration: CAMERA_END,
          },
          0,
        );
        // The drawing (not the lamp) comes up from the S2 end state's 25% while the section
        // enters, so the pin opens on a lit map (the scene's top edge fades, route.css).
        gsap.fromTo(
          drawing,
          { opacity: START.opacity },
          {
            opacity: 1,
            ease: "power1.out",
            scrollTrigger: {
              trigger: scene,
              start: `top ${ENTRY_LIT.from * 100}%`,
              end: `top ${ENTRY_LIT.to * 100}%`,
              scrub: 0.5,
            },
          },
        );
        tl.fromTo(apmShapes, { opacity: OFF_FOCUS_OPACITY }, { opacity: 1, duration: CAMERA_END }, 0);
        // A name the settle carries across the heading (APM's, under its second line) waits
        // unseen until the camera has carried it clear; the others stay as they are.
        names.forEach(({ text }, index) => {
          tl.fromTo(
            text,
            { opacity: 0 },
            { opacity: 1, duration: CAMERA_END, ease: (t: number) => framing().names[index]?.(t) ?? 1 },
            0,
          );
        });
        // The lamp is a 16px object, not part of the drawing: its scale is exactly 1 / the camera's.
        tl.fromTo(
          dot,
          { scale: 1 / START.scale },
          { scale: () => 1 / framing().scale, duration: CAMERA_END, ease: (t: number) => framing().lampSettle(t) },
          0,
        );
        // It switches on at the junction as the round starts, at full mint.
        tl.fromTo(dot, { autoAlpha: 0 }, { autoAlpha: 1, duration: CAMERA_END - LAMP_ON, ease: "power2.out" }, LAMP_ON);
        // Through the 청평화 hold: a slow push in about its door, where the ledger just moved.
        const pushFor = PUSH.to - PUSH.from;
        tl.fromTo(
          camera,
          {
            x: () => framing().x,
            y: () => framing().y,
            scale: () => framing().scale,
            "--map-scale": () => framing().scale,
          },
          {
            x: () => framing().push.x,
            y: () => framing().push.y,
            scale: () => framing().push.scale,
            "--map-scale": () => framing().push.scale,
            duration: pushFor,
            ease: "power1.inOut",
            immediateRender: false,
          },
          PUSH.from,
        );
        tl.fromTo(
          dot,
          { scale: () => 1 / framing().scale },
          {
            scale: () => 1 / framing().push.scale,
            duration: pushFor,
            ease: (t: number) => framing().lampPush(t),
            immediateRender: false,
          },
          PUSH.from,
        );
        // Hold to 1: the legs and the dwell at 청평화 sit inside this length.
        tl.set({}, {}, 1);

        follow(true);

        // Deep links and nav jumps land on the settled framing (the round about to start),
        // not on the S2 match-cut frame: #route's scroll margin reaches into the pin.
        section.style.scrollMarginTop = `${-Math.round(CAMERA_END * PIN_LENGTH * 1000) / 10}vh`;

        // A keyboard page that would step over a whole stop rests on that stop's frame instead,
        // through the page's own smooth scroll; every other page stays the browser's.
        const onPageKey = (event: KeyboardEvent) => {
          const direction = pageKey(event);
          const trigger = tl.scrollTrigger;
          const { lenis, scrollTo } = scroller.current;
          if (direction === 0 || !trigger || !live() || lenis?.isStopped) return;
          const length = trigger.end - trigger.start;
          if (!(length > 0)) return;
          const from = lenis?.targetScroll ?? window.scrollY;
          const to = from + direction * PAGE_REACH * window.innerHeight;
          const rest = pageRest((from - trigger.start) / length, (to - trigger.start) / length);
          if (rest === null) return;
          event.preventDefault();
          scrollTo(Math.round(trigger.start + rest * length));
        };
        window.addEventListener("keydown", onPageKey);

        // DrawSVG and MotionPath load once the section is within a viewport (spec 13);
        // until then the round stays undrawn (route.css) and the lamp waits at the junction.
        const near = new IntersectionObserver(
          (entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            near.disconnect();
            void Promise.all([loadDrawSVG(), loadMotionPath()]).then(
              () => {
                if (!alive) return;
                context.add(() => {
                  for (const leg of routeLegs(apmFraction)) {
                    tl.fromTo(
                      maskPath,
                      { drawSVG: `0% ${percent(leg.from)}` },
                      { drawSVG: `0% ${percent(leg.to)}`, duration: leg.duration, immediateRender: false },
                      leg.at,
                    );
                    tl.to(
                      dot,
                      {
                        motionPath: { path: routePath, align: routePath, alignOrigin: [0.5, 0.5], start: leg.from, end: leg.to },
                        duration: leg.duration,
                        immediateRender: false,
                      },
                      leg.at,
                    );
                  }
                  tl.render(tl.totalTime(), true, true);
                });
              },
              () => {
                // The plugin chunks failed to load: show the round as recorded (drawn, lamp at 청평화).
                if (alive) scope.dataset.routeStatic = "";
              },
            );
          },
          { rootMargin: "100% 0px" },
        );
        near.observe(section);
        // No refresh here: a new pin queues ScrollTrigger's own full refresh, and a media
        // change into this branch refreshes everything after it runs. A forced refresh
        // would only re-measure every pin again, mid-scroll if a lazy island mounts.

        return () => {
          alive = false;
          window.removeEventListener("keydown", onPageKey);
          near.disconnect();
          unreveal();
          restoreStatic(scope);
          section.style.removeProperty("scroll-margin-top");
          delete scope.dataset.routeMode;
          delete scope.dataset.routeStatic;
          requestScrollRefresh();
        };
      });

      mm.add(MQ.mobileMotion, () => {
        restoreStatic(scope);
        const unreveal = revealHeading(scope, section);
        blockBeats(scope, section, reportStage, false);
        return unreveal;
      });

      mm.add(MQ.reduced, () => {
        restoreStatic(scope);
        blockBeats(scope, section, reportStage, true);
      });

      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <div ref={root} className="route-root">
      {children}
    </div>
  );
}
