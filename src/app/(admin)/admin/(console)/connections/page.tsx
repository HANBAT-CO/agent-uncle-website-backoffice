import { InfoIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";

import { AutoRefresh } from "@/components/admin/common/AutoRefresh";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { ViewTabs } from "@/components/admin/data-table/ViewTabs";
import { ConnectionsTable, type ConnectionRow } from "@/components/admin/connections/ConnectionsTable";
import { EmptyState } from "@/components/admin/states/EmptyState";
import { ErrorState, LIST_ERROR_MESSAGE } from "@/components/admin/states/ErrorState";
import { verifyAdmin } from "@/lib/admin/dal";
import { rpc } from "@/lib/admin/rpc";
import { toOffset } from "@/lib/admin/search-params";

import { CONNECTION_VIEWS, connectionQueryFor, connectionViewCounts, loadConnectionParams } from "./search-params";

export const metadata: Metadata = { title: "거래처 연결" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * 거래처 연결 (screens 10.8): list_records('connections') with the views and
 * their counts. Read-only: accepting and ending a connection belongs to the
 * two parties in the app.
 */
export default async function ConnectionsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await verifyAdmin();
  const raw = await searchParams;
  const params = loadConnectionParams(raw);
  const known = CONNECTION_VIEWS.some((view) => view.key === params.view);
  const view = known ? params.view : "";
  const query = connectionQueryFor(view);
  const includeDemo = session.target === "live" && params.demo;
  const common = { collection: "connections" as const, includeDemo };

  // Facets follow p_status, so a status view also needs an unfiltered call for the tab counts.
  const [result, unfiltered] = await Promise.all([
    rpc.listRecords({ ...common, ...query, limit: params.size, offset: toOffset(params.page, params.size) }),
    query.status ? rpc.listRecords({ ...common, limit: 1, offset: 0 }) : null,
  ]);

  const current = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") current.set(key, value);
  }
  const retryHref = current.size > 0 ? `/admin/connections?${current.toString()}` : "/admin/connections";

  const header = <PageHeader title="거래처 연결" description="소매업자와 사입삼촌의 연결 요청과 상태를 봐요." />;
  const banner = (
    <p className="flex items-center gap-1.5 rounded-md border bg-card px-3 py-2 text-sm" role="note">
      <InfoIcon aria-hidden weight="bold" className="size-4 shrink-0 text-primary" />
      연결 수락과 해제는 두 거래처만 할 수 있어요.
    </p>
  );

  if (!result.ok) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        {banner}
        <ErrorState message={LIST_ERROR_MESSAGE} retryHref={retryHref} />
      </div>
    );
  }

  const facetsSource = unfiltered ? (unfiltered.ok ? unfiltered.data.facets : null) : result.data.facets;
  const counts = facetsSource ? connectionViewCounts(facetsSource) : null;
  const rows = result.data.rows as ConnectionRow[];

  return (
    <div className="flex flex-col gap-5">
      <AutoRefresh />
      {header}
      {banner}
      <ViewTabs label="연결 보기" tabs={CONNECTION_VIEWS.map((item) => ({ key: item.key, label: item.label, count: counts ? counts[item.key] : null }))} />
      <ConnectionsTable
        rows={rows}
        total={result.data.total}
        page={params.page}
        size={params.size}
        empty={<EmptyState title="조건에 맞는 연결이 없어요" resetHref={view ? "/admin/connections" : undefined} />}
      />
    </div>
  );
}
