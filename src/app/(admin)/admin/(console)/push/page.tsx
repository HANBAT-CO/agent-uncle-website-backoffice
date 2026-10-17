import { PageHeader } from "@/components/admin/common/PageHeader";
import { DefinitionList } from "@/components/admin/common/DefinitionList";
import { KstTime } from "@/components/admin/common/KstTime";
import { ErrorState } from "@/components/admin/states/ErrorState";
import { AutoRefresh } from "@/components/admin/common/AutoRefresh";
import { verifyAdmin } from "@/lib/admin/dal";
import { workflowRpc } from "@/lib/admin/rpc/workflows";
import { VALUE_LABELS } from "@/lib/admin/workflows";
export const metadata = { title: "푸시 전송 상태" };
export default async function PushPage() {
  await verifyAdmin();
  const result = await workflowRpc.push();
  if (!result.ok) return <ErrorState message={result.error.message} />;
  const d = result.data;
  return (
    <div className="space-y-6">
      <PageHeader
        title="푸시 전송 상태"
        description="기기 등록, 실시간 활동, 발송 대기와 실패를 확인하세요."
        meta={<KstTime iso={d.generatedAt} />}
      />
      <AutoRefresh />
      <section className="rounded-xl border bg-card p-5">
        <DefinitionList
          columns={3}
          items={[
            { term: "등록 기기", value: d.devices },
            { term: "알림 활성 기기", value: d.enabledDevices },
            { term: "실시간 활동", value: d.liveActivities },
            { term: "5분 이상 발송 대기", value: d.overdue },
            ...Object.entries(d.states).map(([state, n]) => ({
              term:
                state === "accepted"
                  ? "발송 접수"
                  : (VALUE_LABELS[state] ?? state),
              value: n,
            })),
          ]}
        />
      </section>
      <section className="space-y-3">
        <h2 className="font-semibold">최근 최종 실패 · 최대 50건</h2>
        {d.failures.length ? (
          d.failures.map((f) => (
            <article key={f.id} className="rounded-lg border bg-card p-4">
              <DefinitionList
                items={[
                  { term: "전송 ID", value: String(f.id) },
                  { term: "시도 횟수", value: f.attempts },
                  { term: "생성일", value: <KstTime iso={f.createdAt} /> },
                  { term: "만료일", value: <KstTime iso={f.expiresAt} /> },
                  { term: "오류 기록", value: f.hasError ? "있음" : "없음" },
                ]}
              />
            </article>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            최종 실패 기록이 없어요.
          </p>
        )}
      </section>
    </div>
  );
}
