/**
 * Consent disclosure, retention and company line (spec S10, S11, 16).
 *
 * Two items are launch blockers until the client confirms them in writing
 * (spec 16, open client questions 1 and 2). The defaults below ship in
 * development and staging; WP-20's release gate reads LEGAL_BLOCKERS.
 */

/** Retention text proposed in the spec. Blocker: the client must confirm it. */
export const RETENTION_DEFAULT = "신청일로부터 1년, 동의를 철회하면 바로 파기해요.";

/** [필수] consent and its 자세히 보기 disclosure. */
export const CONSENT = {
  label: "[필수] 개인정보 수집·이용에 동의해요",
  more: "자세히 보기",
  items: [
    {
      term: "수집 항목",
      value: "역할, 이름·담당자명, 매장명·업체명, 연락처, 사입 시장, 문의 내용, 접속 브라우저 정보(user_agent), 신청 경로(source), 유입 정보(utm_*)",
    },
    { term: "이용 목적", value: "사전 신청 안내와 도입 문의 답변" },
    { term: "보유 기간", value: RETENTION_DEFAULT },
  ],
} as const;

/** Public company name. Blocker: pending client confirmation. */
export const COMPANY = {
  name: "HANBAT & CO.",
  line: "© 2026 HANBAT & CO.",
} as const;

/** Application documents. Version and effective date are displayed on each page. */
export const PRIVACY_PAGE = {
  exists: true,
  href: "/privacy",
  label: "개인정보 처리방침",
} as const;

export const TERMS_PAGE = {
  exists: true,
  href: "/terms",
  label: "서비스 이용약관",
} as const;

export type LegalBlocker = {
  id: "company-name" | "retention";
  /** What is pending, in plain words for the release checklist. */
  item: string;
  /** Default shipping until resolved. */
  value: string;
  /** Where the client question is recorded. */
  question: string;
};

export const LEGAL_BLOCKERS: readonly LegalBlocker[] = [
  {
    id: "company-name",
    item: "Public company name in the footer line",
    value: COMPANY.line,
    question: "spec 16, client question 1",
  },
  {
    id: "retention",
    item: "Consent retention period text and final 개인정보 처리방침 approval",
    value: RETENTION_DEFAULT,
    question: "spec 16, client question 2",
  },
];
