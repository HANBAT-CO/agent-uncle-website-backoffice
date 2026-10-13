import { configDiff } from "@/components/admin/remote-config/config-forms";
import { formatKst } from "@/lib/admin/format";
import { isAdminRole, ROLE_LABEL } from "@/lib/admin/roles";

/*
 * 감사 로그 helpers (screens appendix 10.17). Client-safe and pure: the
 * Server Component uses the group mapping and the merge, the tables use the
 * labels and summaries.
 */

export type AuditGroup = { key: string; label: string; actions: string[] };

/**
 * The 작업 filter. backoffice_list_audit takes one p_action, matched exactly
 * or as the prefix before the first dot, so each group is a list of such
 * values: a prefix where it covers the group exactly, else exact actions.
 */
export const AUDIT_GROUPS: AuditGroup[] = [
  { key: "view", label: "열람", actions: ["account.view", "conversation.view", "attachment.view", "lead.view_list", "admin.lookup"] },
  { key: "export", label: "내보내기", actions: ["export"] },
  { key: "config", label: "설정 변경", actions: ["config"] },
  { key: "note_case", label: "메모·케이스", actions: ["note", "case"] },
  { key: "account", label: "계정 조치", actions: ["account.review_document", "account.suspend", "account.restore"] },
  { key: "admin", label: "권한 변경", actions: ["admin.grant", "admin.revoke"] },
];

export function auditActionsFor(group: string | null | undefined): string[] | null {
  return AUDIT_GROUPS.find((item) => item.key === group)?.actions ?? null;
}

/**
 * One page of the union of several per-action lists (each sorted newest
 * first, each holding at least its first offset+size rows).
 */
export function mergeAuditPages<T extends { id: number }>(pages: { total: number; rows: T[] }[], offset: number, size: number): { total: number; rows: T[] } {
  const seen = new Set<number>();
  const rows = pages
    .flatMap((page) => page.rows)
    .filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)))
    .sort((a, b) => b.id - a.id);
  return { total: pages.reduce((sum, page) => sum + page.total, 0), rows: rows.slice(offset, offset + size) };
}

export const TARGET_TYPE_LABEL: Record<string, string> = {
  account: "계정",
  request: "사입 요청",
  delivery: "전달 회차",
  issue: "문제",
  proposal: "변경·취소·정정",
  connection: "거래처 연결",
  lead: "랜딩 문의",
  case: "케이스",
  attachment: "파일",
  export: "내보내기",
  config: "원격 설정",
  admin: "운영 계정",
  notice: "공지",
};

/** Target types offered by the 대상 종류 filter, in this order. */
export const TARGET_TYPES = Object.keys(TARGET_TYPE_LABEL);

export function targetTypeLabel(type: string): string {
  return TARGET_TYPE_LABEL[type] ?? type;
}

