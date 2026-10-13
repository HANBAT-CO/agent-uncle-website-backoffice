"use client";

import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { useTransition } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/admin/ui/select";
import { cn } from "@/lib/admin/utils";

export type SortOption = { value: string; label: string };

/** Sort order in `?sort=`; the first option is the default and keeps the URL clean. */
export function SortSelect({
  options,
  param = "sort",
  label = "정렬",
  className,
}: {
  options: SortOption[];
  param?: string;
  label?: string;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [params, setParams] = useQueryStates(
    { [param]: parseAsString.withDefault(""), page: parseAsInteger },
    { shallow: false, scroll: false, startTransition },
  );
  const current = String(params[param] ?? "");
  const value = options.some((option) => option.value === current) ? current : (options[0]?.value ?? "");

  return (
    <Select
      value={value}
      onValueChange={(next) => void setParams({ [param]: next === options[0]?.value ? null : next, page: null })}
    >
      <SelectTrigger aria-label={label} aria-busy={pending || undefined} className={cn("h-9 min-w-36 bg-card text-sm", className)}>
        {/* Children keep the label in the server HTML; Radix fills it only after hydration otherwise. */}
        <SelectValue>{options.find((option) => option.value === value)?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} className="text-sm">
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
