/*
 * Every Korean label map of the console (screens appendix 9 and 10).
 * Client-safe. Request labels mirror the app's RequestRecord.statusLabel word
 * for word (and backoffice_private.request_label in the migration).
 */

export type Tone = "attention" | "normal" | "done" | "ended";
export type ToneIcon = "WarningCircle" | "Clock" | "CheckCircle" | "XCircle";

export const REQUEST_LABELS = [
  "거절",
  "취소 종료",
  "완료",
  "수령(입금 전)",
  "입금 완료",
  "문제 확인 중",
  "변경·취소 협의 중",
  "확인 대기",
  "답변 필요",
  "수령 대기",
  "미송 재확인",
  "미송 대기",
  "픽업 완료",
  "진행 중",
] as const;

export type RequestLabel = (typeof REQUEST_LABELS)[number];

export function isRequestLabel(value: string): value is RequestLabel {
  return (REQUEST_LABELS as readonly string[]).includes(value);
}

/** Status chips (screens appendix 9): icon + label + tint, colour never alone. */
const TONES: Record<string, { tone: Tone; icon: ToneIcon }> = {};
function define(tone: Tone, icon: ToneIcon, labels: string[]) {
  for (const label of labels) TONES[label] = { tone, icon };
}
define("attention", "WarningCircle", ["답변 필요", "문제 확인 중", "수량 차이", "재제출 필요", "정보 변경 · 다시 확인 필요", "이용 제한"]);
define("normal", "Clock", [
  "확인 대기",
  "진행 중",
  "픽업 완료",
  "수령 대기",
  "수령(입금 전)",
  "미송 대기",
  "미송 재확인",
  "변경·취소 협의 중",
  "상대 확인 대기",
  "조치 완료 · 해결 확인 대기",
  "수락 대기",
  "제출됨 · 검증 전",
]);
define("done", "CheckCircle", ["수령 확인", "연결 완료", "확인함", "확정", "이용 중"]);
define("ended", "CheckCircle", ["완료", "입금 완료", "해결 확인"]);
define("ended", "XCircle", ["거절", "취소 종료", "철회", "미등록", "해당 없음"]);
// Chips the appendix uses without listing a tone: same rules (open work is
// normal, finished is done or ended, never colour alone).
define("attention", "WarningCircle", ["로그인 차단", "긴급"]);
define("normal", "Clock", ["예약", "새 문의", "연락함", "상담 중", "열림", "확인 중", "답변 대기", "역할 선택", "정보 입력"]);
define("done", "CheckCircle", ["게시 중", "가입 전환", "가입 완료", "활성", "해결"]);
define("ended", "CheckCircle", ["종료", "초안"]);
define("ended", "XCircle", ["스팸", "해제됨", "앱 계정 없음", "닫음"]);

const DEFAULT_TONE = { tone: "normal", icon: "Clock" } as const;

export function statusTone(label: string): { tone: Tone; icon: ToneIcon } {
  return TONES[label] ?? DEFAULT_TONE;
}

/** 사입 요청 tabs (screens 10.9), in order. Every label sits in exactly one tab. */
export const REQUEST_TABS: { key: string; label: string; labels: RequestLabel[] | null }[] = [
  { key: "all", label: "전체", labels: null },
  { key: "pending", label: "확인 대기", labels: ["확인 대기"] },
  { key: "progress", label: "진행 중", labels: ["진행 중", "픽업 완료", "미송 대기"] },
  { key: "reply", label: "답변 필요", labels: ["답변 필요"] },
  { key: "recheck", label: "미송 재확인", labels: ["미송 재확인"] },
  { key: "receipt", label: "수령 대기", labels: ["수령 대기"] },
  { key: "issue", label: "문제 확인 중", labels: ["문제 확인 중"] },
  { key: "proposal", label: "변경·취소 협의 중", labels: ["변경·취소 협의 중"] },
  { key: "unpaid", label: "수령(입금 전)", labels: ["수령(입금 전)"] },
  { key: "done", label: "입금 완료", labels: ["입금 완료", "완료"] },
  { key: "closed", label: "종료", labels: ["거절", "취소 종료"] },
];

