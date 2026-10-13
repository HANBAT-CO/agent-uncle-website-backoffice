"use client";

import { LockKeyIcon, PencilSimpleIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";

import { KstTime } from "@/components/admin/common/KstTime";
import { DataTable } from "@/components/admin/data-table/DataTable";
import { TwoLineCell } from "@/components/admin/data-table/TwoLineCell";
import { EmptyState } from "@/components/admin/states/EmptyState";
import { Button } from "@/components/admin/ui/button";
import { CONFIG_KEY_LABEL } from "@/lib/admin/labels";
import { ROLE_LABEL } from "@/lib/admin/roles";
import type { ConfigRow } from "@/lib/admin/rpc/schemas";

import { configSummary, isKnownConfigKey } from "./config-forms";

export const OWNER_ONLY_HINT = "관리자만 변경할 수 있어요";

/**
 * 원격 설정 list (screens 10.15): 항목, 현재 값 (a human summary), 공개,
 * 수정 권한, 최근 변경, 버전, plus "수정" where the signed-in role may write
 * the key. Owner-only keys show a hint to operators instead.
 */
export function ConfigTable({
  rows,
  showActions,
  canEdit,
  onEdit,
}: {
  rows: ConfigRow[];
  showActions: boolean;
  canEdit: (row: ConfigRow) => boolean;
  onEdit: (row: ConfigRow) => void;
}) {
  const columns: ColumnDef<ConfigRow>[] = [
    {
      id: "key",
      header: "항목",
      meta: { width: "10.5rem" },
      cell: ({ row }) => (
        <TwoLineCell primary={CONFIG_KEY_LABEL[row.original.key] ?? row.original.key} secondary={<span className="font-mono">{row.original.key}</span>} />
      ),
    },
    {
      id: "value",
      header: "현재 값",
      cell: ({ row }) => (
        <span className="block truncate text-[0.8125rem]" data-testid={`config-value-${row.original.key}`}>
          {configSummary(row.original.key, row.original.value)}
        </span>
      ),
    },
    {
      id: "public",
      header: "공개",
      meta: { width: "5.5rem" },
      cell: ({ row }) => (row.original.isPublic ? "앱에 전달" : "내부용"),
    },
    {
      id: "writeRole",
      header: "수정 권한",
      meta: { width: "5rem" },
      cell: ({ row }) => ROLE_LABEL[row.original.writeRole],
    },
    {
      id: "updated",
      header: "최근 변경",
      meta: { width: "11.5rem" },
      cell: ({ row }) =>
        row.original.updatedBy ? (
          <span className="flex items-center gap-1 text-xs">
            <span className="truncate">{row.original.updatedByName ?? "이름 없는 운영자"}</span>
            <span aria-hidden className="text-muted-foreground">
              ·
            </span>
            <KstTime iso={row.original.updatedAt} className="text-muted-foreground" />
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">처음 값 그대로</span>
        ),
    },
    {
      id: "version",
      header: "버전",
      meta: { width: "3.5rem", align: "right" },
      cell: ({ row }) => `v${row.original.version}`,
    },
  ];

  if (showActions) {
    columns.push({
      id: "actions",
      header: () => <span className="sr-only">수정</span>,
      meta: { width: "11rem", align: "right" },
      cell: ({ row }) => {
        const config = row.original;
        if (!isKnownConfigKey(config.key)) return <span className="text-xs text-muted-foreground">화면에서 바꿀 수 없어요</span>;
        if (!canEdit(config)) {
          return (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" data-testid={`config-locked-${config.key}`}>
              <LockKeyIcon aria-hidden className="size-3.5" />
              {OWNER_ONLY_HINT}
            </span>
          );
        }
        return (
          <Button type="button" variant="outline" size="sm" onClick={() => onEdit(config)} aria-label={`${CONFIG_KEY_LABEL[config.key] ?? config.key} 수정`}>
            <PencilSimpleIcon aria-hidden data-icon="inline-start" />
            수정
          </Button>
        );
      },
    });
  }

  return (
    <DataTable
      columns={columns}
      rows={rows}
      total={rows.length}
      page={1}
      size={Math.max(rows.length, 1)}
      getRowId={(row) => row.key}
      pagination={false}
      caption="원격 설정 항목"
      maxHeight="none"
      empty={<EmptyState title="설정 항목이 없어요" description="마이그레이션이 기본 설정을 만들지 않았어요. 개발팀에 알려 주세요." />}
    />
  );
}
