import { CaretRightIcon, EnvelopeSimpleIcon, PackageIcon, UsersThreeIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { KstTime } from "@/components/admin/common/KstTime";
import { StatusChip } from "@/components/admin/common/StatusChip";
import { LEAD_ROLE_LABEL, roleKindLabel } from "@/lib/admin/labels";
import { entityHref, type AdminHref } from "@/lib/admin/nav";
import type { SearchResult } from "@/lib/admin/rpc/schemas";

import { Highlight } from "./Highlight";
import type { SearchScope } from "./palette-model";

/** Rows per group on the 전체 tab; the scoped tabs show everything the RPC returned. */
export const ALL_SCOPE_PREVIEW = 5;

function joinDot(parts: (string | null | undefined)[]): string {
  return parts.filter((part): part is string => typeof part === "string" && part.trim().length > 0).join(" · ");
}

function Row({ href, icon: Icon, title, sub, query, aside }: {
  href: AdminHref;
  icon: typeof UsersThreeIcon;
  title: string;
  sub?: string;
  query: string;
  aside?: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="group flex min-h-14 items-center gap-3 px-4 py-2.5 outline-none hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
          <Icon aria-hidden className="size-4" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Highlight text={title} query={query} className="truncate text-sm font-semibold text-foreground" />
          {sub ? <Highlight text={sub} query={query} className="truncate text-xs text-muted-foreground" /> : null}
        </span>
        {aside ? <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">{aside}</span> : null}
        <CaretRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground/70 group-hover:text-foreground" />
      </Link>
    </li>
  );
}

function Section({
  id,
  title,
  count,
  more,
  children,
}: {
  id: string;
  title: string;
  count: number;
  more?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="overflow-hidden rounded-xl border bg-card">
      <header className="flex h-11 items-center justify-between gap-3 border-b px-4">
        <h2 id={id} className="text-sm font-semibold text-foreground">
          {title} <span className="num font-medium text-muted-foreground">{count}건</span>
        </h2>
        {more ? (
          <Link href={more.href} className="text-xs font-medium text-primary underline-offset-4 hover:underline">
            {more.label}
          </Link>
        ) : null}
      </header>
      <ul className="divide-y">{children}</ul>
    </section>
  );
}

/**
 * /admin/search result groups (screens appendix 9): 계정, 요청, 문의 with
 * their counts and the query highlighted. Rows are links to the screens.
 */
export function SearchResults({
  data,
  query,
  scope,
  scopeHref,
}: {
  data: SearchResult;
  query: string;
  scope: SearchScope;
  scopeHref: (scope: SearchScope) => string;
}) {
  const preview = <T,>(rows: T[]) => (scope === "all" ? rows.slice(0, ALL_SCOPE_PREVIEW) : rows);
  const more = (key: SearchScope, label: string, count: number) =>
    scope === "all" && count > ALL_SCOPE_PREVIEW ? { href: scopeHref(key), label: `${label} ${count}건 모두 보기` } : undefined;

  const showAccounts = (scope === "all" || scope === "accounts") && data.accounts.length > 0;
  const showRequests = (scope === "all" || scope === "requests") && data.requests.length > 0;
  const showLeads = (scope === "all" || scope === "leads") && data.leads.length > 0;

  return (
    <div className="flex flex-col gap-5" data-testid="search-results">
      {showAccounts ? (
        <Section id="search-accounts" title="계정" count={data.accounts.length} more={more("accounts", "계정", data.accounts.length)}>
          {preview(data.accounts).map((account) => (
            <Row
              key={account.id}
              href={entityHref({ kind: "account", id: account.id })}
              icon={UsersThreeIcon}
              title={account.name || account.businessName || "이름 없는 계정"}
              sub={joinDot([
                roleKindLabel(account.role),
                account.name ? account.businessName : null,
                account.phoneTail ? `연락처 끝 ${account.phoneTail}` : null,
              ])}
              query={query}
              aside={account.complete ? null : <StatusChip label="가입 미완료" />}
            />
          ))}
        </Section>
      ) : null}

      {showRequests ? (
        <Section id="search-requests" title="요청" count={data.requests.length} more={more("requests", "요청", data.requests.length)}>
          {preview(data.requests).map((request) => (
            <Row
              key={request.id}
              href={entityHref({ kind: "request", id: request.id })}
              icon={PackageIcon}
              title={joinDot([(request.title || request.product), request.option]) || "상품명 없음"}
              sub={joinDot([request.retailer, request.uncle ? `${request.uncle}에게` : null, `요청 ID ${request.id.slice(0, 8)}`])}
              query={query}
              aside={<StatusChip label={request.label} />}
            />
          ))}
        </Section>
      ) : null}

      {showLeads ? (
        <Section id="search-leads" title="문의" count={data.leads.length} more={more("leads", "문의", data.leads.length)}>
          {preview(data.leads).map((lead) => (
            <Row
              key={lead.id}
              href={entityHref({ kind: "lead", id: lead.id, label: lead.businessName ?? undefined })}
              icon={EnvelopeSimpleIcon}
              title={lead.businessName || lead.name || "이름 없는 문의"}
              sub={joinDot([LEAD_ROLE_LABEL[lead.role] ?? lead.role, lead.businessName ? lead.name : null])}
              query={query}
              aside={<KstTime iso={lead.createdAt} />}
            />
          ))}
        </Section>
      ) : null}
    </div>
  );
}
