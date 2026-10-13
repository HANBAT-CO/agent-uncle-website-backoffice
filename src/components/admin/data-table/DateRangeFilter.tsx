"use client";

import { parseAsInteger, useQueryStates } from "nuqs";
import { useId, useTransition } from "react";

import { parseAsKstDay } from "@/lib/admin/search-params";
import { cn } from "@/lib/admin/utils";

/**
 * 기간 filter as KST days in `?from=&to=` (both inclusive). The server turns
 * them into UTC bounds with kstDayRange() (Review Focus 3).
 */
export function DateRangeFilter({
  label = "기간",
  fromParam = "from",
  toParam = "to",
  className,
}: {
  label?: string;
  fromParam?: string;
  toParam?: string;
  className?: string;
}) {
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [params, setParams] = useQueryStates(
    { [fromParam]: parseAsKstDay, [toParam]: parseAsKstDay, page: parseAsInteger },
    { shallow: false, scroll: false, startTransition },
  );
  const from = (params[fromParam] as string | null) ?? "";
  const to = (params[toParam] as string | null) ?? "";

  const inputClass =
    "num h-9 rounded-md border border-input bg-card px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

  return (
    <fieldset aria-busy={pending || undefined} className={cn("flex items-center gap-1.5", className)}>
      <legend className="sr-only">{label} (한국 시간)</legend>
      <span aria-hidden className="text-xs text-muted-foreground">
        {label}
      </span>
      <label htmlFor={`${id}-from`} className="sr-only">
        시작일
      </label>
      <input
        id={`${id}-from`}
        type="date"
        value={from}
        max={to || undefined}
        onChange={(event) => void setParams({ [fromParam]: event.target.value || null, page: null })}
        className={inputClass}
      />
      <span aria-hidden className="text-muted-foreground">
        ~
      </span>
      <label htmlFor={`${id}-to`} className="sr-only">
        종료일
      </label>
      <input
        id={`${id}-to`}
        type="date"
        value={to}
        min={from || undefined}
        onChange={(event) => void setParams({ [toParam]: event.target.value || null, page: null })}
        className={inputClass}
      />
    </fieldset>
  );
}
