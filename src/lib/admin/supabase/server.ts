import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

import type { Database } from "../database.types";
import { getBackofficeEnv } from "../env";
import { ADMIN_COOKIE_OPTIONS, adminFetch, forwardedClientHeaders } from "./shared";

export { ADMIN_COOKIE_OPTIONS } from "./shared";

/**
 * Per-request Supabase client bound to the staff member's own cookie session
 * (backoffice spec D2). Publishable key only: every permission is decided in
 * Postgres by require_admin() inside SECURITY DEFINER RPCs. Never cache or
 * share it across requests.
 *
 * Server Components cannot write cookies, so their setAll is a no-op; the
 * proxy refreshes the session before rendering. Server Actions and Route
 * Handlers do write (sign-in, MFA, sign-out, the OAuth exchange).
 */
export async function createAdminServerClient() {
  const env = getBackofficeEnv();
  if (!env.enabled) {
    throw new Error(`The backoffice console is off (${env.reason}).`);
  }
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  return createServerClient<Database>(env.url, env.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Server Component render: the proxy already refreshed the session.
        }
      },
    },
    cookieOptions: ADMIN_COOKIE_OPTIONS,
    global: { headers: forwardedClientHeaders(headerStore), fetch: adminFetch },
  });
}

export type AdminSupabaseClient = Awaited<ReturnType<typeof createAdminServerClient>>;
