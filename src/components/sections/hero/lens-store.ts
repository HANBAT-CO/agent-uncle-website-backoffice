import { useSyncExternalStore } from "react";

import type { MapBuildingId } from "@/components/map/views";

/**
 * Which building the S1 lens is on (spec S1). A tiny external store shared by
 * the hero's client leaves: the desktop lens (pointer pick), the building
 * buttons, the mobile chips and both readout cards. Discrete values only; the
 * lens position itself never goes through React.
 *
 * - selected: the building chosen by a button, a chip or keyboard focus. The
 *   lens rests there (청평화 until the visitor picks another).
 * - shown: the building whose record the readout shows: the pointer pick
 *   while the lens follows the pointer (null over empty ground), otherwise the
 *   selected building.
 * - request: bumped on every select, so each lens moves even when the same
 *   building is chosen again after a hover.
 */

export const REST_BUILDING: MapBuildingId = "cheongpyeonghwa";

export type LensState = {
  readonly selected: MapBuildingId;
  readonly shown: MapBuildingId | null;
  readonly request: number;
};

const INITIAL: LensState = { selected: REST_BUILDING, shown: REST_BUILDING, request: 0 };

let state: LensState = INITIAL;
const listeners = new Set<() => void>();

function set(next: LensState): void {
  if (next.selected === state.selected && next.shown === state.shown && next.request === state.request) return;
  state = next;
  for (const listener of listeners) listener();
}

export const lensStore = {
  getState: (): LensState => state,
  getServerState: (): LensState => INITIAL,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  /** A button, chip or focus chose a building: the lens moves there and rests there. */
  select(id: MapBuildingId): void {
    set({ selected: id, shown: id, request: state.request + 1 });
  },
  /** The pointer pick under a following lens (null: empty ground). */
  show(id: MapBuildingId | null): void {
    set({ ...state, shown: id });
  },
  /** The pointer left: the readout returns to the selected building. */
  rest(): void {
    set({ ...state, shown: state.selected });
  },
  /** Tests only. */
  reset(): void {
    set(INITIAL);
  },
};

const getShown = () => state.shown;
const getServerShown = () => INITIAL.shown;
const getSelected = () => state.selected;
const getServerSelected = () => INITIAL.selected;

/** The building whose record the readout shows (null: none). */
export function useLensShown(): MapBuildingId | null {
  return useSyncExternalStore(lensStore.subscribe, getShown, getServerShown);
}

/** The building the lens rests on (the checked chip). */
export function useLensSelected(): MapBuildingId {
  return useSyncExternalStore(lensStore.subscribe, getSelected, getServerSelected);
}
