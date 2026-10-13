import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/admin/auth/AuthCard";
import { AuthNotice } from "@/components/admin/auth/AuthNotice";
import { SignOutButton } from "@/components/admin/auth/SignOutButton";
import { getAdminGate, gateRedirectPath } from "@/lib/admin/dal";

export const metadata: Metadata = { title: "권한 없음" };

/**
 * 권한 없음 (screens appendix 10.3): a signed-in auth user who is not staff.
 * The email is what the owner needs to grant a role (spec 5, onboarding).
 */
export default async function NoAccessPage() {
  const gate = await getAdminGate();
  if (gate.state === "ok") redirect("/admin");
  if (gate.state !== "no_access") redirect(gateRedirectPath(gate, "/admin"));

  return (
    <AuthCard
      title="운영 권한이 없는 계정이에요"
      description={
        <p>
          <strong className="font-semibold text-foreground break-all" data-testid="no-access-email">
            {gate.email ?? "이 계정"}
          </strong>
          로 로그인했어요. 관리자에게 이 이메일을 알려 주시면 권한을 받을 수 있어요.
        </p>
      }
    >
      <div className="flex flex-col gap-5">
        {gate.hasAppAccount ? (
          <AuthNotice tone="attention">
            앱에서 쓰는 계정은 운영 계정으로 쓸 수 없어요. 운영용 Google 계정으로 다시 로그인해 주세요.
          </AuthNotice>
        ) : null}
        <SignOutButton className="h-10 w-full text-sm" />
      </div>
    </AuthCard>
  );
}
