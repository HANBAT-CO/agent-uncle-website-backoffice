"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type HTMLAttributes } from "react";

import { usePrefersReducedMotion } from "@/hooks/use-media-query";
import { cx } from "@/lib/cx";

/**
 * React Bits SplitFlapText, copied from the verified scratch build
 * (.context/scratch-toolkit/src/components/SplitFlapText.tsx) and restyled for
 * the record plate clock (spec 5.3, 9). Motive: time flips forward only when a
 * record is written.
 *
 * Changes from the original:
 * - Flat paper tiles: one tile fill, a 1px split line, Paperlogy 700. No
 *   gradients, no shadows, no glows, no brightness filters.
 * - Changing `text` flips from the value currently on screen (the original
 *   reset to the new text without flipping). An interrupted flip continues
 *   from whatever the tiles show at that moment.
 * - `staticChars` (e.g. ":") render as plain glyphs between tiles and never flip.
 * - Kept fix: `setTimeout` instead of `window.setTimeout` (the DOM typing
 *   breaks `next build`).
 * - No setState inside effects: the settled text is derived during render,
 *   tiles change only from timer and frame callbacks.
 * - Accessibility: the tiles are aria-hidden; a visually hidden span carries
 *   the settled text.
 * - Reduced motion: the target text renders at once, nothing flips.
 */

type TileState = {
  current: string;
  next: string;
  flipping: boolean;
  tick: number;
};

type AnimationPlan = {
  index: number;
  from: string;
  target: string;
  sequence: string[];
  start: number;
  step: number;
  done: boolean;
};

type Display = {
  /** Text fully on screen; the next flip starts from it. */
  base: string;
  /** Tiles while a flip runs; null when settled (render `base`). */
  tiles: TileState[] | null;
};

export interface SplitFlapTextProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  /** Phrases to cycle through (cycle mode). Ignored when `text` is set. */
  words?: readonly string[];
  /** A single phrase (text mode): every change flips from the current value. */
  text?: string;
  /** Seconds per flap step (spec 6.2 flap token: 60ms). */
  flipDuration?: number;
  /** Seconds between neighbouring tiles. */
  stagger?: number;
  /** Cycle mode: ms to rest on each phrase. */
  cycleDelay?: number;
  charset?: "alpha" | "alphanumeric" | "numeric" | (string & {});
  /** Random characters shown before a tile lands on its target. */
  flipsPerChar?: number;
  tileColor?: string;
  textColor?: string;
  /** The 1px line across the middle of each tile. */
  splitColor?: string;
  tileRadius?: number | string;
  gap?: number | string;
  fontSize?: number | string;
  /** Cycle mode: start over after the last phrase. */
  loop?: boolean;
  padTo?: number;
  /** Characters drawn as plain glyphs, never as tiles (a clock's colon). */
  staticChars?: string;
}

const DEFAULT_WORDS = ["22:00", "23:30"];

const CHARSETS: Record<string, string> = {
  alpha: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  alphanumeric: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  numeric: "0123456789",
};

const STYLES = `
.au-flap{display:inline-flex;align-items:center;gap:var(--au-flap-gap,3px);font-family:var(--font-sans);font-size:var(--au-flap-size,28px);font-weight:700;line-height:1;letter-spacing:0;font-variant-numeric:tabular-nums;white-space:pre;user-select:none}
.au-flap__tile{position:relative;display:inline-block;width:.74em;height:1.16em;overflow:hidden;border-radius:var(--au-flap-radius,6px);background:var(--au-flap-tile,#edece3);perspective:240px;isolation:isolate}
.au-flap__tile::before{content:"";position:absolute;z-index:8;top:calc(50% - .5px);left:0;width:100%;height:1px;background:var(--au-flap-split,#d7d7d7);pointer-events:none}
.au-flap__half,.au-flap__flap{position:absolute;left:0;width:100%;height:50%;overflow:hidden;background:var(--au-flap-tile,#edece3);backface-visibility:hidden}
.au-flap__half--top,.au-flap__flap--front{top:0}
.au-flap__half--bottom,.au-flap__flap--back{bottom:0}
.au-flap__char{position:absolute;left:0;width:100%;height:200%;display:flex;align-items:center;justify-content:center;color:var(--au-flap-ink,#101010)}
.au-flap__half--top .au-flap__char,.au-flap__flap--front .au-flap__char{top:0}
.au-flap__half--bottom .au-flap__char,.au-flap__flap--back .au-flap__char{bottom:0}
.au-flap__flap{z-index:6;transform-style:preserve-3d;will-change:transform}
.au-flap__flap--front{transform-origin:center bottom;animation:au-flap-front var(--au-flap-duration,.06s) cubic-bezier(.23,1,.32,1) both}
.au-flap__flap--back{transform-origin:center top;transform:rotateX(90deg);animation:au-flap-back var(--au-flap-duration,.06s) cubic-bezier(.23,1,.32,1) both}
.au-flap__static{display:inline-block;width:.3em;text-align:center;color:var(--au-flap-ink,#101010)}
@keyframes au-flap-front{0%{transform:rotateX(0deg)}100%{transform:rotateX(-90deg)}}
@keyframes au-flap-back{0%,45%{transform:rotateX(90deg)}100%{transform:rotateX(0deg)}}
@media (prefers-reduced-motion:reduce){.au-flap__flap{animation:none!important}}
`;

