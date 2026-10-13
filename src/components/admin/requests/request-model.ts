import { isKstDay, qty } from "@/lib/admin/format";
import { ACTIVE_REQUEST_LABELS, REQUEST_TABS } from "@/lib/admin/labels";
import type { RequestAttention } from "@/lib/admin/rpc/enums";

/*
 * Pure helpers of the 사입 요청 screens (screens 10.9): tab counts, the 조건
 * filter, footer totals, event titles, issue kinds and proposal summaries.
 * Client-safe.
 */

export type RequestTab = { key: string; label: string; count: number };

/** The dashboard tile 확인이 필요한 요청 opens this view (`view=attention`): 답변 필요 + 문제 확인 중. */
export const ATTENTION_VIEW = { key: "attention", label: "확인 필요", labels: ["답변 필요", "문제 확인 중"] } as const;
export const ACTIVE_VIEW = { key: "active", label: "진행 중 전체", labels: ACTIVE_REQUEST_LABELS } as const;

function sum(facet: Record<string, number>, labels: readonly string[]): number {
  return labels.reduce((total, label) => total + (facet[label] ?? 0), 0);
}

/**
 * Tabs with counts from the RPC's `labels` facet (every label of the rows
 * matching the other filters). 전체 is every label; aggregate dashboard
 * views (`attention`, `active`) appear only while selected.
 */
export function requestTabs(facet: Record<string, number>, view: string | null | undefined): RequestTab[] {
  const all = Object.values(facet).reduce((total, n) => total + n, 0);
  const tabs = REQUEST_TABS.map((tab) => ({ key: tab.key, label: tab.label, count: tab.labels ? sum(facet, tab.labels) : all }));
  if (view === ATTENTION_VIEW.key) tabs.push({ key: ATTENTION_VIEW.key, label: ATTENTION_VIEW.label, count: sum(facet, ATTENTION_VIEW.labels) });
  if (view === ACTIVE_VIEW.key) tabs.push({ key: ACTIVE_VIEW.key, label: ACTIVE_VIEW.label, count: sum(facet, ACTIVE_VIEW.labels) });
  return tabs;
}

/** 조건 (single select), in spec order; each key is the RPC's p_attention value. */
export const REQUEST_CONDITIONS = [
  { key: "open_issue", label: "열린 문제 있음" },
  { key: "proposal", label: "협의 진행 중" },
  { key: "receipt_pending", label: "수령 대기" },
  { key: "recheck_overdue", label: "재확인일 지남" },
  { key: "pending_stale", label: "하루 넘은 확인 대기" },
  { key: "has_photos", label: "사진 있음" },
  { key: "violation", label: "수량 기록 불일치" },
] as const satisfies readonly { key: RequestAttention; label: string }[];

export type RequestCondition = (typeof REQUEST_CONDITIONS)[number]["key"];
export const REQUEST_CONDITION_KEYS = REQUEST_CONDITIONS.map((condition) => condition.key) as RequestCondition[];

export function conditionAttention(value: string | null | undefined): RequestCondition | undefined {
  return REQUEST_CONDITIONS.find((condition) => condition.key === value)?.key;
}

export function conditionLabel(value: string | null | undefined): string | null {
  return REQUEST_CONDITIONS.find((condition) => condition.key === value)?.label ?? null;
}

/** "{total}건 · 요청 {q}장 · 확보 {a}장 · 전달 {d}장 · 수령 {r}장 · 남은 미송 {b}장" */
export function footerText(
  total: number,
  totals: { quantity: number; acquired: number; delivered: number; received: number; backorder: number },
): string {
  return [
    qty(total, "건"),
    `요청 ${qty(totals.quantity, "장")}`,
    `확보 ${qty(totals.acquired, "장")}`,
    `전달 ${qty(totals.delivered, "장")}`,
    `수령 ${qty(totals.received, "장")}`,
    `남은 미송 ${qty(totals.backorder, "장")}`,
  ].join(" · ");
}

/** An event title: line 1 (bold) and the rest (muted), e.g. a rejection with its reason. */
export function splitTitle(title: string | null | undefined): { head: string; rest: string } {
  const text = (title ?? "").trim();
  if (!text) return { head: "-", rest: "" };
  const at = text.indexOf("\n");
  if (at < 0) return { head: text, rest: "" };
  return { head: text.slice(0, at).trim(), rest: text.slice(at + 1).trim() };
}

/** The app's issue kinds (the first line of reason), plus the receipt-mismatch kind. */
export const ISSUE_KINDS = ["상품·옵션이 달라요", "수량이 부족해요", "오염·파손이 있어요"] as const;
export const ISSUE_RECEIPT_KIND = "수령 수량 차이";

/**
 * 유형 and 설명 of an issue. The app writes "{kind}\n{text}"; older rows
 * write "{kind}: {text}". A reason with an actual count comes from a receipt
 * mismatch.
 */
export function issueParts(reason: string | null | undefined, actual: number | null | undefined): { kind: string; detail: string } {
  const text = (reason ?? "").trim();
  const at = text.indexOf("\n");
  const first = (at < 0 ? text : text.slice(0, at)).trim();
  const rest = at < 0 ? "" : text.slice(at + 1).trim();
  const known = ISSUE_KINDS.find((kind) => first === kind);
  if (known) return { kind: known, detail: rest };
  const prefixed = ISSUE_KINDS.find((kind) => first.startsWith(`${kind}:`));
  if (prefixed) return { kind: prefixed, detail: text.slice(prefixed.length + 1).trim() };
  if (first === ISSUE_RECEIPT_KIND) return { kind: ISSUE_RECEIPT_KIND, detail: rest };
  if (typeof actual === "number") return { kind: ISSUE_RECEIPT_KIND, detail: text };
  return { kind: "기타", detail: text };
}

const PROPOSAL_COUNTERS: readonly [field: string, label: string][] = [
  ["quantity", "요청"],
  ["acquired", "확보"],
  ["delivered", "전달"],
  ["received", "수령"],
  ["cancelled", "취소"],
  ["acquiredCancelled", "확보 취소"],
  ["held", "보류"],
];

/** The proposed values of a 변경·취소·정정: changed text first, then the counters present. */
export function proposalSummary(values: { [field: string]: unknown } | null | undefined): string {
  if (!values) return "-";
  const parts: string[] = [];
  for (const [field, label] of [
    ["product", "상품"],
    ["option", "옵션"],
  ] as const) {
    const value = values[field];
    if (typeof value === "string" && value.trim()) parts.push(`${label} ${value.trim()}`);
  }
  for (const [field, label] of PROPOSAL_COUNTERS) {
    const value = values[field];
    if (typeof value === "number" && Number.isFinite(value)) parts.push(`${label} ${qty(value, "장")}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "-";
}

function dayNumber(day: string): number {
  const [year, month, date] = day.split("-").map(Number);
  return Date.UTC(year, month - 1, date) / 86_400_000;
}

/** Days from `today` (KST 'YYYY-MM-DD') to a recheck date: 0 today, negative when overdue, null without a date. */
export function recheckDays(recheck: string | null | undefined, today: string): number | null {
  if (!recheck || !isKstDay(recheck) || !isKstDay(today)) return null;
  return dayNumber(recheck) - dayNumber(today);
}
