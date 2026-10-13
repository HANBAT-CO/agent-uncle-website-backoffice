import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/admin/auth/AuthCard";
import { MfaChallengeForm } from "@/components/admin/auth/MfaChallengeForm";
import { MfaEnrollForm } from "@/components/admin/auth/MfaEnrollForm";
import { SignOutButton } from "@/components/admin/auth/SignOutButton";
import { getAdminGate, gateRedirectPath } from "@/lib/admin/dal";
import { safeNext } from "@/lib/admin/session";
import { createAdminServerClient } from "@/lib/admin/supabase/server";

export const metadata: Metadata = { title: "2단계 인증" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * 2단계 인증 (screens appendix 10.2). A verified TOTP factor gets the
 * challenge; otherwise the page enrols one. Staff only: anyone else is routed
 * by their gate.
 */
export default async function MfaPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = (await searchParams).next;
  const next = safeNext(Array.isArray(raw) ? raw[0] : raw);

  const gate = await getAdminGate();
  if (gate.state === "ok" && gate.session.aal === "aal2") redirect(next);
  if (gate.state !== "ok" && gate.state !== "mfa_required") redirect(gateRedirectPath(gate, next));

  const supabase = await createAdminServerClient();
  const { data } = await supabase.auth.mfa.listFactors();
  const factor = data?.totp.find((f) => f.status === "verified") ?? null;

  const footer = (
    <SignOutButton label="다른 계정으로 로그인" variant="link" className="h-auto p-0 text-xs" />
  );

  return factor ? (
    <AuthCard title="2단계 인증" footer={footer}>
      <MfaChallengeForm factorId={factor.id} next={next} />
    </AuthCard>
  ) : (
    <AuthCard title="2단계 인증" description="2단계 인증을 등록해 주세요." footer={footer}>
      <MfaEnrollForm next={next} />
    </AuthCard>
  );
}
