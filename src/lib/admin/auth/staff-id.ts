import type { BackofficeTarget } from "../env";

/*
 * Staff sign in with an ID and a password only. Supabase Auth still needs an
 * email, so each staff ID maps to an address on a domain that is not shared
 * with app users and never receives mail (.invalid is reserved, RFC 2606).
 * Local seeds keep their existing @agentuncle.local addresses.
 */
export const STAFF_EMAIL_DOMAIN: Record<BackofficeTarget, string> = {
  live: "staff.agentuncle.invalid",
  local: "agentuncle.local",
};

/** Lowercase letters, digits, dot, underscore or hyphen; 2 to 40 characters, starting with a letter or digit. */
const STAFF_ID = /^[a-z0-9][a-z0-9._-]{1,39}$/;

/**
 * The Auth email for a typed staff ID, or null when the ID is malformed.
 * A typed address is accepted only on the target's own staff domain, so the
 * form can never sign in an app account.
 */
export function staffEmailFromId(input: string, target: BackofficeTarget): string | null {
  const value = input.trim().toLowerCase();
  const domain = STAFF_EMAIL_DOMAIN[target];
  const at = value.indexOf("@");
  const id = at === -1 ? value : value.slice(0, at);
  if (at !== -1 && value.slice(at + 1) !== domain) return null;
  return STAFF_ID.test(id) ? `${id}@${domain}` : null;
}

/** The staff ID shown back in the form for an Auth email. */
export function staffIdFromEmail(email: string): string {
  const at = email.indexOf("@");
  return at === -1 ? email : email.slice(0, at);
}
