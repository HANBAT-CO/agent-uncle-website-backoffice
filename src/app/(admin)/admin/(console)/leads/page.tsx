import type { Metadata } from "next";

import { PageHeader } from "@/components/admin/common/PageHeader";
import { DataTableToolbar } from "@/components/admin/data-table/DataTableToolbar";
import { FilterChips, type FilterChip } from "@/components/admin/data-table/FilterChips";
import { SearchInput } from "@/components/admin/data-table/SearchInput";
import { ViewTabs } from "@/components/admin/data-table/ViewTabs";
import { ExportDialog } from "@/components/admin/export/ExportDialog";
import { LeadSheet, type StaffOption } from "@/components/admin/leads/LeadSheet";
import { LeadStatusFilter, LeadsTable } from "@/components/admin/leads/LeadsTable";
import { LEAD_COPY, LEAD_VIEWS, leadQuery, leadTabCounts, onlyToday } from "@/components/admin/leads/lead-view";
import type { MiniAuditRow } from "@/components/admin/panels/MiniAuditList";
import { EmptyState } from "@/components/admin/states/EmptyState";
import { ErrorState, LIST_ERROR_MESSAGE } from "@/components/admin/states/ErrorState";
import { verifyAdmin } from "@/lib/admin/dal";
import { LEAD_STATUS_LABEL } from "@/lib/admin/labels";
import { newOperationId } from "@/lib/admin/operation-id";
import { hasRole } from "@/lib/admin/roles";
import { EXPORT_MIN_ROLE, rpc, type LeadList, type LeadRow, type RpcResult } from "@/lib/admin/rpc";
import { toOffset } from "@/lib/admin/search-params";

import { loadLeadParams } from "./search-params";

export const metadata: Metadata = { title: "랜딩 문의" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** 오늘 has no SQL filter: read newest-first pages until one reaches yesterday. */
const TODAY_PAGE = 200;
const TODAY_MAX_PAGES = 5;

type Loaded = { rows: LeadRow[]; total: number; facets: Record<string, number> };

async function loadToday(a: { status?: LeadRow["status"]; search?: string; includeSuspect: boolean }): Promise<RpcResult<Loaded>> {
  const rows: LeadRow[] = [];
  let facets: Record<string, number> = {};
  for (let page = 0; page < TODAY_MAX_PAGES; page += 1) {
    const result: RpcResult<LeadList> = await rpc.listLeads({ ...a, limit: TODAY_PAGE, offset: page * TODAY_PAGE });
    if (!result.ok) return result;
    if (page === 0) facets = result.data.facets;
    const today = onlyToday(result.data.rows);
    rows.push(...today);
    if (today.length < result.data.rows.length || result.data.rows.length < TODAY_PAGE) break;
  }
  return { ok: true, data: { rows, total: rows.length, facets } };
}

/**
 * 랜딩 문의 (screens 10.16; viewer masked, operator writes). Data:
 * list_leads, which masks 이름 and 연락처 for viewers, drops 남긴 말 for
 * them, and writes the lead.view_list audit row for operators. CSV is for
 * the owner. No AutoRefresh (spec 4).
 */
export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await verifyAdmin();
  const params = await loadLeadParams(searchParams);
  const canWrite = hasRole(session.role, "operator");
  const query = leadQuery(params.view, params.status);
  const search = params.q.trim() || undefined;

  const loaded: RpcResult<Loaded> = query.todayOnly
    ? await loadToday({ status: query.status, search, includeSuspect: query.includeSuspect })
    : await rpc.listLeads({
        status: query.status,
        search,
        includeSuspect: query.includeSuspect,
        limit: params.size,
        offset: toOffset(params.page, params.size),
      });

  const header = (
    <PageHeader
      title="랜딩 문의"
      description="웹사이트에서 남긴 가입·상담 문의예요. 연락한 뒤 처리 상태와 메모를 남겨 주세요."
      meta={canWrite ? null : <span>열람자에게는 연락처 일부와 이름 첫 글자만 보이고, 남긴 말은 보이지 않아요.</span>}
      actions={<ExportDialog kind="leads" minRole={EXPORT_MIN_ROLE.leads} role={session.role} />}
    />
  );

  if (!loaded.ok) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <ErrorState message={LIST_ERROR_MESSAGE} />
      </div>
    );
  }

  const { facets } = loaded.data;
  const rows = query.todayOnly ? loaded.data.rows.slice(toOffset(params.page, params.size), toOffset(params.page, params.size) + params.size) : loaded.data.rows;
  const counts = leadTabCounts({ view: params.view, total: loaded.data.total, facets });
  const anyLead = Object.values(facets).some((n) => n > 0);

  const chips: FilterChip[] = [];
  if (params.status) chips.push({ param: "status", label: `처리 상태: ${LEAD_STATUS_LABEL[params.status]}` });
  if (search) chips.push({ param: "q", label: `검색: ${search}` });

  const open = params.lead ? (loaded.data.rows.find((row) => row.id === params.lead) ?? null) : null;
  const [admins, audit] =
    params.lead && open && canWrite
      ? await Promise.all([rpc.listAdmins(), rpc.listAudit({ targetType: "lead", targetId: open.id, limit: 10, offset: 0 })])
      : [null, null];
  const staff: StaffOption[] = admins?.ok
    ? admins.data.filter((admin) => !admin.revokedAt && admin.role !== "viewer").map((admin) => ({ userId: admin.userId, displayName: admin.displayName }))
    : [];
  const history: MiniAuditRow[] | null = audit?.ok
    ? audit.data.rows.map((row) => ({ id: row.id, at: row.at, action: row.action, actorName: row.actorName, reason: row.reason || null }))
    : null;

  return (
    <div className="flex flex-col gap-5">
      {header}
      <ViewTabs tabs={LEAD_VIEWS.map((view) => ({ key: view.key, label: view.label, count: counts[view.key] }))} />
      <DataTableToolbar>
        <SearchInput placeholder={canWrite ? "이름, 매장명, 연락처로 찾기" : "매장명, 사입 시장으로 찾기"} />
        <LeadStatusFilter facets={facets} />
      </DataTableToolbar>
      <FilterChips chips={chips} resetParams={["lead"]} />
      <LeadsTable
        rows={rows}
        total={loaded.data.total}
        page={params.page}
        size={params.size}
        showMessage={canWrite}
        empty={
          anyLead || search ? (
            <EmptyState title={LEAD_COPY.emptyFiltered} description={LEAD_COPY.emptyFilteredHint} resetHref="/admin/leads?view=all" />
          ) : (
            <EmptyState title={LEAD_COPY.empty} description="웹사이트에서 문의가 들어오면 여기에 바로 보여요." />
          )
        }
      />
      {params.lead ? <LeadSheet lead={open} canWrite={canWrite} operationId={newOperationId()} staff={staff} history={history} /> : null}
    </div>
  );
}
