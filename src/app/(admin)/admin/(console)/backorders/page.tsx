import { InfoIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import type { SearchParams } from "nuqs/server";

import { AgingChart } from "@/components/admin/backorders/AgingChart";
import { BackordersTable } from "@/components/admin/backorders/BackordersTable";
import { BACKORDER_VIEWS, agingBars, backorderView } from "@/components/admin/backorders/backorder-model";
import { AutoRefresh } from "@/components/admin/common/AutoRefresh";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { ViewTabs } from "@/components/admin/data-table/ViewTabs";
import { ErrorState } from "@/components/admin/states/ErrorState";
import { verifyAdmin } from "@/lib/admin/dal";
import { rpc } from "@/lib/admin/rpc";
import { toOffset } from "@/lib/admin/search-params";

import { loadBackorderParams } from "./search-params";

export const metadata: Metadata = { title: "미송 재확인" };

/**
 * 미송 재확인 /admin/backorders (screens appendix 10.11, viewer). Requests
 * from list_requests with an attention per view, soonest recheck first. Each
 * view needs its own attention, so the other views are counted with one-row
 * calls; 미송 경과 is the dashboard's aging from backoffice_overview.
 * Read-only: rechecks and reminders happen in the app.
 */
export default async function BackordersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await verifyAdmin();
  const params = await loadBackorderParams(searchParams);
  const active = backorderView(params.view);
  const includeDemo = session.target === "live" && params.demo;

  const [overview, ...lists] = await Promise.all([
    rpc.overview({ includeDemo, days: 1 }),
    ...BACKORDER_VIEWS.map((view) => {
      const current = view.key === active.key;
      return rpc.listRequests({
        attention: view.attention,
        labels: view.labels,
        sort: "recheck_asc",
        includeDemo,
        limit: current ? params.size : 1,
        offset: current ? toOffset(params.page, params.size) : 0,
      });
    }),
  ]);
  const result = lists[BACKORDER_VIEWS.indexOf(active)];
  const now = new Date().toISOString();

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="미송 재확인" />
      <p className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-xs text-secondary-foreground">
        <InfoIcon aria-hidden weight="bold" className="size-4 shrink-0" />
        재확인 알림은 사입삼촌 앱이 열려 있을 때만 만들어져요.
      </p>
      {overview.ok ? <AgingChart bars={agingBars(overview.data.backorderAging)} /> : null}
      <ViewTabs
        tabs={BACKORDER_VIEWS.map((view, index) => {
          const list = lists[index];
          return { key: view.key, label: view.label, count: list.ok ? list.data.total : null };
        })}
      />
      {result.ok ? (
        <BackordersTable
          rows={result.data.rows}
          total={result.data.total}
          page={params.page}
          size={params.size}
          now={now}
          filtered={active.key !== ""}
        />
      ) : (
        <ErrorState />
      )}
      <AutoRefresh />
    </div>
  );
}
