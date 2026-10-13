"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export type ListParamValue = string | number | boolean | readonly string[] | null | undefined;

/**
 * Builds a link to the current list with some URL params changed (the same
 * encoding nuqs uses: arrays joined with commas). Any change that does not
 * set `page` itself goes back to page 1. Empty values remove the param.
 */
export function useListHref(): (updates: Record<string, ListParamValue>) => string {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return useCallback(
    (updates) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        const empty = value === null || value === undefined || value === "" || value === false || (Array.isArray(value) && value.length === 0);
        if (empty) params.delete(key);
        else params.set(key, Array.isArray(value) ? value.join(",") : String(value));
      }
      if (!("page" in updates)) params.delete("page");
      const query = params.toString();
      return query ? `${pathname}?${query}` : pathname;
    },
    [pathname, searchParams],
  );
}
