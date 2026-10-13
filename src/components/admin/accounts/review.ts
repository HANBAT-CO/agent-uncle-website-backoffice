/*
 * Document review vocabulary (screens 10.7 서류). Client-safe constants shared
 * by the review form (client) and the review history (server).
 */

export const REVIEW_DECISION_LABEL = { verified: "확인함", rejected: "재제출 요청", reset: "검토 초기화" } as const;
export type ReviewDecisionKey = keyof typeof REVIEW_DECISION_LABEL;

/** Checklist items; `name` is the form field, `key` the p_checks key. */
export const REVIEW_CHECKS = [
  { name: "checkName", key: "businessName", label: "상호가 일치해요" },
  { name: "checkNumber", key: "businessNumber", label: "사업자등록번호가 일치해요" },
  { name: "checkImage", key: "imageClear", label: "이미지가 선명해요" },
] as const;
