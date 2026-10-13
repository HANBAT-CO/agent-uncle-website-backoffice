import type { Metadata } from "next";
import { Suspense } from "react";

import { loadAccountNames } from "@/components/admin/checks/account-names";
import { anomalyRow } from "@/components/admin/checks/anomaly-model";
import { AutoRefresh } from "@/components/admin/common/AutoRefresh";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { AttentionQueue } from "@/components/admin/dashboard/AttentionQueue";
import { BackorderAgingChart } from "@/components/admin/dashboard/BackorderAgingChart";
import { DashboardSkeleton } from "@/components/admin/dashboard/DashboardSkeleton";
import { KpiTiles } from "@/components/admin/dashboard/KpiTiles";
import { kpiTiles, parseRange, stampLabel, summaryLines } from "@/components/admin/dashboard/model";
import { NewRequestsChart } from "@/components/admin/dashboard/NewRequestsChart";
import { RangeToggle } from "@/components/admin/dashboard/RangeToggle";
import { SideSummary } from "@/components/admin/dashboard/SideSummary";
import { StageBar } from "@/components/admin/dashboard/StageBar";
import { toStages } from "@/components/admin/dashboard/stages";
import { ErrorState } from "@/components/admin/states/ErrorState";
import { verifyAdmin } from "@/lib/admin/dal";
import { rpc, type Overview, type RpcResult } from "@/lib/admin/rpc";

export const metadata: Metadata = { title: "대시보드" };

const DASHBOARD_ERROR = "대시보드를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function isOn(value: string | string[] | undefined): boolean {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "1" || raw === "true";
}

async function Stamp({ overview }: { overview: Promise<RpcResult<Overview>> }) {
  const result = await overview;
  if (!result.ok) return null;
  return (
    <time dateTime={result.data.generatedAt} data-testid="dashboard-stamp" className="num">
      {stampLabel(result.data.generatedAt)}
    </time>
  );
}

async function DashboardBody({
  overview,
  names,
  includeDemo,
}: {
  overview: Promise<RpcResult<Overview>>;
  names: Promise<Map<string, string>>;
  includeDemo: boolean;
}) {
  const [result, nameMap] = await Promise.all([overview, names]);
  if (!result.ok) return <ErrorState message={DASHBOARD_ERROR} />;

  const data = result.data;
  const now = new Date(data.generatedAt);
  const stages = toStages(data.requestLabels);

  return (
    <>
      <KpiTiles tiles={kpiTiles(data, { includeDemo })} />
      <StageBar stages={[...stages]} ended={stages.ended} includeDemo={includeDemo} />
      <div className="dashboard-workspace grid gap-5">
        <AttentionQueue rows={data.queue.map((item) => anomalyRow(item, nameMap, now))} now={now} includeDemo={includeDemo} />
        <SideSummary lines={summaryLines(data)} accounts={data.accounts} maintenanceOn={Boolean(data.maintenance?.active)} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <NewRequestsChart series={data.newRequestsByDay} />
        <BackorderAgingChart aging={data.backorderAging} />
      </div>
    </>
  );
}

/**
 * 대시보드 /admin (screens 10.5, viewer). One backoffice_overview call for
 * the chosen range feeds the stamp, the six KPI tiles, the 지금 확인할 일
 * queue, the side summary, request flow and two charts. Refreshes every 30 s while
 * the tab is visible. Demo rows count only on live with `demo=1`.
 */
export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await verifyAdmin();
  const params = await searchParams;
  const range = parseRange(params.range);
  const includeDemo = session.target === "live" && isOn(params.demo);

  // Started together; the stamp and the body await the same overview call.
  const overview = rpc.overview({ includeDemo, days: range });
  const names = loadAccountNames(includeDemo);

  return (
    <div className="flex flex-col gap-5" data-testid="dashboard">
      <AutoRefresh />
      <PageHeader
        title="대시보드"
        eyebrow="OPERATIONS OVERVIEW"
        meta={
          <Suspense fallback={<span aria-hidden>…</span>}>
            <Stamp overview={overview} />
          </Suspense>
        }
        actions={<RangeToggle value={range} />}
      />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardBody overview={overview} names={names} includeDemo={includeDemo} />
      </Suspense>
    </div>
  );
}
