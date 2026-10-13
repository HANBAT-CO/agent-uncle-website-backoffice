"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { FacetFilter, type FacetOption } from "@/components/admin/data-table/FacetFilter";
import { useListHref } from "@/components/admin/data-table/use-list-href";
import { Button } from "@/components/admin/ui/button";

/**
 * The left facet rail of 계정·가입 (screens 10.7, the only screen with one;
 * below 1440px it folds into a filter panel above the table so every column fits):
 * 역할 in `?role=`, 상태 in `?view=` (shared with the tabs, because
 * backoffice_list_accounts filters on one state at a time), and
 * "필터 초기화". Counts come from the RPC facets, computed by the page.
 */
export function AccountFacetRail({ roles, states }: { roles: FacetOption[]; states: FacetOption[] }) {
  const searchParams = useSearchParams();
  const hrefWith = useListHref();
  const active = Boolean(searchParams.get("view") || searchParams.get("role"));

  return (
    <aside
      aria-label="계정 필터"
      className="grid grid-cols-1 items-start gap-4 rounded-xl border bg-card p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,3fr)_auto] min-[90rem]:flex min-[90rem]:flex-col min-[90rem]:gap-5"
    >
      <FacetFilter param="role" title="역할" options={roles} className="[&_ul]:grid [&_ul]:grid-cols-3 md:[&_ul]:grid-cols-1 min-[90rem]:[&_ul]:flex" />
      <FacetFilter param="view" title="상태" options={states} className="[&_ul]:grid [&_ul]:grid-cols-2 xl:[&_ul]:grid-cols-4 min-[90rem]:[&_ul]:flex" />
      {active ? (
        <Button asChild variant="outline" size="lg" className="w-full">
          <Link href={hrefWith({ view: null, role: null })} scroll={false}>
            필터 초기화
          </Link>
        </Button>
      ) : (
        <Button variant="outline" size="lg" className="w-full" disabled>
          필터 초기화
        </Button>
      )}
    </aside>
  );
}
