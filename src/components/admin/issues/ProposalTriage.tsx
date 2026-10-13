"use client";

import { AccountLink } from "@/components/admin/common/AccountLink";
import { DefinitionList, type DefinitionItem } from "@/components/admin/common/DefinitionList";
import { KstTime } from "@/components/admin/common/KstTime";
import { TwoLineCell } from "@/components/admin/data-table/TwoLineCell";
import { EmptyState } from "@/components/admin/states/EmptyState";
import { PROPOSAL_KIND_LABEL } from "@/lib/admin/labels";
import type { Ledger, RecordRow } from "@/lib/admin/rpc/schemas";

import type { TriageProperties } from "./PropertiesPanel";
import { TriageList, type TriageColumn } from "./TriageList";
import { TriageMemo, type TriageMemoData } from "./TriageMemo";
import { TriagePanes } from "./TriagePanes";
import { openSpan, proposalValueItems } from "./triage-model";

export type ProposalRow = RecordRow<"proposals">;

const productLine = (row: ProposalRow) => [row.request?.product, row.request?.option].filter(Boolean).join(" · ");
const party = (row: ProposalRow, id: string | null | undefined) => row.parties.find((p) => p.id === id) ?? null;
const kindLabel = (row: ProposalRow) => PROPOSAL_KIND_LABEL[row.kind ?? ""] ?? "정정";

function columns(now: Date, ledgers: Record<string, Ledger>): TriageColumn<ProposalRow>[] {
  return [
    {
      id: "kind",
      header: "종류",
      cell: (row) => <TwoLineCell primary={kindLabel(row)} secondary={productLine(row) || undefined} className="max-w-32" />,
    },
    {
      id: "proposer",
      header: "제안자",
      cell: (row) => <span className="block max-w-24 truncate">{party(row, row.proposerId)?.name ?? "-"}</span>,
    },
    {
      id: "reason",
      header: "사유",
      cell: (row) => <span className="block max-w-24 truncate text-muted-foreground">{row.values?.reason || "-"}</span>,
    },
    {
      id: "ledger",
      header: "수량 (장)",
      cell: (row) => {
        const ledger = row.requestId ? ledgers[row.requestId] : undefined;
        if (!ledger) return <span className="text-muted-foreground">-</span>;
        // Two lines to fit the pane; the sr-only separator keeps the text '요청 {q} · 확보 {a} · 전달 {d} · 수령 {r} · 취소 {c}'.
        return (
          <span data-testid="proposal-ledger" className="num flex flex-col text-xs leading-tight">
            <span className="text-foreground">
              요청 {ledger.quantity} · 확보 {ledger.acquired} · 전달 {ledger.delivered}
            </span>
            <span className="sr-only"> · </span>
            <span className="mt-0.5 text-muted-foreground">
              수령 {ledger.received} · 취소 {ledger.cancelled}
            </span>
          </span>
        );
      },
    },
    {
      id: "wait",
      header: "대기 시간",
      cell: (row) =>
        row.status === "pending" ? <span className="num">{openSpan(row.createdAt, null, now)}</span> : <span className="text-muted-foreground">-</span>,
    },
  ];
}

function ProposalDetail({ row }: { row: ProposalRow }) {
  const items: DefinitionItem[] = [
    { term: "사유", value: row.values?.reason ? <span className="whitespace-pre-wrap">{row.values.reason}</span> : null },
    { term: "제안자", value: <AccountLink account={party(row, row.proposerId)} /> },
    ...proposalValueItems(row.values).map((item) => ({ term: item.term, value: item.value })),
    { term: "제안 시각", value: <KstTime iso={row.createdAt} /> },
  ];
  if (row.status !== "pending" && row.resolvedBy) {
    items.push({ term: "처리한 거래처", value: <AccountLink account={party(row, row.resolvedBy)} /> });
  }
  return (
    <section aria-labelledby="triage-detail" className="flex min-w-0 flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex flex-col gap-1">
        <h2 id="triage-detail" className="text-base font-semibold text-foreground">
          {kindLabel(row)}
        </h2>
        {productLine(row) ? <p className="text-xs text-muted-foreground">{productLine(row)}</p> : null}
      </div>
      <DefinitionList columns={1} items={items} />
    </section>
  );
}

/**
 * 변경·취소·정정 tab of 문제·정정 (screens 10.12): proposals from
 * list_records('proposals') with the request's counters, plus detail and 속성
 * of the selected proposal from its request. Only the other party confirms a
 * proposal, in the app.
 */
export function ProposalTriage({
  rows,
  total,
  page,
  size,
  selectedId,
  ledgers,
  now,
  properties,
  memo,
  filtered,
}: {
  rows: ProposalRow[];
  total: number;
  page: number;
  size: number;
  selectedId: string | null;
  ledgers: Record<string, Ledger>;
  now: string;
  properties: TriageProperties | null;
  memo: TriageMemoData | null;
  filtered: boolean;
}) {
  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const empty = (
    <EmptyState
      title="조건에 맞는 협의가 없어요"
      description={filtered ? "다른 보기를 골라 보세요." : "거래처가 앱에서 변경·취소·정정을 제안하면 여기에 보여요."}
      resetHref={filtered ? "/admin/issues?tab=proposals" : undefined}
    />
  );
  if (rows.length === 0) return empty;

  return (
    <TriagePanes
      list={
        <TriageList
          caption="변경·취소·정정 목록"
          columns={columns(new Date(now), ledgers)}
          rows={rows}
          getId={(row) => row.id}
          selectedId={selected?.id ?? null}
          total={total}
          page={page}
          size={size}
          empty={empty}
        />
      }
      detail={selected ? <ProposalDetail row={selected} /> : null}
      memo={memo ? <TriageMemo memo={memo} /> : null}
      properties={properties}
    />
  );
}
