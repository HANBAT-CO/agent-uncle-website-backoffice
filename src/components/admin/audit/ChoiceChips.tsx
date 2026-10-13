"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { cn } from "@/lib/admin/utils";

import { useListHref } from "../data-table/use-list-href";

/**
 * A single-choice chip row whose value lives in `?{param}=` (the 작업 filter).
 * Each chip is a link; choosing the active chip again clears it.
 */
export function ChoiceChips({ param, label, options }: { param: string; label: string; options: { value: string; label: string }[] }) {
  const searchParams = useSearchParams();
  const hrefWith = useListHref();
  const current = searchParams.get(param) ?? "";

  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <span className="mr-0.5 text-xs text-muted-foreground" aria-hidden>
        {label}
      </span>
      {options.map((option) => {
        const on = option.value === current;
        return (
          <Link
            key={option.value}
            href={hrefWith({ [param]: on ? null : option.value })}
            scroll={false}
            aria-pressed={on}
            role="button"
            className={cn(
              "inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-medium outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40",
              on ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90" : "bg-card text-foreground",
            )}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}
