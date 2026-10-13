import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Form from "next/form";

import { PageHeader } from "@/components/admin/common/PageHeader";
import { ViewTabs } from "@/components/admin/data-table/ViewTabs";
import { SearchResults } from "@/components/admin/shell/SearchResults";
import { SEARCH_SCOPES, parseScope, type SearchScope } from "@/components/admin/shell/palette-model";
import { EmptyState } from "@/components/admin/states/EmptyState";
import { ErrorState, LIST_ERROR_MESSAGE } from "@/components/admin/states/ErrorState";
import { Button } from "@/components/admin/ui/button";
import { verifyAdmin } from "@/lib/admin/dal";
import { hasRole } from "@/lib/admin/roles";
import { rpc } from "@/lib/admin/rpc";

export const metadata: Metadata = { title: "검색" };

/** backoffice_search returns at most this many rows per group. */
const SEARCH_LIMIT = 20;
const MAX_QUERY = 100;

const SCOPE_LABEL: Record<SearchScope, string> = { all: "전체", accounts: "계정", requests: "요청", leads: "문의" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function searchHref(q: string, scope: SearchScope): string {
  const params = new URLSearchParams({ q });
  if (scope !== "all") params.set("scope", scope);
  return `/admin/search?${params.toString()}`;
}

/**
 * /admin/search (screens appendix 9): the full result page behind ⌘K, with
 * scope tabs 전체 / 계정 / 요청 / 문의, counts and highlighted matches.
 * Viewers search names and ids only; the SQL decides what each role may
 * match and masks the rest.
 */
export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await verifyAdmin();
  const params = await searchParams;
  const q = first(params.q).trim().slice(0, MAX_QUERY);
  const scope = parseScope(params.scope);
  const result = q ? await rpc.search(q, SEARCH_LIMIT) : null;
  const data = result?.ok ? result.data : null;

  const counts = data
    ? { accounts: data.accounts.length, requests: data.requests.length, leads: data.leads.length }
    : { accounts: 0, requests: 0, leads: 0 };
  const total = counts.accounts + counts.requests + counts.leads;
  const scopeCount = scope === "all" ? total : counts[scope];
  const capped = data ? Object.values(counts).some((count) => count >= SEARCH_LIMIT) : false;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="검색"
        description="계정, 사입 요청, 랜딩 문의를 한 번에 찾아요."
        meta={hasRole(session.role, "operator") ? null : <span>연락처와 이메일로 찾기는 운영자 이상만 할 수 있어요.</span>}
      />

      <Form action="/admin/search" role="search" className="flex max-w-2xl items-center gap-2">
        <label htmlFor="admin-search-q" className="sr-only">
          찾을 내용
        </label>
        <div className="relative min-w-0 flex-1">
          <MagnifyingGlassIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id="admin-search-q"
            type="search"
            name="q"
            defaultValue={q}
            maxLength={MAX_QUERY}
            placeholder="이름, 매장명, 상품명, 요청 ID로 찾기"
            autoComplete="off"
            className="h-10 w-full rounded-md border border-input bg-card pr-3 pl-9 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </div>
        {scope !== "all" ? <input type="hidden" name="scope" value={scope} /> : null}
        <Button type="submit" size="lg" className="h-10 px-4 text-sm">
          찾기
        </Button>
      </Form>

      {q ? (
        <ViewTabs
          param="scope"
          label="검색 범위"
          tabs={SEARCH_SCOPES.map((key) => ({
            key,
            label: SCOPE_LABEL[key],
            count: data ? (key === "all" ? total : counts[key]) : null,
          }))}
        />
      ) : null}

      {!q ? (
        <EmptyState title="찾을 내용을 입력해 주세요" description="이름, 매장명, 상품명, 요청 ID로 찾을 수 있어요." />
      ) : result && !result.ok ? (
        <ErrorState message={LIST_ERROR_MESSAGE} retryHref={searchHref(q, scope)} />
      ) : data && scopeCount > 0 ? (
        <>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            &quot;{q}&quot; {SCOPE_LABEL[scope]} <span className="num">{scopeCount}</span>건
            {capped ? " · 종류마다 최대 20건까지 보여요. 더 자세히 입력하면 좁혀져요." : ""}
          </p>
          <SearchResults data={data} query={q} scope={scope} scopeHref={(next) => searchHref(q, next)} />
        </>
      ) : (
        <EmptyState
          title={`"${q}"에 맞는 결과가 없어요`}
          description="다른 이름이나 요청 ID로 찾아 보세요."
          resetHref={scope !== "all" && total > 0 ? searchHref(q, "all") : undefined}
        />
      )}
    </div>
  );
}
