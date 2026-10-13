"use client";

import { useEffect, useId, useMemo, useRef, type PointerEvent as ReactPointerEvent } from "react";

import { useSmoothScroll } from "@/components/motion/SmoothScroll";
import { plate } from "@/content/copy";
import { MQ } from "@/lib/gsap-plugins";
import { railEntries } from "@/lib/story/derive";
import { useStorySelector } from "@/lib/story/use-story";

import { entryJump, shouldCloseSheet, toChromeEntries, type ChromeEntry } from "./chrome-model";
import { useScrollToEntry } from "./hooks";
import { RailEntryView } from "./RailEntryView";
import { RecordPlate } from "./RecordPlate";

/**
 * The record sheet (spec 5.4): a native <dialog> opened with showModal, so the
 * browser traps focus and Esc closes it. It slides up from the bottom (700ms
 * snap, @starting-style in chrome.css) and holds the full plate and the record
 * list, newest at the bottom. Closing: Esc, the 닫기 button, a tap on the
 * backdrop, or an 80px downward swipe on the handle. Lenis stops while it is
 * open. Opened from the mobile pill and, from 1280px, the footer's 업무 기록 n.
 *
 * Test hook: dialog[data-record-sheet].
 */

const CLOSE_MS = 700;
/** An older card showing less than this under the top fade reads as a broken card. */
const SLIVER_PX = 44;

/**
 * Open at the newest entry. If that leaves only a sliver of an older card under
 * the 16px top fade (no whole text line), pad the list's foot so the sliver
 * scrolls away too.
 */
function scrollToNewest(body: HTMLElement, list: HTMLElement) {
  list.style.removeProperty("padding-bottom");
  body.scrollTop = body.scrollHeight;
  const top = body.getBoundingClientRect().top;
  for (const item of list.children) {
    const visible = item.getBoundingClientRect().bottom - top;
    if (visible <= 0) continue;
    if (visible < SLIVER_PX && item !== list.lastElementChild) {
      list.style.paddingBottom = `${Math.ceil(visible) + 8}px`;
      body.scrollTop = body.scrollHeight;
    }
    break;
  }
}

export function RecordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const title = useRef<HTMLParagraphElement>(null);
  const closing = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const after = useRef<(() => void) | null>(null);
  const drag = useRef<{ id: number; startY: number; dy: number } | null>(null);
  const titleId = useId();
  const { lenis } = useSmoothScroll();
  const scrollToEntry = useScrollToEntry();

  const entries = useStorySelector(railEntries);
  const items = useMemo(() => toChromeEntries(entries, null, false), [entries]);

  // Open and close with the parent's state.
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) {
      node.removeAttribute("data-closing");
      panel.current?.style.removeProperty("transform");
      node.showModal();
      // Start reading at the sheet's name (not the whole sheet as one string); Tab reaches 닫기 next.
      (title.current ?? panel.current)?.focus({ preventScroll: true });
      lenis?.stop();
      if (body.current && list.current) scrollToNewest(body.current, list.current);
    } else if (!open && node.open) {
      node.close();
    }
  }, [open, lenis]);

  useEffect(() => () => clearTimeout(closing.current), []);

  /** Slide the panel down, then close the dialog (the close event tells the parent). */
  const requestClose = (then?: () => void) => {
    const node = dialog.current;
    if (!node?.open || node.hasAttribute("data-closing")) return;
    after.current = then ?? null;
    const reduce = window.matchMedia(MQ.reduced).matches;
    node.setAttribute("data-closing", "");
    clearTimeout(closing.current);
    closing.current = setTimeout(() => node.close(), reduce ? 0 : CLOSE_MS);
  };

  const onDialogClose = () => {
    const node = dialog.current;
    node?.removeAttribute("data-closing");
    panel.current?.style.removeProperty("transform");
    panel.current?.style.removeProperty("transition");
    lenis?.start();
    onClose();
    const next = after.current;
    after.current = null;
    next?.();
  };

  const activate = (entry: ChromeEntry) => requestClose(() => scrollToEntry(entryJump(entry)));

  const onHandleDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    drag.current = { id: event.pointerId, startY: event.clientY, dy: 0 };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic or already released pointers cannot be captured; the drag still works without capture.
    }
    if (panel.current) panel.current.style.transition = "none";
  };

  const onHandleMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || state.id !== event.pointerId || !panel.current) return;
    state.dy = Math.max(0, event.clientY - state.startY);
    panel.current.style.transform = `translateY(${state.dy}px)`;
  };

  const onHandleUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    drag.current = null;
    const node = panel.current;
    if (!node) return;
    node.style.removeProperty("transition");
    if (shouldCloseSheet(state.dy)) {
      node.style.removeProperty("transform");
      requestClose();
    } else {
      node.style.removeProperty("transform");
    }
  };

  return (
    <dialog
      ref={dialog}
      data-record-sheet
      aria-labelledby={titleId}
      className="au-sheet"
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClose={onDialogClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        className="au-sheet-panel flex outline-none max-h-[min(86dvh,760px)] w-full max-w-[560px] flex-col rounded-t-card bg-paper text-ink [--focus:#0C483E]"
      >
        <div
          aria-hidden="true"
          className="flex h-8 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
        >
          <span className="h-1 w-10 rounded-pill bg-grey-300" />
        </div>
        <div className="flex shrink-0 items-center justify-between gap-4 pr-3 pb-2 pl-6">
          <p ref={title} id={titleId} tabIndex={-1} className="text-[17px] leading-[1.4] font-bold text-ink outline-none">
            {plate.label}
          </p>
          <button
            type="button"
            onClick={() => requestClose()}
            className="inline-flex h-11 items-center rounded-pill px-4 text-[15px] leading-none font-bold text-ink transition-[scale,background-color] duration-(--duration-fast) ease-snap hover:bg-[rgb(16_16_16/0.06)] active:scale-[0.98]"
          >
            {plate.sheet.close}
          </button>
        </div>
        <div className="shrink-0 px-4 pb-3">
          <RecordPlate variant="sheet" live={open} />
        </div>
        <div
          ref={body}
          data-lenis-prevent
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-1 pb-[calc(20px+env(safe-area-inset-bottom))] [mask-image:linear-gradient(to_bottom,transparent_0,#000_16px)]"
        >
          <ol ref={list} className="flex flex-col gap-2" aria-label={plate.label}>
            {items.map((entry) => (
              <li key={entry.key} data-sheet-entry={entry.key}>
                <RailEntryView entry={entry} onActivate={activate} ground="paper" />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </dialog>
  );
}
