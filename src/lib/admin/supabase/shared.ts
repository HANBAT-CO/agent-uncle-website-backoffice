/*
 * Pieces shared by the request-scoped server client (server.ts) and the proxy
 * client (proxy.ts). No next/headers import, so the proxy can use them too.
 */

/**
 * @supabase/ssr cookie options (backoffice spec 5). The session and the PKCE
 * verifier live under /admin only, are never readable from JS, and travel on
 * top-level navigations from Google (lax). The landing at / never sees them.
 */
export const ADMIN_COOKIE_OPTIONS: { path: "/admin"; sameSite: "lax"; httpOnly: true; secure: boolean } = {
  path: "/admin",
  sameSite: "lax",
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
};

/** Request header the proxy sets with the console path and query, for `?next=`. */
export const ADMIN_PATH_HEADER = "x-admin-path";

export const CLIENT_INFO = "agent-uncle-backoffice";

const IP_CHARS = /^[0-9A-Fa-f:.[\]%]{1,64}$/;

/**
 * The staff member's address and browser, forwarded to PostgREST so
 * backoffice_private.client_info() can store them in each audit row (spec 3).
 * Best effort: malformed values are dropped, never guessed.
 */
export function forwardedClientHeaders(source: Headers): Record<string, string> {
  const headers: Record<string, string> = {};
  const forwardedFor = source.get("x-forwarded-for")?.split(",")[0]?.trim() || source.get("x-real-ip")?.trim();
  if (forwardedFor && IP_CHARS.test(forwardedFor)) headers["x-backoffice-client-ip"] = forwardedFor;
  // Header values must stay printable ASCII.
  const userAgent = source.get("user-agent")?.replace(/[^\x20-\x7e]/g, "").trim().slice(0, 300);
  if (userAgent) headers["x-backoffice-user-agent"] = userAgent;
  return headers;
}

/**
 * fetch for every Supabase call from the console. @supabase/ssr pins its own
 * X-Client-Info; this replaces it so audit rows say which surface called.
 */
export const adminFetch: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  headers.set("x-client-info", CLIENT_INFO);
  return fetch(input, { ...init, headers, cache: "no-store" });
};
