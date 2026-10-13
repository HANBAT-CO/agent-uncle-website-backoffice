import { createParser, parseAsBoolean, parseAsInteger, parseAsNumberLiteral, parseAsString } from "nuqs/server";

import { isKstDay } from "./format";

/*
 * List state in the URL (screens 9 data table kit): view, q, page, size,
 * sort, demo plus module filters, so a pasted link reopens the same list.
 * Imported from nuqs/server, which holds no server-only code: the same
 * parsers feed createSearchParamsCache / createLoader in Server Components
 * and useQueryStates in client components.
 *
 *   const cache = createSearchParamsCache({ ...pageParsers, ...dateRangeParsers, status: parseAsString })
 */

export const PAGE_SIZES = [50, 100, 200] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export const pageParsers = {
  page: parseAsInteger.withDefault(1),
  size: parseAsNumberLiteral(PAGE_SIZES).withDefault(50),
  q: parseAsString.withDefault(""),
  sort: parseAsString.withDefault(""),
  demo: parseAsBoolean.withDefault(false),
  view: parseAsString.withDefault(""),
};

/** A KST calendar day 'YYYY-MM-DD'; anything else reads as absent. */
export const parseAsKstDay = createParser({
  parse: (value: string) => (isKstDay(value) ? value : null),
  serialize: (value: string) => value,
});

/** 기간 filters as KST days; turn them into UTC bounds with kstDayRange(). */
export const dateRangeParsers = {
  from: parseAsKstDay,
  to: parseAsKstDay,
};

/** Zero-based row offset of a 1-based page. */
export function toOffset(page: number, size: number): number {
  return (Math.max(Math.floor(page), 1) - 1) * size;
}
