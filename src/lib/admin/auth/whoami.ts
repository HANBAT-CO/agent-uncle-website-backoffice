import { z } from "zod";

import type { BackofficeTarget } from "../env";
import type { AdminRole } from "../roles";

/*
 * backoffice_whoami() contract (migration: public.backoffice_whoami) and the
 * pure routing decision the DAL makes from it (backoffice spec 5). No
 * server-only import: this module holds no secrets and is unit tested.
 */

export const whoamiSchema = z.object({
  userId: z.string().min(1).nullable(),
  email: z.string().nullable(),
  admin: z.boolean(),
  role: z.enum(["viewer", "operator", "owner"]).nullable(),
  displayName: z.string().nullable(),
  mfaRequired: z.boolean(),
  aal: z.enum(["aal1", "aal2"]).catch("aal1"),
  mfaEnrolled: z.boolean(),
  ready: z.boolean(),
  hasAppAccount: z.boolean(),
});

export type Whoami = z.infer<typeof whoamiSchema>;

export type AdminSession = {
  userId: string;
  email: string | null;
  role: AdminRole;
  displayName: string;
  aal: "aal1" | "aal2";
  mfaRequired: boolean;
  target: BackofficeTarget;
};

export type AdminGate =
  | { state: "ok"; session: AdminSession }
  | { state: "signed_out" }
  | { state: "expired" }
  | { state: "no_access"; email: string | null; hasAppAccount: boolean }
  | { state: "mfa_required"; enrolled: boolean }
  | { state: "unavailable"; reason: "disabled" | "not_installed" | "misconfigured" };

/** The parsed whoami payload, or null when it does not match the contract. */
export function parseWhoami(raw: unknown): Whoami | null {
  const parsed = whoamiSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Routes a signed-in user from their whoami payload. */
export function gateFromWhoami(who: Whoami, target: BackofficeTarget): AdminGate {
  if (!who.userId) return { state: "signed_out" };
  if (!who.admin || !who.role) {
    return { state: "no_access", email: who.email, hasAppAccount: who.hasAppAccount };
  }
  if (!who.ready) {
    // ready = staff and (no MFA rule or aal2); the only staff gap left is MFA.
    return { state: "mfa_required", enrolled: who.mfaEnrolled };
  }
  return {
    state: "ok",
    session: {
      userId: who.userId,
      email: who.email,
      role: who.role,
      displayName: who.displayName?.trim() || who.email || "운영 계정",
      aal: who.aal,
      mfaRequired: who.mfaRequired,
      target,
    },
  };
}
