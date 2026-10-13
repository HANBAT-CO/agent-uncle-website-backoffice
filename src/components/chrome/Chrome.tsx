"use client";

import "./chrome.css";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { plate } from "@/content/copy";
import { railEntries } from "@/lib/story/derive";
import { useStorySelector } from "@/lib/story/use-story";

import { entryKey, newestAddedEntry, entryTitle, toChromeEntries } from "./chrome-model";
import { useHydrated, useKeyScrollSync } from "./hooks";
import { Nav } from "./Nav";
import { PhaseSync } from "./PhaseSync";

/**
 * The persistent record chrome (spec 5): the nav, the record column (rail and
 * plate, min 1024px), the mobile pill and sheet, the rail's live region and
 * the phase sync. It reads only the story store (useStorySelector + derive.ts)
 * and never imports a section.
 *
 * Hydration gate: the server renders the nav only (plain anchors that work
 * without JS). Everything that shows story state mounts after hydration,
 * under [data-chrome-root][data-hydrated], so a no-JS visitor never sees a
 * 22:00 record while reading the morning. It is portalled to the end of
 * <body>: the record column is complementary, after main in reading and tab
 * order; a second skip link before the nav reaches it from the top.
 */

const ANNOUNCE_DEBOUNCE_MS = 800;
const RecordColumn = dynamic(() => import("./RecordColumn").then((module) => module.RecordColumn), { ssr: false });
const MobileRecordPill = dynamic(() => import("./MobileRecordPill").then((module) => module.MobileRecordPill), { ssr: false });
const RecordSheet = dynamic(() => import("./RecordSheet").then((module) => module.RecordSheet), { ssr: false });

/** Polite live region: the newest entry's title, 800ms after entries are added. Removals stay silent. */
function RailAnnouncer() {
  const entries = useStorySelector(railEntries);
  const items = useMemo(() => toChromeEntries(entries, null, false), [entries]);
  const [message, setMessage] = useState({ text: "", serial: 0 });
  const previous = useRef<string[] | null>(null);
  const latest = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const keys = items.map(entryKey);
    latest.current = new Set(keys);
    const before = previous.current;
    previous.current = keys;
    if (before === null) return;
    const added = newestAddedEntry(before, items);
    if (!added) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      // Scrolled back before the announcement: the entry is gone, say nothing.
      if (!latest.current.has(added.key)) return;
      setMessage((current) => ({ text: entryTitle(added), serial: current.serial + 1 }));
    }, ANNOUNCE_DEBOUNCE_MS);
  }, [items]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true" data-rail-live>
      {message.text ? <p key={message.serial}>{message.text}</p> : null}
    </div>
  );
}

type SheetControls = {
  sheetOpen: boolean;
  onOpenSheet: (opener: HTMLElement) => void;
  onCloseSheet: () => void;
};

function DynamicChrome({ sheetOpen, onOpenSheet, onCloseSheet }: SheetControls) {
  return (
    <div data-chrome-root data-hydrated="">
      <RecordColumn onOpenSheet={onOpenSheet} />
      <MobileRecordPill onOpenSheet={onOpenSheet} />
      <RecordSheet open={sheetOpen} onClose={onCloseSheet} />
      <RailAnnouncer />
    </div>
  );
}

/** Pending copy.ts plate.skip (requested); the same wording until it lands. */
const SKIP_LABEL: string = (plate as { readonly skip?: string }).skip ?? `${plate.label}으로 건너뛰기`;

function isShown(element: HTMLElement): boolean {
  if (typeof element.checkVisibility === "function") return element.checkVisibility({ visibilityProperty: true });
  return element.getClientRects().length > 0 && getComputedStyle(element).visibility === "visible";
}

/**
 * Where the record skip link takes the keyboard (from 1024px): the newest rail
 * card, else the spine, the 업무 기록 n pill or the plate's first ledger label,
 * whichever is on screen. Null when the column shows nothing (film, phones).
 */
function recordFocusTarget(): HTMLElement | null {
  const column = document.querySelector<HTMLElement>("[data-record-column]");
  if (!column || !isShown(column)) return null;
  const candidates = [
    ...[...column.querySelectorAll<HTMLElement>(".au-rail-list > li[data-rail-entry] button")].reverse(),
    column.querySelector<HTMLElement>(".au-spine"),
    column.querySelector<HTMLElement>("[data-rail-pill]"),
    ...column.querySelectorAll<HTMLElement>("[data-plate] button"),
  ];
  return candidates.find((element): element is HTMLElement => element !== null && isShown(element)) ?? null;
}

/**
 * Second skip link (a11y): the record chrome is portalled after the footer, so
 * in forward Tab order it is only reached once it has folded into the footer
 * pill. This one, right after 본문으로 건너뛰기, moves focus into the record on
 * screen (rail, spine or plate) or, where none is, opens the sheet. Visually
 * hidden until focused, like the first.
 */
function RecordSkipLink({ onOpenSheet }: { onOpenSheet: (opener: HTMLElement) => void }) {
  return (
    <button
      type="button"
      className="skip-link"
      onClick={(event) => {
        const target = recordFocusTarget();
        if (target) target.focus({ preventScroll: true });
        else onOpenSheet(event.currentTarget);
      }}
    >
      {SKIP_LABEL}
    </button>
  );
}

export function Chrome() {
  const hydrated = useHydrated();
  useKeyScrollSync();
  const [sheetOpen, setSheetOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);

  const openSheet = useCallback((from: HTMLElement) => {
    opener.current = from;
    setSheetOpen(true);
  }, []);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    const from = opener.current;
    opener.current = null;
    if (!from) return;
    // The dialog hands focus back itself in Chromium. WebKit leaves it on the
    // closed panel and drops it to <body> after the close event: refocus the
    // opener once that has happened (never if the visitor moved on).
    const restore = () => {
      const active = document.activeElement;
      const lost = active === null || active === document.body || active.closest("dialog[data-record-sheet]") !== null;
      if (from.isConnected && lost) from.focus({ preventScroll: true });
    };
    restore();
    requestAnimationFrame(restore);
  }, []);

  return (
    <>
      {hydrated ? <RecordSkipLink onOpenSheet={openSheet} /> : null}
      <Nav />
      <PhaseSync />
      {hydrated
        ? createPortal(<DynamicChrome sheetOpen={sheetOpen} onOpenSheet={openSheet} onCloseSheet={closeSheet} />, document.body)
        : null}
    </>
  );
}
