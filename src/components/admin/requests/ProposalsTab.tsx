import { KstTime } from "@/components/admin/common/KstTime";
import { StatusChip } from "@/components/admin/common/StatusChip";
import { actorRoleLabel, PROPOSAL_KIND_LABEL, PROPOSAL_STATUS_LABEL } from "@/lib/admin/labels";
import type { RequestDossier } from "@/lib/admin/rpc/schemas";

import { DetailTable } from "./DetailTable";
import { proposalSummary } from "./request-model";

/** 변경·취소·정정 (screens 10.9): 종류, 제안자, 상태, 사유, the proposed values, 시각. Read-only: only the partner confirms. */
export function ProposalsTab({ data }: { data: RequestDossier }) {
  const ids = { retailerId: data.request.retailerId, uncleId: data.request.uncleId };
  return (
    <DetailTable
      caption="변경·취소·정정"
      testId="proposals-table"
      empty="변경·취소·정정 기록이 없어요"
      columns={[
        { header: "종류", className: "w-16" },
        { header: "제안자" },
        { header: "상태" },
        { header: "사유", className: "min-w-48" },
        { header: "제안한 값", className: "min-w-40" },
        { header: "시각" },
      ]}
      rows={data.proposals.map((proposal) => ({
        key: proposal.id,
        cells: [
          <span key="kind" className="font-semibold">
            {PROPOSAL_KIND_LABEL[proposal.kind ?? ""] ?? proposal.kind ?? "-"}
          </span>,
          actorRoleLabel(proposal.proposerId, ids),
          <StatusChip key="status" label={PROPOSAL_STATUS_LABEL[proposal.status ?? ""] ?? proposal.status ?? "-"} />,
          <span key="reason" className="whitespace-pre-wrap">
            {proposal.values?.reason || "-"}
          </span>,
          <span key="values" className="num text-xs">
            {proposalSummary(proposal.values, proposal, data.request.requestType)}
          </span>,
          <KstTime key="at" iso={proposal.createdAt} />,
        ],
      }))}
    />
  );
}
