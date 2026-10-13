"use client";

import { ArrowRightIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";

import { AccountLink } from "@/components/admin/common/AccountLink";
import { KstTime } from "@/components/admin/common/KstTime";
import { StatusChip } from "@/components/admin/common/StatusChip";
import { DataTable } from "@/components/admin/data-table/DataTable";
import { formatSince } from "@/lib/admin/format";
import { CONNECTION_STATUS_LABEL } from "@/lib/admin/labels";
import type { RecordRow } from "@/lib/admin/rpc/schemas";

export type ConnectionRow = RecordRow<"connections">;

function party(row: ConnectionRow, id: string | null | undefined) {
  return row.parties.find((p) => p.id === id) ?? (id ? { id, name: null, role: null } : null);
}

const columns: ColumnDef<ConnectionRow>[] = [
  {
    id: "pair",
    header: "요청한 쪽 → 받은 쪽",
    meta: { width: "26rem" },
    cell: ({ row }) => (
      <span className="flex min-w-0 items-center gap-2">
        <AccountLink account={party(row.original, row.original.from)} className="min-w-0" />
        <ArrowRightIcon aria-hidden weight="bold" className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="sr-only">받은 쪽</span>
        <AccountLink account={party(row.original, row.original.to)} className="min-w-0" />
      </span>
    ),
  },
  {
    id: "status",
    header: "상태",
    meta: { width: "8rem" },
    cell: ({ row }) => <StatusChip label={CONNECTION_STATUS_LABEL[row.original.status ?? ""] ?? (row.original.status || "-")} />,
  },
  {
    id: "createdAt",
    header: "요청 일시",
    meta: { width: "9rem" },
    cell: ({ row }) => <KstTime iso={row.original.createdAt} className="text-muted-foreground" />,
  },
  {
    id: "waiting",
    header: "대기 시간",
    meta: { width: "7rem", align: "right" },
    cell: ({ row }) =>
      row.original.status === "pending" ? (
        <WaitingTime iso={row.original.createdAt ?? row.original.updatedAt} />
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },
];

/** Relative to the browser clock; suppressHydrationWarning covers the server/client minute gap. */
function WaitingTime({ iso }: { iso: string }) {
  return (
    <span className="num" suppressHydrationWarning>
      {formatSince(iso)}
    </span>
  );
}

/** 거래처 연결 table (screens 10.8). Read-only: the names link to the dossiers. */
export function ConnectionsTable({
  rows,
  total,
  page,
  size,
  empty,
}: {
  rows: ConnectionRow[];
  total: number;
  page: number;
  size: number;
  empty: React.ReactNode;
}) {
  return <DataTable caption="거래처 연결 목록" columns={columns} rows={rows} total={total} page={page} size={size} getRowId={(row) => row.id} empty={empty} />;
}
