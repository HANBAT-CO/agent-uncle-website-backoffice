import { createLoader } from "nuqs/server";

import { pageParsers } from "@/lib/admin/search-params";

/** 미송 재확인 URL state (screens 9, 10.11): view, page, size, demo. The sort is fixed: recheck_asc. */
export const loadBackorderParams = createLoader({
  view: pageParsers.view,
  page: pageParsers.page,
  size: pageParsers.size,
  demo: pageParsers.demo,
});
