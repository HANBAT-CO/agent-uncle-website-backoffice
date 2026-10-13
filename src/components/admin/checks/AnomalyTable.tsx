"use client";

import { createColumnHelper } from "@tanstack/react-table";

import { KstTime } from "@/components/admin/common/KstTime";
import { DataTable } from "@/components/admin/data-table/DataTable";

import type { AnomalyRowModel } from "./anomaly-model";
import { ToneChip } from "./ToneChip";

const column = createColumnHelper<AnomalyRowModel>();

const columns = [
  column.accessor((row) => row.severity.label, {
    id: "severity",
    header: "중요도",
    meta: { width: "6rem" },
    cell: ({ row }) => <ToneChip label={row.original.severity.label} tone={row.original.severity.tone} icon={row.original.severity.icon} />,
  }),
  column.accessor("kindLabel", {
    header: "종류",
    meta: { width: "12rem" },
    cell: ({ getValue }) => <span className="font-semibold text-foreground">{getValue()}</span>,
  }),
  column.accessor("target", {
    header: "대상",
    meta: { width: "16rem" },
    cell: ({ getValue }) => <span className="block max-w-64 truncate">{getValue()}</span>,
  }),
  column.accessor("summary", {
    header: "내용",
    cell: ({ row }) =>
      row.original.note ? (
        <span className="flex max-w-[28rem] flex-col gap-0.5 py-1.5 leading-snug whitespace-normal">
          <span className="font-semibold text-foreground">{row.original.summary}</span>
          <span className="text-xs text-muted-foreground">{row.original.note}</span>
        </span>
      ) : (
        <span className="block max-w-[28rem] truncate text-muted-foreground">{row.original.summary}</span>
      ),
  }),
  column.accessor("since", {
    header: "발생 시각",
    meta: { width: "9rem" },
    cell: ({ getValue }) => <KstTime iso={getValue()} />,
  }),
];

/**
 * 운영 점검 list (screens 10.6): 중요도, 종류, 대상, 내용, 발생 시각. Rows
 * link to their target. Ledger rows show the Korean violation labels and the
 * fixed note. Rows arrive already filtered and paged by the server page.
 */
export function AnomalyTable({
  rows,
  total,
  page,
  size,
  empty,
}: {
  rows: AnomalyRowModel[];
  total: number;
  page: number;
  size: number;
  empty: React.ReactNode;
}) {
  return (
    <DataTable
      caption="운영 점검 목록"
      columns={columns}
      rows={rows}
      total={total}
      page={page}
      size={size}
      getRowId={(row) => row.id}
      rowHref={(row) => row.href}
      empty={empty}
    />
  );
}
