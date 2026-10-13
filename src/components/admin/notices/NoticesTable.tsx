"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { StatusChip } from "@/components/admin/common/StatusChip";
import { DataTable } from "@/components/admin/data-table/DataTable";
import { formatKst } from "@/lib/admin/format";
import { NOTICE_AUDIENCE_LABEL, NOTICE_STATE_LABEL } from "@/lib/admin/labels";
import type { NoticeRow } from "@/lib/admin/rpc/schemas";

import { noticeWindowLabel } from "./notice-form";
import { SeverityBadge } from "./SeverityBadge";

/**
 * 공지 (screens 10.14, list_notices): every notice, drafts and ended ones
 * included. A row opens the editor Sheet (`?tab=notices&notice={id}`).
 */
export function NoticesTable({ rows, authors, empty }: { rows: NoticeRow[]; authors: Record<string, string>; empty: React.ReactNode }) {
  const columns: ColumnDef<NoticeRow>[] = [
    {
      id: "title",
      header: "제목",
      meta: { width: "20rem" },
      cell: ({ row }) => <span className="block truncate font-semibold text-foreground">{row.original.title}</span>,
    },
    { id: "audience", header: "대상", cell: ({ row }) => NOTICE_AUDIENCE_LABEL[row.original.audience] },
    { id: "severity", header: "중요도", cell: ({ row }) => <SeverityBadge severity={row.original.severity} /> },
    {
      id: "window",
      header: "노출 기간",
      cell: ({ row }) => <span className="num text-muted-foreground">{noticeWindowLabel(row.original.startsAt, row.original.endsAt)}</span>,
    },
    { id: "state", header: "상태", cell: ({ row }) => <StatusChip label={NOTICE_STATE_LABEL[row.original.state]} /> },
    { id: "dismissible", header: "닫기 허용", cell: ({ row }) => (row.original.dismissible ? "허용" : "허용 안 함") },
    { id: "version", header: "버전", meta: { align: "right" }, cell: ({ row }) => row.original.version },
    {
      id: "updated",
      header: "최근 변경",
      cell: ({ row }) => (
        <span className="flex flex-col leading-tight">
          <span className="text-[0.8125rem]">{authors[row.original.updatedBy] ?? "운영 계정"}</span>
          <span className="num text-xs text-muted-foreground">{formatKst(row.original.updatedAt)}</span>
        </span>
      ),
    },
  ];

  return (
    <DataTable
      caption="공지 목록"
      columns={columns}
      rows={rows}
      total={rows.length}
      page={1}
      size={Math.max(rows.length, 1)}
      pagination={false}
      getRowId={(row) => row.id}
      rowHref={(row) => `/admin/notices?tab=notices&notice=${row.id}`}
      empty={empty}
    />
  );
}
