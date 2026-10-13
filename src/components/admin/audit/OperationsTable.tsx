"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import { KstTime } from "@/components/admin/common/KstTime";
import { DataTable } from "@/components/admin/data-table/DataTable";
import { useListHref } from "@/components/admin/data-table/use-list-href";
import { roleKindLabel } from "@/lib/admin/labels";
import type { OperationRow } from "@/lib/admin/rpc/schemas";

import { shortId } from "./audit-format";

/**
 * 앱 작업 기록 (screens 10.17): the app's command ledger with command names
 * and results only. Arguments never leave Postgres (they hold message
 * bodies, drafts and profile data). The account name filters the list.
 */
export function OperationsTable({
  rows,
  total,
  page,
  size,
  empty,
}: {
  rows: OperationRow[];
  total: number;
  page: number;
  size: number;
  empty: React.ReactNode;
}) {
  const hrefWith = useListHref();

  const columns: ColumnDef<OperationRow>[] = [
    {
      id: "at",
      header: "시각",
      meta: { width: "8.5rem" },
      cell: ({ row }) => <KstTime iso={row.original.createdAt} />,
    },
    {
      id: "account",
      header: "계정",
      meta: { width: "14rem" },
      cell: ({ row }) => {
        const actor = row.original.actor;
        return (
          <span className="flex min-w-0 flex-col leading-tight">
            <Link
              href={hrefWith({ account: actor.id })}
              scroll={false}
              className="truncate text-[0.8125rem] font-semibold text-foreground hover:text-primary hover:underline"
              title="이 계정의 기록만 보기"
            >
              {actor.name?.trim() || "이름 없음"}
            </Link>
            <span className="mt-0.5 truncate text-xs text-muted-foreground">
              {roleKindLabel(actor.role)}
              {actor.demo ? " · 데모" : ""}
            </span>
          </span>
        );
      },
    },
    {
      id: "command",
      header: "명령",
      meta: { width: "12rem" },
      cell: ({ row }) =>
        row.original.command ? (
          <span className="font-mono text-[0.8125rem]" data-testid="operation-command">
            {row.original.command}
          </span>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      id: "result",
      header: "결과",
      cell: ({ row }) =>
        row.original.result ? (
          <span className="block truncate font-mono text-xs" title={row.original.result}>
            {shortId(row.original.result)}
          </span>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      id: "operationId",
      header: "작업 번호",
      meta: { width: "10rem" },
      cell: ({ row }) => (
        <span className="block truncate font-mono text-xs text-muted-foreground" title={row.original.operationId}>
          {shortId(row.original.operationId)}
        </span>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      total={total}
      page={page}
      size={size}
      getRowId={(row) => `${row.actor.id}:${row.operationId}`}
      caption="앱 작업 기록"
      empty={empty}
    />
  );
}
