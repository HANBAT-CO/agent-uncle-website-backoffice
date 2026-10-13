"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { AccountLink } from "@/components/admin/common/AccountLink";
import { DdayChip } from "@/components/admin/common/DdayChip";
import { Qty } from "@/components/admin/common/Qty";
import { StatusChip } from "@/components/admin/common/StatusChip";
import { DataTable } from "@/components/admin/data-table/DataTable";
import { TwoLineCell } from "@/components/admin/data-table/TwoLineCell";
import { EmptyState } from "@/components/admin/states/EmptyState";
import { formatKst } from "@/lib/admin/format";
import type { RequestRow } from "@/lib/admin/rpc/schemas";

import { answerState, eventLines, recheckNoticeLabel } from "./backorder-model";

function columns(now: Date): ColumnDef<RequestRow>[] {
  return [
    {
      id: "recheck",
      header: "재확인일",
      meta: { sortKey: "recheck_asc" },
      cell: ({ row }) => (
        <span className="flex flex-col items-start gap-0.5 leading-tight">
          <span className="num text-[0.8125rem] font-semibold">{formatKst(row.original.recheck, { now })}</span>
          <DdayChip days={row.original.recheckDays} className="h-[1.125rem]" />
        </span>
      ),
    },
    {
      id: "backorder",
      header: "남은 미송",
      meta: { align: "right" },
      cell: ({ row }) => <Qty n={row.original.ledger.backorder} unit="장" />,
    },
    {
      id: "answer",
      header: "답변 상태",
      cell: ({ row }) => <StatusChip label={answerState(row.original)} />,
    },
    {
      id: "retailer",
      header: "소매업자",
      cell: ({ row }) => <AccountLink account={row.original.retailer} className="max-w-32" />,
    },
    {
      id: "uncle",
      header: "사입삼촌",
      cell: ({ row }) => <AccountLink account={row.original.uncle} className="max-w-32" />,
    },
    {
      id: "product",
      header: "상품 · 옵션",
      cell: ({ row }) => (
        <TwoLineCell primary={row.original.product || "-"} secondary={row.original.option || undefined} className="max-w-40" />
      ),
    },
    {
      id: "lastEvent",
      header: "최근 처리",
      cell: ({ row }) => {
        const { title, reason } = eventLines(row.original.lastEvent?.title);
        return title ? (
          <TwoLineCell primary={title} secondary={reason ?? undefined} className="max-w-56" />
        ) : (
          <span className="text-muted-foreground">-</span>
        );
      },
    },
    {
      id: "notice",
      header: "재확인 알림",
      cell: ({ row }) => (
        <span data-testid="recheck-notice" className={row.original.recheckNoticeAt ? "num" : "text-muted-foreground"}>
          {recheckNoticeLabel(row.original.recheckNoticeAt, now)}
        </span>
      ),
    },
  ];
}

/**
 * 미송 재확인 list (screens 10.11), soonest recheck first. A row opens the
 * request Sheet. `now` comes from the server so dates render the same on
 * both sides.
 */
export function BackordersTable({
  rows,
  total,
  page,
  size,
  now,
  filtered,
}: {
  rows: RequestRow[];
  total: number;
  page: number;
  size: number;
  now: string;
  filtered: boolean;
}) {
  return (
    <DataTable
      caption="미송 재확인"
      columns={columns(new Date(now))}
      rows={rows}
      total={total}
      page={page}
      size={size}
      getRowId={(row) => row.id}
      rowHref={(row) => `/admin/requests/${encodeURIComponent(row.id)}`}
      sort={{ key: "recheck_asc", direction: "ascending" }}
      empty={
        <EmptyState
          title="기다리는 미송이 없어요"
          description={filtered ? "다른 보기를 골라 보세요." : "사입삼촌이 미송 결과를 공유하면 여기에 보여요."}
          resetHref={filtered ? "/admin/backorders" : undefined}
        />
      }
    />
  );
}
