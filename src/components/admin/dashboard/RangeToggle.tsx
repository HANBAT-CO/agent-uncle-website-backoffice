"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useOptimistic, useTransition } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/components/admin/ui/toggle-group";
import { cn } from "@/lib/admin/utils";

import { RANGES, RANGE_LABEL, parseRange, rangeHref, type Range } from "./model";

/**
 * 오늘 / 7일 / 30일 (screens 10.5, `?range=1|7|30`). The range lives in the
 * URL; the dashboard keeps its current frame while the next one loads.
 */
export function RangeToggle({ value }: { value: Range }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(value);

  const select = (next: string) => {
    if (!next) return; // a single toggle group cannot be cleared
    const range = parseRange(next);
    if (range === shown) return;
    startTransition(() => {
      setShown(range);
      router.push(rangeHref(searchParams.toString(), range), { scroll: false });
    });
  };

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      spacing={0}
      value={String(shown)}
      onValueChange={select}
      aria-label="기간"
      aria-busy={pending || undefined}
      data-testid="range-toggle"
      className={cn("bg-card transition-opacity", pending && "opacity-70")}
    >
      {RANGES.map((range) => (
        <ToggleGroupItem
          key={range}
          value={String(range)}
          className="h-8 px-3 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary/90"
        >
          {RANGE_LABEL[range]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
