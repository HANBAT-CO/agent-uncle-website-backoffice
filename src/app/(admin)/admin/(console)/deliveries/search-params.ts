import { createLoader } from "nuqs/server";

import { pageParsers } from "@/lib/admin/search-params";

/** 전달·수령 URL state (screens 9, 10.10): view, page, size, demo. */
export const loadDeliveryParams = createLoader({
  view: pageParsers.view,
  page: pageParsers.page,
  size: pageParsers.size,
  demo: pageParsers.demo,
});
