import { InfoIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import type { SearchParams } from "nuqs/server";

import { AutoRefresh } from "@/components/admin/common/AutoRefresh";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { ViewTabs } from "@/components/admin/data-table/ViewTabs";
import { IssueTriage } from "@/components/admin/issues/IssueTriage";
import { ProposalTriage } from "@/components/admin/issues/ProposalTriage";
import { recordRows } from "@/components/admin/issues/record-rows";
import { TriageTabs } from "@/components/admin/issues/TriageTabs";
import {
  ISSUE_VIEWS,
  PROPOSAL_VIEWS,
  issueView,
  issueViewCounts,
  proposalView,
  proposalViewCounts,
  triageTab,
} from "@/components/admin/issues/triage-model";
import { ErrorState } from "@/components/admin/states/ErrorState";
import { verifyAdmin, type AdminSession } from "@/lib/admin/dal";
import { rpc } from "@/lib/admin/rpc";
import { toOffset } from "@/lib/admin/search-params";

import { deliveryRounds, issueProperties, memoData, proposalProperties, requestLedgers } from "./load";
import { loadIssueParams } from "./search-params";

export const metadata: Metadata = { title: "문제·정정" };

type Query = Awaited<ReturnType<typeof loadIssueParams>>;

const READ_ONLY_NOTE = "문제 해결 확인은 소매업자만, 정정 확정은 상대 거래처만 할 수 있어요. 운영자는 메모와 케이스로 도와요.";

async function IssuesTab({ session, query, includeDemo }: { session: AdminSession; query: Query; includeDemo: boolean }) {
  const view = issueView(query.view);
  const adminsRequest = rpc.listAdmins(); // independent of the list: start it first
  const [list, all] = await Promise.all([
    rpc.listRecords({
      collection: "issues",
      filter: view.filter,
      status: view.status,
      includeDemo,
      limit: query.size,
      offset: toOffset(query.page, query.size),
    }),
    // A status view narrows the facets too, so count the views from an unfiltered call.
    view.status ? rpc.listRecords({ collection: "issues", includeDemo, limit: 1, offset: 0 }) : null,
  ]);
  const facetSource = all ?? list;
  const counts = facetSource.ok ? issueViewCounts(facetSource.data.facets.status) : null;
  const tabs = <ViewTabs tabs={ISSUE_VIEWS.map((v) => ({ key: v.key, label: v.label, count: counts?.[v.key] ?? null }))} />;
  if (!list.ok) return <>{tabs}<ErrorState /></>;

  const rows = recordRows("issues", list.data);
  const selected = rows.find((row) => row.id === query.item) ?? rows[0] ?? null;
  const [dossier, rounds, admins] = await Promise.all([
    selected?.requestId ? rpc.getRequest(selected.requestId) : null,
    deliveryRounds(rows, includeDemo),
    adminsRequest,
  ]);
  const now = new Date();
  const request = dossier?.ok ? dossier.data : null;

  return (
    <>
      {tabs}
      <IssueTriage
        rows={rows}
        total={list.data.total}
        page={query.page}
        size={query.size}
        selectedId={selected?.id ?? null}
        rounds={rounds}
        now={now.toISOString()}
        properties={selected ? issueProperties(selected, request, now) : null}
        memo={memoData(request, admins.ok ? admins.data : [], session.role)}
        filtered={view.key !== ""}
      />
    </>
  );
}

async function ProposalsTab({ session, query, includeDemo }: { session: AdminSession; query: Query; includeDemo: boolean }) {
  const view = proposalView(query.view);
  const adminsRequest = rpc.listAdmins(); // independent of the list: start it first
  const [list, all] = await Promise.all([
    rpc.listRecords({ collection: "proposals", status: view.status, includeDemo, limit: query.size, offset: toOffset(query.page, query.size) }),
    rpc.listRecords({ collection: "proposals", includeDemo, limit: 1, offset: 0 }),
  ]);
  const counts = all.ok ? proposalViewCounts(all.data.facets.status) : null;
  const tabs = <ViewTabs tabs={PROPOSAL_VIEWS.map((v) => ({ key: v.key, label: v.label, count: counts?.[v.key] ?? null }))} />;
  if (!list.ok) return <>{tabs}<ErrorState /></>;

  const rows = recordRows("proposals", list.data);
  const selected = rows.find((row) => row.id === query.item) ?? rows[0] ?? null;
  const [dossier, ledgers, admins] = await Promise.all([
    selected?.requestId ? rpc.getRequest(selected.requestId) : null,
    requestLedgers(rows, includeDemo),
    adminsRequest,
  ]);
  const now = new Date();
  const request = dossier?.ok ? dossier.data : null;

  return (
    <>
      {tabs}
      <ProposalTriage
        rows={rows}
        total={list.data.total}
        page={query.page}
        size={query.size}
        selectedId={selected?.id ?? null}
        ledgers={ledgers}
        now={now.toISOString()}
        properties={selected ? proposalProperties(selected, request, now) : null}
        memo={memoData(request, admins.ok ? admins.data : [], session.role)}
        filtered={view.key !== ""}
      />
    </>
  );
}

/**
 * 문제·정정 /admin/issues (screens appendix 10.12, viewer). A 3-pane triage of
 * issues and of change, cancel and correction proposals: the list, the
 * selected record, and its 속성 from the request. Staff only add notes and
 * cases; resolving and confirming stay with the two parties in the app.
 */
export default async function IssuesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await verifyAdmin();
  const query = await loadIssueParams(searchParams);
  const tab = triageTab(query.tab);
  const includeDemo = session.target === "live" && query.demo;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="문제·정정" actions={<TriageTabs active={tab} demo={query.demo} />} />
      <p className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-xs text-secondary-foreground">
        <InfoIcon aria-hidden weight="bold" className="size-4 shrink-0" />
        {READ_ONLY_NOTE}
      </p>
      {tab === "proposals" ? (
        <ProposalsTab session={session} query={query} includeDemo={includeDemo} />
      ) : (
        <IssuesTab session={session} query={query} includeDemo={includeDemo} />
      )}
      <AutoRefresh />
    </div>
  );
}
