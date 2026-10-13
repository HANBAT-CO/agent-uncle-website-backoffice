import type { Metadata } from "next";

import { AuthNotice } from "@/components/admin/auth/AuthNotice";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { RemoteConfigScreen } from "@/components/admin/remote-config/RemoteConfigScreen";
import { ErrorState, LIST_ERROR_MESSAGE } from "@/components/admin/states/ErrorState";
import { verifyAdmin } from "@/lib/admin/dal";
import { newOperationId } from "@/lib/admin/operation-id";
import { hasRole } from "@/lib/admin/roles";
import { rpc } from "@/lib/admin/rpc";

export const metadata: Metadata = { title: "원격 설정" };

const HISTORY_LIMIT = 100;

/**
 * 원격 설정 /admin/remote-config (spec 6, 11; screens appendix 10.15).
 * Everyone reads the keys; operators edit feature_flags and support, owners
 * every key. 변경 기록 comes from list_audit (operator+). Postgres checks
 * the write role and the version again on every save.
 */
export default async function RemoteConfigPage() {
  const session = await verifyAdmin();
  const canSeeHistory = hasRole(session.role, "operator");
  const [config, history] = await Promise.all([
    rpc.listConfig(),
    canSeeHistory ? rpc.listAudit({ targetType: "config", limit: HISTORY_LIMIT, offset: 0 }) : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="원격 설정"
        description="점검 모드, 최소 지원 버전, 기능 스위치, 고객센터 안내를 바꿔요."
        meta={hasRole(session.role, "operator") ? null : <span>열람자 권한에서는 설정을 볼 수만 있어요.</span>}
      />
      <AuthNotice>앱이 이 설정을 읽도록 업데이트된 뒤부터 반영돼요. 단, 쓰기 차단과 이용 제한은 서버에서 바로 적용돼요.</AuthNotice>
      {config.ok ? (
        <RemoteConfigScreen
          rows={config.data}
          history={history?.ok ? history.data.rows : null}
          historyError={history && !history.ok ? "변경 기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." : null}
          role={session.role}
          operationId={newOperationId()}
        />
      ) : (
        <ErrorState message={config.error.kind === "forbidden" ? config.error.message : LIST_ERROR_MESSAGE} />
      )}
    </div>
  );
}
