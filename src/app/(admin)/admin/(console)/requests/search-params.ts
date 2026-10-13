import { createLoader, createParser, parseAsStringLiteral } from "nuqs/server";

import { REQUEST_CONDITION_KEYS } from "@/components/admin/requests/request-model";
import { REQUEST_SORTS } from "@/lib/admin/rpc/enums";
import { dateRangeParsers, pageParsers } from "@/lib/admin/search-params";

/*
 * 사입 요청 list state in the URL (screens 9, 10.9): the shared view, q,
 * page, size, demo; sort as an RPC sort; 기간 as KST days; `account` from
 * the 거래처 combobox; `cond` is the single-select 조건 (an RPC p_attention).
 */

export const REQUEST_SORT_OPTIONS = [
  { value: "updated_desc", label: "최근 처리순" },
  { value: "created_desc", label: "요청 최신순" },
  { value: "created_asc", label: "요청 오래된순" },
  { value: "recheck_asc", label: "재확인일 빠른순" },
] as const satisfies readonly { value: (typeof REQUEST_SORTS)[number]; label: string }[];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An account id from the 거래처 combobox; anything else reads as no filter. */
const parseAsAccountId = createParser({
  parse: (value: string) => (UUID.test(value) ? value.toLowerCase() : null),
  serialize: (value: string) => value,
});

export const requestSearchParams = {
  ...pageParsers,
  ...dateRangeParsers,
  sort: parseAsStringLiteral(REQUEST_SORTS).withDefault("updated_desc"),
  account: parseAsAccountId,
  cond: parseAsStringLiteral(REQUEST_CONDITION_KEYS),
};

export const loadRequestSearchParams = createLoader(requestSearchParams);
