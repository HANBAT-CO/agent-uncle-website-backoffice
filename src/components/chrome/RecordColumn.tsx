"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

import { AppIcon } from "@/components/icons/AppIcon";
import { fill, plate } from "@/content/copy";
import { useMediaQuery, usePrefersReducedMotion } from "@/hooks/use-media-query";
import { gsap, ScrollTrigger } from "@/lib/gsap";
import { MQ } from "@/lib/gsap-plugins";
import { duration, gsapEase } from "@/lib/motion";
import { chromeFor, railEntries } from "@/lib/story/derive";
import { useStorySelector } from "@/lib/story/use-story";

import {
  dropExited,
  DRAFT_KEY,
  entryJump,
  entryMovesLedger,
  reconcilePresence,
  recordCount,
  toChromeEntries,
  type ChromeEntry,
  type Presence,
} from "./chrome-model";
import { useScrollToEntry } from "./hooks";
import { RailEntryView } from "./RailEntryView";
import { RecordPlate } from "./RecordPlate";

/**
 * The record column (spec 5.2, 5.3, 3.4), fixed right from 1024px.
 *
 * - min 1280px: the rail (an ordered list of record entries, newest at the
 *   bottom, older ones clipped under a 48px top fade on paper ground; on the
 *   night and dawn grounds a cut card fades out whole, markClipped) with the
 *   record plate at
 *   its foot. Modes from chromeFor(): open; spine (a 56px strip, one dot per
 *   entry; a click, keyboard focus or a 150ms rest on the dots peeks the rail,
 *   which stays 2.4s after the pointer leaves); hidden; pill (업무 기록 n, 업무
 *   기록 only: messages are not counted; opens the sheet). Mode changes are 700ms translateX transitions in
 *   chrome.css, never width or layout.
 * - 1024-1279px: no rail; the compact plate bottom-right.
 *
 * Entry motion (GSAP, only inside this tree): new entries rise from y+16 over
 * 700ms and fade in over 160ms, both on the snap curve, their text showing
 * once the paper is all but opaque (fadeIn: never a frame below AA);
 * removed entries fade out over 240ms;
 * the others shift by FLIP (positions measured before and after each commit).
 * Records that move the ledger get a 1px --accent-live outline that fades over
 * 1.2s. The draft becomes the success card in place. Reduced motion: none of
 * it, entries swap at once.
 *
 * Hero hand-off (WP-10): while the hero's record proxies are flying in
 * (desktop motion, min 1280px, the hero holds [data-rail-proxy] elements and
 * no data-proxy-done), the rail's own r2005 and r2031 entries are hidden but
 * keep their slots ([data-rail-slot]) so the proxies can measure them. Only
 * while the hero is the active section, so a stale hero attribute can never
 * empty the top of the rail further down.
 *
 * Cards jump to where their record happened (entryJump): the section start,
 * or its end when the section opens on an earlier beat than the record.
 *
 * Test hooks: [data-record-column][data-rail-mode][data-plate-mode],
 * live entries [data-rail-entry=<key>], exiting ones [data-rail-exiting].
 */

const PEEK_MS = 2400;
/** A mouse must rest this long on the spine's dots before the rail peeks. */
const PEEK_INTENT_MS = 150;
const FLASH_S = 1.2;
/** Seconds new entries wait while older ones shift up, and between new entries. */
const ENTER_AFTER_SHIFT_S = 0.14;
const ENTER_STAGGER_S = 0.08;
/** New entries fade in over this (their rise takes duration.record). */
const ENTER_FADE_S = duration.fast;
/**
 * Entry opacity from which its text shows: the 13px #636363 meta line on a
 * card over the page's own paper keeps 4.5:1 from about 0.92 (night ground
 * 0.81); bubbles from about 0.63.
 */
const INK_AT = 0.95;

/**
 * Fade an entry in with its text held back ([data-entry-veiled] clears its
 * [data-entry-ink] parts, chrome.css) until the entry is all but opaque, so
 * no frame shows a record or a bubble at half contrast: the paper fades, the
 * text lands on it. Whatever ends the tween (done, killed, overwritten)
 * unveils the text; chrome.css has a 1.2s failsafe too.
 */
function fadeIn(li: HTMLElement, { duration: seconds, delay = 0, fromZero = true }: { duration: number; delay?: number; fromZero?: boolean }) {
  li.setAttribute("data-entry-veiled", "");
  const unveil = () => li.removeAttribute("data-entry-veiled");
  const vars: gsap.TweenVars = {
    opacity: 1,
    duration: seconds,
    delay,
    ease: gsapEase.snap,
    overwrite: "auto",
    onUpdate: () => {
      if (Number(gsap.getProperty(li, "opacity")) >= INK_AT) unveil();
    },
    onComplete: unveil,
    onInterrupt: unveil,
  };
  return fromZero ? gsap.fromTo(li, { opacity: 0 }, vars) : gsap.to(li, vars);
}

