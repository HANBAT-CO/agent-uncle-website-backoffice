"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import { words } from "@/content/copy";
import { useFinePointer, useLowPower } from "@/lib/device";
import { gsap, ScrollTrigger, SplitText, useGSAP } from "@/lib/gsap";
import { MQ, PIN_PRIORITY, loadScrambleText, requestScrollRefresh } from "@/lib/gsap-plugins";
import { gsapEase } from "@/lib/motion";
import { useStoryBeats } from "@/lib/story/use-story";

import type { PitHandle, PitProps } from "./Pit";
import {
  binOf,
  bodySize,
  clearBodies,
  collectBodies,
  heapFrame,
  pitSize,
  setFlag,
  setGloss,
  setPitMode,
  writeFrame,
  writePose,
  type PitBodyEls,
} from "./pit-dom";
import { fallbackHeap, heapPose, heapSpot, type HeapLayout } from "./pit-heap";
import {
  blendPose,
  rotatedHalfExtents,
  scalePoses,
  type Bin,
  type PitPhase,
  type PitSize,
  type Pose,
  type PoseMap,
} from "./pit-physics";
import {
  RECUT,
  dropOffset,
  dropWindows,
  flightFrame,
  flightT,
  flightWindows,
  isLanded,
  isScrambled,
} from "./recut";

/**
 * S2 words motion (spec S2, 3.2, 6.3, 6.5). Client wrapper around the
 * server-rendered stage; one gsap.matchMedia with the three branches.
 *
 * desktopMotion:
 *   Approach (before the pin): the H2 fills character by character on its
 *   own scrub as it rises (section top 75% of the viewport to the pin), from
 *   40% ink, the lede comes up from 60% just behind it, and the dim map fades
 *   in from section top 35%, so the hero's map and this one never read at
 *   once. The pit falls in real time once its top reaches the viewport bottom
 *   (Pit, lazy): the pills spawn just above the pit and slide in under the
 *   lede.
 * Loading: the pit (matter-js), the heading split and ScrambleText wait for
 *   the reader's first scroll with the section's top within half a viewport
 *   of the fold (never the load or hydration task); keyboard focus on a pill
 *   loads the pit at once and settles the pile when it is ready. Phones
 *   split each ledger row's line mask the same way, row by row.
 *   The stage pins +=120% (scrub 0.8, refreshPriority 40); the pinned
 *   timeline (recut.ts): 0-0.18 the pile at rest; at 0.18 the pit settles
 *   whatever is still falling (a short 300ms settle, never a mid-air
 *   record), freezes and records every pose; 0.18-0.27 the vocabulary pills
 *   fall through the floor; 0.27-0.82 each bubble flies from its recorded
 *   pose to its ledger token slot while its dim phrase copy fades in on the
 *   left, scrambles into the token label at 70% of the flight and takes the
 *   token skin, and the connector draws left to right; a bubble in the air
 *   paints over the pile, and the bin's rules fade as the fourth bubble lifts
 *   off (rows 4-6 land where the bin stood); 0.82-1 the closing line, and
 *   the caption moves from the empty bin to the ledger. Flights and drops
 *   are pure functions of the timeline's progress, so a fast reverse never
 *   strands a pill. Scrubbing back under 0.16 thaws the pile where it is
 *   drawn: live again (asleep), so the pills take presses, open their
 *   captions and can be grabbed as before the freeze, and the next pass
 *   records the pile afresh. Scrolling above the section resets the pit to its
 *   fresh-load state (the heap unseen, its pills still in the tab order), so
 *   re-entry replays the fall; the freeze waits for the live scroll position,
 *   so the scrub running on after an instant jump above (Home) never
 *   re-freezes it. Until the fall the pit is empty (the heap waits unseen,
 *   words.css), so no pill is ever seen jumping from the heap to the spawn
 *   line, which Chrome also scored as a layout shift.
 *   After the pin, each block dissolves (opacity only) as it nears the
 *   floating nav.
 * mobileMotion: no pin; the pit runs once on entry (8 bodies, touch never
 *   captured) and the ledger list reveals with line masks.
 * reduced: the static heap and list (the server layout).
 *
 * No engine: a pit chunk or matter-js that fails to load (a flaky network,
 * chunk hashes gone after a deploy) never reaches the page's error screen.
 * The heap is the pile, at rest, from the fall on, and the re-cut runs on it.
 *
 * Vocabulary pills are toggletips: a tap, click, Enter or Space toggles the
 * glossary line; a held mouse (or a long touch) shows it while held; keyboard
 * focus shows it; Escape or a press elsewhere hides it.
 *
 * Reports b2330 for the whole section.
 */

/** Stands in for the pit when its chunk fails to load: WordsMotion shows the heap at rest instead. */
function PitUnavailable({ onFailed }: PitProps) {
  useEffect(() => {
    onFailed();
  }, [onFailed]);
  return null;
}

const Pit = dynamic(() => import("./Pit").catch(() => PitUnavailable), { ssr: false });

const BEATS = [[0, "b2330"]] as const;
const SCRAMBLE_CHARS = "사입삼촌확보미송전달수령요청";
const SCRAMBLE_SECONDS = 0.6;
/** Unfilled heading ink: 40% of #EDECE3 on #07231C is 3.3:1, so a reader who stops mid-fill still reads it (large text). */
const H2_FROM = "rgba(237, 236, 227, 0.4)";
const H2_TO = "#EDECE3";
/** The lede waits at this ink while the heading fills (4.7:1 on the night ground), then comes up with it. */
const LEDE_FROM = 0.6;
/**
 * The pit (matter-js), the heading split and the ScrambleText plugin load
 * once the section's top is half a viewport below the fold, and only after
 * the reader has scrolled: never in the page-load and hydration tasks.
 */
