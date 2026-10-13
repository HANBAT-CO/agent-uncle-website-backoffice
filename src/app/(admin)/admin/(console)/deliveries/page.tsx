import type { Metadata } from "next";
import type { SearchParams } from "nuqs/server";

import { AutoRefresh } from "@/components/admin/common/AutoRefresh";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { ViewTabs } from "@/components/admin/data-table/ViewTabs";
import { DeliveriesTable } from "@/components/admin/deliveries/DeliveriesTable";
import { DELIVERY_VIEWS, deliveryView, deliveryViewCounts } from "@/components/admin/deliveries/delivery-model";
import { recordRows } from "@/components/admin/issues/record-rows";
import { ErrorState } from "@/components/admin/states/ErrorState";
import { verifyAdmin } from "@/lib/admin/dal";
import { rpc } from "@/lib/admin/rpc";
import { toOffset } from "@/lib/admin/search-params";

import { loadDeliveryParams } from "./search-params";

export const metadata: Metadata = { title: "전달·수령" };

/**
 * 전달·수령 /admin/deliveries (screens appendix 10.10, viewer). Delivery
 * rounds from list_records('deliveries'); the view counts come from the same
 * call's facets, which SQL computes before the view filter. Viewers get the
 * 수령지 masked by the RPC. Read-only: receipts are recorded in the app.
 */
export default async function DeliveriesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await verifyAdmin();
  const params = await loadDeliveryParams(searchParams);
  const view = deliveryView(params.view);
  const result = await rpc.listRecords({
    collection: "deliveries",
    filter: view.filter,
    includeDemo: session.target === "live" && params.demo,
    limit: params.size,
    offset: toOffset(params.page, params.size),
  });
  const counts = result.ok ? deliveryViewCounts(result.data.facets) : null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="전달·수령" />
      <ViewTabs tabs={DELIVERY_VIEWS.map((item) => ({ key: item.key, label: item.label, count: counts?.[item.key] ?? null }))} />
      {result.ok ? (
        <DeliveriesTable
          rows={recordRows("deliveries", result.data)}
          total={result.data.total}
          page={params.page}
          size={params.size}
          now={new Date().toISOString()}
          filtered={view.key !== ""}
        />
      ) : (
        <ErrorState />
      )}
      <AutoRefresh />
    </div>
  );
}
