"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { AccountLink } from "@/components/admin/common/AccountLink";
import { KstTime } from "@/components/admin/common/KstTime";
import { RequestLink } from "@/components/admin/common/RequestLink";
import { StatusChip } from "@/components/admin/common/StatusChip";
import { DataTable } from "@/components/admin/data-table/DataTable";
import { NOTICE_KIND_LABEL } from "@/lib/admin/labels";
import type { RecordRow } from "@/lib/admin/rpc/schemas";

type HistoryRow = RecordRow<"notices">;

/**
 * 알림 기록 (screens 10.14): the in-app notifications the app wrote for each
 * account. Chat notifications read "[채팅 알림]" (masked in SQL for every
 * role); the message itself stays behind the audited transcript.
 */
export function NoticeHistoryTable({
  rows,
  total,
  page,
  size,
  empty,
}: {
  rows: HistoryRow[];
  total: number;
  page: number;
  size: number;
  empty: React.ReactNode;
}) {
  const columns: ColumnDef<HistoryRow>[] = [
    {
      id: "owner",
      header: "받는 계정",
      meta: { width: "14rem" },
      cell: ({ row }) => {
        const owner = row.original.parties.find((party) => party.id === row.original.ownerId) ?? row.original.parties[0];
        return <AccountLink account={owner} />;
      },
    },
    {
      id: "kind",
      header: "종류",
      cell: ({ row }) => {
        const kind = row.original.kind ?? "";
        return <span className="text-muted-foreground">{NOTICE_KIND_LABEL[kind] ?? (kind || "-")}</span>;
      },
    },
    {
      id: "title",
      header: "제목",
      meta: { width: "20rem" },
      cell: ({ row }) => <span className="block truncate font-medium text-foreground">{row.original.title || "-"}</span>,
    },
    {
      id: "read",
      header: "읽음",
      cell: ({ row }) =>
        row.original.read ? (
          <span className="text-muted-foreground">읽음</span>
        ) : (
          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
            <span aria-hidden className="size-1.5 rounded-full bg-primary" />안 읽음
          </span>
        ),
    },
    { id: "createdAt", header: "생성 시각", cell: ({ row }) => <KstTime iso={row.original.createdAt} /> },
    {
      id: "target",
      header: "대상",
      meta: { width: "18rem" },
      cell: ({ row }) => {
        const request = row.original.request;
        if (!request) return <span className="text-muted-foreground">-</span>;
        return (
          <span className="flex min-w-0 items-center gap-2">
            <RequestLink id={request.id} className="truncate">
              {request.product?.trim() || "상품명 없음"}
              {request.option ? <span className="font-normal text-muted-foreground"> · {request.option}</span> : null}
            </RequestLink>
            <StatusChip label={request.label} />
          </span>
        );
      },
    },
  ];

  return (
    <DataTable
      caption="알림 기록"
      columns={columns}
      rows={rows}
      total={total}
      page={page}
      size={size}
      getRowId={(row) => row.id}
      empty={empty}
    />
  );
}
