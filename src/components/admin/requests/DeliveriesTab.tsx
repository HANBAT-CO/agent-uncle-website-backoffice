import { KstTime } from "@/components/admin/common/KstTime";
import { StatusChip } from "@/components/admin/common/StatusChip";
import { deliveryState } from "@/lib/admin/labels";
import type { RequestDossier } from "@/lib/admin/rpc/schemas";

import { DetailTable } from "./DetailTable";

const n = (value: number | null | undefined, unit = "장") => (typeof value === "number" ? `${value.toLocaleString("ko-KR")}${unit}` : null);

/** 전달 회차 (screens 10.9): {n}차, 전달 일시, 이번 전달, 확인한 수량, 실제 받은 수량, 상태, 정정됨. */
export function DeliveriesTab({ deliveries, unit = "장" }: { deliveries: RequestDossier["deliveries"]; unit?: "장" | "건" }) {
  return (
    <DetailTable
      caption="전달 회차"
      testId="deliveries-table"
      empty="아직 전달 회차가 없어요"
      columns={[
        { header: "회차", className: "w-16" },
        { header: "전달 일시" },
        { header: "이번 전달", align: "right" },
        { header: "확인한 수량", align: "right" },
        { header: "실제 받은 수량", align: "right" },
        { header: "상태" },
        { header: "정정" },
      ]}
      rows={deliveries.map((delivery) => ({
        key: delivery.id,
        cells: [
          <span key="round" className="num font-semibold">
            {delivery.round}차
          </span>,
          <KstTime key="at" iso={delivery.createdAt} />,
          n(delivery.quantity, unit),
          delivery.receiptRecorded ? n(delivery.received, unit) : null,
          delivery.receiptRecorded ? n(delivery.actual, unit) : null,
          <StatusChip key="state" label={deliveryState(delivery)} />,
          delivery.correctedAt ? (
            <span key="corrected" className="inline-flex flex-col">
              <span className="font-medium">정정됨</span>
              <KstTime iso={delivery.correctedAt} className="text-xs text-muted-foreground" />
            </span>
          ) : null,
        ],
      }))}
    />
  );
}