const toCssUnit = (value: number | string) => (typeof value === "number" ? `${value}px` : value);

const resolveCharset = (charset: SplitFlapTextProps["charset"]) => {
  if (charset && CHARSETS[charset]) return CHARSETS[charset];
  return typeof charset === "string" && charset.length > 0 ? charset : CHARSETS.alphanumeric;
};

const normalizePhrase = (phrase: string, width: number) => String(phrase ?? "").padEnd(width, " ").slice(0, width);

const createTiles = (phrase: string): TileState[] =>
  phrase.split("").map((char) => ({ current: char, next: char, flipping: false, tick: 0 }));

const sampleChar = (charset: string) => charset.charAt(Math.floor(Math.random() * charset.length)) || " ";

const buildSequence = (target: string, flips: number, charset: string) => {
  const steps: string[] = [];
  for (let i = 0; i < flips; i += 1) steps.push(sampleChar(charset));
  steps.push(target);
  return steps;
};

const tilesText = (tiles: readonly TileState[]) => tiles.map((tile) => tile.current).join("");

const SplitFlapText = ({
  words = DEFAULT_WORDS,
  text,
  flipDuration = 0.06,
  stagger = 0.06,
  cycleDelay = 2400,
  charset = "alphanumeric",
  flipsPerChar = 4,
  tileColor = "#EDECE3",
  textColor = "#101010",
  splitColor = "#D7D7D7",
  tileRadius = 6,
  gap = 3,
  fontSize = 28,
  loop = false,
  padTo = 0,
  staticChars = "",
  className,
  style,
  ...props
}: SplitFlapTextProps) => {
  const reduced = usePrefersReducedMotion();
  const rafRef = useRef<number | null>(null);
  const cycleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** What the tiles show right now (also mid-flip); the start of the next flip. */
  const liveTextRef = useRef<string | null>(null);

  const sourceWords = Array.isArray(words) && words.length > 0 ? words : DEFAULT_WORDS;
  const phrasesKey = typeof text === "string" ? text : sourceWords.map((word) => String(word ?? "")).join("\u001f");
  const phrases = useMemo(() => phrasesKey.split("\u001f"), [phrasesKey]);

  const width = useMemo(() => {
    const longest = phrases.reduce((max, phrase) => Math.max(max, phrase.length), 1);
    return Math.max(1, Math.ceil(Number(padTo) || 0), longest);
  }, [padTo, phrases]);

  const normalizedPhrases = useMemo(() => phrases.map((phrase) => normalizePhrase(phrase, width)), [phrases, width]);
  const firstPhrase = normalizedPhrases[0] ?? "";

  const [display, setDisplay] = useState<Display>(() => ({ base: firstPhrase, tiles: null }));

  useEffect(() => {
    const flipMs = Math.max(40, (Number(flipDuration) || 0.06) * 1000);
    const staggerMs = Math.max(0, (Number(stagger) || 0) * 1000);
    const restMs = Math.max(400, Number(cycleDelay) || 2400);
    const flips = Math.max(0, Math.floor(Number(flipsPerChar) || 0));
    const activeCharset = resolveCharset(charset);
    let cancelled = false;

    const stopFrame = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    const stopTimer = () => {
      if (cycleTimerRef.current !== null) {
        clearTimeout(cycleTimerRef.current);
        cycleTimerRef.current = null;
      }
    };

    /** Flip from whatever is on screen to `target`. Returns the flip's length in ms. */
    const animateTo = (target: string): number => {
      const from = normalizePhrase(liveTextRef.current ?? firstPhrase, width);
      if (reduced || from === target) {
        liveTextRef.current = target;
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          if (!cancelled) setDisplay({ base: target, tiles: null });
        });
        return 0;
      }

      const plans = target
        .split("")
        .map<AnimationPlan | null>((targetChar, index) => {
          const fromChar = from[index] ?? " ";
          if (fromChar === targetChar || staticChars.includes(targetChar)) return null;
          return {
            index,
            from: fromChar,
            target: targetChar,
            sequence: buildSequence(targetChar, flips, activeCharset),
            start: index * staggerMs,
            step: -1,
            done: false,
          };
        })
        .filter((plan): plan is AnimationPlan => plan !== null);

      const total = plans.reduce((max, plan) => Math.max(max, plan.start + plan.sequence.length * flipMs), 0);
      // Tiles start from the screen; characters with no plan (unchanged or static) land at once.
      const planned = new Set(plans.map((plan) => plan.index));
      const working = createTiles(from).map((tile, index) =>
        planned.has(index) ? tile : { current: target[index], next: target[index], flipping: false, tick: 0 },
      );
      const startedAt = performance.now();

      const tick = (now: number) => {
        if (cancelled) return;
        const elapsed = now - startedAt;
        let changed = false;
        let running = false;

        for (const plan of plans) {
          const local = elapsed - plan.start;
          if (local < 0) {
            running = true;
            continue;
          }
          const step = Math.floor(local / flipMs);
          if (step < plan.sequence.length) {
            running = true;
            if (step !== plan.step) {
              plan.step = step;
              const tile = working[plan.index];
              working[plan.index] = {
                current: step === 0 ? plan.from : plan.sequence[step - 1],
                next: plan.sequence[step],
                flipping: true,
                tick: tile.tick + 1,
              };
              changed = true;
            }
          } else if (!plan.done) {
            plan.done = true;
            const tile = working[plan.index];
            working[plan.index] = { current: plan.target, next: plan.target, flipping: false, tick: tile.tick + 1 };
            changed = true;
          }
        }

        liveTextRef.current = tilesText(working);
        if (running) {
          if (changed) setDisplay({ base: from, tiles: working.map((tile) => ({ ...tile })) });
          rafRef.current = requestAnimationFrame(tick);
        } else {
          rafRef.current = null;
          liveTextRef.current = target;
          setDisplay({ base: target, tiles: null });
        }
      };

      rafRef.current = requestAnimationFrame(tick);
      return total;
    };

    stopFrame();
    stopTimer();

    if (normalizedPhrases.length <= 1) {
      // Text mode: the first render shows the text; later changes flip.
      if (liveTextRef.current === null) liveTextRef.current = firstPhrase;
      else animateTo(firstPhrase);
    } else {
      // Cycle mode (the original behaviour): rest, flip to the next phrase, repeat.
      liveTextRef.current ??= firstPhrase;
      let phraseIndex = Math.max(0, normalizedPhrases.indexOf(normalizePhrase(liveTextRef.current, width)));
      const scheduleNext = (delay: number) => {
        cycleTimerRef.current = setTimeout(() => {
          if (cancelled) return;
          const nextIndex = phraseIndex + 1;
          if (nextIndex >= normalizedPhrases.length && !loop) return;
          phraseIndex = nextIndex % normalizedPhrases.length;
          scheduleNext(restMs + animateTo(normalizedPhrases[phraseIndex]));
        }, delay);
      };
      scheduleNext(restMs);
    }

    return () => {
      cancelled = true;
      stopFrame();
      stopTimer();
    };
  }, [normalizedPhrases, firstPhrase, width, loop, cycleDelay, flipDuration, stagger, flipsPerChar, charset, staticChars, reduced]);

  // Screen readers get the target at once (text mode) or the phrase on screen (cycle mode).
  const settled = normalizedPhrases.length <= 1 ? firstPhrase : display.base;
  // Reduced motion: that text, no flip. Otherwise the running flip, else the text on screen.
  const tiles = reduced ? createTiles(settled) : (display.tiles ?? createTiles(display.base));

  const componentStyle: CSSProperties & Record<string, string | number | undefined> = {
    "--au-flap-tile": tileColor,
    "--au-flap-ink": textColor,
    "--au-flap-split": splitColor,
    "--au-flap-radius": toCssUnit(tileRadius),
    "--au-flap-gap": toCssUnit(gap),
    "--au-flap-size": toCssUnit(fontSize),
    "--au-flap-duration": `${Math.max(0.04, Number(flipDuration) || 0.06)}s`,
    ...style,
  };

  return (
    <span className={cx("inline-flex", className)} {...props}>
      <style href="au-split-flap" precedence="default">
        {STYLES}
      </style>
      <span className="sr-only">{settled.trimEnd()}</span>
      <span className="au-flap" style={componentStyle} aria-hidden="true">
        {tiles.map((tile, index) =>
          staticChars.includes(tile.current) && !tile.flipping ? (
            <span className="au-flap__static" key={`${index}-${tiles.length}`}>
              {tile.current}
            </span>
          ) : (
            <span className="au-flap__tile" key={`${index}-${tiles.length}`}>
              <span className="au-flap__half au-flap__half--top">
                <span className="au-flap__char">{tile.current === " " ? " " : tile.current}</span>
              </span>
              <span className="au-flap__half au-flap__half--bottom">
                <span className="au-flap__char">{tile.flipping ? tile.next : tile.current}</span>
              </span>
              {tile.flipping ? (
                <>
                  <span className="au-flap__flap au-flap__flap--front" key={`front-${index}-${tile.tick}`}>
                    <span className="au-flap__char">{tile.current === " " ? " " : tile.current}</span>
                  </span>
                  <span className="au-flap__flap au-flap__flap--back" key={`back-${index}-${tile.tick}`}>
                    <span className="au-flap__char">{tile.next === " " ? " " : tile.next}</span>
                  </span>
                </>
              ) : null}
            </span>
          ),
        )}
      </span>
    </span>
  );
};

export default SplitFlapText;
