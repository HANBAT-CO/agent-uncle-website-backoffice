"use client";

import { CheckIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { cn } from "@/lib/admin/utils";

import { useListHref } from "./use-list-href";

export type FacetOption = { value: string; label: string; count?: number | null };

/**
 * One facet group with counts from the RPC (screens 9; the 계정·가입 rail).
 * Options are links that toggle the value in `?{param}=`; `multiple` keeps a
 * comma list.
 */
export function FacetFilter({
  param,
  title,
  options,
  multiple = false,
  className,
}: {
  param: string;
  title: string;
  options: FacetOption[];
  multiple?: boolean;
  className?: string;
}) {
  const searchParams = useSearchParams();
  const hrefWith = useListHref();
  const raw = searchParams.get(param) ?? "";
  const selected = raw ? raw.split(",") : [];

  const hrefFor = (value: string) => {
    const on = selected.includes(value);
    if (!multiple) return hrefWith({ [param]: on ? null : value });
    return hrefWith({ [param]: on ? selected.filter((item) => item !== value) : [...selected, value] });
  };

  return (
    <section aria-label={title} className={cn("flex flex-col gap-1", className)}>
      <h3 className="px-2 text-xs font-medium text-muted-foreground">{title}</h3>
      <ul className="flex flex-col">
        {options.map((option) => {
          const on = selected.includes(option.value);
          return (
            <li key={option.value}>
              <Link
                href={hrefFor(option.value)}
                scroll={false}
                aria-pressed={on}
                role="button"
                className={cn(
                  "flex h-8 items-center gap-2 rounded-md px-2 text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40",
                  on && "bg-secondary font-semibold text-secondary-foreground",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input",
                    on && "border-primary bg-primary text-primary-foreground",
                  )}
                >
                  {on ? <CheckIcon weight="bold" className="size-3" /> : null}
                </span>
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {option.count !== undefined && option.count !== null ? (
                  <span className="num text-xs text-muted-foreground">{option.count.toLocaleString("ko-KR")}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
