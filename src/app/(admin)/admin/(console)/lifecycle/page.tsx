import { PageHeader } from "@/components/admin/common/PageHeader";
import { AccountLink } from "@/components/admin/common/AccountLink";
import { KstTime } from "@/components/admin/common/KstTime";
import { ErrorState } from "@/components/admin/states/ErrorState";
import {
  WorkflowExplorer,
  WorkflowPager,
  pageNumber,
  type WorkflowParams,
} from "@/components/admin/workflows/WorkflowExplorer";
import { verifyAdmin } from "@/lib/admin/dal";
import { workflowRpc } from "@/lib/admin/rpc/workflows";
export const metadata = { title: "탈퇴·개인 설정" };
export default async function LifecyclePage({
  searchParams,
}: {
  searchParams: Promise<WorkflowParams>;
}) {
  await verifyAdmin();
  const params = await searchParams;
  const page = pageNumber({ page: params.deletionPage });
  const result = await workflowRpc.lifecycle((page - 1) * 25);
  return (
    <div className="space-y-6">
      <PageHeader
        title="탈퇴·개인 설정"
        description="탈퇴 대기열과 도매처 즐겨찾기, 채팅 차단 상태를 확인하세요."
      />
      <section className="space-y-3">
        <h2 className="font-semibold">탈퇴 처리 대기</h2>
        {!result.ok ? (
          <ErrorState message={result.error.message} />
        ) : (
          <>
            {result.data.rows.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap gap-5 rounded-lg border bg-card p-4"
              >
                <AccountLink account={r.account} />
                <KstTime iso={r.started_at} />
                <span className="text-sm">
                  {r.queued
                    ? "삭제 대기열 등록됨"
                    : "탈퇴 요청됨 · 대기열 확인 필요"}
                </span>
              </div>
            ))}
            {!result.data.total ? (
              <p className="text-sm text-muted-foreground">
                탈퇴 처리 중인 계정이 없어요.
              </p>
            ) : null}
            <WorkflowPager
              pageKey="deletionPage"
              path="/admin/lifecycle"
              params={params}
              page={page}
              total={result.data.total}
            />
          </>
        )}
      </section>
      <WorkflowExplorer group="lifecycle" params={params} />
    </div>
  );
}
