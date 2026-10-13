import { StatusChip } from "@/components/admin/common/StatusChip";
import { formatSince } from "@/lib/admin/format";
import { actorRoleLabel, ISSUE_STATUS_LABEL } from "@/lib/admin/labels";
import type { RequestDossier } from "@/lib/admin/rpc/schemas";

import { DetailTable } from "./DetailTable";
import { issueParts } from "./request-model";

/**
 * 문제 (screens 10.9): 유형 (the first line of reason), 설명, 보고자, 상태,
 * 보류 {n}개, 조치, 열린 기간. Only the retailer confirms a fix in the app.
 */
export function IssuesTab({ data, now }: { data: RequestDossier; now: Date }) {
  const ids = { retailerId: data.request.retailerId, uncleId: data.request.uncleId };
  return (
    <DetailTable
      caption="문제"
      testId="issues-table"
      empty="문제 기록이 없어요"
      columns={[
        { header: "유형" },
        { header: "설명", className: "min-w-48" },
        { header: "보고자" },
        { header: "상태" },
        { header: "보류", align: "right" },
        { header: "조치", className: "min-w-40" },
        { header: "열린 기간" },
      ]}
      rows={data.issues.map((issue) => {
        const parts = issueParts(issue.reason, issue.actual);
        const resolved = issue.status === "resolved";
        return {
          key: issue.id,
          cells: [
            <span key="kind" className="font-semibold whitespace-nowrap">
              {parts.kind}
            </span>,
            <span key="detail" className="whitespace-pre-wrap">
              {parts.detail || "-"}
            </span>,
            actorRoleLabel(issue.reporterId, ids),
            <StatusChip key="status" label={ISSUE_STATUS_LABEL[issue.status ?? ""] ?? issue.status ?? "-"} />,
            `${(issue.held ?? 0).toLocaleString("ko-KR")}개`,
            issue.action ? (
              <span key="action" className="whitespace-pre-wrap">
                {issue.action}
              </span>
            ) : null,
            resolved ? null : <span key="open">{formatSince(issue.createdAt, now)}</span>,
          ],
        };
      })}
    />
  );
}
