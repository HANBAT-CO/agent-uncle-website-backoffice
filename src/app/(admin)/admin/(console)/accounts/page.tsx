import type { Metadata } from "next";

import { AccountFacetRail } from "@/components/admin/accounts/AccountFacetRail";
import { AccountsTable } from "@/components/admin/accounts/AccountsTable";
import { AutoRefresh } from "@/components/admin/common/AutoRefresh";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { DataTableToolbar } from "@/components/admin/data-table/DataTableToolbar";
import { FilterChips, type FilterChip } from "@/components/admin/data-table/FilterChips";
import { SearchInput } from "@/components/admin/data-table/SearchInput";
import { SortSelect } from "@/components/admin/data-table/SortSelect";
import { ViewTabs } from "@/components/admin/data-table/ViewTabs";
import { EmptyState } from "@/components/admin/states/EmptyState";
import { ErrorState, LIST_ERROR_MESSAGE } from "@/components/admin/states/ErrorState";
import { verifyAdmin } from "@/lib/admin/dal";
import { hasRole } from "@/lib/admin/roles";
import { rpc, type AccountList, type AccountState } from "@/lib/admin/rpc";
import { toOffset } from "@/lib/admin/search-params";

import {
  ACCOUNT_ROLE_FACETS,
  ACCOUNT_SORT_OPTIONS,
  ACCOUNT_STATE_FACETS,
  ACCOUNT_VIEW_TABS,
  accountStateFor,
  accountViewLabel,
  loadAccountParams,
} from "./search-params";

export const metadata: Metadata = { title: "계정·가입" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Facets = AccountList["facets"];

const MAX_QUERY = 100;

const STATE_FACET_COUNT: Record<(typeof ACCOUNT_STATE_FACETS)[number]["key"], (facets: Facets, extra: ExtraCounts) => number | null> = {
  signup: (f) => f.signup,
  complete: (f) => f.complete,
  missing: (f) => f.documentMissing,
  review: (f) => f.awaitingReview,
  verified: (f) => f.verified,
  rejected: (f) => f.rejected,
  suspended: (f) => f.suspended,
  banned: (_f, extra) => extra.banned,
  staff: (f) => f.staff,
  "no-account": (f) => f.noAccount,
};

const ROLE_FACET_COUNT: Record<(typeof ACCOUNT_ROLE_FACETS)[number]["key"], (facets: Facets) => number> = {
  retailer: (f) => f.retailer,
  uncle: (f) => f.uncle,
  none: (f) => f.noRole,
};

type ExtraCounts = { all: number | null; today: number | null; working: number | null; banned: number | null };

function listHref(params: URLSearchParams): string {
  const query = params.toString();
  return query ? `/admin/accounts?${query}` : "/admin/accounts";
}

/**
 * 계정·가입 (screens 10.7): views with counts, the facet rail, a role-aware
 * search, sort and the signup columns. Viewers get masked emails and search
 * names only (backoffice_list_accounts decides; a phone tail finds nothing).
 */
export default async function AccountsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await verifyAdmin();
  const raw = await searchParams;
  const params = loadAccountParams(raw);
  const canSeeContact = hasRole(session.role, "operator");
  const q = params.q.trim().slice(0, MAX_QUERY);
  const state = accountStateFor(params.view);
  const includeDemo = session.target === "live" && params.demo;
  const base = { search: q || undefined, role: params.role ?? undefined, includeDemo };

  // One p_state per call: the main page, plus totals for the tabs and the
  // 로그인 차단 facet that the RPC facets do not carry.
  const count = (s: AccountState | undefined) => rpc.listAccounts({ ...base, state: s, limit: 1, offset: 0 });
  const [result, all, today, working, banned] = await Promise.all([
    rpc.listAccounts({ ...base, state, sort: params.sort, limit: params.size, offset: toOffset(params.page, params.size) }),
    state ? count(undefined) : null,
    state === "joined_today" ? null : count("joined_today"),
    state === "working" ? null : count("working"),
    state === "login_banned" ? null : count("login_banned"),
  ]);

  const current = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") current.set(key, value);
  }

  const header = (
    <PageHeader
      title="계정·가입"
      eyebrow={params.role === "uncle" ? "사입삼춘 관리" : params.role === "retailer" ? "소매상 관리" : "회원 관리"}
      description="사입삼춘과 소매상의 가입, 사업자 서류, 이용 상태를 함께 관리해요."
      meta={canSeeContact ? null : <span>열람자 권한에서는 이메일과 연락처가 가려져요.</span>}
    />
  );

  if (!result.ok) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <ErrorState message={LIST_ERROR_MESSAGE} retryHref={listHref(current)} />
      </div>
    );
  }

  const data = result.data;
  const totalOf = (r: typeof all) => (r && r.ok ? r.data.total : null);
  const extra: ExtraCounts = {
    all: state ? totalOf(all) : data.total,
    today: state === "joined_today" ? data.total : totalOf(today),
    working: state === "working" ? data.total : totalOf(working),
    banned: state === "login_banned" ? data.total : totalOf(banned),
  };
  const tabCount: Record<(typeof ACCOUNT_VIEW_TABS)[number]["key"], number | null> = {
    "": extra.all,
    signup: data.facets.signup,
    review: data.facets.awaitingReview,
    today: extra.today,
    working: extra.working,
    suspended: data.facets.suspended,
  };

  const chips: FilterChip[] = [];
  const roleLabel = ACCOUNT_ROLE_FACETS.find((option) => option.key === params.role)?.label;
  if (roleLabel) chips.push({ param: "role", label: roleLabel });
  const viewLabel = accountViewLabel(params.view);
  if (viewLabel && state) chips.push({ param: "view", label: viewLabel });
  if (q) chips.push({ param: "q", label: `검색: ${q}` });
  const filtered = chips.length > 0;

  return (
    <div className="flex flex-col gap-5">
      <AutoRefresh />
      {header}
      <div className="grid grid-cols-1 items-start gap-4 min-[90rem]:grid-cols-[11rem_minmax(0,1fr)]">
        <AccountFacetRail
          roles={ACCOUNT_ROLE_FACETS.map((option) => ({ value: option.key, label: option.label, count: ROLE_FACET_COUNT[option.key](data.facets) }))}
          states={ACCOUNT_STATE_FACETS.map((option) => ({
            value: option.key,
            label: option.label,
            count: STATE_FACET_COUNT[option.key](data.facets, extra),
          }))}
        />
        <div className="flex min-w-0 flex-col gap-3">
          <ViewTabs label="계정 보기" tabs={ACCOUNT_VIEW_TABS.map((tab) => ({ key: tab.key, label: tab.label, count: tabCount[tab.key] }))} />
          <DataTableToolbar actions={<SortSelect options={[...ACCOUNT_SORT_OPTIONS]} label="정렬" />}>
            <SearchInput
              placeholder={canSeeContact ? "이름·매장명·이메일·연락처 뒷자리로 검색" : "이름·매장명으로 검색"}
              label="계정 검색"
            />
          </DataTableToolbar>
          <FilterChips chips={chips} />
          <AccountsTable
            rows={data.rows}
            total={data.total}
            page={params.page}
            size={params.size}
            sort={params.sort}
            empty={
              <EmptyState
                title="조건에 맞는 계정이 없어요"
                description="검색어나 필터를 바꿔 보세요."
                resetHref={filtered ? "/admin/accounts" : undefined}
              />
            }
          />
        </div>
      </div>
    </div>
  );
}
