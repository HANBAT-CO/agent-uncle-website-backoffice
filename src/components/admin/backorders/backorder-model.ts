import { formatKst } from "@/lib/admin/format";
import type { RequestLabel } from "@/lib/admin/labels";
import type { RequestAttention } from "@/lib/admin/rpc/enums";
import type { Overview } from "@/lib/admin/rpc/schemas";

/*
 * 미송 재확인 (screens appendix 10.11): views, 답변 상태, 최근 처리 and
 * 재확인 알림 cells, and the 미송 경과 buckets. Client-safe and pure. The view
 * keys are the ones the dashboard tile (`view=due`) and ⌘K
 * (`view=overdue`) link to.
 */

export type BackorderView = { key: string; label: string; attention: RequestAttention; labels: RequestLabel[] | null };

export const BACKORDER_VIEWS: readonly BackorderView[] = [
  { key: "", label: "전체 미송", attention: "backorder", labels: null },
  { key: "today", label: "오늘 재확인", attention: "recheck_today", labels: null },
  { key: "overdue", label: "기한 지남", attention: "recheck_overdue", labels: null },
  { key: "due", label: "재확인 도래", attention: "recheck_due", labels: null },
  { key: "reply", label: "답변 필요", attention: "backorder", labels: ["답변 필요"] },
];

export function backorderView(key: string | null | undefined): BackorderView {
  return BACKORDER_VIEWS.find((view) => view.key === (key ?? "")) ?? BACKORDER_VIEWS[0];
}

export type AnswerState = "답변 필요" | "기다리기로 함" | "취소 협의 중";

/** 답변 상태 of a back order: an open proposal first, then the uncle's open question. */
export function answerState(row: { needsReply: boolean; proposalId: string }): AnswerState {
  if (row.proposalId) return "취소 협의 중";
  if (row.needsReply) return "답변 필요";
  return "기다리기로 함";
}

/** 최근 처리: the event title's first line, and its second line (the reason) when there is one. */
export function eventLines(title: string | null | undefined): { title: string | null; reason: string | null } {
  if (!title?.trim()) return { title: null, reason: null };
  const [first, ...rest] = title.trim().split("\n");
  const reason = rest.join(" ").trim();
  return { title: first.trim(), reason: reason || null };
}

/** 재확인 알림: '보냄 · {KST}' or '아직 없음'. */
export function recheckNoticeLabel(iso: string | null | undefined, now: Date = new Date()): string {
  return iso ? `보냄 · ${formatKst(iso, { now })}` : "아직 없음";
}

type AgingKey = keyof Overview["backorderAging"];

/** 미송 경과 buckets, the same as the dashboard (days past the recheck date). */
export const AGING_BUCKETS: readonly { key: AgingKey; label: string }[] = [
  { key: "0-1", label: "0-1일" },
  { key: "2-3", label: "2-3일" },
  { key: "4-7", label: "4-7일" },
  { key: "8+", label: "8일 이상" },
];

export type AgingBar = { key: AgingKey; label: string; count: number };

export function agingBars(aging: Overview["backorderAging"]): AgingBar[] {
  return AGING_BUCKETS.map((bucket) => ({ ...bucket, count: aging[bucket.key] }));
}
