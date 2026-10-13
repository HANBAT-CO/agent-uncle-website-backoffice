import { bytes, formatKst, qty } from "@/lib/admin/format";
import {
  ANOMALY_LABEL,
  ANOMALY_SEVERITY_LABEL,
  ISSUE_STATUS_LABEL,
  LEAD_ROLE_LABEL,
  PROPOSAL_KIND_LABEL,
  SIGNUP_STAGE_LABEL,
  VIOLATION_NOTE,
  verificationLabel,
  violationLabels,
  type Tone,
  type ToneIcon,
} from "@/lib/admin/labels";
import type { AnomalySeverity } from "@/lib/admin/rpc/enums";
import type { AnomalyItem } from "@/lib/admin/rpc/schemas";

/*
 * 운영 점검 view model (screens 10.6), shared with the dashboard's
 * 지금 확인할 일 queue (10.5). Turns backoffice_private.anomalies rows into
 * display rows: kind label, 중요도 chip, 대상, 내용 and the link to the
 * target. Client-safe and pure.
 */

export type AnomalyKind = keyof typeof ANOMALY_LABEL;

/** Kinds in the screens 10.6 order. */
export const ANOMALY_KINDS = Object.keys(ANOMALY_LABEL) as AnomalyKind[];

export type SeverityChipModel = { label: string; tone: Tone; icon: ToneIcon };

const SEVERITY_TONE: Record<AnomalySeverity, { tone: Tone; icon: ToneIcon }> = {
  critical: { tone: "attention", icon: "WarningCircle" },
  high: { tone: "attention", icon: "WarningCircle" },
  normal: { tone: "normal", icon: "Clock" },
  low: { tone: "ended", icon: "Clock" },
};

/** 중요도 긴급/높음/보통/낮음: critical and high need a human now (attention tone). */
export function severityChip(severity: AnomalySeverity): SeverityChipModel {
  return { label: ANOMALY_SEVERITY_LABEL[severity], ...SEVERITY_TONE[severity] };
}

export function anomalyLabel(kind: string): string {
  return ANOMALY_LABEL[kind] ?? kind;
}

const TARGET_TYPE_LABEL: Record<string, string> = {
  request: "요청",
  issue: "문제",
  delivery: "전달 회차",
  proposal: "변경·취소·정정",
  account: "계정",
  connection: "연결",
  attachment: "첨부",
  storage_object: "파일",
  lead: "문의",
};

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const shortId = (id: string) => id.slice(0, 8);
const seg = (id: string) => encodeURIComponent(id);

/** Where a row leads. Issues, deliveries and proposals open the request they belong to. */
export function anomalyHref(item: AnomalyItem): string | null {
  const requestId = str(item.detail.requestId);
  switch (item.targetType) {
    case "request":
      return `/admin/requests/${seg(item.targetId)}`;
    case "issue":
    case "delivery":
    case "proposal":
      return requestId ? `/admin/requests/${seg(requestId)}` : null;
    case "account":
      return `/admin/accounts/${seg(item.targetId)}`;
    case "lead":
      return `/admin/leads?view=all&lead=${seg(item.targetId)}`;
    case "connection":
      return "/admin/connections";
    case "attachment": {
      const owner = str(item.detail.ownerId);
      return owner ? `/admin/accounts/${seg(owner)}` : null;
    }
    case "storage_object": {
      // Storage paths start with the owner's account id: '{ownerId}/{attachmentId}/…'.
      const owner = item.targetId.split("/")[0];
      return owner ? `/admin/accounts/${seg(owner)}` : null;
    }
    default:
      return null;
  }
}

function accountName(names: ReadonlyMap<string, string>, id: string | null): string {
  if (!id) return "-";
  return names.get(id) ?? shortId(id);
}

/** 대상: the target type plus its best human name (product, account name) or a short id. */
function targetLabel(item: AnomalyItem, names: ReadonlyMap<string, string>): string {
  const type = TARGET_TYPE_LABEL[item.targetType];
  const detail = item.detail;
  let name: string;
  switch (item.targetType) {
    case "request":
      name = str(detail.product) ?? shortId(item.targetId);
      break;
    case "issue":
    case "delivery":
    case "proposal": {
      const requestId = str(detail.requestId);
      name = requestId ? `요청 ${shortId(requestId)}` : shortId(item.targetId);
      break;
    }
    case "account":
      name = accountName(names, item.targetId);
      break;
    case "connection":
      name = `${accountName(names, str(detail.from))} → ${accountName(names, str(detail.to))}`;
      break;
    case "attachment":
      name = str(detail.ownerId) ? accountName(names, str(detail.ownerId)) : shortId(item.targetId);
      break;
    case "storage_object":
      name = accountName(names, item.targetId.split("/")[0] || null);
      break;
    default:
      name = shortId(item.targetId);
  }
  return type ? `${type} · ${name}` : name;
}

