import type { Metadata } from "next";

import { AuthNotice } from "@/components/admin/auth/AuthNotice";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { RemoteConfigScreen } from "@/components/admin/remote-config/RemoteConfigScreen";
import { AppReleaseList } from "@/components/admin/remote-config/AppReleaseList";
import type { WorkflowParams } from "@/components/admin/workflows/WorkflowExplorer";
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
export default async function RemoteConfigPage({ searchParams }: { searchParams: Promise<WorkflowParams> }) {
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
      <AuthNotice>원격 설정은 앱이 해당 항목을 읽을 때 반영돼요. 쓰기 차단과 이용 제한은 서버에서 바로 적용되며, 업데이트 안내는 아래 앱 릴리스에서 별도로 확인해요.</AuthNotice>
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
      <AppReleaseList params={await searchParams} />
    </div>
  );
}