/** All in-flight labels shown together in the dashboard's 진행 중 stage. */
export const ACTIVE_REQUEST_LABELS: RequestLabel[] = [
  "진행 중", "픽업 완료", "미송 대기", "미송 재확인", "답변 필요", "변경·취소 협의 중", "문제 확인 중",
];

/** Aggregate dashboard views are additional to the mutually exclusive list tabs. */
const REQUEST_VIEWS: Record<string, RequestLabel[] | null> = {
  ...Object.fromEntries(REQUEST_TABS.map((tab) => [tab.key, tab.labels])),
  attention: ["답변 필요", "문제 확인 중"],
  active: ACTIVE_REQUEST_LABELS,
  received: ["수령(입금 전)", "입금 완료", "완료"],
};

/** `p_labels` for a request view key; null means every label. */
export function requestLabelsForView(view: string | null | undefined): RequestLabel[] | null {
  return (view && REQUEST_VIEWS[view]) || null;
}

/** Ledger violation codes (screens 10.9). */
export const VIOLATION_LABEL: Record<string, string> = {
  received_gt_delivered: "수령이 전달보다 많아요",
  delivered_gt_acquired: "전달이 확보보다 많아요",
  negative_counter: "음수 수량이 있어요",
  held_out_of_range: "처리 보류 수량이 범위를 벗어났어요",
  delivered_ne_sum_deliveries: "전달 합계가 회차 합과 달라요",
  received_ne_sum_delivery_receipts: "수령 합계가 회차 합과 달라요",
  open_issues_ne_unresolved_issues: "열린 문제 수가 맞지 않아요",
  held_ne_issue_and_proposal_holds: "보류 합계가 맞지 않아요",
  proposal_pointer_mismatch: "협의 기록이 맞지 않아요",
  multiple_pending_proposals: "협의 기록이 맞지 않아요",
  completed_but_open: "완료 상태가 맞지 않아요",
  finished_but_not_closed: "완료 상태가 맞지 않아요",
};

export const VIOLATION_FALLBACK = "수량 규칙을 벗어났어요";
export const VIOLATION_NOTE = "앱 밖에서 기록이 바뀌었을 수 있어요. 개발팀에 공유해 주세요.";

export function violationLabel(code: string): string {
  return VIOLATION_LABEL[code] ?? VIOLATION_FALLBACK;
}

/** Distinct Korean labels for a list of codes (two codes can share a label). */
export function violationLabels(codes: readonly string[]): string[] {
  return [...new Set(codes.map(violationLabel))];
}

/** 운영 점검 kinds (screens 10.6). */
export const ANOMALY_LABEL: Record<string, string> = {
  ledger_violation: "수량 기록 불일치",
  recheck_overdue: "기한 지난 미송 재확인",
  receipt_unconfirmed: "수령 확인 48시간 넘음",
  issue_unresolved: "3일 넘은 문제",
  pending_request_stale: "하루 넘은 확인 대기",
  proposal_stale: "이틀 넘은 협의",
  document_review_pending: "서류 확인 대기",
  connection_pending_stale: "3일 넘은 연결 요청",
  signup_stalled: "3일 멈춘 가입",
  attachment_object_missing: "파일 없음",
  storage_object_unregistered: "등록되지 않은 파일",
  auth_user_without_account: "앱 계정 없는 로그인",
  lead_unhandled: "하루 넘은 새 문의",
};

/** 중요도 of an anomaly (screens 10.6). */
export const ANOMALY_SEVERITY_LABEL: Record<string, string> = {
  critical: "긴급",
  high: "높음",
  normal: "보통",
  low: "낮음",
};

/** Missing signup fields (screens 10.7). */
export const MISSING_FIELD_LABEL: Record<string, string> = {
  bankName: "은행명", bankAccount: "계좌번호", bankHolder: "예금주", "bankAccount:format": "계좌번호 형식",
  name: "매장명",
  contact: "담당자명",
  phone: "연락처",
  businessName: "사업자명",
  businessNumber: "사업자등록번호",
  documentId: "사업자등록증",
  address: "주소",
  addressDetail: "상세주소",
  salesChannel: "판매 채널",
  pickupArea: "도매 픽업 구역",
  deliveryArea: "소매 배송 지역",
  deadline: "요청 마감시간",
  terms: "이용약관 동의",
  privacy: "개인정보 동의",
  "phone:format": "연락처 형식",
  "businessNumber:format": "사업자등록번호 형식",
  "deadline:format": "마감시간 형식",
  role: "역할 선택",
  bootstrap: "앱 첫 실행 전",
};

