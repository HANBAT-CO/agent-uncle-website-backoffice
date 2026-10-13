"use client";

import { WarningCircleIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { StatusChip } from "@/components/admin/common/StatusChip";
import { DataTable } from "@/components/admin/data-table/DataTable";
import { TwoLineCell } from "@/components/admin/data-table/TwoLineCell";
import { useListHref } from "@/components/admin/data-table/use-list-href";
import { formatKst, qty } from "@/lib/admin/format";
import { LEAD_ROLE_LABEL, LEAD_STATUS_LABEL } from "@/lib/admin/labels";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/admin/rpc/enums";
import type { LeadRow } from "@/lib/admin/rpc/schemas";
import { cn } from "@/lib/admin/utils";

import { messagePreview, sourceSummary, statusFilterHref, suspectLabels } from "./lead-view";

/*
 * 랜딩 문의 table (screens 10.16). The SQL masks 이름 and 연락처 for viewers
 * and leaves 남긴 말 out; the column itself is shown to operators only. A row
 * opens the lead Sheet (`?lead={id}`), keeping the list state.
 */

export function SuspectBadges({ source }: { source: string | null }) {
  const labels = suspectLabels(source);
  if (labels.length === 0) return <span className="text-muted-foreground">-</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {labels.map((label) => (
        <span key={label} className="inline-flex h-6 items-center gap-1 rounded-full bg-status-attention-bg px-2 text-xs font-medium whitespace-nowrap text-status-attention">
          <WarningCircleIcon aria-hidden weight="bold" className="size-3.5" />
          {label}
        </span>
      ))}
    </span>
  );
}

export function LeadsTable({
  rows,
  total,
  page,
  size,
  showMessage,
  empty,
}: {
  rows: LeadRow[];
  total: number;
  page: number;
  size: number;
  showMessage: boolean;
  empty: React.ReactNode;
}) {
  const hrefWith = useListHref();
  const columns: ColumnDef<LeadRow>[] = [
    {
      id: "createdAt",
      header: "접수 시각",
      cell: ({ row }) => {
        // Date over time keeps the 11 columns inside 1440px.
        const text = formatKst(row.original.createdAt);
        const split = text.lastIndexOf(" ");
        return (
          <time dateTime={row.original.createdAt} className="num flex flex-col leading-tight whitespace-nowrap">
            <span className="font-medium text-foreground">{split > 0 ? text.slice(0, split) : text}</span>
            {split > 0 ? <span className="mt-0.5 text-xs text-muted-foreground">{text.slice(split + 1)}</span> : null}
          </time>
        );
      },
    },
    { id: "role", header: "역할", cell: ({ row }) => LEAD_ROLE_LABEL[row.original.role] ?? row.original.role },
    {
      id: "name",
      header: "이름 · 매장",
      meta: { width: "12rem" },
      cell: ({ row }) => <TwoLineCell primary={row.original.name || "-"} secondary={row.original.businessName} />,
    },
    {
      id: "contact",
      header: "연락처",
      cell: ({ row }) => <span data-testid="lead-contact" className="num block max-w-32 truncate">{row.original.contact || "-"}</span>,
    },
    { id: "market", header: "사입 시장", cell: ({ row }) => row.original.market || <span className="text-muted-foreground">-</span> },
    ...(showMessage
      ? ([
          {
            id: "message",
            header: "남긴 말",
            meta: { width: "12rem" },
            cell: ({ row }) => {
              const text = messagePreview(row.original.message);
              return text ? <span title={text} className="block max-w-32 truncate">{text}</span> : <span className="text-muted-foreground">-</span>;
            },
          },
        ] satisfies ColumnDef<LeadRow>[])
      : []),
    {
      id: "source",
      header: "유입",
      cell: ({ row }) => {
        const summary = sourceSummary(row.original.source, row.original.utm);
        return <TwoLineCell className="max-w-28" primary={<span className="font-normal">{summary.primary}</span>} secondary={summary.secondary} />;
      },
    },
    { id: "suspect", header: "의심 표시", cell: ({ row }) => <SuspectBadges source={row.original.source} /> },
    { id: "status", header: "처리 상태", cell: ({ row }) => <StatusChip label={LEAD_STATUS_LABEL[row.original.status]} /> },
    { id: "assignee", header: "담당", cell: ({ row }) => row.original.assignee?.displayName ?? <span className="text-muted-foreground">-</span> },
    { id: "notes", header: "메모", meta: { align: "right" }, cell: ({ row }) => qty(row.original.notes, "건") },
  ];

  return (
    <DataTable
      caption="랜딩 문의"
      columns={columns}
      rows={rows}
      total={total}
      page={page}
      size={size}
      getRowId={(row) => row.id}
      rowHref={(row) => hrefWith({ lead: row.id, page: page > 1 ? page : null })}
      empty={empty}
    />
  );
}

/** 처리 상태 filter with the counts of backoffice_list_leads facets. */
export function LeadStatusFilter({ facets }: { facets: Record<string, number> }) {
  const searchParams = useSearchParams();
  const hrefWith = useListHref();
  const view = searchParams.get("view");
  const current = searchParams.get("status") as LeadStatus | null;
  return (
    <div role="group" aria-label="처리 상태" className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs text-muted-foreground">처리 상태</span>
      {LEAD_STATUSES.map((status) => {
        const on = current === status;
        return (
          <Link
            key={status}
            href={hrefWith({ ...statusFilterHref({ view }, on ? null : status), lead: null })}
            scroll={false}
            aria-pressed={on}
            role="button"
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-full border bg-card px-2.5 text-xs font-medium outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40",
              on && "border-primary bg-primary text-primary-foreground hover:bg-primary",
            )}
          >
            {LEAD_STATUS_LABEL[status]}
            <span className={cn("num", on ? "text-primary-foreground/80" : "text-muted-foreground")}>{(facets[status] ?? 0).toLocaleString("ko-KR")}</span>
          </Link>
        );
      })}
    </div>
  );
}
