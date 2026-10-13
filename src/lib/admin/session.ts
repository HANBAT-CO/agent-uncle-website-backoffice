/*
 * Session rules (backoffice spec 4, 5). Pure, shared by the proxy, the DAL and
 * the auth actions.
 */

/** A staff session lasts at most 12 hours after sign-in (spec D4). */
export const SESSION_MAX_AGE_SECONDS = 43_200;

/** JWT claims we read. RFC 8176 also allows plain string amr entries; they carry no time. */
export type SessionClaims = {
  amr?: ReadonlyArray<{ method: string; timestamp: number } | string>;
  iat?: number;
};

/**
 * Sign-in time in epoch seconds: the earliest `amr` timestamp (refreshes keep
 * it, an MFA step adds a later one), else `iat`, else null.
 */
export function sessionStartedAt(claims: SessionClaims): number | null {
  const stamps = (Array.isArray(claims.amr) ? claims.amr : [])
    .map((entry) => (typeof entry === "object" && entry !== null ? entry.timestamp : undefined))
    .filter((t): t is number => typeof t === "number" && Number.isFinite(t) && t > 0);
  if (stamps.length > 0) return Math.min(...stamps);
  return typeof claims.iat === "number" && Number.isFinite(claims.iat) ? claims.iat : null;
}

/** True once the session is older than 12 h. A session of unknown age counts as expired. */
export function isSessionExpired(claims: SessionClaims, nowSeconds: number): boolean {
  const started = sessionStartedAt(claims);
  if (started === null) return true;
  return nowSeconds - started > SESSION_MAX_AGE_SECONDS;
}

const FALLBACK = "/admin";
const BASE = "http://console.invalid";
/**
 * Never a post-login destination: the sign-in steps (they would loop) and the
 * POST-only CSV export route (a GET after login would answer 405).
 */
const SIGN_IN_PATHS = ["/admin/login", "/admin/mfa", "/admin/auth", "/admin/export"];

function within(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}

/**
 * Open-redirect guard for `?next=`. Only same-origin console paths survive,
 * normalised (dot segments resolved, fragment dropped); anything else is
 * `/admin`.
 */
export function safeNext(next: string | null | undefined): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 2048) return FALLBACK;
  if (!next.startsWith("/") || next.startsWith("//")) return FALLBACK;
  // Backslashes read as slashes in browsers; control characters split headers.
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return FALLBACK;

  let url: URL;
  try {
    url = new URL(next, BASE);
  } catch {
    return FALLBACK;
  }
  if (url.origin !== BASE) return FALLBACK;
  if (!within(url.pathname, "/admin")) return FALLBACK;
  if (SIGN_IN_PATHS.some((root) => within(url.pathname, root))) return FALLBACK;
  return `${url.pathname}${url.search}`;
}
