import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/admin/auth/AuthCard";
import { AuthNotice } from "@/components/admin/auth/AuthNotice";
import { PasswordSignInForm } from "@/components/admin/auth/PasswordSignInForm";
import { ADMIN_PANEL_NAME } from "@/lib/admin/brand";
import { getAdminGate, gateRedirectPath, type AdminGate } from "@/lib/admin/dal";
import { getBackofficeEnv } from "@/lib/admin/env";
import { safeNext } from "@/lib/admin/session";

export const metadata: Metadata = { title: "로그인" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** 로그인 (screens appendix 10.1). Staff ID and password on every target. */
export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = safeNext(first(params.next));
  const env = getBackofficeEnv();
  if (!env.enabled) redirect(`/admin/unavailable?reason=${env.reason}`);

  let gate: AdminGate | null = null;
  try {
    gate = await getAdminGate();
  } catch {
    gate = null; // Supabase unreachable: still show the form.
  }
  if (gate?.state === "ok") redirect(next);
  if (gate?.state === "mfa_required" || gate?.state === "unavailable") redirect(gateRedirectPath(gate, next));

  const notice =
    first(params.error) ? (
      <AuthNotice tone="attention">로그인하지 못했어요. 다시 시도해 주세요.</AuthNotice>
    ) : first(params.reason) === "expired" ? (
      <AuthNotice>보안을 위해 다시 로그인해 주세요.</AuthNotice>
    ) : null;

  return (
    <AuthCard
      title={ADMIN_PANEL_NAME}
      description="운영 계정으로 로그인해 주세요."
      footer="운영 화면의 열람과 변경은 모두 기록돼요."
    >
      <div className="flex flex-col gap-6">
        {notice}
        <PasswordSignInForm next={next} />
      </div>
    </AuthCard>
  );
}
