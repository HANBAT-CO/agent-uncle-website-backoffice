"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getSiteUrl } from "@/lib/site";

import { gateRedirectPath, resolveAdminGate } from "../dal";
import { getBackofficeEnv } from "../env";
import { safeNext } from "../session";
import { createAdminServerClient, type AdminSupabaseClient } from "../supabase/server";

/*
 * Staff sign-in, MFA and sign-out (backoffice spec 5, screens 10.1 to 10.3).
 * Every action is reachable by a direct POST, so each one re-checks the
 * environment and the session itself.
 */

export type AuthFormState = { status: "idle" | "error"; message?: string; email?: string };

const COPY = {
  badCredentials: "이메일 또는 비밀번호를 확인해 주세요.",
  localOnly: "로컬 테스트 계정만 쓸 수 있어요.",
  badCode: "코드가 맞지 않아요. 새 코드로 다시 입력해 주세요.",
  totpDisabled: "2단계 인증이 아직 켜지지 않았어요. 관리자에게 문의해 주세요.",
  retry: "잠시 후 다시 시도해 주세요.",
} as const;

const TOTP_FRIENDLY_NAME = "사입삼춘 운영";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** The console env, or a redirect to 사용할 수 없음. */
function enabledEnv() {
  const env = getBackofficeEnv();
  if (!env.enabled) redirect(`/admin/unavailable?reason=${env.reason}`);
  return env;
}

/** After a sign-in step: the console, MFA, or 권한 없음, depending on whoami. */
async function routeAfterSignIn(supabase: AdminSupabaseClient, target: "local" | "live", next: string): Promise<never> {
  const gate = await resolveAdminGate(supabase, target);
  redirect(gate.state === "ok" ? next : gateRedirectPath(gate, next));
}

/** Google OAuth with PKCE (production sign-in). */
export async function signInWithGoogleAction(formData: FormData): Promise<void> {
  enabledEnv();
  const next = safeNext(field(formData, "next"));
  const supabase = await createAdminServerClient();
  const redirectTo = `${new URL("/admin/auth/callback", getSiteUrl()).href}?next=${encodeURIComponent(next)}`;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, queryParams: { prompt: "select_account" } },
  });
  if (error || !data?.url) redirect("/admin/login?error=oauth");
  redirect(data.url);
}

const passwordSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(256),
});

/** Email and password, for the seeded local staff only (target=local). */
export async function signInWithPasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const env = enabledEnv();
  const email = field(formData, "email").trim();
  if (env.target !== "local") return { status: "error", message: COPY.localOnly, email };

  const parsed = passwordSchema.safeParse({ email, password: field(formData, "password") });
  if (!parsed.success) return { status: "error", message: COPY.badCredentials, email };

  const supabase = await createAdminServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { status: "error", message: COPY.badCredentials, email };

  return routeAfterSignIn(supabase, env.target, safeNext(field(formData, "next")));
}

const codeSchema = z.string().regex(/^\d{6}$/);

/** TOTP challenge and verify, for a factor of the signed-in user (enrolment or sign-in). */
export async function verifyTotpAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const env = enabledEnv();
  const next = safeNext(field(formData, "next"));
  const supabase = await createAdminServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect(`/admin/login?next=${encodeURIComponent(next)}`);

  const code = field(formData, "code").replace(/\s+/g, "");
  if (!codeSchema.safeParse(code).success) return { status: "error", message: COPY.badCode };

  const factorId = field(formData, "factorId");
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return { status: "error", message: COPY.retry };
  const factor = factors.all.find((f) => f.id === factorId && f.factor_type === "totp");
  if (!factor) return { status: "error", message: COPY.badCode };

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) return { status: "error", message: COPY.badCode };

  return routeAfterSignIn(supabase, env.target, next);
}

export type EnrollTotpResult =
  | { ok: true; factorId: string; qrSvg: string; secret: string }
  | { ok: false; message: string };

/** Starts TOTP enrolment for the signed-in staff member: a fresh factor with its QR and key. */
export async function enrollTotpAction(): Promise<EnrollTotpResult> {
  const env = enabledEnv();
  const supabase = await createAdminServerClient();
  const gate = await resolveAdminGate(supabase, env.target);
  if (gate.state !== "ok" && gate.state !== "mfa_required") return { ok: false, message: COPY.retry };

  // An earlier, never verified enrolment would block the friendly name.
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return { ok: false, message: COPY.retry };
  for (const stale of factors.all.filter((f) => f.factor_type === "totp" && f.status === "unverified")) {
    await supabase.auth.mfa.unenroll({ factorId: stale.id });
  }

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: TOTP_FRIENDLY_NAME });
  if (error || !data) {
    const code = (error as { code?: string } | null)?.code ?? "";
    return { ok: false, message: /not_enabled|disabled/.test(code) ? COPY.totpDisabled : COPY.retry };
  }
  // auth-js returns "data:image/svg+xml;utf-8,<svg…>" with raw markup; re-encode it for <img src>.
  const svg = data.totp.qr_code.replace(/^data:image\/svg\+xml;[^,]*,/, "");
  return {
    ok: true,
    factorId: data.id,
    qrSvg: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    secret: data.totp.secret,
  };
}

/** 로그아웃 (this browser) or 모든 기기에서 로그아웃 (scope=global). */
export async function signOutAction(formData: FormData): Promise<void> {
  const scope = field(formData, "scope") === "global" ? "global" : "local";
  const env = getBackofficeEnv();
  if (env.enabled) {
    const supabase = await createAdminServerClient();
    await supabase.auth.signOut({ scope });
  }
  redirect("/admin/login");
}
