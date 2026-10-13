"use client";

import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useQueryStates } from "nuqs";
import { useTransition } from "react";

import { Button } from "@/components/admin/ui/button";
import { PAGE_SIZES, pageParsers } from "@/lib/admin/search-params";

import { useListHref } from "./use-list-href";

/** "{from}-{to} / {total}건" with 이전 / 다음 and the page size (50, 100, 200), all in the URL. */
export function Pagination({ total, page, size }: { total: number; page: number; size: number }) {
  const hrefWith = useListHref();
  const [pending, startTransition] = useTransition();
  const [, setParams] = useQueryStates(
    { size: pageParsers.size, page: pageParsers.page },
    { shallow: false, scroll: false, startTransition },
  );

  const pages = Math.max(Math.ceil(total / size), 1);
  const current = Math.min(Math.max(page, 1), pages);
  const from = total === 0 ? 0 : (current - 1) * size + 1;
  const to = Math.min(current * size, total);

  return (
    <nav aria-label="페이지" aria-busy={pending || undefined} className="flex flex-wrap items-center justify-between gap-3 px-1 pt-1 text-xs">
      <p className="num text-muted-foreground">
        {from.toLocaleString("ko-KR")}-{to.toLocaleString("ko-KR")} / {total.toLocaleString("ko-KR")}건
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-muted-foreground">
          <span>한 번에</span>
          <select
            value={size}
            onChange={(event) => setParams({ size: Number(event.target.value) as (typeof PAGE_SIZES)[number], page: null })}
            className="h-8 rounded-md border border-input bg-card px-2 text-xs text-foreground"
          >
            {PAGE_SIZES.map((option) => (
              <option key={option} value={option}>
                {option}건
              </option>
            ))}
          </select>
        </label>
        {current > 1 ? (
          <Button asChild variant="outline" size="lg">
            <Link href={hrefWith({ page: current - 1 === 1 ? null : current - 1 })} scroll={false} rel="prev">
              <CaretLeftIcon aria-hidden data-icon="inline-start" />
              이전
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="lg" disabled>
            <CaretLeftIcon aria-hidden data-icon="inline-start" />
            이전
          </Button>
        )}
        {current < pages ? (
          <Button asChild variant="outline" size="lg">
            <Link href={hrefWith({ page: current + 1 })} scroll={false} rel="next">
              다음
              <CaretRightIcon aria-hidden data-icon="inline-end" />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="lg" disabled>
            다음
            <CaretRightIcon aria-hidden data-icon="inline-end" />
          </Button>
        )}
      </div>
    </nav>
  );
}
