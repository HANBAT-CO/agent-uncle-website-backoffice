"use client";

import { XIcon } from "@phosphor-icons/react";
import Link from "next/link";

import { Button } from "@/components/admin/ui/button";
import { cn } from "@/lib/admin/utils";

import { useListHref } from "./use-list-href";

export type FilterChip = { param: string; label: string };

/**
 * Active filters as removable chips plus "필터 초기화" (screens 9). Pass one
 * chip per active filter; `resetParams` lists extra params the reset clears.
 */
export function FilterChips({ chips, resetParams = [], className }: { chips: FilterChip[]; resetParams?: string[]; className?: string }) {
  const hrefWith = useListHref();
  if (chips.length === 0) return null;
  const resetAll = Object.fromEntries([...chips.map((chip) => chip.param), ...resetParams].map((param) => [param, null]));

  return (
    <div role="group" aria-label="적용한 필터" className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {chips.map((chip) => (
        <Link
          key={`${chip.param}-${chip.label}`}
          href={hrefWith({ [chip.param]: null })}
          scroll={false}
          aria-label={`${chip.label} 필터 빼기`}
          className="inline-flex h-7 items-center gap-1 rounded-full border bg-card pr-1.5 pl-2.5 text-xs font-medium outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          {chip.label}
          <XIcon aria-hidden weight="bold" className="size-3 text-muted-foreground" />
        </Link>
      ))}
      <Button asChild variant="ghost" size="sm" className="text-xs">
        <Link href={hrefWith(resetAll)} scroll={false}>
          필터 초기화
        </Link>
      </Button>
    </div>
  );
}
