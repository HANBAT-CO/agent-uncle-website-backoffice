import { createLoader } from "nuqs/server";

import type { RecordFilter } from "@/lib/admin/rpc/enums";
import type { RecordFacets } from "@/lib/admin/rpc/schemas";
import { pageParsers } from "@/lib/admin/search-params";

/*
 * 거래처 연결 list state (screens 10.8): views in `?view=`, page and size.
 * Each view maps to one backoffice_list_records argument. Client-safe.
 */

type ConnectionQuery = { filter?: RecordFilter; status?: string };

export const CONNECTION_VIEWS = [
  { key: "", label: "전체", query: {} },
  { key: "pending", label: "수락 대기", query: { filter: "pending" } },
  { key: "stale", label: "수락 대기 3일 넘음", query: { filter: "pending_3d" } },
  { key: "today", label: "오늘 연결", query: { filter: "today" } },
  { key: "accepted", label: "연결 완료", query: { status: "accepted" } },
] as const satisfies readonly { key: string; label: string; query: ConnectionQuery }[];

export type ConnectionViewKey = (typeof CONNECTION_VIEWS)[number]["key"];

export function connectionQueryFor(view: string | null | undefined): ConnectionQuery {
  return { ...(CONNECTION_VIEWS.find((item) => item.key === (view ?? ""))?.query ?? {}) };
}

/**
 * Tab counts from the facets of a call without p_status (the facets follow
 * p_status but not p_filter): 전체 is the sum of every status.
 */
export function connectionViewCounts(facets: RecordFacets): Record<ConnectionViewKey, number> {
  const status = facets.status;
  return {
    "": Object.values(status).reduce((sum, n) => sum + n, 0),
    pending: status.pending ?? 0,
    stale: facets.pending3d,
    today: facets.today,
    accepted: status.accepted ?? 0,
  };
}

export const loadConnectionParams = createLoader(pageParsers);
