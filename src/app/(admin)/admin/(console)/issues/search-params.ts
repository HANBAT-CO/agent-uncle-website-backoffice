import { createLoader, parseAsString } from "nuqs/server";

import { pageParsers } from "@/lib/admin/search-params";

/**
 * 문제·정정 URL state (screens 9, 10.12): `tab` (문제 or proposals), view,
 * page, size, demo, and `item`, the record selected into the detail and 속성
 * panes (the first row when it is absent or not on this page).
 */
export const loadIssueParams = createLoader({
  tab: parseAsString.withDefault(""),
  view: pageParsers.view,
  page: pageParsers.page,
  size: pageParsers.size,
  demo: pageParsers.demo,
  item: parseAsString.withDefault(""),
});