export function missingFieldLabel(key: string): string {
  return MISSING_FIELD_LABEL[key] ?? key;
}

/** Required signup fields per role (retailer 12 fields + 2 consents, uncle 8 + 2). */
export const REQUIRED_FIELD_TOTAL = { retailer: 14, uncle: 10 } as const;

/** 감사 로그 actions (screens 10.17). */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  "payment.confirm_receipt": "플랫폼 입금 확인", "payment.reject_receipt": "플랫폼 입금 반려",
  "payment.pay_uncle": "삼촌 지급 기록", "bank.view": "정산 계좌 열람",
  "team_chat.view": "팀·동료 대화 열람", "workflow.view": "업무 내용 열람",
  "account.view": "계정 열람",
  "conversation.view": "대화 열람",
  "attachment.view": "파일 열람",
  "lead.view_list": "문의 목록 열람",
  "admin.lookup": "운영 계정 조회",
  "export.*": "CSV 내보내기",
  "account.review_document": "서류 검토",
  "account.suspend": "이용 제한",
  "account.restore": "이용 재개",
  "note.add": "메모",
  "case.open": "케이스 열기",
  "case.update": "케이스 변경",
  "notice.create": "공지 작성",
  "notice.update": "공지 변경",
  "config.set": "설정 변경",
  "admin.grant": "권한 부여",
  "admin.revoke": "권한 해제",
  "lead.set_status": "문의 상태 변경",
};

export function auditActionLabel(action: string): string {
  if (action.startsWith("export.")) return AUDIT_ACTION_LABEL["export.*"];
  return AUDIT_ACTION_LABEL[action] ?? action;
}

/** Business-document state (spec 8). `none` is an auth user without an app account. */
export const VERIFICATION_LABEL: Record<"missing" | "not_required" | "unverified" | "verified" | "stale" | "rejected" | "none", string> = {
  missing: "미등록",
  not_required: "해당 없음",
  unverified: "제출됨 · 검증 전",
  verified: "확인함",
  stale: "정보 변경 · 다시 확인 필요",
  rejected: "재제출 필요",
  none: "앱 계정 없음",
};

export function verificationLabel(state: string | null | undefined): string {
  return VERIFICATION_LABEL[(state ?? "none") as keyof typeof VERIFICATION_LABEL] ?? VERIFICATION_LABEL.none;
}

/** 랜딩 문의 처리 상태 (screens 10.16). */
export const LEAD_STATUS_LABEL: Record<"new" | "contacted" | "qualified" | "converted" | "spam" | "closed", string> = {
  new: "새 문의",
  contacted: "연락함",
  qualified: "상담 중",
  converted: "가입 전환",
  spam: "스팸",
  closed: "종료",
};

/** 랜딩 문의 역할 (screens 10.16). */
export const LEAD_ROLE_LABEL: Record<string, string> = {
  retailer: "소매업자",
  uncle: "사입삼촌",
  other: "기타",
};

/** Operator cases. */
export const CASE_STATUS_LABEL: Record<"open" | "investigating" | "waiting" | "resolved" | "dismissed", string> = {
  open: "열림",
  investigating: "확인 중",
  waiting: "답변 대기",
  resolved: "해결",
  dismissed: "닫음",
};

export const CASE_SEVERITY_LABEL: Record<"low" | "normal" | "high" | "urgent", string> = {
  low: "낮음",
  normal: "보통",
  high: "높음",
  urgent: "긴급",
};

/** 공지 상태, 대상, 중요도 (screens 10.14). */
export const NOTICE_STATE_LABEL: Record<"draft" | "scheduled" | "live" | "ended", string> = {
  draft: "초안",
  scheduled: "예약",
  live: "게시 중",
  ended: "종료",
};

export const NOTICE_AUDIENCE_LABEL: Record<"all" | "retailer" | "uncle", string> = {
  all: "전체",
  retailer: "소매업자",
  uncle: "사입삼촌",
};

