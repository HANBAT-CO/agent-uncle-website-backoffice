"use client";

import { createContext, use, type Dispatch, type RefObject } from "react";

import type { ReceiptAction, ReceiptState, TearSource } from "./receipt-state";

/**
 * The receipt section's local state, shared by its client leaves: the slip's
 * controls (server-rendered inside the slip), the TearTicket leaf and the
 * what-if panel. Provided by ReceiptProvider. The story store only ever sees
 * beatFor(state), written by the provider.
 */
export type ReceiptContextValue = {
  state: ReceiptState;
  dispatch: Dispatch<ReceiptAction>;
  /**
   * Tear without a stub button press (a drag or swipe by default, or the
   * auto-tear). The issue row turns into static text and an open sample
   * closes on the tear, so if either had focus, focus moves to the slip's
   * title row first.
   */
  tear: (by?: TearSource) => void;
  /** id of the what-if panel host (the issue row's aria-controls). */
  panelId: string;
  /** The slip's title row; focus lands here when a focused stub button tears. */
  statusRef: RefObject<HTMLDivElement | null>;
  /** The issue row button; focus returns here when the sample closes. */
  issueRef: RefObject<HTMLButtonElement | null>;
};

export const ReceiptContext = createContext<ReceiptContextValue | null>(null);

export function useReceipt(): ReceiptContextValue {
  const value = use(ReceiptContext);
  if (!value) throw new Error("useReceipt must be used inside <ReceiptProvider>.");
  return value;
}
