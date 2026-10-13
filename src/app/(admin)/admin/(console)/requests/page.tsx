import type { Metadata } from "next";

import { AutoRefresh } from "@/components/admin/common/AutoRefresh";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { DataTableToolbar } from "@/components/admin/data-table/DataTableToolbar";
import { FilterChips, type FilterChip } from "@/components/admin/data-table/FilterChips";
import { SearchInput } from "@/components/admin/data-table/SearchInput";
import { SortSelect } from "@/components/admin/data-table/SortSelect";
import { ExportDialog } from "@/components/admin/export/ExportDialog";
import { RequestFilters } from "@/components/admin/requests/RequestFilters";
import { RequestTabs } from "@/components/admin/requests/RequestTabs";
import { RequestsFooter } from "@/components/admin/requests/RequestsFooter";
import { RequestsTable, type RequestListRow } from "@/components/admin/requests/RequestsTable";
import { conditionAttention, conditionLabel, splitTitle } from "@/components/admin/requests/request-model";
import { EmptyState } from "@/components/admin/states/EmptyState";
import { ErrorState, LIST_ERROR_MESSAGE } from "@/components/admin/states/ErrorState";
import { verifyAdmin } from "@/lib/admin/dal";
import { formatKst, formatRelative, kstDayRange } from "@/lib/admin/format";
import { requestLabelsForView } from "@/lib/admin/labels";
import { EXPORT_MIN_ROLE, rpc, type RequestRow } from "@/lib/admin/rpc";
import { toOffset } from "@/lib/admin/search-params";

import { loadRequestSearchParams, REQUEST_SORT_OPTIONS } from "./search-params";

export const metadata: Metadata = { title: "사입 요청" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Params a filter chip removes; the tab (`view`) and paging are not filters. */
const FILTER_PARAMS = ["q", "from", "to", "account", "cond"] as const;

function listHref(params: Record<string, string | string[] | undefined>, drop: readonly string[] = []): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (drop.includes(key) || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) search.append(key, item);
  }
  const query = search.toString();
  return query ? `/admin/requests?${query}` : "/admin/requests";
}

function toRow(row: RequestRow, now: Date): RequestListRow {
  return {
    id: row.id,
    createdAt: row.createdAt,
    label: row.label,
    retailer: row.retailer.name,
    uncle: row.uncle.name,
    wholesaler: row.wholesaler,
    location: row.location,
    product: row.product,
    option: row.option,
    quantity: row.ledger.quantity,
    acquired: row.ledger.acquired,
    delivered: row.ledger.delivered,
    received: row.ledger.received,
    backorder: row.ledger.backorder,
    recheck: row.recheck,
    recheckDays: row.recheckDays,
    lastEvent: row.lastEvent?.title ? splitTitle(row.lastEvent.title).head : null,
    lastEventAgo: row.lastEvent?.createdAt ? formatRelative(row.lastEvent.createdAt, now) : null,
    version: row.version,
    violations: row.violations.length,
  };
}

/** The selected account's name, read from the rows (every row involves it). */
function accountName(rows: RequestRow[], accountId: string | null): string | null {
  if (!accountId) return null;
  for (const row of rows) {
    if (row.retailer.id === accountId) return row.retailer.name;
    if (row.uncle.id === accountId) return row.uncle.name;
  }
  return null;
}

/**
 * 사입 요청 (screens 10.9): tabs with counts, 기간 / 거래처 / 조건 filters,
 * search, sort, footer totals and the operator CSV. A row opens the
 * intercepted Sheet over this list; a pasted /admin/requests/[id] renders the
 * full page.
 */
export default async function RequestsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await verifyAdmin();
  const raw = await searchParams;
  const params = loadRequestSearchParams(raw);
  const includeDemo = session.target === "live" && params.demo;
  const size = params.size;
  const page = Math.max(params.page, 1);
  const attention = conditionAttention(params.cond);

  const result = await rpc.listRequests({
    labels: requestLabelsForView(params.view),
    attention,
    accountId: params.account ?? undefined,
    search: params.q.trim() || undefined,
    from: params.from ? kstDayRange(params.from).from : undefined,
    to: params.to ? kstDayRange(params.to).to : undefined,
    includeDemo,
    sort: params.sort,
    limit: size,
    offset: toOffset(page, size),
  });

  const data = result.ok ? result.data : null;
  const now = new Date();
  const selectedAccount = data ? accountName(data.rows, params.account) : null;

  const chips: FilterChip[] = [];
  if (params.q.trim()) chips.push({ param: "q", label: `검색 "${params.q.trim()}"` });
  if (params.from) chips.push({ param: "from", label: `${formatKst(params.from, { time: false })}부터` });
  if (params.to) chips.push({ param: "to", label: `${formatKst(params.to, { time: false })}까지` });
  if (params.account) chips.push({ param: "account", label: `거래처 ${selectedAccount ?? "선택한 거래처"}` });
  const condition = conditionLabel(params.cond);
  if (condition) chips.push({ param: "cond", label: condition });
  const filtered = chips.length > 0;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader title="사입 요청" eyebrow="REQUEST DESK" description="요청부터 수령까지, 거래의 흐름을 확인하세요." />

      {data ? <RequestTabs labels={data.labels} view={params.view} /> : null}

      <DataTableToolbar
        actions={
          <>
            <SortSelect options={[...REQUEST_SORT_OPTIONS]} />
            <ExportDialog kind="requests" minRole={EXPORT_MIN_ROLE.requests} role={session.role} includeDemo={includeDemo} />
          </>
        }
      >
        <SearchInput placeholder="상품명·옵션·도매처·요청 ID로 검색" />
      </DataTableToolbar>

      <div role="group" aria-label="필터" className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--console-line)] bg-card/55 p-2.5">
        <RequestFilters accountId={params.account} accountName={selectedAccount} />
        <FilterChips chips={chips} className="ml-1" />
      </div>

      {!data ? (
        <ErrorState message={LIST_ERROR_MESSAGE} retryHref={listHref(raw)} />
      ) : (
        <RequestsTable
          rows={data.rows.map((row) => toRow(row, now))}
          total={data.total}
          page={page}
          size={size}
          sort={params.sort}
          footer={<RequestsFooter total={data.total} totals={data.totals} />}
          empty={
            <EmptyState
              title="조건에 맞는 요청이 없어요"
              description="검색어나 상태 필터를 바꿔 보세요."
              resetHref={filtered ? listHref(raw, [...FILTER_PARAMS, "page"]) : undefined}
            />
          }
        />
      )}

      <AutoRefresh />
    </div>
  );
}
