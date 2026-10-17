"use client";

import { ArrowRightIcon, PencilSimpleLineIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";

import { AccountLink } from "@/components/admin/common/AccountLink";
import { KstTime } from "@/components/admin/common/KstTime";
import { Qty } from "@/components/admin/common/Qty";
import { StatusChip } from "@/components/admin/common/StatusChip";
import { DataTable } from "@/components/admin/data-table/DataTable";
import { TwoLineCell } from "@/components/admin/data-table/TwoLineCell";
import { EmptyState } from "@/components/admin/states/EmptyState";
import { requestUnit } from "@/lib/admin/format";
import { deliveryState } from "@/lib/admin/labels";
import type { RecordRow } from "@/lib/admin/rpc/schemas";

import { deliveryParties, deliveryWait } from "./delivery-model";

export type DeliveryRow = RecordRow<"deliveries">;

function columns(now: Date): ColumnDef<DeliveryRow>[] {
  return [
    {
      id: "round",
      header: "회차",
      meta: { width: "4.5rem" },
      cell: ({ row }) => <span className="num font-semibold">{row.original.round === null ? "-" : `${row.original.round}차`}</span>,
    },
    {
      id: "createdAt",
      header: "전달 일시",
      cell: ({ row }) => <KstTime iso={row.original.createdAt} />,
    },
    {
      id: "parties",
      header: "사입삼촌 → 소매업자",
      cell: ({ row }) => {
        const { uncle, retailer } = deliveryParties(row.original);
        return (
          <span className="flex max-w-48 min-w-0 flex-col leading-tight">
            <AccountLink account={uncle} className="text-[0.8125rem]" />
            <span className="mt-0.5 flex min-w-0 items-center gap-1 text-xs">
              <ArrowRightIcon aria-hidden className="size-3 shrink-0 text-muted-foreground" />
              <AccountLink account={retailer} className="font-normal text-muted-foreground" />
            </span>
          </span>
        );
      },
    },
    {
      id: "product",
      header: "상품 · 옵션",
      cell: ({ row }) => (
        <TwoLineCell primary={row.original.request?.title || row.original.product || "-"} secondary={row.original.option || undefined} className="max-w-44" />
      ),
    },
    {
      id: "quantity",
      header: "이번 전달",
      meta: { align: "right" },
      cell: ({ row }) => <Qty n={row.original.quantity} unit={requestUnit(row.original.request?.requestType)} />,
    },
    {
      id: "received",
      header: "확인한 수량",
      meta: { align: "right" },
      cell: ({ row }) => <Qty n={row.original.receiptRecorded ? row.original.received : null} unit={requestUnit(row.original.request?.requestType)} />,
    },
    {
      id: "actual",
      header: "실제 받은 수량",
      meta: { align: "right" },
      cell: ({ row }) => <Qty n={row.original.receiptRecorded ? (row.original.actual ?? null) : null} unit={requestUnit(row.original.request?.requestType)} />,
    },
    {
      id: "state",
      header: "상태",
      cell: ({ row }) => <StatusChip label={deliveryState(row.original)} />,
    },
    {
      id: "address",
      header: "수령지",
      cell: ({ row }) => (
        <TwoLineCell
          primary={<span data-testid="delivery-address" className="font-normal">{row.original.address || "-"}</span>}
          secondary={row.original.addressDetail || undefined}
          className="max-w-40"
        />
      ),
    },
    {
      id: "wait",
      header: "대기 시간",
      meta: { align: "right" },
      cell: ({ row }) => {
        const wait = deliveryWait(row.original, now);
        return wait ? <span className="num">{wait}</span> : <span className="text-muted-foreground">-</span>;
      },
    },
    {
      id: "corrected",
      header: "정정",
      cell: ({ row }) =>
        row.original.correctedAt ? (
          <span className="inline-flex h-6 items-center gap-1 rounded-full bg-status-neutral-bg px-2 text-xs font-medium text-status-neutral">
            <PencilSimpleLineIcon aria-hidden weight="bold" className="size-3.5" />
            정정됨
          </span>
        ) : null,
    },
  ];
}

/**
 * 전달 회차 list (screens 10.10). A row opens the request: from this list
 * that is the intercepted request Sheet. `now` comes from the server so the
 * wait time renders the same on the server and in the browser.
 */
export function DeliveriesTable({
  rows,
  total,
  page,
  size,
  now,
  filtered,
}: {
  rows: DeliveryRow[];
  total: number;
  page: number;
  size: number;
  now: string;
  filtered: boolean;
}) {
  return (
    <DataTable
      caption="전달 회차"
      columns={columns(new Date(now))}
      rows={rows}
      total={total}
      page={page}
      size={size}
      getRowId={(row) => row.id}
      rowHref={(row) => (row.requestId ? `/admin/requests/${encodeURIComponent(row.requestId)}` : null)}
      empty={
        <EmptyState
          title="조건에 맞는 전달 회차가 없어요"
          description={filtered ? "다른 보기를 골라 보세요." : "사입삼촌이 전달을 기록하면 여기에 보여요."}
          resetHref={filtered ? "/admin/deliveries" : undefined}
        />
      }
    />
  );
}
