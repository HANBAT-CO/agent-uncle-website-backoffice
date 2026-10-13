"use client";

import { AccountLink } from "@/components/admin/common/AccountLink";
import { DefinitionList } from "@/components/admin/common/DefinitionList";
import { KstTime } from "@/components/admin/common/KstTime";
import { TwoLineCell } from "@/components/admin/data-table/TwoLineCell";
import { EmptyState } from "@/components/admin/states/EmptyState";
import type { RecordRow } from "@/lib/admin/rpc/schemas";

import { issueDescription, issueKind } from "./issue-kind";
import type { TriageProperties } from "./PropertiesPanel";
import { TriageList, type TriageColumn } from "./TriageList";
import { TriageMemo, type TriageMemoData } from "./TriageMemo";
import { TriagePanes } from "./TriagePanes";
import { openSpan } from "./triage-model";

export type IssueRow = RecordRow<"issues">;

const productLine = (row: IssueRow) => [row.request?.product, row.request?.option].filter(Boolean).join(" · ");
const partyName = (row: IssueRow, id: string | null | undefined) => row.parties.find((party) => party.id === id) ?? null;
const issueEnd = (row: IssueRow) => (row.status === "resolved" ? row.updatedAt : null);

function columns(now: Date, rounds: Record<string, number>): TriageColumn<IssueRow>[] {
  return [
    {
      id: "kind",
      header: "유형",
      cell: (row) => (
        <TwoLineCell primary={issueKind(row.reason, row.actual !== undefined && row.actual !== null)} secondary={productLine(row) || undefined} className="max-w-40" />
      ),
    },
    {
      id: "reporter",
      header: "보고자",
      cell: (row) => <span className="block max-w-24 truncate">{partyName(row, row.reporterId)?.name ?? "-"}</span>,
    },
    { id: "span", header: "열린 기간", cell: (row) => <span className="num">{openSpan(row.createdAt, issueEnd(row), now)}</span> },
    { id: "held", header: "보류", align: "right", cell: (row) => `${row.held ?? 0}개` },
    {
      id: "round",
      header: "관련 회차",
      align: "right",
      cell: (row) => (row.deliveryId && rounds[row.deliveryId] ? `${rounds[row.deliveryId]}차` : <span className="text-muted-foreground">-</span>),
    },
    {
      id: "action",
      header: "최근 조치",
      cell: (row) =>
        row.action ? <span className="block max-w-32 truncate text-muted-foreground">{row.action}</span> : <span className="text-muted-foreground">-</span>,
    },
  ];
}

function IssueDetail({ row }: { row: IssueRow }) {
  const hasActual = row.actual !== undefined && row.actual !== null;
  return (
    <section aria-labelledby="triage-detail" className="flex min-w-0 flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex flex-col gap-1">
        <h2 id="triage-detail" className="text-base font-semibold text-foreground">
          {issueKind(row.reason, hasActual)}
        </h2>
        {productLine(row) ? <p className="text-xs text-muted-foreground">{productLine(row)}</p> : null}
      </div>
      <DefinitionList
        columns={1}
        items={[
          { term: "설명", value: <span className="whitespace-pre-wrap">{issueDescription(row.reason)}</span> },
          { term: "보고자", value: <AccountLink account={partyName(row, row.reporterId)} /> },
          { term: "조치", value: row.action ? <span className="whitespace-pre-wrap">{row.action}</span> : null },
          ...(hasActual ? [{ term: "실제 받은 수량", value: `${row.actual}장` }] : []),
          { term: "보고 시각", value: <KstTime iso={row.createdAt} /> },
        ]}
      />
    </section>
  );
}

/**
 * 문제 tab of 문제·정정 (screens 10.12): list, detail and 속성 panes. The list
 * comes from list_records('issues'); detail, 속성 and the memo come from the
 * selected issue's request (backoffice_get_request). Staff never resolve an
 * issue here: only the retailer can, in the app.
 */
export function IssueTriage({
  rows,
  total,
  page,
  size,
  selectedId,
  rounds,
  now,
  properties,
  memo,
  filtered,
}: {
  rows: IssueRow[];
  total: number;
  page: number;
  size: number;
  selectedId: string | null;
  rounds: Record<string, number>;
  now: string;
  properties: TriageProperties | null;
  memo: TriageMemoData | null;
  filtered: boolean;
}) {
  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const empty = (
    <EmptyState
      title="조건에 맞는 문제가 없어요"
      description={filtered ? "다른 보기를 골라 보세요." : "거래처가 앱에서 문제를 알리면 여기에 보여요."}
      resetHref={filtered ? "/admin/issues" : undefined}
    />
  );
  if (rows.length === 0) return empty;

  return (
    <TriagePanes
      list={
        <TriageList
          caption="문제 목록"
          columns={columns(new Date(now), rounds)}
          rows={rows}
          getId={(row) => row.id}
          selectedId={selected?.id ?? null}
          total={total}
          page={page}
          size={size}
          empty={empty}
        />
      }
      detail={selected ? <IssueDetail row={selected} /> : null}
      memo={memo ? <TriageMemo memo={memo} /> : null}
      properties={properties}
    />
  );
}

