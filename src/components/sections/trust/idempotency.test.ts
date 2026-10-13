import { describe, expect, it } from "vitest";

import { trust } from "@/content/copy";

import { INITIAL_IDEMPOTENCY, OFFLINE_ERROR, reduceIdempotency, type IdempotencyEvent, type IdempotencyState } from "./idempotency";

/**
 * 끊겨도 한 번만 (spec S8 proof index): one request carries one operation id;
 * sending it again, however often and after however many failures, leaves
 * exactly one saved request.
 */

const SEND: IdempotencyEvent = { type: "send" };
const OFFLINE: IdempotencyEvent = { type: "setOnline", online: false };
const ONLINE: IdempotencyEvent = { type: "setOnline", online: true };

function drive(events: readonly IdempotencyEvent[], state: IdempotencyState = INITIAL_IDEMPOTENCY): IdempotencyState {
  return events.reduce(reduceIdempotency, state);
}

describe("initial state", () => {
  it("is online with nothing sent and one operation id", () => {
    expect(INITIAL_IDEMPOTENCY.online).toBe(true);
    expect(INITIAL_IDEMPOTENCY.attempts).toBe(0);
    expect(INITIAL_IDEMPOTENCY.saved).toBe(0);
    expect(INITIAL_IDEMPOTENCY.error).toBeNull();
    expect(INITIAL_IDEMPOTENCY.opId).toMatch(/\S/);
  });
});

describe("send while online", () => {
  it("saves the request once", () => {
    const state = drive([SEND]);
    expect(state.attempts).toBe(1);
    expect(state.saved).toBe(1);
    expect(state.error).toBeNull();
  });

  it("sending the same request again counts the attempt but never saves it twice", () => {
    const state = drive([SEND, SEND, SEND]);
    expect(state.attempts).toBe(3);
    expect(state.saved).toBe(1);
  });
});

describe("send while offline", () => {
  it("fails with the app's network string and keeps nothing", () => {
    const state = drive([OFFLINE, SEND]);
    expect(state.attempts).toBe(1);
    expect(state.saved).toBe(0);
    expect(state.error).toBe("서버에 연결하지 못했어요. 입력을 유지했으니 연결 상태를 확인하고 다시 시도해 주세요.");
    expect(state.error).toBe(trust.idempotency.offline);
    expect(OFFLINE_ERROR).toBe(trust.idempotency.offline);
  });

  it("counts every failed attempt", () => {
    const state = drive([OFFLINE, SEND, SEND, SEND]);
    expect(state.attempts).toBe(3);
    expect(state.saved).toBe(0);
  });

  it("keeps the same operation id across failures", () => {
    const state = drive([OFFLINE, SEND, SEND]);
    expect(state.opId).toBe(INITIAL_IDEMPOTENCY.opId);
  });
});

describe("retry after reconnecting", () => {
  it("offline retries then one online send end in exactly one saved request", () => {
    const state = drive([OFFLINE, SEND, SEND, ONLINE, SEND]);
    expect(state.attempts).toBe(3);
    expect(state.saved).toBe(1);
    expect(state.error).toBeNull();
  });

  it("a request saved before the line dropped is not saved again when retried", () => {
    const state = drive([SEND, OFFLINE, SEND, ONLINE, SEND, SEND]);
    expect(state.attempts).toBe(4);
    expect(state.saved).toBe(1);
  });

  it("the error stays visible until the next send succeeds", () => {
    const failed = drive([OFFLINE, SEND, ONLINE]);
    expect(failed.error).toBe(OFFLINE_ERROR);
    expect(reduceIdempotency(failed, SEND).error).toBeNull();
  });
});

describe("the switch", () => {
  it("toggle flips the connection and never counts as an attempt", () => {
    const off = reduceIdempotency(INITIAL_IDEMPOTENCY, { type: "toggle" });
    expect(off.online).toBe(false);
    expect(off.attempts).toBe(0);
    const on = reduceIdempotency(off, { type: "toggle" });
    expect(on.online).toBe(true);
  });

  it("setOnline to the current value returns the same state", () => {
    expect(reduceIdempotency(INITIAL_IDEMPOTENCY, ONLINE)).toBe(INITIAL_IDEMPOTENCY);
  });
});

describe("invariants", () => {
  it("saved never exceeds the number of distinct operations and never decreases", () => {
    const events: IdempotencyEvent[] = [SEND, OFFLINE, SEND, SEND, { type: "toggle" }, SEND, SEND, OFFLINE, SEND, ONLINE, SEND];
    let state = INITIAL_IDEMPOTENCY;
    for (const event of events) {
      const next = reduceIdempotency(state, event);
      expect(next.saved).toBeGreaterThanOrEqual(state.saved);
      expect(next.saved).toBeLessThanOrEqual(1);
      expect(next.saved).toBe(next.savedOps.length);
      state = next;
    }
    expect(state.saved).toBe(1);
  });

  it("never mutates the previous state", () => {
    const before = JSON.stringify(INITIAL_IDEMPOTENCY);
    drive([SEND, OFFLINE, SEND, ONLINE, SEND]);
    expect(JSON.stringify(INITIAL_IDEMPOTENCY)).toBe(before);
  });
});
