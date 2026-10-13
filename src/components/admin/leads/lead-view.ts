import { kstDayRange, kstToday } from "@/lib/admin/format";
import type { LeadStatus } from "@/lib/admin/rpc/enums";
import type { LeadRow } from "@/lib/admin/rpc/schemas";

/*
 * 랜딩 문의 list logic (screens 10.16). Pure and client-safe: views, the
 * backoffice_list_leads arguments they map to, and the cell summaries.
 */

export const LEAD_COPY = {
  empty: "아직 랜딩 문의가 없어요",
  emptyFiltered: "조건에 맞는 문의가 없어요",
  emptyFilteredHint: "다른 보기나 처리 상태를 골라 보세요.",
  csvNote: "개인정보가 담긴 파일이에요. 사유를 남기고 내려받아요.",
  messageHidden: "열람자에게는 보이지 않아요.",
  notesHint: "메모는 고치거나 지울 수 없어요. 개인정보는 적지 말아 주세요.",
} as const;

export type LeadViewKey = "new" | "today" | "all" | "clean";

/** 새 문의 · 오늘 · 전체 · 의심 제외; the first is the default (no `view` in the URL). */
export const LEAD_VIEWS: { key: LeadViewKey; label: string }[] = [
  { key: "new", label: "새 문의" },
  { key: "today", label: "오늘" },
  { key: "all", label: "전체" },
  { key: "clean", label: "의심 제외" },
];

function viewKey(view: string | null | undefined): LeadViewKey {
  return view === "today" || view === "all" || view === "clean" ? view : "new";
}

/**
 * backoffice_list_leads arguments for a view and the 처리 상태 filter.
 * 오늘 has no SQL filter: the page keeps the rows received since KST midnight.
 */
export function leadQuery(
  view: string | null | undefined,
  status: LeadStatus | null | undefined,
): { status: LeadStatus | undefined; includeSuspect: boolean; todayOnly: boolean } {
  const key = viewKey(view);
  return {
    status: status ?? (key === "new" ? "new" : undefined),
    includeSuspect: key !== "clean",
    todayOnly: key === "today",
  };
}

/** URL updates for a 처리 상태 pick: on the 새 문의 view it moves to 전체, so the tab matches the rows. */
export function statusFilterHref(current: { view: string | null | undefined }, status: LeadStatus | null): { status: LeadStatus | null; view: string | null } {
  const key = viewKey(current.view);
  if (status && key === "new") return { status, view: "all" };
  return { status, view: key === "new" ? null : key };
}

/** Tab counts: exact from the status facets, or the active view's total. */
export function leadTabCounts(o: { view: string | null | undefined; total: number; facets: Record<string, number> }): Record<LeadViewKey, number | null> {
  const key = viewKey(o.view);
  if (key === "clean") return { new: null, today: null, all: null, clean: o.total };
  const all = Object.values(o.facets).reduce((sum, n) => sum + n, 0);
  return { new: o.facets.new ?? 0, today: key === "today" ? o.total : null, all, clean: null };
}

/** Leads received since KST midnight (rows arrive newest first). */
export function onlyToday<T extends Pick<LeadRow, "createdAt">>(rows: readonly T[], now: Date = new Date()): T[] {
  const start = Date.parse(kstDayRange(kstToday(now)).from);
  return rows.filter((row) => Date.parse(row.createdAt) >= start);
}

/** 의심 표시: "빠른 제출" for timing-suspect, "테스트" for e2e (the SQL `suspect` rule). */
export function suspectLabels(source: string | null | undefined): string[] {
  const value = source ?? "";
  const labels: string[] = [];
  if (value.includes("timing-suspect")) labels.push("빠른 제출");
  if (value.includes("e2e")) labels.push("테스트");
  return labels;
}

/** 유입: the source over "utm_source / utm_campaign". */
export function sourceSummary(source: string | null | undefined, utm: Record<string, string> | null | undefined): { primary: string; secondary: string | null } {
  const parts = [utm?.utm_source, utm?.utm_campaign].filter((part): part is string => Boolean(part?.trim()));
  return { primary: source?.trim() || "-", secondary: parts.length > 0 ? parts.join(" / ") : null };
}

/** 남긴 말 in the list: the first 40 characters on one line. */
export function messagePreview(message: string | null | undefined, max = 40): string {
  const text = (message ?? "").replace(/\s+/g, " ").trim();
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max).join("")}…` : text;
}
