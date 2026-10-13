import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/*
 * REST and SQL helpers for the console e2e suites. LOCAL STACK ONLY: every
 * helper refuses a Supabase URL that is not on this machine, and psql goes
 * through supabase-local/scripts/psql.sh (the local db container). Only the
 * publishable key is used; staff and demo users sign in with their own
 * passwords, exactly like the console and the app.
 */

export const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

/** The CLI's well-known local default; .env.development.local normally provides the same value. */
const DEFAULT_LOCAL_KEY = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const DEFAULT_LOCAL_URL = "http://127.0.0.1:55321";
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

export type StaffRole = "owner" | "operator" | "viewer" | "spare";

/** Seeded logins (spec 5, supabase-local/README.md). spare is an auth user who is not staff. */
export const STAFF: Record<StaffRole, { email: string; password: string }> = {
  owner: { email: "admin@agentuncle.local", password: "agentuncle-admin-local" },
  operator: { email: "operator@agentuncle.local", password: "agentuncle-operator-local" },
  viewer: { email: "viewer@agentuncle.local", password: "agentuncle-viewer-local" },
  spare: { email: "spare@agentuncle.local", password: "agentuncle-spare-local" },
};

export const DEMO_PASSWORD = "agentuncle-demo-local";

function readDotenv(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match) out[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

/** URL and publishable key of the local stack, refusing anything that is not local. */
export function localSupabase(): { url: string; key: string } {
  const file = readDotenv(path.join(REPO_ROOT, ".env.development.local"));
  const url = process.env.BACKOFFICE_SUPABASE_URL ?? file.BACKOFFICE_SUPABASE_URL ?? DEFAULT_LOCAL_URL;
  const key = process.env.BACKOFFICE_SUPABASE_PUBLISHABLE_KEY ?? file.BACKOFFICE_SUPABASE_PUBLISHABLE_KEY ?? DEFAULT_LOCAL_KEY;
  if (!LOOPBACK.has(new URL(url).hostname)) {
    throw new Error(`e2e helpers only run against the local stack, not ${url}`);
  }
  if (key.startsWith("sb_") && !key.startsWith("sb_publishable_")) throw new Error("e2e helpers use the publishable key only");
  return { url, key };
}

/** A fresh supabase-js client signed in with email and password (no persistence). */
export async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const { url, key } = localSupabase();
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return client;
}

export type RpcOutcome<T = unknown> = {
  data: T | null;
  error: { code?: string; message: string } | null;
  status: number;
};

async function call<T>(client: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<RpcOutcome<T>> {
  const { data, error, status } = await client.rpc(fn, args);
  return { data: (data as T) ?? null, error: error ? { code: error.code, message: error.message } : null, status };
}

/** An RPC as a demo app user (`slug` or full email), e.g. saip_command or backoffice_overview (403). */
export async function demoUserRpc<T = unknown>(email: string, fn: string, args: Record<string, unknown> = {}): Promise<RpcOutcome<T>> {
  const address = email.includes("@") ? email : `${email}@demo.agentuncle.local`;
  const client = await signIn(address, DEMO_PASSWORD);
  try {
    return await call<T>(client, fn, args);
  } finally {
    await client.auth.signOut({ scope: "local" });
  }
}

/** An RPC as a seeded staff member (or spare@), with their own JWT. */
export async function staffRpc<T = unknown>(role: StaffRole, fn: string, args: Record<string, unknown> = {}): Promise<RpcOutcome<T>> {
  const client = await signIn(STAFF[role].email, STAFF[role].password);
  try {
    return await call<T>(client, fn, args);
  } finally {
    await client.auth.signOut({ scope: "local" });
  }
}

/** SQL as postgres in the local db container. Returns unaligned, tuples-only output. */
export function psql(sql: string): string {
  localSupabase();
  return execFileSync(path.join(REPO_ROOT, "supabase-local/scripts/psql.sh"), ["-qAt", "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
