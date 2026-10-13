"use client";

import { WarningCircleIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";

import { DdayChip } from "@/components/admin/common/DdayChip";
import { StatusChip } from "@/components/admin/common/StatusChip";
import { DataTable, type DataTableSort } from "@/components/admin/data-table/DataTable";
import { TwoLineCell } from "@/components/admin/data-table/TwoLineCell";
import { formatKst } from "@/lib/admin/format";

/** One list row, shaped on the server (relative times are computed there, so hydration never differs). */
export type RequestListRow = {
  id: string;
  createdAt: string | null;
  label: string;
  retailer: string | null;
  uncle: string | null;
  wholesaler: string | null;
  location: string | null;
  product: string | null;
  option: string | null;
  quantity: number;
  acquired: number;
  delivered: number;
  received: number;
  backorder: number;
  recheck: string | null;
  recheckDays: number | null;
  lastEvent: string | null;
  lastEventAgo: string | null;
  version: number;
  violations: number;
};

const dash = <span className="text-muted-foreground">-</span>;

function Party({ name }: { name: string | null }) {
  return <span className="block max-w-28 truncate">{name?.trim() || "이름 없음"}</span>;
}

const columns: ColumnDef<RequestListRow>[] = [
  {
    id: "createdAt",
    header: "요청 시각",
    meta: { width: "8.5rem", sortKey: "created" },
    cell: ({ row }) => <TwoLineCell primary={formatKst(row.original.createdAt)} secondary={`#${row.original.id.slice(0, 8)}`} />,
  },
  {
    id: "label",
    header: "상태",
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-1">
        <StatusChip label={row.original.label} />
        {row.original.violations > 0 ? (
          <span title="수량 기록 불일치" className="inline-flex text-status-attention">
            <WarningCircleIcon role="img" aria-label="수량 기록 불일치" weight="fill" className="size-4" />
          </span>
        ) : null}
      </span>
    ),
  },
  { id: "retailer", header: "소매업자", cell: ({ row }) => <Party name={row.original.retailer} /> },
  { id: "uncle", header: "사입삼촌", cell: ({ row }) => <Party name={row.original.uncle} /> },
  {
    id: "wholesaler",
    header: "도매처",
    cell: ({ row }) => (row.original.wholesaler || row.original.location ? <TwoLineCell primary={row.original.wholesaler || "-"} secondary={row.original.location} className="max-w-32" /> : dash),
  },
  {
    id: "product",
    header: "상품 · 옵션",
    cell: ({ row }) => <TwoLineCell primary={row.original.product || "-"} secondary={row.original.option} className="max-w-40" />,
  },
  {
    id: "counts",
    // Two lines, so the widest header does not set the column width.
    header: () => (
      <span className="inline-flex flex-col items-end leading-tight">
        <span>요청 · 확보 · 전달 · 수령</span>
        <span>(장)</span>
      </span>
    ),
    meta: { align: "right" },
    cell: ({ row }) => {
      const r = row.original;
      return (
        <span data-testid="row-counts">
          {r.quantity} · {r.acquired} · {r.delivered} · {r.received}
        </span>
      );
    },
  },
  {
    id: "backorder",
    header: "남은 미송",
    meta: { align: "right" },
    cell: ({ row }) => (row.original.backorder > 0 ? `${row.original.backorder.toLocaleString("ko-KR")}장` : <span className="text-muted-foreground">0장</span>),
  },
  {
    id: "recheck",
    header: "재확인일",
    meta: { sortKey: "recheck" },
    cell: ({ row }) =>
      row.original.recheck ? (
        <span className="flex flex-col items-start gap-0.5 leading-tight">
          <span className="num text-[0.8125rem] font-semibold">{formatKst(row.original.recheck, { time: false })}</span>
          <DdayChip days={row.original.recheckDays} className="h-4" />
        </span>
      ) : (
        dash
      ),
  },
  {
    id: "lastEvent",
    header: "최근 처리",
    meta: { sortKey: "updated" },
    cell: ({ row }) =>
      row.original.lastEvent ? <TwoLineCell primary={row.original.lastEvent} secondary={row.original.lastEventAgo} className="max-w-44" /> : dash,
  },
  {
    id: "version",
    header: "버전",
    meta: { align: "right", width: "4rem" },
    cell: ({ row }) => <span className="text-muted-foreground">v{row.original.version}</span>,
  },
];

const SORT_STATE: Record<string, DataTableSort> = {
  updated_desc: { key: "updated", direction: "descending" },
  created_desc: { key: "created", direction: "descending" },
  created_asc: { key: "created", direction: "ascending" },
  recheck_asc: { key: "recheck", direction: "ascending" },
};

/**
 * 사입 요청 list (screens 10.9). A row opens the request: from here the
 * intercepted Sheet over this list (scroll and selection stay), a pasted URL
 * the full page.
 */
export function RequestsTable({
  rows,
  total,
  page,
  size,
  sort,
  footer,
  empty,
}: {
  rows: RequestListRow[];
  total: number;
  page: number;
  size: number;
  sort: string;
  footer: React.ReactNode;
  empty: React.ReactNode;
}) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      total={total}
      page={page}
      size={size}
      getRowId={(row) => row.id}
      rowHref={(row) => `/admin/requests/${encodeURIComponent(row.id)}`}
      selectable
      sort={SORT_STATE[sort] ?? null}
      footer={footer}
      empty={empty}
      caption="사입 요청 목록"
    />
  );
}
