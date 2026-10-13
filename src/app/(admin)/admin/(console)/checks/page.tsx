import type { Metadata } from "next";
import { createLoader } from "nuqs/server";

import { loadAccountNames } from "@/components/admin/checks/account-names";
import { AnomalyTable } from "@/components/admin/checks/AnomalyTable";
import { anomalyRow, kindFilters, parseKind, type AnomalyKind } from "@/components/admin/checks/anomaly-model";
import { KindChips } from "@/components/admin/checks/KindChips";
import { AutoRefresh } from "@/components/admin/common/AutoRefresh";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { stampLabel } from "@/components/admin/dashboard/model";
import { EmptyState } from "@/components/admin/states/EmptyState";
import { ErrorState, LIST_ERROR_MESSAGE } from "@/components/admin/states/ErrorState";
import { verifyAdmin } from "@/lib/admin/dal";
import { rpc } from "@/lib/admin/rpc";
import { pageParsers, toOffset } from "@/lib/admin/search-params";

export const metadata: Metadata = { title: "운영 점검" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const loadParams = createLoader({ page: pageParsers.page, size: pageParsers.size, demo: pageParsers.demo });

function checksHref(kind: AnomalyKind | null, demo: boolean): string {
  const params = new URLSearchParams();
  if (kind) params.set("kind", kind);
  if (demo) params.set("demo", "1");
  const query = params.toString();
  return query ? `/admin/checks?${query}` : "/admin/checks";
}

/**
 * 운영 점검 /admin/checks (screens 10.6, viewer): every open anomaly from
 * backoffice_ledger_anomalies (at most 500, most severe first), filtered by
 * the kind chips (`?kind=`) and paged in the URL. Ledger violations mean a
 * record changed outside saip_command; they are listed first.
 */
export default async function ChecksPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await verifyAdmin();
  const raw = await searchParams;
  const { page, size, demo } = loadParams(raw);
  const kind = parseKind(raw.kind);
  const includeDemo = session.target === "live" && demo;

  const [result, names] = await Promise.all([rpc.anomalies({ includeDemo }), loadAccountNames(includeDemo)]);

  const header = (
    <PageHeader
      title="운영 점검"
      meta={
        result.ok ? (
          <time dateTime={result.data.generatedAt} data-testid="checks-stamp" className="num">
            {stampLabel(result.data.generatedAt)}
          </time>
        ) : null
      }
    />
  );

  if (!result.ok) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <ErrorState message={LIST_ERROR_MESSAGE} retryHref={checksHref(kind, includeDemo)} />
      </div>
    );
  }

  const { items, counts } = result.data;
  const now = new Date(result.data.generatedAt);
  const filtered = kind ? items.filter((item) => item.kind === kind) : items;
  const offset = toOffset(page, size);
  const rows = filtered.slice(offset, offset + size).map((item) => anomalyRow(item, names, now));

  const empty = kind ? (
    <EmptyState title="확인할 이상 징후가 없어요" description="수량 기록과 파일 상태가 모두 정상이에요." resetHref={checksHref(null, includeDemo)} />
  ) : (
    <EmptyState title="확인할 이상 징후가 없어요" description="수량 기록과 파일 상태가 모두 정상이에요." />
  );

  return (
    <div className="flex flex-col gap-4" data-testid="checks">
      <AutoRefresh />
      {header}
      {items.length > 0 || kind ? (
        <KindChips filters={kindFilters(counts, kind)} total={items.length} selected={kind} hrefFor={(next) => checksHref(next, includeDemo)} />
      ) : null}
      <AnomalyTable rows={rows} total={filtered.length} page={page} size={size} empty={empty} />
    </div>
  );
}
