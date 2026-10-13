"use client";

import { useState } from "react";

import type { MapBuildingId } from "@/components/map/views";
import { hero, map } from "@/content/copy";

import { useLensSelected, useLensShown } from "./lens-store";

/**
 * The lens readout (spec S1): a paper card with the record under the lens, in
 * the app's list format (place / item / shop · request / status as an outlined
 * pill). Seeded demo data, covered by the honesty line in the frame.
 *
 * All four records are stacked in one grid cell so the card keeps one size;
 * a swap slides the old record up 8px and the new one in from 8px below on the
 * record token (700ms snap, hero.css). Record surfaces never change colour.
 *
 * - float (desktop): hangs 24px beside the lens; HeroLens writes its anchor
 *   (--rx, --ry) and side (data-readout-side) on the map box. Hidden while the
 *   lens is over empty ground. It follows the pointer, so it stays out of the
 *   accessibility tree: a visually hidden polite region next to it carries
 *   the chosen building's record and speaks only when a button or keyboard
 *   focus chooses one, never while a mouse sweeps across the map.
 * - dock (phones): fixed in the map frame's lower left; the chips swap it, so
 *   it is the live region itself.
 */

type Shown = MapBuildingId | null;

function Record({ id }: { id: MapBuildingId }) {
  const lens = hero.lens[id];
  return (
    <>
      <p className="hero-readout-place">{lens.place}</p>
      <p className="hero-readout-title">{lens.item}</p>
      <p className="hero-readout-request">{lens.request}</p>
      <p className="hero-readout-status">
        <span>{lens.status}</span>
      </p>
    </>
  );
}

export function LensReadout({ variant }: { variant: "float" | "dock" }) {
  const shown = useLensShown();
  const selected = useLensSelected();
  // The record that just left keeps sliding out (adjusting state while rendering, no effect).
  const [swap, setSwap] = useState<{ shown: Shown; previous: Shown }>({ shown, previous: null });
  if (swap.shown !== shown) setSwap({ shown, previous: swap.shown });
  const float = variant === "float";

  return (
    <>
      <div
        className="hero-readout"
        data-hero-readout={variant}
        data-variant={variant}
        data-shown={shown ?? "none"}
        aria-live={float ? undefined : "polite"}
        aria-hidden={float ? true : undefined}
      >
        <div className="hero-readout-card">
          <div className="hero-readout-stack">
            {map.order.map((id) => {
              const state = id === shown ? "active" : id === swap.previous ? "leaving" : "idle";
              return (
                <div key={id} className="hero-readout-item" data-state={state} data-readout={id} aria-hidden={float ? undefined : id !== shown}>
                  <Record id={id} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {float ? (
        <div className="sr-only" aria-live="polite" aria-atomic="true" data-hero-readout-live>
          <Record id={selected} />
        </div>
      ) : null}
    </>
  );
}
