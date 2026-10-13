import { CheckCircleIcon, ShieldCheckIcon, XCircleIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";

import { AuthNotice } from "@/components/admin/auth/AuthNotice";
import { SignOutButton } from "@/components/admin/auth/SignOutButton";
import { DefinitionList } from "@/components/admin/common/DefinitionList";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { AccountMfaEnroll } from "@/components/admin/shell/AccountMfaEnroll";
import { verifyAdmin } from "@/lib/admin/dal";
import { ROLE_LABEL } from "@/lib/admin/roles";
import { createAdminServerClient } from "@/lib/admin/supabase/server";

export const metadata: Metadata = { title: "내 계정" };

/** Verified TOTP factors of the signed-in staff member, or null when the MFA API fails. */
async function verifiedFactorCount(): Promise<number | null> {
  const supabase = await createAdminServerClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error || !data) return null;
  return data.totp.filter((factor) => factor.status === "verified").length;
}

function Card({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      <h2 id={id} className="text-sm font-semibold text-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * 내 계정 (screens appendix 10.19): who is signed in, 2단계 인증 with
 * "등록하기", and sign-out on this browser or everywhere (WP-02 actions).
 */
export default async function AccountPage() {
  const session = await verifyAdmin();
  const factors = await verifiedFactorCount();

  const mfaStatus =
    factors === null ? (
      <span className="text-muted-foreground">상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.</span>
    ) : factors > 0 ? (
      <span className="inline-flex h-6 items-center gap-1 rounded-full bg-status-normal-bg px-2 text-xs font-medium text-status-normal">
        <CheckCircleIcon aria-hidden weight="fill" className="size-3.5" />
        등록됨 {factors}개
      </span>
    ) : (
      <span className="inline-flex h-6 items-center gap-1 rounded-full bg-status-neutral-bg px-2 text-xs font-medium text-status-neutral">
        <XCircleIcon aria-hidden weight="bold" className="size-3.5" />
        미등록
      </span>
    );

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="내 계정" />

      <Card id="account-profile" title="운영 계정">
        <DefinitionList
          columns={3}
          items={[
            { term: "이름", value: session.displayName },
            { term: "이메일", value: session.email ? <span className="break-all">{session.email}</span> : null },
            { term: "역할", value: ROLE_LABEL[session.role] },
          ]}
        />
        <AuthNotice>운영 계정은 앱 계정과 분리해서 써 주세요.</AuthNotice>
      </Card>

      <Card id="account-mfa" title="2단계 인증">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2" data-testid="mfa-status">
            {mfaStatus}
            {session.mfaRequired ? (
              <span className="inline-flex h-6 items-center gap-1 rounded-full bg-secondary px-2 text-xs font-medium text-secondary-foreground">
                <ShieldCheckIcon aria-hidden weight="bold" className="size-3.5" />
                필수
              </span>
            ) : null}
          </div>
          {factors === 0 ? <AccountMfaEnroll /> : null}
        </div>
        <p className="text-xs/relaxed text-muted-foreground">
          {factors && factors > 0
            ? "로그인할 때 인증 앱의 6자리 코드를 한 번 더 확인해요."
            : "등록하면 로그인할 때 인증 앱의 6자리 코드를 한 번 더 확인해요."}
        </p>
      </Card>

      <Card id="account-signout" title="로그아웃">
        <p className="text-xs/relaxed text-muted-foreground">
          모든 기기에서 로그아웃하면 다른 브라우저와 기기의 로그인도 함께 끝나요.
        </p>
        <div className="flex flex-wrap gap-2">
          <SignOutButton className="h-9 px-3.5 text-sm" />
          <SignOutButton scope="global" label="모든 기기에서 로그아웃" className="h-9 px-3.5 text-sm" />
        </div>
      </Card>
    </div>
  );
}
