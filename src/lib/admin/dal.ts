import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import { gateFromWhoami, parseWhoami, type AdminGate, type AdminSession } from "./auth/whoami";
import { getBackofficeEnv, type BackofficeTarget } from "./env";
import { hasRole, type AdminRole } from "./roles";
import { isSessionExpired, safeNext } from "./session";
import { createAdminServerClient, type AdminSupabaseClient } from "./supabase/server";
import { ADMIN_PATH_HEADER } from "./supabase/shared";

export type { AdminGate, AdminSession } from "./auth/whoami";

/*
 * Data Access Layer entry (backoffice spec 4, 5, 7). Every console page,
 * Server Action and Route Handler calls verifyAdmin() or requireRole() first;
 * the proxy only redirects optimistically. Postgres re-checks the role on
 * every RPC anyway.
 */

/**
 * Resolves the gate with an existing client. Not cached: the auth actions call
 * it right after a sign-in or MFA step, with the new tokens in the client.
 */
export async function resolveAdminGate(supabase: AdminSupabaseClient, target: BackofficeTarget): Promise<AdminGate> {
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return { state: "signed_out" };
  if (isSessionExpired(claims, Math.floor(Date.now() / 1000))) return { state: "expired" };

  const { data: raw, error: rpcError, status } = await supabase.rpc("backoffice_whoami");
  if (rpcError) {
    if (rpcError.code === "PGRST202") return { state: "unavailable", reason: "not_installed" };
    if (rpcError.code === "PGRST301" || rpcError.code === "PGRST302" || status === 401) return { state: "signed_out" };
    throw new Error(`backoffice_whoami failed (${rpcError.code || status})`);
  }
  const who = parseWhoami(raw);
  if (!who) throw new Error("backoffice_whoami returned an unexpected shape");
  return gateFromWhoami(who, target);
}

/** The current request's gate: one backoffice_whoami per request (React cache). */
export const getAdminGate: () => Promise<AdminGate> = cache(async (): Promise<AdminGate> => {
  // Always request-time: a build without the BACKOFFICE_* vars must not
  // prerender a gated page (e.g. 권한 없음) as a fixed redirect.
  await connection();
  const env = getBackofficeEnv();
  if (!env.enabled) return { state: "unavailable", reason: env.reason };
  const supabase = await createAdminServerClient();
  return resolveAdminGate(supabase, env.target);
});

/** The console path of this request (set by the proxy), safe for `?next=`. */
export async function currentAdminPath(): Promise<string> {
  return safeNext((await headers()).get(ADMIN_PATH_HEADER));
}

/** Where a non-ok gate sends the visitor. `next` is a safe console path. */
export function gateRedirectPath(gate: Exclude<AdminGate, { state: "ok" }>, next: string): string {
  switch (gate.state) {
    case "signed_out":
      return `/admin/login?next=${encodeURIComponent(next)}`;
    case "expired":
      return "/admin/login?reason=expired";
    case "mfa_required":
      return `/admin/mfa?next=${encodeURIComponent(next)}`;
    case "no_access":
      return "/admin/no-access";
    case "unavailable":
      return `/admin/unavailable?reason=${gate.reason}`;
  }
}

/** The signed-in staff session, or a redirect for every other state. */
export async function verifyAdmin(): Promise<AdminSession> {
  const gate = await getAdminGate();
  if (gate.state === "ok") return gate.session;
  redirect(gateRedirectPath(gate, await currentAdminPath()));
}

/** The session when its role is at least `min`; null means render ForbiddenState. */
export async function requireRole(min: AdminRole): Promise<AdminSession | null> {
  const session = await verifyAdmin();
  return hasRole(session.role, min) ? session : null;
}
