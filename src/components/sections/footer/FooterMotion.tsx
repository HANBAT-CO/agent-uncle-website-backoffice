"use client";

import { useRef } from "react";

import { gsap, ScrollTrigger, SplitText, useGSAP } from "@/lib/gsap";
import { gsapEase } from "@/lib/motion";

/**
 * S11 footer motion (GSAP leaf). Motive: the dot as the full stop, the story
 * ends where the film ends.
 *
 * As the wordmark comes into view (one line) or as each part comes into view
 * (stacked: below 768px, or 500px tall or less):
 * 1. the wordmark's syllables rise out of their line masks (yPercent 100 to 0,
 *    700ms on the record curve, 50ms apart)
 * 2. the ink dot drops from 40vh above into the period slot with the film's
 *    drop token: 420ms power2.in, a 90ms squash (scaleX 1.3, scaleY 0.7),
 *    a 380ms overshoot settle
 * 3. the one-liner types on by syllable, 18ms apart
 *
 * Why not the spec's "footer top at 80%": the slot sits a padding plus 0.66em
 * below the footer's top, so at that point the dot landed below the fold on
 * laptops and behind the open record column (the rail or the compact plate,
 * fixed over the right side from 1024px until it folds for the footer).
 *
 * On one line the syllables rise as the wordmark's top reaches 85%, each one
 * once nothing of the record column is open over it: all four at once where
 * the column has already folded or does not reach them (below 1024px, wide
 * screens), else 사입삼 first and 춘 as the column folds, on the same 50ms
 * stagger and after the column's slide has cleared it. The column's aside
 * keeps its full box when folded, so its rail and plate modes decide (watched
 * by a MutationObserver), not its box. The finale (any syllables left, the
 * drop, the one-liner) plays once the slot's bottom is at 92% (the landing
 * spot on screen) with no open column over the slot; the dot drops 300ms
 * after the last syllable has set off (450ms into a four-syllable rise, at
 * once if they all rose long before). Should the column never fold, the
 * footer's top at 45% (the footer active) still completes it.
 *
 * Every start is clamp()ed: on tall screens (1080x1920, 3840x2160) the footer
 * is shorter than about half the viewport, so "top 45%" lies past the end of
 * the page; clamped to the maximum scroll, it still fires there.
 *
 * Stacked, the wordmark closes the page instead (footer.css sets it last,
 * above or beside the legal line), so the end frame always holds it whole.
 * Each line rises as its top reaches 90% (a two-line block keyed to one point
 * would sit masked and empty on screen for a whole flick), the dot drops once
 * the slot's bottom reaches 92% (always reachable at the end of the page),
 * and the one-liner, now first in the footer, types on by itself when its top
 * reaches 90%.
 *
 * Each part plays once per entry and resets only after the footer has left
 * below the viewport, so nothing replays while in sight: re-crossing a start
 * resumes, never restarts. Reduced motion (and no JS) keeps the composed,
 * static wordmark with the dot in place. The one-liner fades by opacity only,
 * so its text stays in the accessibility tree while it types on.
 *
 * Built on approach (the footer within two screens), not at load: the splits
 * stay out of the hydration work, about 17,000px above.
 *
 * Renders a hidden marker and animates its enclosing <footer> by data
 * attributes, so the wordmark, dot and line stay server-rendered.
 */

/** The footer.css condition under which the wordmark is stacked last, on two lines. */
const STACKED = "(max-width: 767.98px), (max-height: 500px)";
/** chrome.css: the record rail and its full plate from here; below, the compact plate alone. */
const RAIL_UP = "(min-width: 1280px)";

/** Seconds between syllables. */
const STAGGER = 0.05;
/** The dot sets off this long after the last syllable (450ms into a four-syllable rise). */
const DROP_AFTER_LAST_RISE = 0.3;
/** The one-liner types on this long after the dot sets off. */
const TYPE_AFTER_DROP = 0.15;
/** A syllable counts as clear of the record column when it ends at least this far left of it. */
const LANE_GAP = 16;
/**
 * Seconds after the column folds before a syllable it covered sets off: its
 * 700ms slide on the snap curve is then past half way (about 210px of a
 * plate's 390px run), clear of the deepest overlap measured (107px of the
 * compact plate at 1024x768).
 */
const FOLD_CLEAR = 0.12;

/** The fixed record column (chrome's [data-record-column]) and its lane's left edge, where displayed (from 1024px). */
function recordColumn(): { node: HTMLElement; left: number } | null {
  const node = document.querySelector<HTMLElement>("[data-record-column]");
  const box = node?.getBoundingClientRect();
  return node && box && box.width > 0 && box.height > 0 ? { node, left: box.left - LANE_GAP } : null;
}

/**
 * The left edge of what the record column holds open over the page's right
 * side (the rail and its plate from 1280px, the compact plate from 1024 to
 * 1279px), or Infinity where nothing of it is open: below 1024px, and once
 * it has folded for the footer (from 1280px only the small 업무 기록 n pill at
 * the bottom right, below 1280px nothing).
 */
