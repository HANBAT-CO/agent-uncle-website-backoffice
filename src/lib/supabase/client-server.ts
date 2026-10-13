import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types";

/**
 * Supabase client for Server Components and Server Actions.
 *
 * Uses the publishable (anon) key: RLS is the security boundary, and this
 * site only ever INSERTs. No auth session is stored or refreshed; every call
 * is an anonymous REST request. Never put a service-role key here.
 */

let client: SupabaseClient<Database> | null = null;

export type SupabaseConfigError = { kind: "missing-env"; missing: string[] };

export function getServerSupabase(): SupabaseClient<Database> | SupabaseConfigError {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    const missing = [
      ...(url ? [] : ["NEXT_PUBLIC_SUPABASE_URL"]),
      ...(key ? [] : ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]),
    ];
    return { kind: "missing-env", missing };
  }

  client = createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { "x-client-info": "agent-uncle-landing" },
    },
  });
  return client;
}

export function isSupabaseConfigError(
  value: SupabaseClient<Database> | SupabaseConfigError,
): value is SupabaseConfigError {
  return "kind" in value && value.kind === "missing-env";
}
