import { ViewTabs } from "@/components/admin/data-table/ViewTabs";

import { requestTabs } from "./request-model";

/**
 * 사입 요청 tabs (screens 10.9) with counts from the RPC's labels facet:
 * every tab counts the rows the other filters leave, so a count always
 * equals the rows its tab shows.
 */
export function RequestTabs({ labels, view }: { labels: Record<string, number>; view: string }) {
  return <ViewTabs label="요청 상태" tabs={requestTabs(labels, view)} />;
}