/** 'Chrome', 'Safari', 'Edge', 'Firefox', '서버' (a server-side client such as node), or the first token. */
export function browserLabel(userAgent: string | null | undefined): string {
  const ua = userAgent?.trim() ?? "";
  if (!ua) return "";
  if (/\bEdg(e|A|iOS)?\//.test(ua)) return "Edge";
  if (/\bFirefox\//.test(ua)) return "Firefox";
  if (/(Chrome|CriOS)\//.test(ua)) return "Chrome";
  if (/\bVersion\/[\d.]+.*Safari\//.test(ua)) return "Safari";
  if (/^(node|undici|supabase-js|curl|python)/i.test(ua)) return "서버";
  return ua.split(/[\s/]/)[0].slice(0, 20);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** A UUID as its first 8 characters ('66e41cba…'); other ids unchanged. Show the full id in a title. */
export function shortId(id: string): string {
  return UUID.test(id) ? `${id.slice(0, 8)}…` : id;
}

/** Known fields, in the order they are listed. */
const FIELD_LABEL: Record<string, string> = {
  rows: "행 수",
  count: "건수",
  includeDemo: "데모 포함",
  from: "시작",
  to: "종료",
  role: "역할",
  requireMfa: "2단계 인증 필수",
  revokedAt: "해제 시각",
  revoked: "해제",
  status: "상태",
  verificationStatus: "서류 확인",
  loginBanned: "로그인 차단",
  version: "버전",
  active: "게시",
  isPublic: "앱에 전달",
  assigneeId: "담당",
  severity: "중요도",
  title: "제목",
  decision: "결과",
  noteId: "메모 번호",
  caseId: "케이스 번호",
  mime: "파일 형식",
  ownerId: "소유 계정",
  peerId: "상대 계정",
};
const FIELD_ORDER = Object.keys(FIELD_LABEL);
const fieldRank = (field: string) => {
  const index = FIELD_ORDER.indexOf(field);
  return index === -1 ? FIELD_ORDER.length : index;
};

function display(field: string, value: unknown): string {
  if (field === "role" && isAdminRole(value)) return ROLE_LABEL[value];
  if (typeof value === "boolean") return value ? "예" : "아니요";
  if (typeof value === "string") {
    if (UUID.test(value)) return shortId(value);
    if (ISO_TIME.test(value) && !Number.isNaN(Date.parse(value))) return formatKst(value);
    return value.length > 40 ? `${value.slice(0, 40)}…` : value;
  }
  if (typeof value === "number") return value.toLocaleString("ko-KR");
  return JSON.stringify(value);
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

/**
 * 변경 전 → 후 as short Korean lines. config.set uses the config diff;
 * others list changed fields ("역할: 열람자 → 운영자"), or the recorded
 * values when there is no before ("행 수 61"). Empty values are skipped.
 */
export function changeSummary(
  action: string,
  targetId: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  limit = 4,
): string[] {
  if (action === "config.set" && after) {
    const lines: string[] = [];
    if (before && before.version !== after.version) lines.push(`버전 v${display("version", before.version)} → v${display("version", after.version)}`);
    if (before && before.isPublic !== after.isPublic) lines.push(`앱에 전달: ${display("isPublic", before.isPublic)} → ${display("isPublic", after.isPublic)}`);
    for (const entry of configDiff(targetId, before?.value ?? null, after.value)) lines.push(`${entry.label}: ${entry.before} → ${entry.after}`);
    return lines.slice(0, limit);
  }
  if (!after && !before) return [];
  if (!before) {
    return Object.entries(after ?? {})
      .filter(([, value]) => !isEmpty(value) && typeof value !== "object")
      .sort((a, b) => fieldRank(a[0]) - fieldRank(b[0]))
      .map(([field, value]) => `${FIELD_LABEL[field] ?? field} ${display(field, value)}`)
      .slice(0, limit);
  }
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after ?? {})])].sort((a, b) => fieldRank(a) - fieldRank(b));
  return fields
    .filter((field) => after && field in after && JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null))
    .map((field) => {
      const from = isEmpty(before[field]) ? "없음" : display(field, before[field]);
      const to = isEmpty(after?.[field]) ? "없음" : display(field, after?.[field]);
      return `${FIELD_LABEL[field] ?? field}: ${from} → ${to}`;
    })
    .slice(0, limit);
}

export type ChainOutcome =
  | { ok: true; checked: number; headHash: string | null; verifiedAt: string }
  | { ok: false; brokenAtId: number; checked: number };

/** The 무결성 확인 result in the exact screens-appendix copy. */
export function chainMessage(result: ChainOutcome): string {
  if (result.ok) {
    const head = (result.headHash ?? "").slice(0, 12);
    return `감사 기록 ${result.checked.toLocaleString("ko-KR")}건이 모두 이어져 있어요. 마지막 해시 ${head}…`;
  }
  return `${result.brokenAtId}번 기록부터 체인이 맞지 않아요. 개발팀에 바로 알려 주세요.`;
}
