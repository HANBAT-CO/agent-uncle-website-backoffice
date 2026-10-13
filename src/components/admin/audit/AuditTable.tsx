"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import { KstTime } from "@/components/admin/common/KstTime";
import { DataTable } from "@/components/admin/data-table/DataTable";
import { TwoLineCell } from "@/components/admin/data-table/TwoLineCell";
import { auditActionLabel, CONFIG_KEY_LABEL } from "@/lib/admin/labels";
import { ROLE_LABEL, isAdminRole } from "@/lib/admin/roles";
import type { AuditRow } from "@/lib/admin/rpc/schemas";

import { browserLabel, changeSummary, shortId, targetTypeLabel } from "./audit-format";

const EXPORT_KIND_LABEL: Record<string, string> = {
  requests: "사입 요청",
  deliveries: "전달 회차",
  receipts: "수령 기록",
  issues: "문제",
  proposals: "변경·취소·정정",
  accounts: "계정",
  leads: "랜딩 문의",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 대상 as 종류 · ID · 이름 (when the console can resolve it), linking to the target where it has a screen. */
function Target({ row, adminNames }: { row: AuditRow; adminNames: Record<string, string> }) {
  const kind = targetTypeLabel(row.targetType);
  const id = row.targetId;
  let name: string | null = null;
  let href: string | null = null;
  if (row.targetType === "admin") name = adminNames[id] ?? null;
  if (row.targetType === "config") name = CONFIG_KEY_LABEL[id] ?? null;
  if (row.targetType === "export") name = EXPORT_KIND_LABEL[id] ?? null;
  if (row.targetType === "account" && UUID.test(id)) {
    href = `/admin/accounts/${id}`;
    name = adminNames[id] ?? null;
  }
  if (row.targetType === "request" && id) href = `/admin/requests/${encodeURIComponent(id)}`;

  const primary = name ? `${kind} · ${name}` : kind;
  const secondary = id ? (
    href ? (
      <Link href={href} title={id} className="font-mono hover:text-primary hover:underline">
        {shortId(id)}
      </Link>
    ) : (
      <span title={id} className="font-mono">
        {shortId(id)}
      </span>
    )
  ) : null;
  return <TwoLineCell primary={primary} secondary={secondary} />;
}

/**
 * 감사 로그 rows (screens 10.17): 시각, 운영자, 작업, 대상, 사유, 변경 전 → 후,
 * 접속 정보. Read-only: the log rejects UPDATE and DELETE in Postgres, and
 * the console offers neither.
 */
export function AuditTable({
  rows,
  total,
  page,
  size,
  adminNames,
  empty,
}: {
  rows: AuditRow[];
  total: number;
  page: number;
  size: number;
  adminNames: Record<string, string>;
  empty: React.ReactNode;
}) {
  const columns: ColumnDef<AuditRow>[] = [
    {
      id: "at",
      header: "시각",
      meta: { width: "8.5rem" },
      cell: ({ row }) => <KstTime iso={row.original.at} />,
    },
    {
      id: "actor",
      header: "운영자",
      meta: { width: "8rem" },
      cell: ({ row }) => (
        <TwoLineCell
          primary={row.original.actorName ?? "이름 없는 운영자"}
          secondary={isAdminRole(row.original.actorRole) ? ROLE_LABEL[row.original.actorRole] : row.original.actorRole}
        />
      ),
    },
    {
      id: "action",
      header: "작업",
      meta: { width: "9rem" },
      cell: ({ row }) => (
        <TwoLineCell primary={auditActionLabel(row.original.action)} secondary={<span className="font-mono">{row.original.action}</span>} />
      ),
    },
    {
      id: "target",
      header: "대상",
      meta: { width: "10rem" },
      cell: ({ row }) => <Target row={row.original} adminNames={adminNames} />,
    },
    {
      id: "reason",
      header: "사유",
      meta: { width: "11rem" },
      cell: ({ row }) =>
        row.original.reason ? (
          <span className="block truncate" title={row.original.reason}>
            {row.original.reason}
          </span>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      id: "change",
      header: "변경 전 → 후",
      cell: ({ row }) => {
        const lines = changeSummary(row.original.action, row.original.targetId, row.original.before, row.original.after);
        if (lines.length === 0) return <span className="text-muted-foreground">-</span>;
        const rest = lines.length > 2 ? ` 외 ${lines.length - 2}개` : "";
        return (
          <span className="flex min-w-0 flex-col leading-tight" title={lines.join("\n")}>
            <span className="truncate text-[0.8125rem] text-foreground">{lines[0]}</span>
            {lines[1] ? (
              <span className="mt-0.5 truncate text-xs text-muted-foreground">
                {lines[1]}
                {rest}
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      id: "client",
      header: "접속 정보",
      meta: { width: "10rem" },
      cell: ({ row }) => {
        const { ip, userAgent } = row.original.client;
        const browser = browserLabel(userAgent);
        if (!ip && !browser) return <span className="text-muted-foreground">-</span>;
        return (
          <span className="block truncate text-xs" title={userAgent ?? undefined}>
            <span className="num">{ip ?? "-"}</span>
            {browser ? <span className="text-muted-foreground"> · {browser}</span> : null}
          </span>
        );
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      total={total}
      page={page}
      size={size}
      getRowId={(row) => String(row.id)}
      caption="감사 기록"
      empty={empty}
    />
  );
}
