import type { RequestLabel } from "@/lib/admin/labels";

/*
 * 요청 단계 (screens 10.5): the twelve request labels folded into four
 * ordinal stages for the stacked bar, plus 종료 (거절 + 취소 종료), which
 * is shown apart as a grey note. Client-safe and pure.
 */

export const STAGE_KEYS = ["확인 대기", "진행 중", "수령 대기", "완료"] as const;
export type StageKey = (typeof STAGE_KEYS)[number];

export const STAGE_MEMBERS: Record<StageKey, readonly RequestLabel[]> = {
  "확인 대기": ["확인 대기"],
  "진행 중": ["진행 중", "픽업 완료", "미송 대기", "미송 재확인", "답변 필요", "변경·취소 협의 중", "문제 확인 중"],
  "수령 대기": ["수령 대기"],
  완료: ["완료"],
};

export const ENDED_MEMBERS: readonly RequestLabel[] = ["거절", "취소 종료"];

export type Stage = { key: StageKey; count: number };
export type Stages = Stage[] & { ended: number };

/** A usable count: positive and finite, otherwise 0. */
function countOf(labels: Record<string, number>, label: string): number {
  const value = labels[label];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function sum(labels: Record<string, number>, members: readonly string[]): number {
  return members.reduce((total, label) => total + countOf(labels, label), 0);
}

/** The four stages in order (always all four) with `ended` for 종료. */
export function toStages(requestLabels: Record<string, number>): Stages {
  const stages = STAGE_KEYS.map((key) => ({ key, count: sum(requestLabels, STAGE_MEMBERS[key]) }));
  return Object.assign(stages, { ended: sum(requestLabels, ENDED_MEMBERS) });
}
