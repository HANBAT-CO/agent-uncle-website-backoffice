import type { Metadata } from "next";

import { AuthCard } from "@/components/admin/auth/AuthCard";
import { getBackofficeEnv } from "@/lib/admin/env";

export const metadata: Metadata = { title: "사용할 수 없음" };

type Reason = "disabled" | "not_installed" | "misconfigured";

const COPY: Record<Reason, string> = {
  disabled: "이 배포에서는 운영 화면이 꺼져 있어요.",
  not_installed: "운영 데이터 계층이 아직 설치되지 않았어요. 앱 저장소에 마이그레이션이 반영된 뒤 이용할 수 있어요.",
  misconfigured: "운영 화면 설정을 확인해 주세요.",
};

function isReason(value: unknown): value is Reason {
  return value === "disabled" || value === "not_installed" || value === "misconfigured";
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * 사용할 수 없음 (screens appendix 10.4). Public. When the environment itself
 * is off or wrong, that is the reason shown, whatever the URL says.
 */
export default async function UnavailablePage({ searchParams }: { searchParams: SearchParams }) {
  const env = getBackofficeEnv();
  const raw = (await searchParams).reason;
  const param = Array.isArray(raw) ? raw[0] : raw;
  const reason: Reason = !env.enabled ? env.reason : isReason(param) ? param : "misconfigured";

  return (
    <AuthCard title="사용할 수 없음">
      <p className="text-sm/relaxed text-foreground" data-reason={reason}>
        {COPY[reason]}
      </p>
      {/* Which variable failed (names and rules only, never a key value). */}
      {!env.enabled && env.reason === "misconfigured" ? (
        <p className="mt-3 font-mono text-xs/relaxed text-muted-foreground" data-detail>
          확인할 항목: {env.detail}
        </p>
      ) : null}
    </AuthCard>
  );
}
