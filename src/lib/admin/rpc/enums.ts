/*
 * Argument vocabularies of the backoffice RPCs (migration
 * 20261013090000_backoffice_admin_layer.sql). Client-safe constants: filters,
 * URL parsers and forms validate against the same lists the SQL accepts.
 */

export const ACCOUNT_STATES = [
  "no_account",
  "staff",
  "role_pending",
  "signup",
  "complete",
  "document_missing",
  "awaiting_review",
  "verified",
  "rejected",
  "suspended",
  "login_banned",
  "working",
  "joined_today",
] as const;
export type AccountState = (typeof ACCOUNT_STATES)[number];

export const ACCOUNT_SORTS = ["created_desc", "created_asc", "last_sign_in_desc", "name_asc"] as const;
export type AccountSort = (typeof ACCOUNT_SORTS)[number];

export const ACCOUNT_ROLE_FILTERS = ["retailer", "uncle", "none"] as const;
export type AccountRoleFilter = (typeof ACCOUNT_ROLE_FILTERS)[number];

export const REQUEST_ATTENTIONS = [
  "needs_reply",
  "open_issue",
  "proposal",
  "receipt_pending",
  "backorder",
  "recheck_due",
  "recheck_today",
  "recheck_overdue",
  "pending_stale",
  "violation",
  "has_photos",
] as const;
export type RequestAttention = (typeof REQUEST_ATTENTIONS)[number];

export const REQUEST_SORTS = ["updated_desc", "created_desc", "created_asc", "recheck_asc"] as const;
export type RequestSort = (typeof REQUEST_SORTS)[number];

export const RECORD_COLLECTIONS = [
  "connections",
  "deliveries",
  "receipts",
  "proposals",
  "issues",
  "events",
  "notices",
  "attachments",
  "signupProgress",
] as const;
export type RecordCollection = (typeof RECORD_COLLECTIONS)[number];

export const RECORD_FILTERS = [
  "awaiting_receipt",
  "awaiting_receipt_48h",
  "mismatch",
  "corrected",
  "pending",
  "pending_3d",
  "today",
  "unresolved",
  "unread",
  "incomplete",
] as const;
export type RecordFilter = (typeof RECORD_FILTERS)[number];

export const LEAD_STATUSES = ["new", "contacted", "qualified", "converted", "spam", "closed"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const NOTE_TARGETS = ["account", "request", "delivery", "issue", "proposal", "connection", "lead", "case"] as const;
export type NoteTarget = (typeof NOTE_TARGETS)[number];

export const CASE_TARGETS = ["account", "request", "delivery", "issue", "proposal", "connection", "lead"] as const;
export type CaseTarget = (typeof CASE_TARGETS)[number];

export const CASE_SEVERITIES = ["low", "normal", "high", "urgent"] as const;
export type CaseSeverity = (typeof CASE_SEVERITIES)[number];

export const CASE_STATUSES = ["open", "investigating", "waiting", "resolved", "dismissed"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const OPEN_CASE_STATUSES = ["open", "investigating", "waiting"] as const satisfies readonly CaseStatus[];

export const EXPORT_KINDS = ["requests", "deliveries", "receipts", "issues", "proposals", "accounts", "leads"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

/** PII exports need the owner; business ledgers need an operator (spec 6). */
export const EXPORT_MIN_ROLE: Record<ExportKind, "operator" | "owner"> = {
  requests: "operator",
  deliveries: "operator",
  receipts: "operator",
  issues: "operator",
  proposals: "operator",
  accounts: "owner",
  leads: "owner",
};

export const NOTICE_AUDIENCES = ["all", "retailer", "uncle"] as const;
export type NoticeAudience = (typeof NOTICE_AUDIENCES)[number];

export const NOTICE_SEVERITIES = ["info", "important", "critical"] as const;
export type NoticeSeverity = (typeof NOTICE_SEVERITIES)[number];

export const NOTICE_STATES = ["draft", "scheduled", "live", "ended"] as const;
export type NoticeState = (typeof NOTICE_STATES)[number];

export const REVIEW_DECISIONS = ["verified", "rejected", "reset"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export const VERIFICATION_STATES = ["missing", "not_required", "unverified", "verified", "stale", "rejected", "none"] as const;
export type VerificationState = (typeof VERIFICATION_STATES)[number];

export const ANOMALY_SEVERITIES = ["critical", "high", "normal", "low"] as const;
export type AnomalySeverity = (typeof ANOMALY_SEVERITIES)[number];
