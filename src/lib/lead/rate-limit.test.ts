import { describe, expect, it } from "vitest";

import { clientKey, createRateLimiter, RATE_LIMIT_CAPACITY, RATE_LIMIT_WINDOW_MS } from "./rate-limit";

const TWO_MINUTES = RATE_LIMIT_WINDOW_MS / RATE_LIMIT_CAPACITY;

describe("lead rate limit (5 per 10 minutes, per client)", () => {
  it("allows a burst of 5 and refuses the 6th", () => {
    const limiter = createRateLimiter();
    const results = Array.from({ length: 6 }, () => limiter.take("203.0.113.7", 0));
    expect(results).toEqual([true, true, true, true, true, false]);
  });

  it("refills one submission every 2 minutes, never above the burst", () => {
    const limiter = createRateLimiter();
    for (let i = 0; i < RATE_LIMIT_CAPACITY; i += 1) limiter.take("a", 0);
    expect(limiter.take("a", TWO_MINUTES - 1)).toBe(false);
    expect(limiter.take("a", TWO_MINUTES * 2)).toBe(true);
    // A long pause refills to the cap, not beyond it.
    const later = TWO_MINUTES * 100;
    const burst = Array.from({ length: RATE_LIMIT_CAPACITY + 1 }, () => limiter.take("a", later));
    expect(burst.filter(Boolean)).toHaveLength(RATE_LIMIT_CAPACITY);
  });

  it("keeps clients apart", () => {
    const limiter = createRateLimiter();
    for (let i = 0; i < RATE_LIMIT_CAPACITY; i += 1) limiter.take("a", 0);
    expect(limiter.take("a", 0)).toBe(false);
    expect(limiter.take("b", 0)).toBe(true);
  });

  it("forgets the least recently seen client past the cap", () => {
    const limiter = createRateLimiter({ maxClients: 2 });
    for (let i = 0; i < RATE_LIMIT_CAPACITY; i += 1) limiter.take("a", 0);
    limiter.take("b", 1);
    limiter.take("c", 2);
    expect(limiter.size).toBe(2);
    // "a" was evicted, so it starts with a full bucket again.
    expect(limiter.take("a", 3)).toBe(true);
  });
});

describe("clientKey", () => {
  it("takes the first x-forwarded-for address, else x-real-ip, else none", () => {
    expect(clientKey(new Headers({ "x-forwarded-for": "198.51.100.4, 10.0.0.1" }))).toBe("198.51.100.4");
    expect(clientKey(new Headers({ "x-real-ip": " 198.51.100.9 " }))).toBe("198.51.100.9");
    expect(clientKey(new Headers())).toBeNull();
  });

  it("caps the key length", () => {
    expect(clientKey(new Headers({ "x-forwarded-for": "x".repeat(200) }))?.length).toBe(64);
  });
});
