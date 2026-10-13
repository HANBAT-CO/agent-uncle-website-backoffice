import { ClockCounterClockwiseIcon } from "@phosphor-icons/react/dist/ssr";

import { KstTime } from "@/components/admin/common/KstTime";
import { auditActionLabel } from "@/lib/admin/labels";

export type MiniAuditRow = { id: number; at: string; action: string; actorName: string | null; reason?: string | null };

/** 처리 이력: the recent audit rows for one record (dossier, request). Read-only. */
export function MiniAuditList({
  rows,
  title = "처리 이력",
  emptyLabel = "아직 기록이 없어요",
}: {
  rows: MiniAuditRow[];
  title?: string;
  emptyLabel?: string;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold">
        <ClockCounterClockwiseIcon aria-hidden weight="bold" className="size-4 text-muted-foreground" />
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ol className="flex flex-col divide-y rounded-md border bg-card text-sm">
          {rows.map((row) => (
            <li key={row.id} className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-0.5 px-3 py-2">
              <KstTime iso={row.at} className="text-xs text-muted-foreground" />
              <span className="font-medium">
                {auditActionLabel(row.action)}
                <span className="ml-2 text-xs font-normal text-muted-foreground">{row.actorName ?? "운영 계정"}</span>
              </span>
              {row.reason ? <span className="col-start-2 text-xs break-words text-muted-foreground">사유: {row.reason}</span> : null}
            </li>
          ))}
        </ol>
      )}
      <p className="text-xs text-muted-foreground">감사 기록은 수정하거나 지울 수 없어요.</p>
    </section>
  );
}
