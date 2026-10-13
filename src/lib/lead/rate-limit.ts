/**
 * Best-effort rate limit for the lead action (spec 10): a token bucket per
 * client IP, 5 submissions per 10 minutes (a burst of 5, then one more every 2
 * minutes). It lives in one server instance's memory only: every serverless
 * instance or region keeps its own buckets and a cold start empties them, so
 * it slows a single noisy client, nothing more. The database CHECKs cap field
 * sizes regardless, and a shared limiter (for example a Redis-backed one) is
 * the upgrade if abuse appears.
 *
 * Kept out of src/app/actions/lead.ts because a "use server" module may only
 * export async functions; this module is plain and unit-tested
 * (rate-limit.test.ts). Server only: never import it from a client component.
 */

export const RATE_LIMIT_CAPACITY = 5;
export const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
/** Upper bound on tracked clients so the map cannot grow without limit. */
export const RATE_LIMIT_MAX_CLIENTS = 5000;

const REFILL_PER_MS = RATE_LIMIT_CAPACITY / RATE_LIMIT_WINDOW_MS;

type Bucket = { tokens: number; updatedAt: number };

export type RateLimiter = {
  /** Spends one token for this client. False when the bucket is empty. */
  take(key: string, now: number): boolean;
  /** Number of clients currently tracked (for tests). */
  readonly size: number;
};

export function createRateLimiter({
  capacity = RATE_LIMIT_CAPACITY,
  refillPerMs = REFILL_PER_MS,
  maxClients = RATE_LIMIT_MAX_CLIENTS,
}: { capacity?: number; refillPerMs?: number; maxClients?: number } = {}): RateLimiter {
  const buckets = new Map<string, Bucket>();
  return {
    take(key, now) {
      const previous = buckets.get(key);
      const tokens = previous ? Math.min(capacity, previous.tokens + (now - previous.updatedAt) * refillPerMs) : capacity;
      // Re-insert so the map stays ordered from least to most recently seen.
      buckets.delete(key);
      if (tokens < 1) {
        buckets.set(key, { tokens, updatedAt: now });
        return false;
      }
      buckets.set(key, { tokens: tokens - 1, updatedAt: now });
      while (buckets.size > maxClients) {
        const oldest = buckets.keys().next().value;
        if (oldest === undefined) break;
        buckets.delete(oldest);
      }
      return true;
    },
    get size() {
      return buckets.size;
    },
  };
}

/**
 * The first address in x-forwarded-for (the client, as the hosting proxy
 * reports it), else x-real-ip. Only trustworthy behind a proxy that sets the
 * header itself (Vercel does); a spoofed header can only spread one client's
 * submissions over more buckets, which the limit accepts as best effort.
 */
export function clientKey(requestHeaders: Headers): string | null {
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || requestHeaders.get("x-real-ip")?.trim();
  return ip ? ip.slice(0, 64) : null;
}
