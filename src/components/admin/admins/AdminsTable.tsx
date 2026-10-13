"use client";

import { CheckCircleIcon, ShieldCheckIcon, XCircleIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";

import { KstTime } from "@/components/admin/common/KstTime";
import { DataTable } from "@/components/admin/data-table/DataTable";
import { TwoLineCell } from "@/components/admin/data-table/TwoLineCell";
import { EmptyState } from "@/components/admin/states/EmptyState";
import { ROLE_LABEL } from "@/lib/admin/roles";
import type { AdminRow } from "@/lib/admin/rpc/schemas";
import { cn } from "@/lib/admin/utils";

import { RevokeDialog } from "./RevokeDialog";
import { RoleChangeDialog } from "./RoleChangeDialog";

export const SELF_HINT = "본인 권한은 다른 관리자가 변경해야 해요.";

function Chip({ tone, icon: Icon, children }: { tone: "normal" | "neutral"; icon: typeof CheckCircleIcon; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap",
        tone === "normal" ? "bg-status-normal-bg text-status-normal" : "bg-status-neutral-bg text-status-neutral",
      )}
    >
      <Icon aria-hidden weight={tone === "normal" ? "fill" : "bold"} className="size-3.5 shrink-0" />
      {children}
    </span>
  );
}

/**
 * 운영 계정 rows (screens 10.18): 이름, 이메일, 역할, 2단계 인증, 최근 로그인,
 * 상태, and "역할 변경" / "해제". Your own row has no actions.
 */
export function AdminsTable({ rows, operationIds }: { rows: AdminRow[]; operationIds: Record<string, string> }) {
  const columns: ColumnDef<AdminRow>[] = [
    {
      id: "name",
      header: "이름",
      meta: { width: "11rem" },
      cell: ({ row }) => <TwoLineCell primary={row.original.displayName || "이름 없음"} secondary={row.original.isMe ? "나" : undefined} />,
    },
    {
      id: "email",
      header: "이메일",
      cell: ({ row }) => <span className="block truncate">{row.original.email ?? "-"}</span>,
    },
    {
      id: "role",
      header: "역할",
      meta: { width: "6rem" },
      cell: ({ row }) => ROLE_LABEL[row.original.role],
    },
    {
      id: "mfa",
      header: "2단계 인증",
      meta: { width: "11rem" },
      cell: ({ row }) => {
        const factors = row.original.mfaFactors ?? 0;
        return (
          <span className="flex items-center gap-1.5">
            {factors > 0 ? (
              <Chip tone="normal" icon={CheckCircleIcon}>
                등록됨 {factors}개
              </Chip>
            ) : (
              <Chip tone="neutral" icon={XCircleIcon}>
                미등록
              </Chip>
            )}
            {row.original.requireMfa ? (
              <span className="inline-flex h-6 items-center gap-1 rounded-full bg-secondary px-2 text-xs font-medium text-secondary-foreground">
                <ShieldCheckIcon aria-hidden weight="bold" className="size-3.5" />
                필수
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      id: "lastSignIn",
      header: "최근 로그인",
      meta: { width: "8.5rem" },
      cell: ({ row }) => <KstTime iso={row.original.lastSignInAt} />,
    },
    {
      id: "status",
      header: "상태",
      meta: { width: "6.5rem" },
      cell: ({ row }) =>
        row.original.revokedAt ? (
          <Chip tone="neutral" icon={XCircleIcon}>
            해제됨
          </Chip>
        ) : (
          <Chip tone="normal" icon={CheckCircleIcon}>
            활성
          </Chip>
        ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">관리</span>,
      meta: { width: "15rem", align: "right" },
      cell: ({ row }) => {
        const admin = row.original;
        if (admin.isMe) return <span className="text-xs whitespace-normal text-muted-foreground">{SELF_HINT}</span>;
        if (admin.revokedAt) return <span className="text-xs text-muted-foreground">운영 계정 추가로 다시 부여할 수 있어요</span>;
        const operationId = operationIds[admin.userId];
        return (
          <span className="inline-flex items-center justify-end gap-1.5">
            <RoleChangeDialog
              userId={admin.userId}
              name={admin.displayName}
              role={admin.role}
              requireMfa={admin.requireMfa}
              operationId={operationId}
            />
            <RevokeDialog userId={admin.userId} name={admin.displayName} operationId={operationId} />
          </span>
        );
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      total={rows.length}
      page={1}
      size={Math.max(rows.length, 1)}
      getRowId={(row) => row.userId}
      pagination={false}
      maxHeight="none"
      caption="운영 계정"
      empty={<EmptyState title="운영 계정이 없어요" description="첫 관리자는 SQL 편집기에서 한 번만 등록해요." />}
    />
  );
}