/** 내용: what is wrong, in the app's nouns. */
function summaryOf(item: AnomalyItem, now: Date): string {
  const detail = item.detail;
  switch (item.kind) {
    case "ledger_violation":
      return violationLabels(Array.isArray(detail.violations) ? detail.violations.filter((code): code is string => typeof code === "string") : []).join(" · ");
    case "recheck_overdue": {
      const day = str(detail.recheck);
      return day ? `재확인일 ${formatKst(day, { now })} 지남` : "재확인일 지남";
    }
    case "receipt_unconfirmed": {
      const quantity = num(detail.quantity);
      return quantity === null ? "수령 대기" : `이번 전달 ${qty(quantity, "장")} · 수령 대기`;
    }
    case "issue_unresolved": {
      const status = ISSUE_STATUS_LABEL[str(detail.status) ?? ""] ?? "문제 확인 중";
      return `${status} · 보류 ${qty(num(detail.held) ?? 0, "개")}`;
    }
    case "pending_request_stale":
      return "확인 대기";
    case "proposal_stale": {
      const kind = PROPOSAL_KIND_LABEL[str(detail.kind) ?? ""];
      return kind ? `${kind} · 상대 확인 대기` : "상대 확인 대기";
    }
    case "document_review_pending":
      return verificationLabel(str(detail.state) ?? "unverified");
    case "connection_pending_stale":
      return "수락 대기";
    case "signup_stalled": {
      const stage = SIGNUP_STAGE_LABEL[str(detail.stage) ?? ""];
      return stage ? `${stage} 단계` : "가입 시작 전";
    }
    case "attachment_object_missing":
      return "저장소에 파일이 없어요";
    case "storage_object_unregistered": {
      const size = num(detail.size) ?? (str(detail.size) ? Number(detail.size) : null);
      return size !== null && Number.isFinite(size) ? `${bytes(size)} · 첨부 기록 없음` : "첨부 기록 없음";
    }
    case "auth_user_without_account":
      return "앱 계정을 만들기 전이에요";
    case "lead_unhandled": {
      const role = LEAD_ROLE_LABEL[str(detail.role) ?? ""] ?? "역할 미상";
      const source = str(detail.source);
      return source ? `${role} · ${source}` : role;
    }
    default:
      return "-";
  }
}

export type AnomalyRowModel = {
  id: string;
  kind: string;
  kindLabel: string;
  severity: SeverityChipModel;
  target: string;
  summary: string;
  /** Korean violation labels (ledger_violation only). */
  violations: string[];
  /** The fixed ledger note (ledger_violation only). */
  note: string | null;
  since: string | null;
  href: string | null;
};

/** One display row. `names` maps account ids to (role-masked) names when known. */
export function anomalyRow(item: AnomalyItem, names: ReadonlyMap<string, string>, now: Date = new Date()): AnomalyRowModel {
  const ledger = item.kind === "ledger_violation";
  const codes = ledger && Array.isArray(item.detail.violations) ? item.detail.violations.filter((code): code is string => typeof code === "string") : [];
  return {
    id: `${item.kind}:${item.targetType}:${item.targetId}`,
    kind: item.kind,
    kindLabel: anomalyLabel(item.kind),
    severity: severityChip(item.severity),
    target: targetLabel(item, names),
    summary: summaryOf(item, now),
    violations: ledger ? violationLabels(codes) : [],
    note: ledger ? VIOLATION_NOTE : null,
    since: item.since,
    href: anomalyHref(item),
  };
}

export type KindFilter = { kind: AnomalyKind; label: string; count: number };

/** Kind chips with counts, in the screens 10.6 order; the selected kind stays even at 0. */
export function kindFilters(counts: Record<string, number>, selected?: AnomalyKind | null): KindFilter[] {
  return ANOMALY_KINDS.filter((kind) => (counts[kind] ?? 0) > 0 || kind === selected).map((kind) => ({
    kind,
    label: ANOMALY_LABEL[kind],
    count: counts[kind] ?? 0,
  }));
}

/** `?kind=`: a known kind or null (all kinds). */
export function parseKind(value: string | string[] | undefined | null): AnomalyKind | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && (ANOMALY_KINDS as string[]).includes(raw) ? (raw as AnomalyKind) : null;
}
