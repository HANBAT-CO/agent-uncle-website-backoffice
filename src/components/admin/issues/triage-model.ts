import { formatSince, requestUnit } from "@/lib/admin/format";
import type { RecordFilter } from "@/lib/admin/rpc/enums";

/*
 * 문제·정정 triage (screens appendix 10.12): tabs, views and counts, the
 * 열린 기간 / 대기 시간 span, the request ledger line and the proposed
 * values. Client-safe and pure.
 */

export type TriageTab = "issues" | "proposals";

export function triageTab(value: string | null | undefined): TriageTab {
  return value === "proposals" ? "proposals" : "issues";
}

export type TriageView = { key: string; label: string; filter?: RecordFilter; status?: string };

export const ISSUE_VIEWS: readonly TriageView[] = [
  { key: "", label: "열린 문제", filter: "unresolved" },
  { key: "action", label: "조치 완료 · 해결 확인 대기", status: "actionTaken" },
  { key: "resolved", label: "해결 확인", status: "resolved" },
];

export const PROPOSAL_VIEWS: readonly TriageView[] = [
  { key: "", label: "상대 확인 대기", status: "pending" },
  { key: "approved", label: "확정", status: "approved" },
  { key: "withdrawn", label: "철회", status: "withdrawn" },
  { key: "rejected", label: "거절", status: "rejected" },
];

function pick(views: readonly TriageView[], key: string | null | undefined): TriageView {
  return views.find((view) => view.key === (key ?? "")) ?? views[0];
}

export const issueView = (key: string | null | undefined) => pick(ISSUE_VIEWS, key);
export const proposalView = (key: string | null | undefined) => pick(PROPOSAL_VIEWS, key);

/** Issue view counts from the status facet; 열린 문제 is every status but resolved (SQL 'unresolved'). */
export function issueViewCounts(status: Record<string, number>): Record<string, number> {
  const all = Object.values(status).reduce((sum, n) => sum + n, 0);
  return { "": all - (status.resolved ?? 0), action: status.actionTaken ?? 0, resolved: status.resolved ?? 0 };
}

export function proposalViewCounts(status: Record<string, number>): Record<string, number> {
  return Object.fromEntries(PROPOSAL_VIEWS.map((view) => [view.key, status[view.status ?? ""] ?? 0]));
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * 열린 기간 and 대기 시간. Still open: '3일째' / '5시간째' up to now. Closed
 * (`end` set): the span itself, '3일' / '22시간'.
 */
export function openSpan(start: string | null | undefined, end: string | null | undefined, now: Date = new Date()): string {
  if (!start) return "-";
  if (!end) return formatSince(start, now);
  const elapsed = Math.max(new Date(end).getTime() - new Date(start).getTime(), 0);
  if (Number.isNaN(elapsed)) return "-";
  if (elapsed < DAY) return `${Math.max(Math.floor(elapsed / HOUR), 1)}시간`;
  return `${Math.floor(elapsed / DAY)}일`;
}

type LedgerLike = { quantity: number; acquired: number; delivered: number; received: number; cancelled: number };

/** '요청 {q} · 확보 {a} · 전달 {d} · 수령 {r} · 취소 {c}' from the request's counters. */
export function ledgerLine(ledger: LedgerLike | null | undefined): string {
  if (!ledger) return "-";
  return `요청 ${ledger.quantity} · 확보 ${ledger.acquired} · 전달 ${ledger.delivered} · 수령 ${ledger.received} · 취소 ${ledger.cancelled}`;
}

/** Proposed fields with the app's names and order (requests.dart ProposalCard); 사유 is shown on its own. */
const PROPOSAL_FIELDS: readonly { key: string; term: string; unit?: "장" }[] = [
  { key: "product", term: "상품" },
  { key: "option", term: "옵션" },
  { key: "quantity", term: "수량", unit: "장" },
  { key: "acquired", term: "누적 확보", unit: "장" },
  { key: "received", term: "이번 수령 확인", unit: "장" },
  { key: "acquiredCancelled", term: "확보분 취소", unit: "장" },
  { key: "address", term: "배송지" },
  { key: "addressDetail", term: "상세주소" },
  { key: "recheck", term: "미송 재확인일" },
];

export function proposalValueItems(values: Record<string, unknown> | null | undefined, requestType?: string | null): { term: string; value: string }[] {
  if (!values) return [];
  const items: { term: string; value: string }[] = [];
  for (const field of PROPOSAL_FIELDS) {
    const value = values[field.key];
    if (value === undefined || value === null || value === "") continue;
    items.push({ term: field.term, value: field.unit && typeof value === "number" ? `${value}${requestUnit(requestType)}` : String(value) });
  }
  return items;
}
