"use client";

import { useEffect, useRef, type RefObject } from "react";

import { useSmoothScroll } from "@/components/motion/SmoothScroll";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";
import { MQ, PIN_PRIORITY, requestScrollRefresh } from "@/lib/gsap-plugins";
import { gsapEase } from "@/lib/motion";

import { useFilmController } from "./FilmPlayer";
import { REVEAL, coverScale, revealFrame, type RevealGeometry } from "./reveal";

/**
 * S9 film motion (spec S9, 3.2, 6.3, 6.5). GSAP leaf around the
 * server-rendered stage; it never animates anything React renders, only the
 * frame's transform and clip-path and a few CSS variables on the scene.
 *
 * desktopMotion: two triggers.
 *   - The pin: the scene, +=80%, refreshPriority 10, in our own spacer
 *     ([data-film-pin-spacer]) so refreshes never move a focused control.
 *   - The reveal: scrub 0.6 from the spacer's top at 55% of the viewport over
 *     0.55 + 0.8 viewports. The dot blooms while the scene scrolls in, the
 *     loop already plays when the pin engages (about 41%), and the pin is
 *     spent on the full-bleed loop and the card (reveal.ts holds the frames
 *     as a pure function of progress).
 *   Pressing play, or tabbing to a control, before the card has settled
 *   scrolls to its settled point first; a jump to #film lands there too (the
 *   section's scroll-margin-top).
 * mobileMotion: no pin. When the frame's centre reaches 90% of the viewport,
 *   the dot opens over 900ms on the snap curve, onto the green frame (the
 *   loop's first frame). Until then the core is a faint green slot around the
 *   dot (film.css). Scrolling back above that point closes it again, so
 *   re-entry replays, but never once the reader has asked for the film: then
 *   the frame stays open and the film pauses only below 25% visibility.
 * reduced: no mask and no autoplay: the loop's first frame with the play
 *   mark and button. The details text shows as a static note (film.css).
 *
 * The section's story beat is its default (b0941) and the chrome is hidden
 * here (SECTION_CHROME), so nothing is reported. While green sits under the
 * floating nav, the scene carries data-film-under-nav (for the chrome).
 */

/** Layout offset of `el` inside `ancestor` (offsets ignore transforms, so the scaled frame never leaks in). */
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
  if (!element) throw new Error(`FilmMotion: missing ${selector}`);
  return element;
}

/**
 * A deep link to #film on load (spec 6.3). The browser jumps to the section
 * before any pin exists (film.css already holds the scene where the pin will
 * hold it). Building the pins above then moves the film about 4000px down and
 * GSAP restores scroll positions it recorded on the way, so the first frame
 * after hydration showed the night sections, the sections' activity triggers
 * (created right after, in passive effects) reported a night section, and the
 * record chrome slid in over the card (CLS 1.0) until gsap-plugins re-scrolled
 * after the next refresh. FilmMotion's pin is the last the page builds, so it
 * lands the link again right there, and once more in the next frame for
 * anything that moves the page later in the same task. In the first seconds
 * after load only, and never after the reader has scrolled, typed or touched.
 */
const DEEP_LINK_WINDOW_MS = 6000;
const READER_INPUT = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
let deepLink: "pending" | "done" = "pending";

if (typeof window !== "undefined") {
  const finish = () => {
    deepLink = "done";
    for (const type of READER_INPUT) window.removeEventListener(type, finish);
  };
  for (const type of READER_INPUT) window.addEventListener(type, finish, { passive: true });
}

/** The page was opened on a link to this section and nothing has moved the reader since. */
function deepLinkTo(section: HTMLElement): boolean {
  return (
    deepLink === "pending" &&
    performance.now() < DEEP_LINK_WINDOW_MS &&
    section.id !== "" &&
    decodeURIComponent(window.location.hash.slice(1)) === section.id
  );
}