type Shown = Presence<ChromeEntry>;

function pinToBottom(list: HTMLElement) {
  if (list.matches(":focus-within")) return;
  list.scrollTop = list.scrollHeight - list.clientHeight;
}

/**
 * Flag the entries the list's top edge cuts ([data-rail-clipped], laid-out
 * positions, transforms ignored). On paper ground they fade under the 48px top
 * mask; on the dark grounds ([data-rail-ground="dark"]) a paper card half
 * faded into the ground reads as a smudge, so chrome.css fades the whole card
 * out instead (and back in once it fits).
 */
function markClipped(list: HTMLElement) {
  const top = list.scrollTop;
  for (const li of list.querySelectorAll<HTMLElement>(":scope > li[data-key]")) {
    li.toggleAttribute("data-rail-clipped", li.offsetTop < top - 0.5);
  }
}

function slotOf(entry: ChromeEntry): string | undefined {
  return entry.kind === "story" ? entry.key : undefined;
}

/**
 * True while `id`'s top is at or above `fraction` of the viewport height and
 * `untilId`'s bottom (by default `id`'s own) is still below the viewport's top.
 */
function watchThreshold(id: string, fraction: number, setState: (visible: boolean) => void, untilId = id) {
  const target = document.getElementById(id);
  const until = document.getElementById(untilId);
  if (!target || !until) return () => undefined;
  let frame = 0;
  const update = () => {
    frame = 0;
    setState(target.getBoundingClientRect().top <= window.innerHeight * fraction && until.getBoundingClientRect().bottom > 0);
  };
  const requestUpdate = () => {
    if (frame === 0) frame = requestAnimationFrame(update);
  };
  update();
  const observer = new IntersectionObserver(requestUpdate, { rootMargin: "0px 0px -25% 0px" });
  observer.observe(target);
  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);
  ScrollTrigger.addEventListener("refresh", requestUpdate);
  return () => {
    if (frame !== 0) cancelAnimationFrame(frame);
    observer.disconnect();
    window.removeEventListener("scroll", requestUpdate);
    window.removeEventListener("resize", requestUpdate);
    ScrollTrigger.removeEventListener("refresh", requestUpdate);
  };
}

