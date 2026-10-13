import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "../database.types";
import { getBackofficeEnv } from "../env";
import { isSessionExpired } from "../session";
import { ADMIN_COOKIE_OPTIONS, ADMIN_PATH_HEADER, adminFetch, forwardedClientHeaders } from "./shared";

/*
 * Session refresh and optimistic routing for /admin (backoffice spec 4). Runs
 * in src/proxy.ts on the Node runtime. It never authorizes anything: every
 * page, Server Action and Route Handler calls verifyAdmin() itself.
 */

/** Reachable without a session. */
const PUBLIC_PATHS = ["/admin/login", "/admin/auth", "/admin/unavailable"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

/** Console HTML is never cached and never indexed. */
function withAdminHeaders<T extends NextResponse>(response: T): T {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

/** A redirect that keeps the cookie writes (refresh, sign-out) of `from`. */
function redirectKeepingCookies(url: URL, from: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(url);
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie);
  for (const key of ["Expires", "Pragma"]) {
    const value = from.headers.get(key);
    if (value) redirect.headers.set(key, value);
  }
  return withAdminHeaders(redirect);
}

export async function updateAdminSession(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  const adminPath = `${pathname}${search}`;
  const forwarded = () => {
    const headers = new Headers(request.headers);
    headers.set(ADMIN_PATH_HEADER, adminPath);
    return headers;
  };

  const env = getBackofficeEnv();
  if (!env.enabled) {
    // Console off (or misconfigured): every /admin URL shows 사용할 수 없음.
    const url = request.nextUrl.clone();
    url.pathname = "/admin/unavailable";
    url.search = `?reason=${env.reason}`;
    return withAdminHeaders(NextResponse.rewrite(url, { request: { headers: forwarded() } }));
  }

  let response = NextResponse.next({ request: { headers: forwarded() } });
  const supabase = createServerClient<Database>(env.url, env.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        // Render sees the refreshed tokens; the browser gets them on the response.
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request: { headers: forwarded() } });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
    cookieOptions: ADMIN_COOKIE_OPTIONS,
    global: { headers: forwardedClientHeaders(request.headers), fetch: adminFetch },
  });

  // Refreshes an expired access token through setAll. Do not run code between
  // createServerClient and getClaims.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  // Server Actions (POST) are never redirected here: the action's own
  // verifyAdmin() answers with a redirect the client router understands.
  const navigable = request.method === "GET" || request.method === "HEAD";

  if (claims && isSessionExpired(claims, Math.floor(Date.now() / 1000))) {
    await supabase.auth.signOut({ scope: "local" });
    if (navigable && pathname !== "/admin/login") {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      url.search = "?reason=expired";
      return redirectKeepingCookies(url, response);
    }
    return withAdminHeaders(response);
  }

  if (!claims && navigable && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    url.searchParams.set("next", adminPath);
    return redirectKeepingCookies(url, response);
  }

  return withAdminHeaders(response);
}