export const NOTICE_SEVERITY_LABEL: Record<"info" | "important" | "critical", string> = {
  info: "안내",
  important: "중요",
  critical: "긴급",
};

/** 알림 기록 종류 (screens 10.14). */
export const NOTICE_KIND_LABEL: Record<string, string> = {
  connection: "연결",
  request: "요청",
  delivery: "전달",
  chat: "채팅",
};

/** 거래처 연결 상태 (screens 10.8). */
export const CONNECTION_STATUS_LABEL: Record<string, string> = {
  pending: "수락 대기",
  accepted: "연결 완료",
  rejected: "거절",
  withdrawn: "철회",
};

/** 변경·취소·정정 (screens 10.9, 10.12). */
export const PROPOSAL_STATUS_LABEL: Record<string, string> = {
  pending: "상대 확인 대기",
  approved: "확정",
  accepted: "확정",
  rejected: "거절",
  withdrawn: "철회",
};

export const PROPOSAL_KIND_LABEL: Record<string, string> = {
  change: "변경",
  cancel: "취소",
  correction: "정정",
};

/** 수령 기록 종류 (receipts.kind). */
export const RECEIPT_KIND_LABEL: Record<string, string> = {
  confirmation: "수령 확인",
  correction: "정정",
};

/** 문제 상태 (screens 10.12). */
export const ISSUE_STATUS_LABEL: Record<string, string> = {
  open: "문제 확인 중",
  actionTaken: "조치 완료 · 해결 확인 대기",
  resolved: "해결 확인",
};

/** 전달 회차 상태 (screens 10.9, 10.10). */
export const DELIVERY_STATE_LABEL = {
  awaiting: "수령 대기",
  received: "수령 확인",
  mismatch: "수량 차이",
} as const;

export function deliveryState(delivery: { receiptRecorded?: boolean | null; quantity?: number | null; actual?: number | null }): string {
  if (!delivery.receiptRecorded) return DELIVERY_STATE_LABEL.awaiting;
  return (delivery.actual ?? 0) !== (delivery.quantity ?? 0) ? DELIVERY_STATE_LABEL.mismatch : DELIVERY_STATE_LABEL.received;
}

/** signupProgress.stage (screens 10.7 가입 단계). */
export const SIGNUP_STAGE_LABEL: Record<string, string> = {
  role: "역할 선택",
  profile: "정보 입력",
  completed: "가입 완료",
};

/** App account roles. */
export const ROLE_KIND_LABEL: Record<"retailer" | "uncle", string> = {
  retailer: "소매업자",
  uncle: "사입삼촌",
};

export function roleKindLabel(role: string | null | undefined): string {
  return role === "retailer" || role === "uncle" ? ROLE_KIND_LABEL[role] : "역할 선택 전";
}

/** 로그인 수단 (screens 10.7). */
export const PROVIDER_LABEL: Record<string, string> = {
  google: "Google",
  kakao: "Kakao",
  email: "이메일",
};

/** 이용 상태 (screens 10.7). */
export const MODERATION_LABEL: Record<"active" | "suspended", string> = {
  active: "이용 중",
  suspended: "이용 제한",
};

/** 첨부 용도 (screens 10.7). */
export const ATTACHMENT_USAGE_LABEL: Record<string, string> = {
  businessDocument: "사업자 서류",
  profilePhoto: "프로필 사진",
  requestPhoto: "요청 사진",
  chatPhoto: "채팅 사진",
};

/** 원격 설정 keys (screens 10.15). */
export const CONFIG_KEY_LABEL: Record<string, string> = {
  maintenance: "점검 모드",
  min_app_version: "최소 지원 버전",
  feature_flags: "기능 스위치",
  support: "고객센터 안내",
};

/** 연결 방향 (screens 10.7). */
export const CONNECTION_DIRECTION_LABEL: Record<"sent" | "received", string> = {
  sent: "보낸 요청",
  received: "받은 요청",
};

/** Event actor role (screens 10.9 처리 이력). */
export function actorRoleLabel(actorId: string | null | undefined, ids: { retailerId?: string | null; uncleId?: string | null }): string {
  if (actorId && actorId === ids.retailerId) return ROLE_KIND_LABEL.retailer;
  if (actorId && actorId === ids.uncleId) return ROLE_KIND_LABEL.uncle;
  return "-";
}
