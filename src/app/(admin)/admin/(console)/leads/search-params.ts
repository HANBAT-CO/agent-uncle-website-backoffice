import { createLoader, parseAsString, parseAsStringLiteral } from "nuqs/server";

import { LEAD_STATUSES } from "@/lib/admin/rpc/enums";
import { pageParsers } from "@/lib/admin/search-params";

/*
 * 랜딩 문의 URL state (screens 10.16): the view (새 문의 by default · 오늘 ·
 * 전체 · 의심 제외), the 처리 상태 filter (`status`, also the dashboard tile
 * link), the search, the page, and the row whose Sheet is open (`lead`, from
 * the ⌘K palette too).
 */
export const LEAD_VIEW_PARAMS = ["new", "today", "all", "clean"] as const;

export const leadParsers = {
  page: pageParsers.page,
  size: pageParsers.size,
  q: pageParsers.q,
  view: parseAsStringLiteral(LEAD_VIEW_PARAMS),
  status: parseAsStringLiteral(LEAD_STATUSES),
  lead: parseAsString,
};

export const loadLeadParams = createLoader(leadParsers);
