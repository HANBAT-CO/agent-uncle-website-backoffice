"use client";

import { useRef, type KeyboardEvent } from "react";

import type { MapBuildingId } from "@/components/map/views";
import { hero, map } from "@/content/copy";

import { lensStore, useLensSelected } from "./lens-store";

/**
 * Phones (spec S1 mobile): a chip row 디오트 / 청평화 / 남평화 / APM under the
 * map, a radiogroup that moves the static lens and swaps the readout (700ms,
 * instant under reduced motion). Default 청평화. Arrow keys move the checked
 * chip (selection follows focus, roving tabindex). Hidden from 768px, where
 * the building buttons on the map do the same job.
 */

const ORDER: readonly MapBuildingId[] = map.order;

const STEP: Partial<Record<string, number>> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

export function HeroChips() {
  const selected = useLensSelected();
  const chips = useRef<Array<HTMLButtonElement | null>>([]);

  const choose = (index: number) => {
    const id = ORDER[index];
    if (!id) return;
    lensStore.select(id);
    chips.current[index]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = ORDER.length - 1;
    const step = STEP[event.key];
    let next: number | null = null;
    if (step !== undefined) next = (index + step + ORDER.length) % ORDER.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    if (next === null) return;
    event.preventDefault();
    choose(next);
  };

  return (
    <div role="radiogroup" aria-label={hero.chipsLabel} className="hero-chips" data-hero-chips>
      {ORDER.map((id, index) => {
        const checked = id === selected;
        return (
          <button
            key={id}
            ref={(node) => {
              chips.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            className="hero-chip"
            data-building-chip={id}
            onClick={() => choose(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {map.buildings[id]}
          </button>
        );
      })}
    </div>
  );
}
