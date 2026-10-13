import { trust } from "@/content/copy";

/**
 * 끊겨도 한 번만 (spec S8 proof index, 두 번 생기지 않아요). Pure and test-first
 * (idempotency.test.ts).
 *
 * The demo's one request carries one operation id. A send while the switch
 * says 연결 끊기 fails with the app's network string and keeps the input; a
 * send while online saves the operation only if no request with that id is
 * saved yet. However often it is retried, exactly one request is saved.
 */

export type IdempotencyState = Readonly<{
  online: boolean;
  /** 보낸 횟수: every press of 요청 보내기. */
  attempts: number;
  /** 저장된 요청: distinct operations the server kept (always savedOps.length). */
  saved: number;
  /** The operation id of the request being sent (the same for every retry). */
  opId: string;
  savedOps: readonly string[];
  /** The app's network failure string after an offline send, until a send succeeds. */
  error: string | null;
}>;

export type IdempotencyEvent = { type: "send" } | { type: "toggle" } | { type: "setOnline"; online: boolean };

export const OFFLINE_ERROR: string = trust.idempotency.offline;

export const INITIAL_IDEMPOTENCY: IdempotencyState = Object.freeze({
  online: true,
  attempts: 0,
  saved: 0,
  opId: "lead-request-1",
  savedOps: Object.freeze([]) as readonly string[],
  error: null,
});

function withOnline(state: IdempotencyState, online: boolean): IdempotencyState {
  return state.online === online ? state : { ...state, online };
}

export function reduceIdempotency(state: IdempotencyState, event: IdempotencyEvent): IdempotencyState {
  switch (event.type) {
    case "toggle":
      return withOnline(state, !state.online);
    case "setOnline":
      return withOnline(state, event.online);
    case "send": {
      const attempts = state.attempts + 1;
      if (!state.online) return { ...state, attempts, error: OFFLINE_ERROR };
      if (state.savedOps.includes(state.opId)) return { ...state, attempts, error: null };
      const savedOps = [...state.savedOps, state.opId];
      return { ...state, attempts, savedOps, saved: savedOps.length, error: null };
    }
  }
}