const NEAR_START = "top bottom+=50%";
/** A freeze that finds pills still falling settles them over this long (snap ease). */
const SETTLE_SECONDS = 0.3;
/** Scrubbing back under this pin progress thaws the frozen pile (a little under the freeze, so a jitter at 0.18 never toggles it). */
const THAW_AT = RECUT.freezeAt - 0.02;
/** After the fall trigger, matter-js gets this long before the pre-fall heap comes back at rest (a slow or failed chunk). */
const ENGINE_WAIT_MS = 3000;
/** Pin progress over which the bin's floor and side rules fade, from the fourth flight's lift-off. */
const BIN_FADE = 0.1;
/** The floating nav's bottom edge (spec 5.1: top 16px + 56px) and the dissolve band above it. */
const NAV_BOTTOM = 72;
const EXIT_BAND = 72;
/** A press that moves farther than this is a drag or a scroll, not a tap. */
const TAP_SLOP = 8;
/** A touch held this long shows the glossary line without a tap. */
const HOLD_MS = 450;

type Mode = "desktop" | "mobile" | "reduced";

/** Shared with Pit: who owns the pills right now. */
type PitControl = { phase: PitPhase };

type Frozen = {
  poses: PoseMap;
  from: PoseMap;
  size: PitSize;
  bin: Bin;
  sizes: Map<string, { width: number; height: number }>;
};

/** A press on a vocabulary pill, from pointerdown to its click. */
type Press = {
  wrapper: HTMLElement;
  x: number;
  y: number;
  /** The caption was open before this press (a tap then closes it). */
  wasOpen: boolean;
  moved: boolean;
  touch: boolean;
  /** A long touch opened it: the following click keeps it open. */
  held: boolean;
  timer: number | null;
};

function required<T extends Element>(scope: ParentNode, selector: string): T {
  const element = scope.querySelector<T>(selector);
  if (!element) throw new Error(`WordsMotion: missing ${selector}`);
  return element;
}

function all<T extends Element>(scope: ParentNode, selector: string): T[] {
  return Array.from(scope.querySelectorAll<T>(selector));
}

/**
 * The motion modes hide the pre-fall heap (words.css): the pills arrive by falling, and a heap
 * glimpsed at the fold, then whisked off to the spawn line, read as a jump (a layout shift).
 * data-pit-heap="shown" brings it back where it is the pile the reader sees: keyboard focus
 * before matter-js arrived, or matter-js not arriving at all.
 */
function showHeap(pit: HTMLElement): void {
  pit.dataset.pitHeap = "shown";
}

/** The heap is on show and still laid out by CSS: it is the pile, at rest, and the engine leaves it. */
function heapResting(pit: HTMLElement | null | undefined): boolean {
  return pit?.dataset.pitHeap === "shown" && pit.dataset.pitMode === "heap";
}

function poseMoved(a: Pose | undefined, b: Pose | undefined): boolean {
  if (!a || !b) return false;
  return Math.hypot(a.x - b.x, a.y - b.y) > 2 || Math.abs(a.angle - b.angle) > 0.03;
}

