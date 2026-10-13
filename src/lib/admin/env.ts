import "server-only";

/*
 * Console environment (backoffice spec 3, D11). Server-only. The console reads
 * exactly three variables and never a NEXT_PUBLIC_ value:
 *   BACKOFFICE_SUPABASE_TARGET           local | live (unset: console off)
 *   BACKOFFICE_SUPABASE_URL              local: http://127.0.0.1:55321, live: the hosted project
 *   BACKOFFICE_SUPABASE_PUBLISHABLE_KEY  publishable (anon) key only
 * A local target must point at this machine and a live target must not, so a
 * preview or a laptop can never reach the other database by accident.
 */

export type BackofficeTarget = "local" | "live";

export type BackofficeEnv =
  | { enabled: true; target: BackofficeTarget; url: string; publishableKey: string }
  | { enabled: false; reason: "disabled" | "misconfigured"; detail: string };

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

function misconfigured(detail: string): BackofficeEnv {
  return { enabled: false, reason: "misconfigured", detail };
}

/**
 * Allowlist: a new-format publishable key (sb_publishable_…) or a legacy JWT
 * whose role is anon. Every other key, privileged ones included, is refused.
 */
function isPublishableKey(key: string): boolean {
  if (key.startsWith("sb_")) return key.startsWith("sb_publishable_");
  const parts = key.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { role?: unknown };
    return payload.role === "anon";
  } catch {
    return false;
  }
}

/** Pure: validates the three backoffice variables from an env record. */
export function readBackofficeEnv(env: Record<string, string | undefined>): BackofficeEnv {
  const target = env.BACKOFFICE_SUPABASE_TARGET?.trim();
  if (!target) {
    return { enabled: false, reason: "disabled", detail: "BACKOFFICE_SUPABASE_TARGET is not set" };
  }
  if (target !== "local" && target !== "live") {
    return misconfigured(`BACKOFFICE_SUPABASE_TARGET must be local or live, got "${target}"`);
  }

  const rawUrl = env.BACKOFFICE_SUPABASE_URL?.trim();
  if (!rawUrl) return misconfigured("BACKOFFICE_SUPABASE_URL is not set");
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return misconfigured("BACKOFFICE_SUPABASE_URL is not a URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return misconfigured("BACKOFFICE_SUPABASE_URL must be http(s)");
  }

  const loopback = LOOPBACK_HOSTS.has(url.hostname);
  if (target === "local" && !loopback) {
    return misconfigured("target=local must point at localhost");
  }
  if (target === "live" && loopback) {
    return misconfigured("target=live must not point at localhost");
  }
  if (target === "live" && url.protocol !== "https:") {
    return misconfigured("target=live must use https");
  }

  const publishableKey = env.BACKOFFICE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!publishableKey) return misconfigured("BACKOFFICE_SUPABASE_PUBLISHABLE_KEY is not set");
  if (!isPublishableKey(publishableKey)) {
    return misconfigured("BACKOFFICE_SUPABASE_PUBLISHABLE_KEY must be the publishable (anon) key");
  }

  const base = `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  return { enabled: true, target, url: base, publishableKey };
}

/** The console environment of this process. */
export function getBackofficeEnv(): BackofficeEnv {
  return readBackofficeEnv({
    BACKOFFICE_SUPABASE_TARGET: process.env.BACKOFFICE_SUPABASE_TARGET,
    BACKOFFICE_SUPABASE_URL: process.env.BACKOFFICE_SUPABASE_URL,
    BACKOFFICE_SUPABASE_PUBLISHABLE_KEY: process.env.BACKOFFICE_SUPABASE_PUBLISHABLE_KEY,
  });
}
