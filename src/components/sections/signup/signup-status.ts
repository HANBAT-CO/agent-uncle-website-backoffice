import { useSyncExternalStore } from "react";

/**
 * The 사전 신청 form's status, shared by the three client islands of S10:
 * LeadForm writes it; StickySubmit (mobile bar) and LiveRecordCard (side
 * card, success card) read it. A tiny external store keeps the islands
 * independent of each other's position in the tree.
 *
 * - pending: the action is in flight (button reads 보내는 중, inputs readOnly)
 * - sentAt: HH:MM of this page view's successful send, else null
 *
 * Client components only (useSignupStatus). The server snapshot is idle.
 */

export const LEAD_FORM_ID = "lead-form";

export type SignupStatus = Readonly<{ pending: boolean; sentAt: string | null }>;

const IDLE: SignupStatus = Object.freeze({ pending: false, sentAt: null });

let current: SignupStatus = IDLE;
const listeners = new Set<() => void>();

export const signupStatus = {
  get: (): SignupStatus => current,
  set(patch: Partial<SignupStatus>): void {
    const next = { ...current, ...patch };
    if (next.pending === current.pending && next.sentAt === current.sentAt) return;
    current = Object.freeze(next);
    for (const listener of [...listeners]) listener();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useSignupStatus(): SignupStatus {
  return useSyncExternalStore(signupStatus.subscribe, signupStatus.get, () => IDLE);
}

/** HH:MM in the visitor's local time (the success card and the visitor record). */
export function formatClock(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