export function RecordColumn({ onOpenSheet }: { onOpenSheet: (opener: HTMLElement) => void }) {
  const chrome = useStorySelector(chromeFor);
  const active = useStorySelector((s) => s.active);
  const entries = useStorySelector(railEntries);
  const draft = useStorySelector((s) => s.draft);
  const reduced = usePrefersReducedMotion();
  const lgUp = useMediaQuery("(min-width: 1024px)", false);
  const xlUp = useMediaQuery("(min-width: 1280px)", false);
  const scrollToEntry = useScrollToEntry();
  const railId = useId();
  const [footerPill, setFooterPill] = useState(false);
  const [signupRailReady, setSignupRailReady] = useState(false);

  const showDraft = active === "signup";
  const items = useMemo(() => toChromeEntries(entries, draft, showDraft), [entries, draft, showDraft]);

  // What is on screen: the live entries plus removed ones finishing their fade.
  const [shown, setShown] = useState<Shown[]>(() => reconcilePresence([], items, false));
  const [lastItems, setLastItems] = useState(items);
  if (items !== lastItems) {
    setLastItems(items);
    setShown((current) => reconcilePresence(current, items, !reduced));
  }

  // Spine peek: hover or focus slides the rail in; it stays 2.4s after leaving.
  const [peek, setPeek] = useState(false);
  const [lastRailMode, setLastRailMode] = useState(chrome.rail);
  if (chrome.rail !== lastRailMode) {
    setLastRailMode(chrome.rail);
    setPeek(false);
  }
  const peekTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const intentTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const startPeek = () => {
    clearTimeout(peekTimer.current);
    clearTimeout(intentTimer.current);
    if (chrome.rail === "spine") setPeek(true);
  };
  const endPeekSoon = () => {
    clearTimeout(peekTimer.current);
    clearTimeout(intentTimer.current);
    peekTimer.current = setTimeout(() => setPeek(false), PEEK_MS);
  };
  // Hover peeks only from the dot cluster and only after a short rest there:
  // brushing the right margin on the way to the scrollbar must not slide the
  // rail over the section. Click and keyboard focus peek at once.
  const peekOnRest = () => {
    clearTimeout(intentTimer.current);
    intentTimer.current = setTimeout(startPeek, PEEK_INTENT_MS);
  };
  const cancelRest = () => clearTimeout(intentTimer.current);
  useEffect(
    () => () => {
      clearTimeout(peekTimer.current);
      clearTimeout(intentTimer.current);
    },
    [],
  );

  const column = useRef<HTMLElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const positions = useRef(new Map<string, number>());
  const exits = useRef(new Map<string, gsap.core.Tween>());
  const measured = useRef(false);

  /** A leaving entry's fade ended (or was cut short): drop it from what is shown. */
  const finishExit = (key: string, tween: gsap.core.Tween) => {
    if (exits.current.get(key) === tween) exits.current.delete(key);
    setShown((current) => dropExited(current, key));
  };

  // FLIP, enter and exit, after every change of what is shown.
  useLayoutEffect(() => {
    const node = list.current;
    if (!node) return;
    const animate = measured.current && !window.matchMedia(MQ.reduced).matches;
    const known = positions.current;

    // Draft -> success card in place: the leaving draft floats over the new card's slot.
    let swap: { draft: HTMLElement; card: HTMLElement } | null = null;
    if (animate) {
      const leavingDraft = node.querySelector<HTMLElement>(`:scope > li[data-key="${DRAFT_KEY}"][data-rail-exiting]`);
      const success = [...node.querySelectorAll<HTMLElement>(':scope > li[data-kind="signup"][data-rail-entry]')].find(
        (li) => !known.has(li.dataset.key ?? ""),
      );
      if (leavingDraft && success && leavingDraft.dataset.swapped === undefined) {
        leavingDraft.dataset.swapped = "";
        const inset = getComputedStyle(node).paddingLeft;
        Object.assign(leavingDraft.style, { position: "absolute", left: inset, right: inset });
        swap = { draft: leavingDraft, card: success };
      }
    }

    pinToBottom(node);
    markClipped(node);
    if (swap) swap.draft.style.top = `${swap.card.offsetTop + swap.card.offsetHeight - swap.draft.offsetHeight}px`;

    // New entries wait for the shift to clear their slot, then rise one after another.
    const shifting = known.size > 0 && [...node.querySelectorAll<HTMLElement>(":scope > li[data-rail-entry]")].some((li) => known.has(li.dataset.key ?? ""));
    let entering = 0;
    const seen = new Set<string>();
    for (const li of node.querySelectorAll<HTMLElement>(":scope > li[data-key]")) {
      const key = li.dataset.key ?? "";
      seen.add(key);
      const top = li.offsetTop - node.scrollTop;
      const before = known.get(key);

      if (li.hasAttribute("data-rail-exiting")) {
        if (!exits.current.has(key)) {
          // Nothing else may touch a leaving entry: a delayed enter tween would
          // otherwise overwrite this fade and the entry would never leave.
          gsap.killTweensOf([li, ...li.querySelectorAll("[data-flash]")]);
          const swapped = swap?.draft === li;
          const exit: gsap.core.Tween = gsap.to(li, {
            opacity: 0,
            duration: swapped ? duration.record : duration.base,
            ease: gsapEase.snap,
            overwrite: false,
            // Finished or cut short, the entry leaves (dropExited ignores it if it came back).
            onComplete: () => finishExit(key, exit),
            onInterrupt: () => finishExit(key, exit),
          });
          exits.current.set(key, exit);
        }
        continue;
      }

      const exit = exits.current.get(key);
      if (exit) {
        // Came back while fading out (fast reverse then forward): fade back in.
        exits.current.delete(key);
        exit.kill();
        if (li.dataset.swapped !== undefined) {
          delete li.dataset.swapped;
          for (const property of ["position", "left", "right", "top"]) li.style.removeProperty(property);
        }
        fadeIn(li, { duration: duration.base, fromZero: false });
      }

      if (animate && before === undefined) {
        const delay = (shifting ? ENTER_AFTER_SHIFT_S : 0) + entering * ENTER_STAGGER_S;
        entering += 1;
        if (swap?.card === li) {
          fadeIn(li, { duration: duration.record });
        } else {
          // The rise keeps the 700ms record curve; the fade is short, and the
          // text waits for it (fadeIn), so no frame shows the meta line at half
          // contrast (axe sampled it at 2.5:1 right after a scroll).
          gsap.fromTo(li, { y: 16 }, { y: 0, duration: duration.record, delay, ease: gsapEase.snap, overwrite: "auto" });
          fadeIn(li, { duration: ENTER_FADE_S, delay });
        }
        const flash = li.querySelector<HTMLElement>("[data-flash]");
        if (flash) gsap.fromTo(flash, { opacity: 1 }, { opacity: 0, duration: FLASH_S, delay, ease: gsapEase.snap });
      } else if (animate && before !== undefined) {
        const offset = Number(gsap.getProperty(li, "y")) || 0;
        const delta = before + offset - top;
        if (Math.abs(delta) > 0.5) {
          gsap.fromTo(li, { y: delta }, { y: 0, duration: duration.record, ease: gsapEase.snap, overwrite: "auto" });
        }
      } else if (!animate) {
        gsap.set(li, { clearProps: "transform,opacity" });
        li.removeAttribute("data-entry-veiled");
      }
      known.set(key, top);
    }

    for (const key of [...known.keys()]) if (!seen.has(key)) known.delete(key);
    measured.current = true;
  }, [shown]);

  // Keep the newest entry at the bottom when the rail resizes; re-measure without animating.
  useEffect(() => {
    const node = list.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      pinToBottom(node);
      markClipped(node);
      for (const li of node.querySelectorAll<HTMLElement>(":scope > li[data-rail-entry]")) {
        positions.current.set(li.dataset.key ?? "", li.offsetTop - node.scrollTop);
      }
    });
    observer.observe(node);
    const onFocusOut = (event: FocusEvent) => {
      if (!node.contains(event.relatedTarget as Node | null)) pinToBottom(node);
    };
    // Keyboard focus can scroll the list (pinToBottom waits while focus is inside): re-flag what the edge cuts.
    const onScroll = () => markClipped(node);
    node.addEventListener("focusout", onFocusOut);
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      node.removeEventListener("focusout", onFocusOut);
      node.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Kill every running entry tween on unmount.
  useEffect(() => {
    const running = exits.current;
    const node = list.current;
    return () => {
      for (const tween of running.values()) tween.kill();
      running.clear();
      if (node) gsap.killTweensOf(node.querySelectorAll("li, [data-flash]"));
    };
  }, []);

  // Hero hand-off: hide r2005 and r2031 while the hero's proxies stand in for them.
  // Only while the hero is the active section: its proxies have always landed by
  // the time words takes over, so a hero attribute left stale by a refresh or a
  // breakpoint revert far below can never empty the top of the rail.
  const heroActive = active === "hero";
  useEffect(() => {
    const node = column.current;
    if (!node) return;
    const hero = heroActive ? document.querySelector<HTMLElement>('[data-section="hero"]') : null;
    if (!hero) {
      node.removeAttribute("data-hero-handoff");
      return;
    }
    const desktop = window.matchMedia(MQ.desktopMotion);
    const wide = window.matchMedia("(min-width: 1280px)");
    const update = () => {
      const pending =
        desktop.matches && wide.matches && hero.querySelector("[data-rail-proxy]") !== null && !hero.hasAttribute("data-proxy-done");
      node.toggleAttribute("data-hero-handoff", pending);
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(hero, { attributes: true, attributeFilter: ["data-proxy-done"], childList: true, subtree: true });
    desktop.addEventListener("change", update);
    wide.addEventListener("change", update);
    ScrollTrigger.addEventListener("refresh", update);
    return () => {
      observer.disconnect();
      desktop.removeEventListener("change", update);
      wide.removeEventListener("change", update);
      ScrollTrigger.removeEventListener("refresh", update);
    };
  }, [heroActive]);

  // The column folds for the footer as soon as the wordmark's top enters the
  // viewport, and opens again only once it is back below the fold: the plate
  // and the rail's bottom cards sit over the wordmark's right end (춘) from
  // 1024px, so folding on the footer box (its top at 75%) left them over it
  // for the first 100px or so of the wordmark, in both directions. The
  // footer's bottom bounds it, so the column stays folded to the page's end.
  useEffect(() => watchThreshold("footer-title", 1, setFooterPill, "footer"), []);
  useEffect(() => watchThreshold("signup", 0.32, setSignupRailReady), []);

  const liveCount = recordCount(entries);
  const activate = (entry: ChromeEntry) => scrollToEntry(entryJump(entry));
  const signupRailPending = active === "signup" && !signupRailReady;
  const railMode = footerPill ? "pill" : chrome.rail;
  const plateMode = footerPill ? "hidden" : chrome.plate;
  // Dark under the rail's top: the night, and the dawn sky (still green once the phase turns day).
  const railGround = chrome.phase === "night" || active === "dawn" ? "dark" : "light";

  return (
    <aside
      ref={column}
      aria-label={plate.label}
      data-record-column
      data-rail-mode={railMode}
      data-plate-mode={plateMode}
      data-rail-ground={railGround}
      data-signup-rail-pending={signupRailPending ? "" : undefined}
      data-peek={peek ? "" : undefined}
      className="au-scope au-column pointer-events-none fixed right-gutter bottom-6 z-(--z-sticky) hidden w-[280px] flex-col lg:flex xl:top-24 xl:w-(--record-col)"
    >
      <div
        className="au-rail-region relative hidden min-h-0 flex-1 xl:block"
        onPointerEnter={(event) => {
          // Back over the open preview: keep it.
          if (event.pointerType === "mouse" && peek) clearTimeout(peekTimer.current);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== "mouse") return;
          cancelRest();
          if (peek) endPeekSoon();
        }}
        onFocus={(event) => {
          // Keyboard focus peeks; a mouse click's focus is left to the click toggle.
          if (event.target.matches(":focus-visible")) startPeek();
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null) && peek) endPeekSoon();
        }}
      >
        <div id={railId} className="au-rail-panel absolute inset-0 flex flex-col">
          <ol ref={list} className="au-rail-list relative flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
            {shown.map(({ item, exiting }, index) => (
              <li
                key={item.key}
                data-key={item.key}
                data-kind={item.kind === "visitor" ? item.record.kind : item.kind}
                data-rail-entry={exiting ? undefined : item.key}
                data-rail-exiting={exiting ? item.key : undefined}
                data-rail-slot={exiting ? undefined : slotOf(item)}
                aria-hidden={exiting || undefined}
                inert={exiting || undefined}
                className={index === 0 ? "relative mt-auto shrink-0" : "relative shrink-0"}
              >
                <RailEntryView entry={item} onActivate={activate} />
                {entryMovesLedger(item) ? (
                  <span
                    aria-hidden="true"
                    data-flash
                    className="pointer-events-none absolute inset-0 rounded-card opacity-0 outline-1 -outline-offset-1 outline-(--accent-live) outline-solid"
                  />
                ) : null}
              </li>
            ))}
          </ol>
        </div>

        <button
          type="button"
          className="au-spine absolute top-0 right-0 bottom-0 flex w-14 cursor-pointer flex-col items-center justify-end rounded-pill"
          aria-label={fill(plate.pill.open, { count: liveCount })}
          aria-controls={railId}
          aria-expanded={peek}
          onClick={() => {
            if (peek) setPeek(false);
            else startPeek();
          }}
        >
          <span aria-hidden="true" className="au-spine-line absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2" />
          <span
            aria-hidden="true"
            data-spine-dots
            className="relative flex w-full flex-col items-center gap-2.5 pt-6 pb-3"
            onPointerEnter={(event) => event.pointerType === "mouse" && !peek && peekOnRest()}
            onPointerLeave={(event) => event.pointerType === "mouse" && cancelRest()}
          >
            {entries.map((entry) => (
              <span key={entry.record.id} className="au-spine-dot relative size-1.5 shrink-0 rounded-full" />
            ))}
          </span>
        </button>
      </div>

      <div className="au-plate-region relative grid shrink-0 xl:mt-3">
        <div className="au-plate-full col-start-1 row-start-1 hidden self-end xl:block">
          <RecordPlate variant="full" live={xlUp && plateMode === "full"} />
        </div>
        <div className="au-plate-compact col-start-1 row-start-1 self-end justify-self-end">
          <RecordPlate variant="compact" live={lgUp && (xlUp ? plateMode === "compact" : plateMode !== "hidden")} />
        </div>
        <button
          type="button"
          data-rail-pill
          aria-haspopup="dialog"
          onClick={(event) => onOpenSheet(event.currentTarget)}
          className="au-rail-pill au-paper col-start-1 row-start-1 hidden h-12 items-center gap-2 self-end justify-self-end rounded-pill bg-record pr-2 pl-5 text-[15px] leading-none font-bold whitespace-nowrap text-record-fg transition-[scale] duration-(--duration-fast) ease-snap active:scale-[0.98] xl:inline-flex"
        >
          {fill(plate.pill.open, { count: liveCount })}
          <span aria-hidden="true" className="grid size-8 place-items-center rounded-pill bg-green-800 text-mint">
            <AppIcon name="chevron" size={14} />
          </span>
        </button>
      </div>
    </aside>
  );
}
