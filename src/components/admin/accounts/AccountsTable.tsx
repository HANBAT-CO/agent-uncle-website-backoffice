"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { KstTime } from "@/components/admin/common/KstTime";
import { Qty } from "@/components/admin/common/Qty";
import { StatusChip } from "@/components/admin/common/StatusChip";
import { DataTable, type DataTableSort } from "@/components/admin/data-table/DataTable";
import { TwoLineCell } from "@/components/admin/data-table/TwoLineCell";
import { MODERATION_LABEL, PROVIDER_LABEL, roleKindLabel, verificationLabel } from "@/lib/admin/labels";
import type { AccountRow } from "@/lib/admin/rpc/schemas";

import { signupProgress } from "./signup";

/** Display name of a list row: the app name, the business name, then the email. */
export function accountDisplayName(row: Pick<AccountRow, "name" | "businessName" | "email" | "hasAccount">): string {
  return row.name?.trim() || row.businessName?.trim() || (row.hasAccount ? "이름 없음" : (row.email ?? "이름 없음"));
}

const columns: ColumnDef<AccountRow>[] = [
  {
    id: "name",
    header: "이름 · 담당자",
    meta: { width: "11rem", sortKey: "name_asc" },
    cell: ({ row }) => (
      <TwoLineCell className="w-40 max-w-40" primary={accountDisplayName(row.original)} secondary={<span title={row.original.email ?? undefined}>{row.original.email ?? "-"}</span>} />
    ),
  },
  {
    id: "role",
    header: "역할",
    meta: { width: "6rem" },
    cell: ({ row }) =>
      row.original.isStaff && !row.original.hasAccount ? (
        <span className="text-muted-foreground">운영 계정</span>
      ) : row.original.hasAccount ? (
        roleKindLabel(row.original.role)
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },
  {
    id: "signup",
    header: "가입 단계",
    meta: { width: "8rem" },
    cell: ({ row }) => <StatusChip label={signupProgress(row.original.role, row.original.missing, row.original.complete).label} />,
  },
  {
    id: "document",
    header: "사업자 서류",
    meta: { width: "9.5rem" },
    cell: ({ row }) => <StatusChip label={verificationLabel(row.original.verification)} />,
  },
  {
    id: "provider",
    header: "로그인 수단",
    meta: { width: "5rem" },
    cell: ({ row }) => PROVIDER_LABEL[row.original.provider] ?? (row.original.provider || "-"),
  },
  {
    id: "connections",
    header: "연결",
    meta: { align: "right", width: "4rem" },
    cell: ({ row }) => <Qty n={row.original.connections} unit="곳" />,
  },
  {
    id: "activeRequests",
    header: "진행 중 요청",
    meta: { align: "right", width: "6rem" },
    cell: ({ row }) => <Qty n={row.original.activeRequests} unit="건" />,
  },
  {
    id: "moderation",
    header: "상태",
    meta: { width: "6rem" },
    cell: ({ row }) => (
      <span className="flex items-center gap-1">
        <StatusChip label={MODERATION_LABEL[row.original.moderation]} />
        {row.original.loginBanned && row.original.moderation !== "suspended" ? <StatusChip label="로그인 차단" /> : null}
      </span>
    ),
  },
  {
    id: "lastSignInAt",
    header: "최근 로그인",
    meta: { width: "6rem", sortKey: "last_sign_in_desc" },
    cell: ({ row }) => <KstTime iso={row.original.lastSignInAt} time={false} className="text-muted-foreground" />,
  },
  {
    id: "createdAt",
    header: "가입일",
    meta: { width: "6rem", sortKey: "created_desc" },
    cell: ({ row }) => <KstTime iso={row.original.createdAt} time={false} className="text-muted-foreground" />,
  },
];

/** 계정·가입 table (screens 10.7). Rows open the dossier. */
export function AccountsTable({
  rows,
  total,
  page,
  size,
  sort,
  empty,
}: {
  rows: AccountRow[];
  total: number;
  page: number;
  size: number;
  sort: string;
  empty: React.ReactNode;
}) {
  const tableSort: DataTableSort =
    sort === "created_asc"
      ? { key: "created_desc", direction: "ascending" }
      : sort === "name_asc"
        ? { key: "name_asc", direction: "ascending" }
        : { key: sort, direction: "descending" };

  return (
    <DataTable
      caption="계정 목록"
      columns={columns}
      rows={rows}
      total={total}
      page={page}
      size={size}
      sort={tableSort}
      getRowId={(row) => row.id}
      className="[&_td]:px-2 [&_th]:px-2"
      rowHref={(row) => `/admin/accounts/${row.id}`}
      empty={empty}
    />
  );
}
