"use client";

import { StorefrontIcon, TruckIcon, UserIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import { KstTime } from "@/components/admin/common/KstTime";
import { StatusChip } from "@/components/admin/common/StatusChip";
import { DataTable } from "@/components/admin/data-table/DataTable";
import { Pagination } from "@/components/admin/data-table/Pagination";
import { useListHref } from "@/components/admin/data-table/use-list-href";
import { EmptyState } from "@/components/admin/states/EmptyState";
import { formatKst, qty } from "@/lib/admin/format";
import { CONNECTION_STATUS_LABEL, roleKindLabel } from "@/lib/admin/labels";
import type { AccountBrief, ConversationRow } from "@/lib/admin/rpc/schemas";
import { cn } from "@/lib/admin/utils";

import { pairKey, pairSides } from "./transcript";

/*
 * 채팅 열람 list (screens 10.13): list_conversations metadata only, never a
 * message body. The full table shows when no pair is selected; with `?a=&b=`
 * the same rows become the left rail of the three-pane view.
 */

function RoleIcon({ role, className }: { role: string | null; className?: string }) {
  const Icon = role === "retailer" ? StorefrontIcon : role === "uncle" ? TruckIcon : UserIcon;
  return <Icon aria-label={roleKindLabel(role)} role="img" weight="bold" className={cn("size-3.5 shrink-0 text-muted-foreground", className)} />;
}

function AccountName({ account }: { account: AccountBrief }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <RoleIcon role={account.role} />
      <span className="truncate">{account.name?.trim() || "이름 없음"}</span>
    </span>
  );
}

/** "수원 행궁 니트하우스 · APM 최삼촌", the retailer first. */
export function PairNames({ a, b, className }: { a: AccountBrief; b: AccountBrief; className?: string }) {
  const { left, right } = pairSides(a, b);
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <AccountName account={left} />
      <span aria-hidden className="text-muted-foreground">
        ·
      </span>
      <AccountName account={right} />
    </span>
  );
}

function connectionLabel(status: string | null): string | null {
  return status ? (CONNECTION_STATUS_LABEL[status] ?? status) : null;
}

function useConversationHref(page: number) {
  const hrefWith = useListHref();
  return (row: ConversationRow) => hrefWith({ a: row.accountA.id, b: row.accountB.id, page: page > 1 ? page : null });
}

const count = (n: number) => qty(n, "건");

export function ConversationTable({ rows, total, page, size }: { rows: ConversationRow[]; total: number; page: number; size: number }) {
  const href = useConversationHref(page);
  const columns: ColumnDef<ConversationRow>[] = [
    {
      id: "pair",
      header: "거래처 쌍",
      meta: { width: "22rem" },
      cell: ({ row }) => <PairNames a={row.original.accountA} b={row.original.accountB} className="font-semibold text-foreground" />,
    },
    {
      id: "connection",
      header: "연결 상태",
      cell: ({ row }) => {
        const label = connectionLabel(row.original.connection);
        return label ? <StatusChip label={label} /> : <span className="text-muted-foreground">-</span>;
      },
    },
    { id: "lastAt", header: "마지막 메시지 시각", cell: ({ row }) => <KstTime iso={row.original.lastAt} /> },
    { id: "userMessages", header: "메시지", meta: { align: "right" }, cell: ({ row }) => count(row.original.userMessages) },
    { id: "systemMessages", header: "업무 기록", meta: { align: "right" }, cell: ({ row }) => count(row.original.systemMessages) },
    { id: "linkedRequests", header: "연결된 요청", meta: { align: "right" }, cell: ({ row }) => count(row.original.linkedRequests) },
    {
      id: "unread",
      header: "안 읽음",
      meta: { align: "right" },
      cell: ({ row }) => <span className={row.original.unread > 0 ? "font-semibold text-foreground" : undefined}>{count(row.original.unread)}</span>,
    },
    { id: "withAttachments", header: "사진 포함", meta: { align: "right" }, cell: ({ row }) => count(row.original.withAttachments) },
  ];

  return (
    <DataTable
      caption="채팅 열람: 거래처 쌍별 대화 기록"
      columns={columns}
      rows={rows}
      total={total}
      page={page}
      size={size}
      getRowId={(row) => pairKey(row.accountA.id, row.accountB.id)}
      rowHref={href}
      empty={<EmptyState title="아직 대화가 없어요" description="거래처 연결을 수락하면 1:1 채팅을 시작할 수 있어요." />}
    />
  );
}

/** The left pane while a pair is open: the same page of pairs, compact. */
export function ConversationRail({
  rows,
  total,
  page,
  size,
  selected,
}: {
  rows: ConversationRow[];
  total: number;
  page: number;
  size: number;
  selected: string;
}) {
  const href = useConversationHref(page);
  const hrefWith = useListHref();
  return (
    <nav aria-label="거래처 쌍" className="flex min-h-0 flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold">거래처 쌍</h2>
        <Link href={hrefWith({ a: null, b: null, page: page > 1 ? page : null })} scroll={false} className="text-xs text-muted-foreground hover:text-foreground hover:underline">
          전체 목록 보기
        </Link>
      </div>
      <ul className="flex max-h-[calc(100dvh-15rem)] min-h-0 flex-col gap-1 overflow-y-auto rounded-xl border bg-card p-1.5">
        {rows.map((row) => {
          const key = pairKey(row.accountA.id, row.accountB.id);
          const active = key === selected;
          const label = connectionLabel(row.connection);
          return (
            <li key={key}>
              <Link
                href={href(row)}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col gap-1 rounded-lg px-2.5 py-2 text-[0.8125rem] outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40",
                  active && "bg-secondary hover:bg-secondary",
                )}
              >
                <PairNames a={row.accountA} b={row.accountB} className="font-semibold" />
                <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="num">{formatKst(row.lastAt)}</span>
                  {row.unread > 0 ? <span className="num font-semibold text-foreground">안 읽음 {row.unread}</span> : null}
                </span>
                <span className="num truncate text-xs text-muted-foreground">
                  메시지 {row.userMessages} · 업무 기록 {row.systemMessages}
                  {label ? ` · ${label}` : ""}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {total > size ? <Pagination total={total} page={page} size={size} /> : null}
    </nav>
  );
}