function recordLaneLeft(): number {
  const column = recordColumn();
  if (!column) return Infinity;
  const { railMode, plateMode } = column.node.dataset;
  const railOpen = window.matchMedia(RAIL_UP).matches && (railMode === "open" || railMode === "spine");
  return railOpen || plateMode !== "hidden" ? column.left : Infinity;
}

export function FooterMotion() {
  const marker = useRef<HTMLSpanElement>(null);

  useGSAP(() => {
    const footer = marker.current?.closest("footer");
    if (!footer) return;
    const heading = footer.querySelector<HTMLElement>("h2");
    const lines = [...footer.querySelectorAll<HTMLElement>("[data-footer-mask]")];
    const slot = footer.querySelector<HTMLElement>("[data-footer-slot]");
    const dot = footer.querySelector<HTMLElement>("[data-footer-dot]");
    const line = footer.querySelector<HTMLElement>("[data-footer-line]");
    if (!heading || lines.length === 0 || !slot || !dot || !line) return;

    let mm: gsap.MatchMedia | null = null;
    let cancelled = false;

    /** Splits, start state, timelines and triggers; returns their teardown. */
    const build = (stacked: boolean) => {
      // One split per line mask, so each line's syllables rise inside their own line.
      const wordmark = SplitText.create(lines, { type: "chars", tag: "span", charsClass: "footer-char", aria: "none" });
      const oneLiner = SplitText.create(line, { type: "words,chars", tag: "span", aria: "none" });
      const chars = wordmark.chars;

      // Start state until each part plays: syllables below their masks, the
      // dot hidden 40vh above its slot, the line not yet typed.
      gsap.set(chars, { yPercent: 100 });
      gsap.set(dot, { autoAlpha: 0, y: -0.4 * window.innerHeight, scaleX: 1, scaleY: 1 });
      gsap.set(oneLiner.chars, { opacity: 0 });

      const rise = (targets: Element[]) =>
        gsap.timeline({ paused: true }).to(targets, { yPercent: 0, duration: 0.7, ease: gsapEase.snap, stagger: STAGGER });
      // The dot shows by a 10ms tween, not a set(): a zero-duration set at a
      // timeline's time 0 stays applied when the timeline is rewound to 0 for
      // the reset, which left the dot floating 40vh above the wordmark.
      const drop = gsap
        .timeline({ paused: true })
        .to(dot, { autoAlpha: 1, duration: 0.01, ease: "none" }, 0)
        .to(dot, { y: 0, duration: 0.42, ease: "power2.in" }, 0)
        .to(dot, { scaleX: 1.3, scaleY: 0.7, duration: 0.09, ease: "power1.out" })
        .to(dot, { scaleX: 1, scaleY: 1, duration: 0.38, ease: gsapEase.overshoot });
      const typing = gsap.timeline({ paused: true }).to(oneLiner.chars, { opacity: 1, duration: 0.01, stagger: 0.018 });

      // What plays when. One line: each syllable as the wordmark enters and
      // the column clears it, then a finale keyed to the slot. Stacked: each
      // line rises as it enters, the one-liner types on as it enters, and the
      // dot drops once its landing spot is in view (never sooner than 0.45s
      // into the last line's rise, as in the sequence).
      const parts: { trigger: Element; start: string; onEnter: () => void; onLeaveBack?: () => void }[] = [];
      const resets: (() => void)[] = [];
      const teardowns: (() => void)[] = [];
      if (stacked) {
        const rises = lines.map((mask) => rise([...mask.querySelectorAll(".footer-char")]));
        const lastRise = rises[rises.length - 1]!;
        let pendingDrop: gsap.core.Tween | null = null;
        lines.forEach((mask, index) => parts.push({ trigger: mask, start: "clamp(top 90%)", onEnter: () => rises[index]!.play() }));
        parts.push({ trigger: line, start: "clamp(top 90%)", onEnter: () => typing.play() });
        parts.push({
          trigger: slot,
          start: "clamp(bottom 92%)",
          onEnter: () => {
            if (pendingDrop || drop.progress() > 0) return;
            lastRise.play();
            pendingDrop = gsap.delayedCall(Math.max(0, 0.45 - lastRise.time()), () => {
              pendingDrop = null;
              drop.play();
            });
          },
        });
        resets.push(() => {
          pendingDrop?.kill();
          pendingDrop = null;
          for (const timeline of [...rises, drop, typing]) timeline.pause(0);
        });
      } else {
        // Per entry: the syllables set off so far (always the leftmost ones,
        // the column lies right), when the last of them did (ticker seconds),
        // the starts crossed, and whether the finale has been set.
        let risen = 0;
        let lastStart = -Infinity;
        let entered = false;
        let landing = false;
        let fallback = false;
        let finale = false;
        let scheduled: gsap.core.Animation[] = [];

        // When the column last folded away (ticker seconds), for the syllables it was over.
        let foldedAt = -Infinity;
        let columnOpen = recordLaneLeft() !== Infinity;

        /** Sets the syllables up to `count` off, continuing the stagger, after the column's slide has cleared any it covered. */
        const riseTo = (count: number) => {
          if (count <= risen) return;
          const batch = chars.slice(risen, count);
          const now = gsap.ticker.time;
          const columnLeft = recordColumn()?.left ?? Infinity;
          const wasCovered = batch.some((char) => char.getBoundingClientRect().right > columnLeft);
          const first = Math.max(now, lastStart + STAGGER, wasCovered ? foldedAt + FOLD_CLEAR : -Infinity);
          scheduled.push(gsap.to(batch, { yPercent: 0, duration: 0.7, ease: gsapEase.snap, stagger: STAGGER, delay: first - now }));
          lastStart = first + (batch.length - 1) * STAGGER;
          risen = count;
        };

        /** Plays whatever the wordmark's position and the column now allow; safe to call any number of times. */
        const advance = () => {
          if (finale) return;
          const lane = recordLaneLeft();
          if (landing && (slot.getBoundingClientRect().right <= lane || fallback)) {
            finale = true;
            riseTo(chars.length);
            const dropIn = Math.max(0, lastStart + DROP_AFTER_LAST_RISE - gsap.ticker.time);
            const settleIn = Math.max(0, lastStart + 0.72 - gsap.ticker.time);
            scheduled.push(
              gsap.delayedCall(settleIn, () => {
                gsap.set(chars, { yPercent: 0, y: 0 });
              }),
              gsap.delayedCall(dropIn, () => void drop.play()),
              gsap.delayedCall(dropIn + TYPE_AFTER_DROP, () => void typing.play()),
            );
            return;
          }
          if (!entered) return;
          let clear = risen;
          while (clear < chars.length && chars[clear]!.getBoundingClientRect().right <= lane) clear += 1;
          riseTo(clear);
        };

        // The column folds and unfolds by its data-rail-mode and data-plate-mode
        // (watched even where it is not displayed: a resize can bring it in).
        const column = document.querySelector("[data-record-column]");
        if (column) {
          const observer = new MutationObserver(() => {
            const open = recordLaneLeft() !== Infinity;
            if (columnOpen && !open) foldedAt = gsap.ticker.time;
            columnOpen = open;
            advance();
          });
          observer.observe(column, { attributes: true, attributeFilter: ["data-rail-mode", "data-plate-mode"] });
          teardowns.push(() => observer.disconnect());
        }

        parts.push(
          {
            trigger: heading,
            start: "clamp(top 85%)",
            onEnter: () => {
              entered = true;
              advance();
            },
          },
          {
            trigger: slot,
            start: "clamp(bottom 92%)",
            onEnter: () => {
              landing = true;
              advance();
            },
            onLeaveBack: () => {
              landing = false;
            },
          },
          {
            trigger: footer,
            start: "clamp(top 45%)",
            onEnter: () => {
              fallback = true;
              advance();
            },
          },
        );
        resets.push(() => {
          for (const animation of scheduled) animation.kill();
          scheduled = [];
          risen = 0;
          lastStart = -Infinity;
          entered = false;
          landing = false;
          fallback = false;
          finale = false;
          gsap.set(chars, { yPercent: 100 });
          drop.pause(0);
          typing.pause(0);
        });
      }

      // refreshPriority -1: measured after every pin above has added its spacing.
      const triggers = [
        ...parts.map((part) => ScrollTrigger.create({ ...part, refreshPriority: -1 })),
        ScrollTrigger.create({
          trigger: footer,
          start: "top bottom",
          refreshPriority: -1,
          onLeaveBack: () => {
            for (const reset of resets) reset();
          },
        }),
      ];

      return () => {
        for (const teardown of teardowns) teardown();
        for (const trigger of triggers) trigger.kill();
        for (const reset of resets) reset();
        gsap.killTweensOf([...chars, dot, ...oneLiner.chars]);
        oneLiner.revert();
        wordmark.revert();
        gsap.set(dot, { clearProps: "all" });
      };
    };

    // Split after the 900 subset and the 700 face have loaded, so the syllable
    // boxes are measured in Paperlogy, not in the fallback.
    void document.fonts.ready.then(() => {
      if (cancelled) return;
      mm = gsap.matchMedia();
      mm.add({ motion: "(prefers-reduced-motion: no-preference)", stacked: STACKED }, (context) => {
        const conditions = context.conditions;
        if (!conditions?.motion) return;
        const stacked = Boolean(conditions.stacked);
        let teardown: (() => void) | null = null;
        const approach = ScrollTrigger.create({
          trigger: footer,
          start: "top bottom+=100%",
          once: true,
          refreshPriority: -1,
          onEnter: () => {
            if (teardown) return;
            teardown = build(stacked);
            // Built inside a scroll update: evaluate the new triggers on the next
            // frame, so a jump straight to the end plays without another scroll.
            requestAnimationFrame(() => ScrollTrigger.update());
          },
        });
        return () => {
          approach.kill();
          teardown?.();
        };
      });
    });

    return () => {
      cancelled = true;
      mm?.revert();
    };
  });

  return <span ref={marker} hidden data-footer-motion="" />;
}
