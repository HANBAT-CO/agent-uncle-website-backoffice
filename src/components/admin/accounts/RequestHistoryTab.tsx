import { AccountLink } from "@/components/admin/common/AccountLink";
import { KstTime } from "@/components/admin/common/KstTime";
import { RequestLink } from "@/components/admin/common/RequestLink";
import { StatusChip } from "@/components/admin/common/StatusChip";
import { requestUnit } from "@/lib/admin/format";
import { REQUEST_LABELS } from "@/lib/admin/labels";
import type { AccountDossier } from "@/lib/admin/rpc/schemas";

/** Label counts of both sides, in the app's label order. */
function labelCounts(stats: AccountDossier["requestStats"]): [string, number][] {
  const merged = new Map<string, number>();
  for (const side of [stats.asRetailer, stats.asUncle]) {
    for (const [label, n] of Object.entries(side)) merged.set(label, (merged.get(label) ?? 0) + n);
  }
  const order = REQUEST_LABELS as readonly string[];
  return [...merged.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
}

/** 요청 이력 (screens 10.7): label counts as chips, then the last 20 requests linking to the request sheet. */
export function RequestHistoryTab({
  stats,
  requests,
}: {
  stats: AccountDossier["requestStats"];
  requests: AccountDossier["recentRequests"];
}) {
  const counts = labelCounts(stats);
  const total = counts.reduce((sum, [, n]) => sum + n, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2" aria-label="상태별 요청 수">
        <span className="num text-sm font-semibold">전체 {total.toLocaleString("ko-KR")}건</span>
        {counts.map(([label, n]) => (
          <span key={label} className="inline-flex items-center gap-1">
            <StatusChip label={label} />
            <span className="num text-xs text-muted-foreground">{n.toLocaleString("ko-KR")}건</span>
          </span>
        ))}
      </div>
      {requests.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">아직 사입 요청이 없어요</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full border-separate border-spacing-0 text-[0.8125rem]">
            <caption className="sr-only">최근 사입 요청 20건</caption>
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th scope="col" className="h-10 border-b px-3 font-medium">상품 · 옵션</th>
                <th scope="col" className="h-10 border-b px-3 font-medium">상태</th>
                <th scope="col" className="h-10 border-b px-3 font-medium">거래처</th>
                <th scope="col" className="h-10 border-b px-3 text-right font-medium">요청 · 확보 · 전달 · 수령</th>
                <th scope="col" className="h-10 border-b px-3 font-medium">요청 시각</th>
                <th scope="col" className="h-10 border-b px-3 font-medium">최근 처리</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id} className="h-12">
                  <td className="max-w-80 border-b px-3">
                    <RequestLink id={request.id} className="block truncate">
                      {[(request.title || request.product), request.option].filter(Boolean).join(" · ") || "상품 정보 없음"}
                    </RequestLink>
                  </td>
                  <td className="border-b px-3">
                    <StatusChip label={request.label} />
                  </td>
                  <td className="border-b px-3">
                    <AccountLink account={request.partner} />
                  </td>
                  <td className="num border-b px-3 text-right whitespace-nowrap">
                    {[request.ledger.quantity, request.ledger.acquired, request.ledger.delivered, request.ledger.received].join(" · ")} {requestUnit(request.requestType)}
                  </td>
                  <td className="border-b px-3 text-muted-foreground">
                    <KstTime iso={request.createdAt} />
                  </td>
                  <td className="border-b px-3 text-muted-foreground">
                    <KstTime iso={request.updatedAt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