/** Radius of the dot on screen (spec 4.6). */
const DOT_RADIUS = 8;
/** Mobile reveal (spec S9 mobile: a 900ms timeline on entry). */
const MOBILE_OPEN = 0.9;
/** Where the frame's centre is in the viewport when the mobile open starts. */
const MOBILE_OPEN_AT = 0.9;
/** Viewports of scroll before the pin over which the dot already blooms. */
const REVEAL_LEAD = 0.55;
/** The pin's length in viewports (spec 3.2: 80vh). */
const PIN_LENGTH = 0.8;
/** The floating nav pill's band; --nav-clear includes a little air below it. */
function navBand() {
  const root = getComputedStyle(document.documentElement);
  const top = Number.parseFloat(root.getPropertyValue("--nav-top"));
  const bottom = Number.parseFloat(root.getPropertyValue("--nav-clear"));
  return {
    top: Number.isFinite(top) && top >= 0 ? top : 16,
    bottom: Number.isFinite(bottom) && bottom > 0 ? bottom : 88,
  };
}

export function FilmMotion({ rootRef }: { rootRef: RefObject<HTMLDivElement | null> }) {
  const controller = useFilmController();
  const { scrollTo } = useSmoothScroll();
  const scrollToRef = useRef(scrollTo);

  useEffect(() => {
    scrollToRef.current = scrollTo;
  });

  // Opening the details changes the page height below the pin.
  useEffect(() => {
    const details = rootRef.current?.querySelector<HTMLDetailsElement>("[data-film-details]");
    if (!details) return;
    const summary = details.querySelector<HTMLElement>(".film-details-summary");
    // Keyboard focus only, and only as far as needed: a mouse press focuses the summary too, and
    // moving it under the pointer between mousedown and mouseup would swallow the click.
    const scrollSummary = () => {
      if (!summary?.matches(":focus-visible")) return;
      const box = summary.getBoundingClientRect();
      const top = window.scrollY + box.top - Math.max(0, (window.innerHeight - box.height) / 2);
      scrollToRef.current(top, { immediate: true });
    };
    details.addEventListener("toggle", requestScrollRefresh);
    summary?.addEventListener("focus", scrollSummary);
    return () => {
      details.removeEventListener("toggle", requestScrollRefresh);
      summary?.removeEventListener("focus", scrollSummary);
    };
  }, [rootRef]);

  useGSAP(
    () => {
      const scope = rootRef.current;
      if (!scope) return;
      const spacer = required<HTMLElement>(scope, "[data-film-pin-spacer]");
      const scene = required<HTMLElement>(spacer, "[data-film-scene]");
      const core = required<HTMLElement>(scene, "[data-film-core]");
      const media = required<HTMLElement>(scene, "[data-film-media]");
      const section = scope.closest<HTMLElement>("section");
      const mm = gsap.matchMedia();

      mm.add(MQ.desktopMotion, () => {
        scope.dataset.filmMotion = "desktop";
        controller.setAutoplay(true);

        const measure = () => {
          const width = core.offsetWidth;
          const height = core.offsetHeight;
          const { x, y } = offsetWithin(core, scene);
          const geo: RevealGeometry = {
            width,
            height,
            scale: coverScale({ x, y, width, height }, { width: scene.clientWidth, height: scene.clientHeight }),
          };
          // The frame's centre below the scene's top (for the green-under-the-nav check).
          return { ...geo, cy: y + height / 2 };
        };

        let geometry = measure();
        const proxy = { p: 0 };
        // refreshAll() runs between "refreshInit" and "refresh" (the same window as ScrollTrigger.isRefreshing).
        let refreshing = false;
        // Green under the floating nav: from the reveal's geometry before the card lands, from the card's box after.
        let greenUnderNav = false;
        let cardUnderNav = false;
        const syncNight = () => scene.toggleAttribute("data-film-under-nav", proxy.p < REVEAL.settle ? greenUnderNav : cardUnderNav);

        // The pin, created first so the reveal (same priority) refreshes after it.
        const pin = ScrollTrigger.create({
          trigger: scene,
          start: "top top",
          end: `+=${PIN_LENGTH * 100}%`,
          pin: true,
          // Our own spacer, already the scene's parent: refreshes never move the scene in the DOM.
          pinSpacer: spacer,
          // The spacer is a flex column (film.css), where GSAP would default to no spacing at all.
          pinSpacing: true,
          invalidateOnRefresh: true,
          refreshPriority: PIN_PRIORITY.film,
        });

        const apply = () => {
          const frame = revealFrame(proxy.p, geometry);
          if (proxy.p > 0 && proxy.p < REVEAL.settle) {
            const band = navBand();
            // The scene's top on screen, from scroll positions (no layout read): below the pin, pinned, above it.
            const scroll = pin.scroll();
            const top = scroll < pin.start ? pin.start - scroll : scroll > pin.end ? pin.end - scroll : 0;
            const centre = top + geometry.cy;
            greenUnderNav = Math.max(top, centre - frame.reach) < band.bottom && centre + frame.reach > band.top;
          } else {
            greenUnderNav = false;
          }
          media.style.clipPath = frame.clipPath;
          media.style.transform = `scale(${frame.scale})`;
          scene.style.setProperty("--film-ring", String(frame.ring));
          scene.style.setProperty("--film-land", String(frame.land));
          // Text never rests at a partial opacity for a scroll position (WCAG 1.4.3 in every scrolled
          // state): the heading and the controls leave as the circle sets out towards them and the
          // ticks wait for the card, each a short timed fade in film.css, and all of it comes back
          // once the card has landed.
          scene.toggleAttribute("data-film-chrome-away", frame.chrome < 1);
          scene.toggleAttribute("data-film-ticks-away", frame.land < 1);
          // The ticks (and their stills) stay under the frame while it covers the scene.
          scene.toggleAttribute("data-film-covered", proxy.p > 0 && proxy.p < REVEAL.settle);
          syncNight();
          // A refresh (any lazy island anywhere) reverts the tween to 0 for a moment: never let
          // that close the reveal, it would pause a running film. "refresh" below resyncs it.
          if (!refreshing) controller.reveal(proxy.p >= REVEAL.loopAt);
        };
        const onRefreshInit = () => {
          refreshing = true;
        };
        const resync = () => {
          refreshing = false;
          controller.reveal(proxy.p >= REVEAL.loopAt);
        };
        ScrollTrigger.addEventListener("refreshInit", onRefreshInit);
        ScrollTrigger.addEventListener("refresh", resync);

        /** Where the card has landed: the settled point plus a little hold. */
        const landing = (trigger: ScrollTrigger) => trigger.start + (trigger.end - trigger.start) * (REVEAL.settle + 0.04);

        // fromTo: invalidateOnRefresh re-records start values, and a resize mid-scrub must still map 0..1.
        const tween = gsap.fromTo(
          proxy,
          { p: 0 },
          {
            p: 1,
            ease: "none",
            onUpdate: apply,
            scrollTrigger: {
              trigger: spacer,
              start: `top ${REVEAL_LEAD * 100}%`,
              end: () => `+=${(REVEAL_LEAD + PIN_LENGTH) * window.innerHeight}`,
              scrub: 0.6,
              invalidateOnRefresh: true,
              refreshPriority: PIN_PRIORITY.film,
              onRefresh: (self) => {
                geometry = measure();
                apply();
                // A jump to #film (hash, hero CTA, footer) lands on the settled card, not on the bare dot.
                if (section) section.style.scrollMarginTop = `${Math.round(self.start + REVEAL_LEAD * window.innerHeight - landing(self))}px`;
              },
              onToggle: ({ isActive }) => {
                media.style.willChange = isActive ? "transform, clip-path" : "";
              },
            },
          },
        );
        apply();

        // After the card has landed: is it under the nav (the reader scrolls on past the pin)?
        ScrollTrigger.create({
          trigger: core,
          pinnedContainer: scene,
          start: () => `top ${navBand().bottom}px`,
          end: () => `bottom ${navBand().top}px`,
          invalidateOnRefresh: true,
          refreshPriority: PIN_PRIORITY.film,
          onToggle: ({ isActive }) => {
            cardUnderNav = isActive;
            syncNight();
          },
        });

        // A deep link to #film lands on the settled card before anything is painted or reported (see
        // deepLinkTo): where a fragment jump puts the section (its scroll-margin-top), with the pins and
        // toggles updated to it and the scrub finished, so the first frame is the card at rest, where
        // the pre-JS jump already showed it. Done for good in the frame, not here: a setup reverted
        // before it (React's dev double effects, a breakpoint flip) leaves the link to the next one.
        const landDeepLink = (target: HTMLElement) => {
          const margin = Number.parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
          const y = target.getBoundingClientRect().top + window.scrollY - margin;
          window.scrollTo({ top: Math.round(Math.min(Math.max(0, y), ScrollTrigger.maxScroll(window))), behavior: "instant" });
          ScrollTrigger.update();
          tween.scrollTrigger?.getTween()?.progress(1);
        };
        let landFrame = 0;
        if (section && deepLinkTo(section)) {
          landDeepLink(section);
          landFrame = requestAnimationFrame(() => {
            landFrame = 0;
            if (!deepLinkTo(section)) return;
            deepLink = "done";
            landDeepLink(section);
          });
        }

        /** Bring the card to rest (Lenis), unless it already has. */
        const settleCard = () => {
          const trigger = tween.scrollTrigger;
          if (!trigger || trigger.progress >= REVEAL.settle) return;
          scrollToRef.current(Math.ceil(landing(trigger)));
        };
        // Play pressed before the card has landed.
        controller.setSettler(settleCard);
        // Keyboard focus on a control mid-reveal would sit under the frame (WCAG 2.4.11): land the card first.
        const onFocusIn = (event: FocusEvent) => {
          const target = event.target;
          if (!(target instanceof HTMLElement) || !target.matches(":focus-visible")) return;
          if (target.closest("[data-film-controls], [data-film-chapters], [data-film-loop-toggle]")) settleCard();
        };
        scene.addEventListener("focusin", onFocusIn);

        return () => {
          cancelAnimationFrame(landFrame);
          ScrollTrigger.removeEventListener("refreshInit", onRefreshInit);
          ScrollTrigger.removeEventListener("refresh", resync);
          scene.removeEventListener("focusin", onFocusIn);
          controller.setSettler(null);
          media.style.clipPath = "";
          media.style.transform = "";
          media.style.willChange = "";
          scene.style.removeProperty("--film-ring");
          scene.style.removeProperty("--film-land");
          scene.removeAttribute("data-film-chrome-away");
          scene.removeAttribute("data-film-ticks-away");
          scene.removeAttribute("data-film-covered");
          scene.removeAttribute("data-film-under-nav");
          section?.style.removeProperty("scroll-margin-top");
          delete scope.dataset.filmMotion;
          // Back to the composed state; the next branch decides about autoplay.
          controller.setAutoplay(false);
          controller.reveal(true);
        };
      });

      mm.add(MQ.mobileMotion, () => {
        scope.dataset.filmMotion = "mobile";
        controller.setAutoplay(true);

        const proxy = { r: DOT_RADIUS };
        const draw = () => {
          media.style.clipPath = `circle(${proxy.r.toFixed(2)}px at 50% 50%)`;
        };
        let opening: gsap.core.Timeline | null = null;

        const close = () => {
          opening?.kill();
          opening = null;
          proxy.r = DOT_RADIUS;
          draw();
          controller.reveal(false);
        };

        const open = () => {
          if (opening) return;
          const cover = Math.ceil(Math.hypot(core.offsetWidth, core.offsetHeight) / 2) + 1;
          opening = gsap
            .timeline()
            .to(proxy, { r: cover, duration: MOBILE_OPEN, ease: gsapEase.snap, onUpdate: draw })
            .call(() => controller.reveal(true), undefined, MOBILE_OPEN * REVEAL.loopAt)
            .call(() => {
              media.style.clipPath = "";
            });
        };

        close();
        // As soon as the frame's centre (the dot) is clear of the bottom edge and any toolbar there,
        // so the reader sees it open and the frame never waits long as a closed slot (film.css tints it).
        // Back above that point the dot closes again, unless the reader has asked for the film: a
        // requested film (playing or paused) keeps its open frame, and the media manager pauses it
        // only once less than a quarter of the frame is on screen (spec S9).
        ScrollTrigger.create({
          trigger: core,
          start: `center ${MOBILE_OPEN_AT * 100}%`,
          end: "max",
          onEnter: open,
          onLeaveBack: () => {
            if (!controller.requested()) close();
          },
        });

        return () => {
          opening?.kill();
          media.style.clipPath = "";
          delete scope.dataset.filmMotion;
          controller.setAutoplay(false);
          controller.reveal(true);
        };
      });

      mm.add(MQ.reduced, () => {
        controller.setAutoplay(false);
      });

      requestScrollRefresh();
    },
    { scope: rootRef, dependencies: [controller] },
  );

  return null;
}
