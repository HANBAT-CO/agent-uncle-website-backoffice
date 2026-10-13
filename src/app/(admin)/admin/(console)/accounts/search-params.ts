import { createLoader, parseAsStringLiteral } from "nuqs/server";

import { ACCOUNT_ROLE_FILTERS, ACCOUNT_SORTS, type AccountState } from "@/lib/admin/rpc/enums";
import { pageParsers } from "@/lib/admin/search-params";

/*
 * 계정·가입 list state in the URL (screens 10.7). backoffice_list_accounts
 * takes one p_state, so the view tabs and the 상태 group of the facet rail
 * share the `view` param: one state at a time, and a tab and its matching
 * rail entry light up together. 역할 is its own `role` param. Client-safe:
 * the page loads it with loadAccountParams, the rail and tabs build links
 * from the same keys.
 */

export type AccountView = { key: string; label: string; state: AccountState | undefined };

/** Tabs (screens 10.7 views), in order. The first is the default and keeps the URL clean. */
export const ACCOUNT_VIEW_TABS = [
  { key: "", label: "전체", state: undefined },
  { key: "signup", label: "가입 미완료", state: "signup" },
  { key: "review", label: "서류 확인 대기", state: "awaiting_review" },
  { key: "today", label: "오늘 가입", state: "joined_today" },
  { key: "working", label: "업무 중인 사입삼촌", state: "working" },
  { key: "suspended", label: "이용 제한", state: "suspended" },
] as const satisfies readonly AccountView[];

/** 상태 group of the facet rail (screens 10.7), in order. */
export const ACCOUNT_STATE_FACETS = [
  { key: "signup", label: "가입 미완료", state: "signup" },
  { key: "complete", label: "가입 완료", state: "complete" },
  { key: "missing", label: "서류 미등록", state: "document_missing" },
  { key: "review", label: "서류 확인 대기", state: "awaiting_review" },
  { key: "verified", label: "확인함", state: "verified" },
  { key: "rejected", label: "재제출 필요", state: "rejected" },
  { key: "suspended", label: "이용 제한", state: "suspended" },
  { key: "banned", label: "로그인 차단", state: "login_banned" },
  { key: "staff", label: "운영 계정", state: "staff" },
  { key: "no-account", label: "앱 계정 없음", state: "no_account" },
] as const satisfies readonly AccountView[];

/** 역할 group of the facet rail. */
export const ACCOUNT_ROLE_FACETS = [
  { key: "retailer", label: "소매업자" },
  { key: "uncle", label: "사입삼촌" },
  { key: "none", label: "역할 선택 전" },
] as const satisfies readonly { key: (typeof ACCOUNT_ROLE_FILTERS)[number]; label: string }[];

/** Sort (screens 10.7); the first is the RPC default. */
export const ACCOUNT_SORT_OPTIONS = [
  { value: "created_desc", label: "가입일 최신순" },
  { value: "created_asc", label: "가입일 오래된순" },
  { value: "last_sign_in_desc", label: "최근 로그인순" },
  { value: "name_asc", label: "이름순" },
] as const satisfies readonly { value: (typeof ACCOUNT_SORTS)[number]; label: string }[];

const VIEW_STATE = new Map<string, AccountState | undefined>(
  [...ACCOUNT_VIEW_TABS, ...ACCOUNT_STATE_FACETS].map((view) => [view.key, view.state]),
);

/** The p_state of a `view` value; undefined for 전체 and for anything unknown. */
export function accountStateFor(view: string | null | undefined): AccountState | undefined {
  return VIEW_STATE.get(view ?? "");
}

/** Label of the active `view` (for the filter chip), or null. */
export function accountViewLabel(view: string): string | null {
  if (!view) return null;
  return [...ACCOUNT_STATE_FACETS, ...ACCOUNT_VIEW_TABS].find((item) => item.key === view)?.label ?? null;
}

export const accountParsers = {
  ...pageParsers,
  sort: parseAsStringLiteral(ACCOUNT_SORTS).withDefault("created_desc"),
  role: parseAsStringLiteral(ACCOUNT_ROLE_FILTERS),
};

export const loadAccountParams = createLoader(accountParsers);
