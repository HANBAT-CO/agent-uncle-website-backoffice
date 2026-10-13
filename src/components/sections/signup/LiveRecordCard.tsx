"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { fill, signup } from "@/content/copy";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/cn";
import { easing } from "@/lib/motion";
import type { StoryState } from "@/lib/story/store";
import { useStorySelector } from "@/lib/story/use-story";

import { useSignupStatus } from "./signup-status";

/**
 * The visitor's 사전 신청 as a record card (spec S10): the request is written
 * in the same log as the night's records. It mirrors the draft lines the form
 * publishes to the story store (역할: 선택 전 until a role is chosen) and, after
 * a send, becomes the success card in place (700ms on the record curve; the
 * deep-green outline fades over 1.2s like a record that moves the ledger).
 *
 * Where it shows:
 * - 1024 to 1279px: beside the form, sticky at 120px (no rail at that width)
 * - below 1024px: only after a success
 * - 1280px and up: never; the record rail's draft card does this job
 *
 * Below 1024px the draft card is never drawn (display none) and leaves at
 * once on a send, so the wrapper turning visible for the success card never
 * shows a fading draft (typed contact and all) under the sheet.
 */

const SIDE_CARD_QUERY = "(min-width: 1024px)";

const selectDraft = (state: StoryState) => state.draft;

const EMPTY_LINES: readonly string[] = [
  fill(signup.draft.line, { label: signup.draft.labels.role, value: signup.draft.empty }),
];

export function LiveRecordCard({ className }: { className?: string }) {
  const draft = useStorySelector(selectDraft);
  const { sentAt } = useSignupStatus();
  const reducedMotion = useReducedMotion() ?? false;
  const sideCard = useMediaQuery(SIDE_CARD_QUERY, false);
  const sent = sentAt !== null;
  const lines = draft?.lines ?? EMPTY_LINES;
  const swap = { duration: reducedMotion ? 0 : 0.35, ease: easing.snap };

  return (
    <div
      data-live-record=""
      data-state={sent ? "sent" : "draft"}
      className={cn(sent ? "block" : "hidden lg:block", "xl:hidden", className)}
    >
      <AnimatePresence mode="wait" initial={false}>
        {sent ? (
          <motion.article
            key={`sent-${sentAt}`}
            aria-label={signup.success.title}
            className="flex max-w-[336px] flex-col gap-0.5 rounded-card border bg-record px-4 py-3.5 text-record-fg shadow-card"
            initial={reducedMotion ? false : { opacity: 0, y: 16, borderColor: "rgb(12 72 62 / 1)" }}
            animate={{
              opacity: 1,
              y: 0,
              borderColor: "rgb(12 72 62 / 0)",
              transition: { ...swap, borderColor: { duration: reducedMotion ? 0 : 1.2, ease: easing.outExpo } },
            }}
            exit={{ opacity: 0, y: -8, transition: swap }}
          >
            <p className="text-caption text-record-meta">{fill(signup.success.meta, { time: sentAt })}</p>
            <p className="text-[15px] leading-[1.45] font-bold">{signup.success.title}</p>
            <p className="mt-1.5 text-[14px] leading-[1.55] text-grey-800">{signup.success.line}</p>
          </motion.article>
        ) : (
          <motion.article
            key="draft"
            aria-label={signup.draft.title}
            className="hidden max-w-[336px] flex-col gap-0.5 rounded-card border border-dashed border-grey-400 bg-record px-4 py-3.5 text-record-fg lg:flex"
            initial={reducedMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0, transition: swap }}
            exit={sideCard ? { opacity: 0, y: -8, transition: swap } : undefined}
          >
            <p className="text-caption text-record-meta">{signup.draft.meta}</p>
            <p className="text-[15px] leading-[1.45] font-bold">{signup.draft.title}</p>
            <ul className="mt-1.5 flex flex-col gap-0.5 text-[14px] leading-[1.55] text-grey-800">
              {lines.map((line) => (
                <li key={line} className="break-all">
                  {line}
                </li>
              ))}
            </ul>
          </motion.article>
        )}
      </AnimatePresence>
    </div>
  );
}