export function WordsMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement | null>(null);
  const pitHandle = useRef<PitHandle | null>(null);
  const control = useRef<PitControl>({ phase: "idle" });
  const bodiesRef = useRef<PitBodyEls[]>([]);
  const startFallRef = useRef<(() => void) | null>(null);
  /** Desktop: bring the pinned stage to its resting frame (keyboard focus landed in the pit). */
  const revealRef = useRef<(() => void) | null>(null);
  const press = useRef<Press | null>(null);
  const pressCleanup = useRef<(() => void) | null>(null);
  /** A keyboard user reached a pill before the pit loaded: settle the pile the moment it is ready. */
  const settleOnReady = useRef(false);
  /** The pit chunk or matter-js failed to load: no engine this visit, the heap is the pile. */
  const engineFailed = useRef(false);
  const [mode, setMode] = useState<Mode | null>(null);
  /** Mount the lazy pit (and with it matter-js). Set by the near gate, or by keyboard focus on a pill. */
  const [near, setNear] = useState(false);
  const lowPower = useLowPower();
  const finePointer = useFinePointer();
  const report = useStoryBeats("words", BEATS);

  const requestPit = useCallback(() => setNear(true), []);

  const cleanupActivePress = useCallback((clearState: boolean) => {
    pressCleanup.current?.();
    pressCleanup.current = null;
    if (clearState) press.current = null;
  }, []);

  useEffect(() => () => cleanupActivePress(true), [cleanupActivePress]);

  /** The vocabulary pill that has keyboard focus, if any. */
  const focusedPill = useCallback((): HTMLElement | null => {
    const active = document.activeElement;
    return active instanceof HTMLElement && active.matches("[data-vocab]") && root.current?.contains(active) ? active : null;
  }, []);

  /**
   * The fall trigger may fire before the lazy pit exists; it starts once it is ready. A heap
   * already brought back to rest (matter-js took longer than ENGINE_WAIT_MS) stays at rest.
   */
  const onPitReady = useCallback(() => {
    const handle = pitHandle.current;
    const resting = heapResting(root.current?.querySelector<HTMLElement>("[data-words-pit]"));
    if (control.current.phase === "falling" && handle && (!resting || settleOnReady.current)) {
      handle.start();
      const pitBox = root.current?.querySelector<HTMLElement>("[data-words-pit]")?.getBoundingClientRect();
      if (!settleOnReady.current && pitBox && pitBox.bottom < 0) {
        // The engine arrived after the reader had passed the pit (a slow network on a phone):
        // rest the pile now, so scrolling back shows it settled, not an empty pit or a replay.
        handle.settle();
      }
      if (settleOnReady.current) {
        // Keyboard focus is on a pill: the pile comes to rest at once, and its caption shows.
        handle.settle();
        const pill = focusedPill();
        const pit = root.current?.querySelector<HTMLElement>("[data-words-pit]");
        const body = pill ? bodiesRef.current.find((entry) => entry.skin === pill) : undefined;
        if (pill && pit && body) {
          setGloss(body, pit, true);
          if (!revealRef.current) pill.scrollIntoView({ block: "nearest" });
        }
      }
    }
    settleOnReady.current = false;
    requestScrollRefresh();
  }, [focusedPill]);

  /** No engine: a fall already under way (or one waiting on keyboard focus) shows the heap at rest now. */
  const onPitFailed = useCallback(() => {
    engineFailed.current = true;
    settleOnReady.current = false;
    const pit = root.current?.querySelector<HTMLElement>("[data-words-pit]");
    if (pit && !pitHandle.current && control.current.phase === "falling") showHeap(pit);
  }, []);

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;
      const pit = required<HTMLElement>(el, "[data-words-pit]");
      const bodies = collectBodies(pit);
      bodiesRef.current = bodies;
      const vocabButtons = bodies.filter((body) => body.kind === "vocab").map((body) => body.skin);
      // Toggletips: the expanded state is real only once script can toggle it.
      for (const button of vocabButtons) button.setAttribute("aria-expanded", "false");

      const closeAllGlosses = () => {
        for (const body of bodies) if (body.wrapper.hasAttribute("data-gloss-open")) setGloss(body, pit, false);
      };

      const setModeAttr = (next: Mode) => {
        el.dataset.wordsMode = next;
        setMode(next);
      };

      /**
       * Start the fall once per entry (Pit starts it on load if it is not there yet). Until
       * then the pit is empty (CSS hides the pre-fall heap in the motion modes); if matter-js
       * has not arrived within ENGINE_WAIT_MS, or failed to load, the heap comes back, at rest.
       */
      let engineWait = 0;
      const startFall = () => {
        if (control.current.phase !== "idle") return;
        control.current.phase = "falling";
        pit.dataset.pitState = "falling";
        if (pitHandle.current) {
          pitHandle.current.start();
          return;
        }
        window.clearTimeout(engineWait);
        if (engineFailed.current) {
          showHeap(pit);
          return;
        }
        engineWait = window.setTimeout(() => {
          if (!pitHandle.current && control.current.phase === "falling") showHeap(pit);
        }, ENGINE_WAIT_MS);
      };
      startFallRef.current = startFall;

      /**
       * Run `onNear` once the section's top is within NEAR_START, but never
       * before the reader's first scroll: at page load the section can already
       * sit inside that margin (phones), and nothing here belongs in the load
       * and hydration tasks. Returns its cleanup.
       */
      const whenNear = (onNear: () => void): (() => void) => {
        let done = false;
        let detach: (() => void) | null = null;
        const fire = () => {
          detach?.();
          detach = null;
          if (done) return;
          done = true;
          onNear();
        };
        const arm = () => {
          if (done || detach) return;
          if (window.scrollY > 0) {
            fire();
            return;
          }
          window.addEventListener("scroll", fire, { passive: true });
          detach = () => window.removeEventListener("scroll", fire);
        };
        // Active from the near line to the end of the page, so a deep link past the section counts too.
        const trigger = ScrollTrigger.create({ trigger: el, start: NEAR_START, end: "max", onEnter: arm, onEnterBack: arm });
        return () => {
          trigger.kill();
          detach?.();
          detach = null;
        };
      };

      const mm = gsap.matchMedia();

      /* ---------------------------------------------------------------- */
      /* Desktop: pinned re-cut                                            */
      /* ---------------------------------------------------------------- */
      mm.add(MQ.desktopMotion, () => {
        setModeAttr("desktop");
        const layout: HeapLayout = "desktop";
        const stage = required<HTMLElement>(el, "[data-words-stage]");
        const spacer = required<HTMLElement>(el, "[data-words-pin-spacer]");
        const copy = required<HTMLElement>(el, "[data-words-copy]");
        const heading = required<HTMLElement>(el, "#words-title");
        const lede = required<HTMLElement>(el, "[data-words-lede]");
        const map = required<HTMLElement>(el, "[data-words-map]");
        const rows = all<HTMLElement>(el, "[data-ledger-row]");
        const phrases = rows.map((row) => required<HTMLElement>(row, "[data-ledger-phrase]"));
        const connectors = rows.map((row) => required<HTMLElement>(row, "[data-ledger-connector]"));
        const tokens = rows.map((row) => required<HTMLElement>(row, "[data-ledger-token]"));
        const notes = all<HTMLElement>(el, "[data-ledger-note]");
        const closing = required<HTMLElement>(el, "[data-words-closing]");
        const outro = required<HTMLElement>(el, "[data-words-outro]");
        const caption = required<HTMLElement>(el, "[data-words-caption]");
        const captionEcho = required<HTMLElement>(el, "[data-words-caption-echo]");
        const captionEchoText = required<HTMLElement>(el, "[data-caption-echo-text]");
        const floor = required<HTMLElement>(el, "[data-pit-floor]");
        const bubbles = bodies
          .filter((body) => body.kind === "bubble")
          .sort((a, b) => (a.ledgerIndex ?? 0) - (b.ledgerIndex ?? 0));
        const vocab = bodies.filter((body) => body.kind === "vocab");
        const windows = flightWindows(bubbles.length);
        const drops = dropWindows(vocab.length);
        const bubbleLabels = bubbles.map((body) => body.text?.textContent ?? "");

        // ScrambleText is lazy (spec 13): fetched with the pit, once the reader nears the section.
        let scramblerReady = false;

        // Flight state, all derived from the timeline's progress.
        let frozen: Frozen | null = null;
        let slots: { x: number; y: number }[] = [];
        let currentSize: PitSize = pitSize(pit);
        let scaled: PoseMap | null = null;
        let scaledFrom: PoseMap | null = null;
        const settle = { k: 1 };
        let settleTween: gsap.core.Tween | null = null;
        let lastK = Number.NaN;
        const lastT: number[] = bubbles.map(() => Number.NaN);
        const lastDrop: number[] = vocab.map(() => Number.NaN);
        // A pill that has fallen through the floor stays in the tab order: keyboard focus on it
        // (Shift+Tab back from the next section) brings the stage back to the pile at rest (revealRef).
        const scrambled: boolean[] = bubbles.map(() => false);
        const landed: boolean[] = bubbles.map(() => false);
        const flying: boolean[] = bubbles.map(() => false);
        const scrambles: (gsap.core.Tween | null)[] = bubbles.map(() => null);
        const instantFrames: number[] = [];

        const measure = () => {
          const pitRect = pit.getBoundingClientRect();
          slots = tokens.map((token) => {
            const rect = token.getBoundingClientRect();
            return { x: rect.left - pitRect.left, y: rect.top - pitRect.top };
          });
          currentSize = pitSize(pit);
          const bins = frozen ? { from: frozen.bin, to: binOf(pit) } : undefined;
          scaled = frozen ? scalePoses(frozen.poses, frozen.size, currentSize, bins) : null;
          scaledFrom = frozen ? scalePoses(frozen.from, frozen.size, currentSize, bins) : null;
          lastT.fill(Number.NaN);
          lastDrop.fill(Number.NaN);
          lastK = Number.NaN;
        };

        const setScramble = (index: number, on: boolean) => {
          if (scrambled[index] === on) return;
          scrambled[index] = on;
          const body = bubbles[index];
          const text = body.text;
          const row = words.ledger[index];
          scrambles[index]?.kill();
          scrambles[index] = null;
          if (!text) return;
          if (on) {
            body.skin.dataset.skinState = row.kind;
            if (scramblerReady) {
              scrambles[index] = gsap.to(text, {
                duration: SCRAMBLE_SECONDS,
                ease: gsapEase.outQuart,
                scrambleText: { text: row.token, chars: SCRAMBLE_CHARS, speed: 0.6 },
              });
            } else {
              text.textContent = row.token;
            }
          } else {
            // Scrubbing back past the trigger restores the phrase instantly.
            body.skin.dataset.skinInstant = "";
            body.skin.dataset.skinState = "bubble";
            text.textContent = bubbleLabels[index];
            instantFrames.push(
              requestAnimationFrame(() => {
                delete body.skin.dataset.skinInstant;
              }),
            );
          }
        };

        const setLanded = (index: number, on: boolean) => {
          if (landed[index] === on) return;
          landed[index] = on;
          setFlag(bubbles[index], "landed", on);
          tokens[index].style.opacity = on ? "1" : "0";
        };

        /**
         * In the air: the bubble paints over the pills still resting in the pile (they come later
         * in the DOM), and an earlier flight, always further along, over a later one.
         */
        const setFlying = (index: number, on: boolean) => {
          if (flying[index] === on) return;
          flying[index] = on;
          const body = bubbles[index];
          if (on) body.wrapper.style.setProperty("--flight-order", String(bubbles.length - index));
          else body.wrapper.style.removeProperty("--flight-order");
          setFlag(body, "flying", on);
        };

        const releaseFlights = () => {
          bubbles.forEach((_, index) => {
            setScramble(index, false);
            setLanded(index, false);
            setFlying(index, false);
          });
          lastT.fill(Number.NaN);
        };

        const releaseDrops = () => {
          for (const body of vocab) body.lift.style.removeProperty("transform");
          lastDrop.fill(Number.NaN);
        };

        let render: (progress: number) => void = () => {};

        /**
         * At 0.18: settle and freeze the pit (or, if matter-js is not loaded yet or the heap is
         * already resting on show, lay the bin heap out as the poses).
         */
        const freeze = () => {
          if (control.current.phase === "frozen" && frozen) return;
          closeAllGlosses();
          const result = heapResting(pit) ? null : (pitHandle.current?.freeze() ?? null);
          let poses: PoseMap;
          let from: PoseMap;
          let size: PitSize;
          let bin: Bin;
          if (result) {
            ({ poses, from, size, bin } = result);
          } else {
            const frame = heapFrame(pit);
            size = pitSize(pit);
            bin = binOf(pit);
            const heap: Record<string, Pose> = {};
            for (const body of bodies) heap[body.id] = heapPose(heapSpot(body.id, fallbackHeap(layout)), frame);
            poses = heap;
            from = heap;
            setPitMode(pit, "live");
            for (const body of bodies) {
              setFlag(body, "pitHidden", false);
              setFlag(body, "pitSkip", false);
              writePose(body, poses[body.id], bodySize(body));
            }
          }
          const sizes = new Map<string, { width: number; height: number }>();
          for (const body of bodies) if (poses[body.id]) sizes.set(body.id, bodySize(body));
          frozen = { poses, from, size, bin, sizes };
          control.current.phase = "frozen";
          pit.dataset.pitState = "frozen";
          measure();
          // Pills still in the air when the freeze came settle onto the pile, quickly, instead of teleporting.
          settleTween?.kill();
          settleTween = null;
          if (Object.keys(poses).some((id) => poseMoved(from[id], poses[id]))) {
            settle.k = 0;
            settleTween = gsap.to(settle, {
              k: 1,
              duration: SETTLE_SECONDS,
              ease: gsapEase.snap,
              onUpdate: () => render(tl.progress()),
            });
          } else {
            settle.k = 1;
          }
        };

        /**
         * Back under the freeze (a reverse scrub): the recorded pile turns live again where it is
         * drawn, so the pills take presses, show their captions and can be grabbed, as they did
         * before the freeze. A pile laid out before matter-js arrived cannot thaw; it stays frozen
         * and only its vocabulary pills take input (data-pit-rest).
         */
        const thaw = () => {
          if (control.current.phase !== "frozen" || !frozen || !scaled) return;
          const rest = scaled;
          if (!pitHandle.current?.thaw(rest)) return;
          settleTween?.kill();
          settleTween = null;
          settle.k = 1;
          releaseFlights();
          releaseDrops();
          for (const body of bodies) {
            const pose = rest[body.id];
            const size = frozen.sizes.get(body.id);
            if (pose && size) writePose(body, pose, size);
          }
          frozen = null;
          scaled = null;
          scaledFrom = null;
          lastK = Number.NaN;
          control.current.phase = "falling";
          pit.dataset.pitState = "falling";
          delete pit.dataset.pitRest;
        };

        render = (progress: number) => {
          // Freeze only where the live scroll agrees: after an instant jump above the section (Home,
          // scrollTo(0)) the 0.8s scrub still renders progress past the freeze while resetPit has
          // already run, and freezing then would leave a static pile in a pit meant to replay its fall.
          const scrolled = tl.scrollTrigger?.progress ?? progress;
          if (progress >= RECUT.freezeAt && scrolled >= RECUT.freezeAt) freeze();
          else if (progress < THAW_AT && scrolled < THAW_AT) thaw();
          if (control.current.phase === "frozen") {
            const atRest = progress < RECUT.freezeAt;
            if (!atRest && pit.hasAttribute("data-pit-rest")) closeAllGlosses();
            pit.toggleAttribute("data-pit-rest", atRest);
          }
          if (control.current.phase !== "frozen" || !frozen || !scaled || !scaledFrom) {
            releaseFlights();
            releaseDrops();
            return;
          }
          const k = settle.k;
          const settling = k !== lastK;
          lastK = k;
          for (let index = 0; index < bubbles.length; index += 1) {
            const body = bubbles[index];
            const rest = scaled[body.id];
            const size = frozen.sizes.get(body.id);
            const slot = slots[index];
            if (!rest || !size || !slot) continue;
            const window = windows[index];
            const t = flightT(progress, window);
            if (t !== lastT[index] || settling) {
              lastT[index] = t;
              const pose = blendPose(scaledFrom[body.id] ?? rest, rest, k);
              const from = { x: pose.x - size.width / 2, y: pose.y - size.height / 2, angle: pose.angle };
              const frame = flightFrame(from, slot, t);
              writeFrame(body, frame.x, frame.y, frame.angle);
            }
            setFlying(index, t > 0 && t < 1);
            setScramble(index, isScrambled(progress, window));
            setLanded(index, isLanded(progress, window));
          }
          // The vocabulary pills fall through the floor (the pit clips there): no translucent pills over the pile.
          for (let index = 0; index < vocab.length; index += 1) {
            const body = vocab[index];
            const rest = scaled[body.id];
            const size = frozen.sizes.get(body.id);
            if (!rest || !size) continue;
            if (settling) writePose(body, blendPose(scaledFrom[body.id] ?? rest, rest, k), size);
            const top = rest.y - rotatedHalfExtents(size, rest.angle).y;
            const offset = dropOffset(progress, drops[index], currentSize.height - top + 4);
            if (offset !== lastDrop[index]) {
              lastDrop[index] = offset;
              if (offset > 0) body.lift.style.transform = `translate3d(0, ${Math.round(offset * 100) / 100}px, 0)`;
              else body.lift.style.removeProperty("transform");
            }
          }
        };

        /** Above the section: back to the pre-fall state, so re-entry replays the fall. */
        const resetPit = () => {
          closeAllGlosses();
          settleTween?.kill();
          settleTween = null;
          settle.k = 1;
          releaseFlights();
          releaseDrops();
          frozen = null;
          scaled = null;
          scaledFrom = null;
          control.current.phase = "idle";
          pit.dataset.pitState = "idle";
          delete pit.dataset.pitRest;
          delete pit.dataset.pitHeap;
          if (pitHandle.current) {
            pitHandle.current.reset();
          } else {
            clearBodies(bodies);
            setPitMode(pit, "heap");
          }
        };

        // Initial states of the scrubbed elements. The ledger stays in the
        // accessibility tree throughout (opacity only, never visibility).
        gsap.set(phrases, { opacity: 0 });
        gsap.set(connectors, { scaleX: 0 });
        gsap.set(tokens, { opacity: 0 });
        gsap.set(notes, { opacity: 0 });
        gsap.set(closing, { opacity: 0, y: 16 });
        gsap.set(captionEchoText, { opacity: 0 });

        // Approach: the heading fills as it rises, the lede comes up just behind it. The split and
        // its scrub are built when the reader nears (out of the hydration task); until then the
        // heading is simply inked, and it is still more than a viewport below the fold.
        let split: SplitText | null = null;
        let approach: gsap.core.Timeline | null = null;
        const buildApproach = () => {
          if (split) return;
          split = SplitText.create(heading, { type: "words,chars", charsClass: "words-char" });
          const chars = split.chars;
          const fillSpan = 0.8;
          const fillEach = fillSpan * 0.32;
          const fillStagger = chars.length > 1 ? (fillSpan - fillEach) / (chars.length - 1) : 0;
          // Every char starts unfilled. A staggered fromTo inside a scrubbed timeline only renders the
          // chars whose tween has begun, so without this the chars ahead of the fill front stay at full
          // ink and the heading reads lit, dim, lit.
          gsap.set(chars, { color: H2_FROM });
          approach = gsap.timeline({
            defaults: { ease: "none" },
            scrollTrigger: { trigger: el, start: "top 75%", end: "top top", scrub: 0.6, invalidateOnRefresh: true },
          });
          approach.fromTo(chars, { color: H2_FROM }, { color: H2_TO, duration: fillEach, stagger: fillStagger }, 0);
          approach.fromTo(lede, { opacity: LEDE_FROM }, { opacity: 1, duration: 0.4 }, 0.55);
          // Past the fill already (a jump into the pin): show its end state, never a dim heading.
          const trigger = approach.scrollTrigger;
          if (trigger) approach.progress(trigger.progress);
        };
        const releaseNear = whenNear(() => {
          buildApproach();
          requestPit();
          void loadScrambleText().then(
            () => {
              scramblerReady = true;
            },
            // Not loaded: each token label is written as is.
            () => {},
          );
        });

        // One map at a time: this dim copy fades in as the hero's end state scrolls away.
        gsap.fromTo(
          map,
          { opacity: 0 },
          { opacity: 0.25, ease: "none", scrollTrigger: { trigger: el, start: "top 35%", end: "top top", scrub: true } },
        );

        const tl = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: {
            trigger: stage,
            start: "top top",
            end: "+=120%",
            pin: true,
            // Our own spacer, already the stage's parent: refreshes never move the stage in the
            // DOM, so a focused vocabulary pill keeps its focus.
            pinSpacer: spacer,
            scrub: 0.8,
            invalidateOnRefresh: true,
            refreshPriority: PIN_PRIORITY.words,
            onUpdate: (self) => report(self.progress),
            onRefresh: () => {
              measure();
              render(tl.progress());
            },
          },
        });

        // 0.27-0.82: per flight, the dim phrase fades in and the connector draws left to right.
        windows.forEach((window, index) => {
          const span = window.end - window.start;
          tl.to(phrases[index], { opacity: 1, duration: span * 0.55, ease: gsapEase.snap }, window.start + span * 0.1);
          tl.to(connectors[index], { scaleX: 1, duration: span * 0.45, ease: gsapEase.snap }, window.scramble - span * 0.15);
        });
        const lastFlight = windows[windows.length - 1];
        if (lastFlight) tl.to(notes, { opacity: 1, duration: 0.05, ease: gsapEase.snap }, lastFlight.end - 0.02);

        // The bin's floor and side rules go as the fourth bubble lifts off: the lower ledger rows
        // (4-6) are drawn where the bin stands, so it is gone before row 4's phrase is fully in.
        const binExit = windows[Math.min(3, windows.length - 1)];
        if (binExit) tl.to(floor, { opacity: 0, duration: BIN_FADE, ease: gsapEase.snap }, binExit.start);

        // 0.82-1: the closing line; the bin's caption goes and reappears under the ledger.
        const closingSpan = RECUT.closingEnd - RECUT.closingStart;
        tl.to(closing, { opacity: 1, y: 0, duration: closingSpan, ease: gsapEase.snap }, RECUT.closingStart);
        tl.to(caption, { opacity: 0, duration: closingSpan * 0.6, ease: gsapEase.snap }, RECUT.closingStart);
        tl.to(captionEchoText, { opacity: 1, duration: closingSpan * 0.6, ease: gsapEase.snap }, RECUT.closingStart + closingSpan * 0.3);
        tl.set({}, {}, 1);
        tl.eventCallback("onUpdate", () => render(tl.progress()));

        const pin = tl.scrollTrigger;

        // Keyboard focus into the pit: the browser centres the pill, which can scroll deep into
        // the pin (past the freeze, where the pills have dropped), or a reader tabbing back from
        // the next section lands on a pill that already fell through the floor. Bring the stage
        // to the pile at rest instead, and draw it there now (no scrub lag), so the focused pill
        // and its caption are on screen at once.
        revealRef.current = () => {
          if (!pin) return;
          const length = pin.end - pin.start;
          const y = window.scrollY;
          if (y >= pin.start - 2 && y <= pin.start + length * (RECUT.freezeAt - 0.04)) return;
          window.scrollTo({ top: Math.round(pin.start + length * 0.03), behavior: "instant" });
          ScrollTrigger.update();
          pin.getTween()?.progress(1);
        };

        // After the pin: each block dissolves (opacity only) in the band just above the floating nav.
        const offsetInStage = (target: HTMLElement) => target.getBoundingClientRect().top - stage.getBoundingClientRect().top;
        for (const target of [copy, ...rows, captionEcho, outro]) {
          gsap.fromTo(
            target,
            { opacity: 1 },
            {
              opacity: 0,
              ease: "none",
              immediateRender: false,
              scrollTrigger: {
                trigger: stage,
                start: () => (pin?.end ?? 0) + Math.max(0, offsetInStage(target) - NAV_BOTTOM - EXIT_BAND),
                end: () => (pin?.end ?? 0) + Math.max(24, offsetInStage(target) - NAV_BOTTOM),
                scrub: true,
                invalidateOnRefresh: true,
              },
            },
          );
        }

        // The fall: real time, once per entry, as the pit's top comes over the fold (the pills
        // enter already falling, so the pile is at rest before the freeze at ordinary speeds).
        const pitOffset = () => pit.getBoundingClientRect().top - stage.getBoundingClientRect().top;
        ScrollTrigger.create({
          trigger: el,
          start: () => `top+=${Math.round(pitOffset())} bottom`,
          invalidateOnRefresh: true,
          onEnter: () => {
            if (pin && pin.progress >= RECUT.freezeAt) return;
            startFall();
          },
        });

        // Above the section (entirely below the viewport): reset for a replay.
        ScrollTrigger.create({
          trigger: el,
          start: "top bottom",
          onLeaveBack: resetPit,
        });

        requestScrollRefresh();

        return () => {
          releaseNear();
          // Built in a scroll callback, so outside this branch's context: revert by hand.
          approach?.scrollTrigger?.kill();
          approach?.revert();
          approach = null;
          split?.revert();
          split = null;
          revealRef.current = null;
          settleTween?.kill();
          for (const id of instantFrames) cancelAnimationFrame(id);
          for (const tween of scrambles) tween?.kill();
          closeAllGlosses();
          pitHandle.current?.reset();
          bubbles.forEach((body, index) => {
            if (body.text) body.text.textContent = bubbleLabels[index];
            body.skin.dataset.skinState = "bubble";
            delete body.skin.dataset.skinInstant;
            body.wrapper.style.removeProperty("--flight-order");
          });
          for (const token of tokens) token.style.removeProperty("opacity");
          clearBodies(bodies);
          setPitMode(pit, "heap");
          window.clearTimeout(engineWait);
          control.current.phase = "idle";
          pit.dataset.pitState = "idle";
          delete pit.dataset.pitRest;
          delete pit.dataset.pitHeap;
          delete el.dataset.wordsMode;
        };
      });

      /* ---------------------------------------------------------------- */
      /* Phones and tablets: the pit runs once; the list reveals          */
      /* ---------------------------------------------------------------- */
      mm.add(MQ.mobileMotion, () => {
        setModeAttr("mobile");

        const fall = ScrollTrigger.create({
          trigger: pit,
          start: "top 70%",
          once: true,
          onEnter: () => {
            startFall();
            // Arriving from below (a deep link): the pile is at rest when the reader scrolls back up
            // (the pit settles it the moment matter-js is ready, if it is not yet).
            if (pit.getBoundingClientRect().bottom < 0) pitHandle.current?.settle();
          },
        });

        // A caption opened by a tap closes once the pit leaves the viewport.
        const glossOut = ScrollTrigger.create({
          trigger: pit,
          start: "top bottom",
          end: "bottom top",
          onLeave: closeAllGlosses,
          onLeaveBack: closeAllGlosses,
        });

        // The pit loads on the reader's first scroll near the section (never in the load task).
        const releaseNear = whenNear(requestPit);

        const rows = all<HTMLElement>(el, "[data-ledger-row]");
        const closing = required<HTMLElement>(el, "[data-words-closing]");
        const splits: SplitText[] = [];
        const revealTweens = new Set<gsap.core.Tween>();
        const reveal = (trigger: HTMLElement, textTargets: HTMLElement[], extra: HTMLElement[]) =>
          SplitText.create(textTargets, {
            type: "lines",
            mask: "lines",
            aria: "none",
            autoSplit: true,
            onSplit: (self: SplitText) => {
              const tween = gsap.from([...self.lines, ...extra], {
                yPercent: 105,
                duration: 0.7,
                ease: gsapEase.snap,
                stagger: 0.06,
                scrollTrigger: { trigger, start: "top 88%", once: true },
              });
              revealTweens.add(tween);
              return tween;
            },
          });

        // Each reveal is split when its row is half a viewport below the fold, not at hydration
        // (line splitting measures layout). A row never reached simply stays as it is: in place.
        const blocks: [HTMLElement, HTMLElement[], HTMLElement[]][] = rows.map((row) => [
          row,
          [required<HTMLElement>(row, "[data-ledger-phrase]"), ...all<HTMLElement>(row, "[data-ledger-note]")],
          [required<HTMLElement>(row, "[data-ledger-token]")],
        ]);
        blocks.push([closing, [closing], []]);
        const revealGates = blocks.map(([trigger, textTargets, extra]) => {
          let built = false;
          const build = () => {
            if (built) return;
            built = true;
            splits.push(reveal(trigger, textTargets, extra));
          };
          return ScrollTrigger.create({ trigger, start: NEAR_START, end: "max", onEnter: build, onEnterBack: build });
        });

        const beat = ScrollTrigger.create({
          trigger: el,
          start: "top center",
          end: "bottom center",
          onToggle: (self) => {
            if (self.isActive) report(0);
          },
        });

        requestScrollRefresh();

        return () => {
          releaseNear();
          fall.kill();
          glossOut.kill();
          beat.kill();
          for (const gate of revealGates) gate.kill();
          // Built in scroll callbacks, so outside this branch's context: revert by hand.
          for (const tween of revealTweens) {
            tween.scrollTrigger?.kill();
            tween.revert();
          }
          revealTweens.clear();
          for (const split of splits) split.revert();
          closeAllGlosses();
          pitHandle.current?.reset();
          clearBodies(bodies);
          setPitMode(pit, "heap");
          window.clearTimeout(engineWait);
          control.current.phase = "idle";
          pit.dataset.pitState = "idle";
          delete pit.dataset.pitHeap;
          delete el.dataset.wordsMode;
        };
      });

      /* ---------------------------------------------------------------- */
      /* Reduced motion: the server layout, final state                   */
      /* ---------------------------------------------------------------- */
      mm.add(MQ.reduced, () => {
        setModeAttr("reduced");
        return () => {
          delete el.dataset.wordsMode;
        };
      });

      return () => {
        window.clearTimeout(engineWait);
        startFallRef.current = null;
        for (const button of vocabButtons) button.removeAttribute("aria-expanded");
      };
    },
    { scope: root },
  );

  /* ---------- Glossary toggletips ---------- */
  const bodyFor = useCallback((wrapper: Element | null) => bodiesRef.current.find((entry) => entry.wrapper === wrapper) ?? null, []);

  const openGloss = useCallback(
    (wrapper: Element | null) => {
      const pit = root.current?.querySelector<HTMLElement>("[data-words-pit]");
      const body = bodyFor(wrapper);
      if (pit && body) setGloss(body, pit, true);
    },
    [bodyFor],
  );

  /** Close one caption, or every caption except `keep`. */
  const closeGloss = useCallback((wrapper?: Element | null, keep?: Element | null) => {
    const pit = root.current?.querySelector<HTMLElement>("[data-words-pit]");
    if (!pit) return;
    for (const body of bodiesRef.current) {
      if (!body.wrapper.hasAttribute("data-gloss-open")) continue;
      if (wrapper ? body.wrapper === wrapper : body.wrapper !== keep) setGloss(body, pit, false);
    }
  }, []);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      cleanupActivePress(true);
      const target = event.target instanceof Element ? event.target : null;
      const wrapper = target?.closest<HTMLElement>("[data-body]") ?? null;
      // A press anywhere else hides a caption a tap left open.
      closeGloss(null, wrapper);
      if (!wrapper) return;
      // Any pill: a sleeping pile wakes so the press can grab it (pointerdown precedes matter's mousedown).
      pitHandle.current?.wake();
      if (!target?.closest("[data-vocab]")) return;

      const state: Press = {
        wrapper,
        x: event.clientX,
        y: event.clientY,
        wasOpen: wrapper.hasAttribute("data-gloss-open"),
        moved: false,
        touch: event.pointerType === "touch",
        held: false,
        timer: null,
      };
      press.current = state;
      if (state.touch) {
        state.timer = window.setTimeout(() => {
          state.timer = null;
          state.held = true;
          openGloss(wrapper);
        }, HOLD_MS);
      } else {
        // A held mouse shows the caption while it is down (and while it drags the pill).
        openGloss(wrapper);
      }

      function clearTimer() {
        if (state.timer !== null) window.clearTimeout(state.timer);
        state.timer = null;
      }
      function move(moveEvent: globalThis.PointerEvent) {
        if (Math.hypot(moveEvent.clientX - state.x, moveEvent.clientY - state.y) <= TAP_SLOP) return;
        state.moved = true;
        clearTimer();
      }
      function detach() {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", release);
        window.removeEventListener("pointercancel", release);
        clearTimer();
      }
      function release(releaseEvent: globalThis.PointerEvent) {
        detach();
        pressCleanup.current = null;
        // A drag or a scroll is not a tap: the caption only showed while held.
        if (releaseEvent.type === "pointercancel" || state.moved) {
          state.moved = true;
          if (!state.touch || state.held) closeGloss(wrapper);
        }
      }
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", release);
      window.addEventListener("pointercancel", release);
      pressCleanup.current = detach;
    },
    [openGloss, closeGloss, cleanupActivePress],
  );

  const onClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const target = event.target instanceof Element ? event.target : null;
      const wrapper = target?.closest("[data-vocab]")?.closest<HTMLElement>("[data-body]") ?? null;
      if (!wrapper) return;
      const state = press.current;
      press.current = null;
      if (state && state.wrapper === wrapper) {
        if (state.moved || state.held) return;
        // A tap or click toggles against the state before the press.
        if (state.wasOpen) closeGloss(wrapper);
        else openGloss(wrapper);
        return;
      }
      // Enter or Space on a focused pill.
      if (wrapper.hasAttribute("data-gloss-open")) closeGloss(wrapper);
      else openGloss(wrapper);
    },
    [openGloss, closeGloss],
  );

  const onFocus = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.matches("[data-vocab]") || !target.matches(":focus-visible")) return;
      // Keyboard focus never chases a falling pill: the pile comes to rest at once.
      const phase = control.current.phase;
      const live = root.current?.dataset.wordsMode === "desktop" || root.current?.dataset.wordsMode === "mobile";
      if (live && (phase === "idle" || phase === "falling")) {
        // Desktop: the browser has scrolled the pill into view, which can land deep in the pin
        // (past the freeze). Bring the stage to the pile at rest before ScrollTrigger sees it.
        const reveal = revealRef.current;
        reveal?.();
        startFallRef.current?.();
        const handle = pitHandle.current;
        if (handle) {
          handle.settle();
        } else {
          // The pit has not loaded yet (the reader tabbed in from the hero): show the heap with the
          // focused pill in it, load the engine and settle on ready.
          const pit = root.current?.querySelector<HTMLElement>("[data-words-pit]");
          if (pit) showHeap(pit);
          settleOnReady.current = true;
          requestPit();
        }
        // Phones: the settled pill may sit lower than where the browser scrolled to.
        if (!reveal) target.scrollIntoView({ block: "nearest" });
      } else if (phase === "frozen") {
        // Desktop, past the freeze (Shift+Tab back from the next section): the pills have
        // dropped through the floor. Scroll the stage back to the pile at rest.
        revealRef.current?.();
      }
      openGloss(target.closest("[data-body]"));
    },
    [openGloss, requestPit],
  );

  const onBlur = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.matches("[data-vocab]")) closeGloss(target.closest("[data-body]"));
    },
    [closeGloss],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") closeGloss();
    },
    [closeGloss],
  );

  const physics = mode === "desktop" || mode === "mobile" ? mode : null;

  return (
    <div
      ref={root}
      className="words-root"
      data-low-power={lowPower ? "" : undefined}
      onPointerDown={onPointerDown}
      onClick={onClick}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    >
      {children}
      {near && physics ? (
        <Pit
          key={physics}
          rootRef={root}
          layout={physics}
          lowPower={lowPower}
          interactive={physics === "desktop" && finePointer}
          handle={pitHandle}
          control={control}
          onReady={onPitReady}
          onFailed={onPitFailed}
        />
      ) : null}
    </div>
  );
}
