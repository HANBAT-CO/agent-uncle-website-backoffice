import type { Metadata } from "next";

import { AdminsTable } from "@/components/admin/admins/AdminsTable";
import { GrantAdminSheet } from "@/components/admin/admins/GrantAdminSheet";
import { AuthNotice } from "@/components/admin/auth/AuthNotice";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { ErrorState, LIST_ERROR_MESSAGE } from "@/components/admin/states/ErrorState";
import { ForbiddenState } from "@/components/admin/states/ForbiddenState";
import { requireRole } from "@/lib/admin/dal";
import { newOperationId } from "@/lib/admin/operation-id";
import { rpc } from "@/lib/admin/rpc";

export const metadata: Metadata = { title: "운영 계정" };

/**
 * 운영 계정 /admin/admins (spec 5, 6; screens appendix 10.18), owner only.
 * Operators and viewers get the in-page ForbiddenState. Every form gets its
 * own operation id; a save revalidates the page, which renders fresh ones.
 */
export default async function AdminsPage() {
  const session = await requireRole("owner");
  if (!session) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="운영 계정" />
        <ForbiddenState min="owner" />
      </div>
    );
  }

  const admins = await rpc.listAdmins();
  const operationIds = admins.ok ? Object.fromEntries(admins.data.map((admin) => [admin.userId, newOperationId()])) : {};

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="운영 계정"
        description="운영 화면에 들어올 수 있는 계정과 역할을 관리해요."
        actions={<GrantAdminSheet operationId={newOperationId()} />}
      />
      <AuthNotice>운영 계정은 앱 계정과 분리해서 써 주세요. 해제해도 기록은 지우지 않아요.</AuthNotice>
      {admins.ok ? <AdminsTable rows={admins.data} operationIds={operationIds} /> : <ErrorState message={LIST_ERROR_MESSAGE} />}
    </div>
  );
}
