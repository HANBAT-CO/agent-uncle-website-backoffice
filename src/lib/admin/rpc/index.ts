import "server-only";

import type { AdminRole } from "../roles";
import { callRpc, type RpcResult } from "./core";
import type {
  AccountRoleFilter,
  AccountSort,
  AccountState,
  CaseSeverity,
  CaseStatus,
  CaseTarget,
  ExportKind,
  LeadStatus,
  NoteTarget,
  NoticeAudience,
  NoticeSeverity,
  RecordCollection,
  RecordFilter,
  RequestAttention,
  RequestSort,
  ReviewDecision,
} from "./enums";
import type { RequestLabel } from "../labels";
import {
  RPC_RESULT_SCHEMAS as S,
  recordListSchemas,
  type AccountDossier,
  type AccountList,
  type AdminRow,
  type Anomalies,
  type AttachmentAccess,
  type AuditList,
  type ChainResult,
  type ConfigRow,
  type Conversation,
  type ConversationList,
  type ExportResult,
  type LeadList,
  type LookupUser,
  type NoticeRow,
  type OperationList,
  type Overview,
  type RecordList,
  type RequestDossier,
  type RequestList,
  type SearchResult,
} from "./schemas";

/*
 * Typed wrappers, one per backoffice RPC (spec 8). camelCase arguments map to
 * the p_snake parameters of the SQL functions; undefined optionals are left
 * out so the SQL defaults apply. Server-only: call from Server Components,
 * Server Actions and Route Handlers after verifyAdmin().
 */

export * from "./core";
export * from "./enums";
export * from "./schemas";

/** Drops undefined values so PostgREST uses the SQL defaults. */
function args(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

export type NoticeInput = {
  noticeId?: string | null;
  version?: number | null;
  title: string;
  body: string;
  audience: NoticeAudience;
  severity: NoticeSeverity;
  linkUrl?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  active: boolean;
  dismissible: boolean;
};

type Page = { limit: number; offset: number };

export const rpc = {
  overview(a: { includeDemo: boolean; days: 1 | 7 | 30 }): Promise<RpcResult<Overview>> {
    return callRpc("backoffice_overview", args({ p_include_demo: a.includeDemo, p_days: a.days }), S.backoffice_overview);
  },

  anomalies(a: { includeDemo: boolean }): Promise<RpcResult<Anomalies>> {
    return callRpc("backoffice_ledger_anomalies", args({ p_include_demo: a.includeDemo }), S.backoffice_ledger_anomalies);
  },

  listAccounts(
    a: { search?: string; role?: AccountRoleFilter; state?: AccountState; includeDemo: boolean; sort?: AccountSort } & Page,
  ): Promise<RpcResult<AccountList>> {
    return callRpc(
      "backoffice_list_accounts",
      args({
        p_search: a.search,
        p_role: a.role,
        p_state: a.state,
        p_include_demo: a.includeDemo,
        p_sort: a.sort,
        p_limit: a.limit,
        p_offset: a.offset,
      }),
      S.backoffice_list_accounts,
    );
  },

  getAccount(id: string): Promise<RpcResult<AccountDossier>> {
    return callRpc("backoffice_get_account", { p_account_id: id }, S.backoffice_get_account);
  },

  listRequests(
    a: {
      labels?: readonly RequestLabel[] | null;
      attention?: RequestAttention;
      accountId?: string;
      search?: string;
      from?: string;
      to?: string;
      includeDemo: boolean;
      sort?: RequestSort;
    } & Page,
  ): Promise<RpcResult<RequestList>> {
    return callRpc(
      "backoffice_list_requests",
      args({
        p_labels: a.labels ? [...a.labels] : undefined,
        p_attention: a.attention,
        p_account_id: a.accountId,
        p_search: a.search,
        p_from: a.from,
        p_to: a.to,
        p_include_demo: a.includeDemo,
        p_sort: a.sort,
        p_limit: a.limit,
        p_offset: a.offset,
      }),
      S.backoffice_list_requests,
    );
  },

  getRequest(id: string): Promise<RpcResult<RequestDossier>> {
    return callRpc("backoffice_get_request", { p_request_id: id }, S.backoffice_get_request);
  },

  listRecords<C extends RecordCollection>(
    a: { collection: C; filter?: RecordFilter; status?: string; requestId?: string; accountId?: string; includeDemo: boolean } & Page,
  ): Promise<RpcResult<RecordList<C>>> {
    return callRpc(
      "backoffice_list_records",
      args({
        p_collection: a.collection,
        p_filter: a.filter,
        p_status: a.status,
        p_request_id: a.requestId,
        p_account_id: a.accountId,
        p_include_demo: a.includeDemo,
        p_limit: a.limit,
        p_offset: a.offset,
      }),
      recordListSchemas[a.collection] as unknown as import("zod").ZodType<RecordList<C>>,
    );
  },

  listConversations(a: { accountId?: string; includeDemo: boolean } & Page): Promise<RpcResult<ConversationList>> {
    return callRpc(
      "backoffice_list_conversations",
      args({ p_account_id: a.accountId, p_include_demo: a.includeDemo, p_limit: a.limit, p_offset: a.offset }),
      S.backoffice_list_conversations,
    );
  },

  /** Operator+, audited (conversation.view) with the reason; phone numbers are masked in SQL. */
  getConversation(a: { a: string; b: string; reason: string; before?: string; limit?: number }): Promise<RpcResult<Conversation>> {
    return callRpc(
      "backoffice_get_conversation",
      args({ p_account_a: a.a, p_account_b: a.b, p_reason: a.reason, p_before: a.before, p_limit: a.limit }),
      S.backoffice_get_conversation,
    );
  },

  /** Operator+, audited (attachment.view). Returns the storage path for a 60 s signed URL. */
  attachmentAccess(id: string, reason: string): Promise<RpcResult<AttachmentAccess>> {
    return callRpc("backoffice_attachment_access", { p_attachment_id: id, p_reason: reason }, S.backoffice_attachment_access);
  },

  search(q: string, limit?: number): Promise<RpcResult<SearchResult>> {
    return callRpc("backoffice_search", args({ p_query: q, p_limit: limit }), S.backoffice_search);
  },

  listLeads(a: { status?: LeadStatus; search?: string; includeSuspect: boolean } & Page): Promise<RpcResult<LeadList>> {
    return callRpc(
      "backoffice_list_leads",
      args({ p_status: a.status, p_search: a.search, p_include_suspect: a.includeSuspect, p_limit: a.limit, p_offset: a.offset }),
      S.backoffice_list_leads,
    );
  },

  listConfig(): Promise<RpcResult<ConfigRow[]>> {
    return callRpc("backoffice_list_config", {}, S.backoffice_list_config);
  },

  listNotices(includeInactive?: boolean): Promise<RpcResult<NoticeRow[]>> {
    return callRpc("backoffice_list_notices", args({ p_include_inactive: includeInactive }), S.backoffice_list_notices);
  },

  listAudit(
    a: { action?: string; actorId?: string; targetType?: string; targetId?: string; from?: string; to?: string } & Page,
  ): Promise<RpcResult<AuditList>> {
    return callRpc(
      "backoffice_list_audit",
      args({
        p_action: a.action,
        p_actor_id: a.actorId,
        p_target_type: a.targetType,
        p_target_id: a.targetId,
        p_from: a.from,
        p_to: a.to,
        p_limit: a.limit,
        p_offset: a.offset,
      }),
      S.backoffice_list_audit,
    );
  },

  listOperations(a: { accountId?: string; command?: string } & Page): Promise<RpcResult<OperationList>> {
    return callRpc(
      "backoffice_list_operations",
      args({ p_account_id: a.accountId, p_command: a.command, p_limit: a.limit, p_offset: a.offset }),
      S.backoffice_list_operations,
    );
  },

  listAdmins(): Promise<RpcResult<AdminRow[]>> {
    return callRpc("backoffice_list_admins", {}, S.backoffice_list_admins);
  },

  /** Owner, audited (admin.lookup). */
  lookupUser(email: string): Promise<RpcResult<LookupUser>> {
    return callRpc("backoffice_lookup_user", { p_email: email }, S.backoffice_lookup_user);
  },

  /** Operator+ (owner for accounts and leads), reason required, audited. At most 5,000 rows. */
  exportRows(a: { kind: ExportKind; reason: string; from?: string; to?: string; includeDemo: boolean }): Promise<RpcResult<ExportResult>> {
    return callRpc(
      "backoffice_export",
      args({ p_kind: a.kind, p_reason: a.reason, p_from: a.from, p_to: a.to, p_include_demo: a.includeDemo }),
      S.backoffice_export,
    );
  },

  verifyAuditChain(): Promise<RpcResult<ChainResult>> {
    return callRpc("backoffice_verify_audit_chain", {}, S.backoffice_verify_audit_chain);
  },

  reviewDocument(a: {
    accountId: string;
    documentId: string;
    decision: ReviewDecision;
    userMessage: string;
    internalNote: string;
    checks: Record<string, boolean>;
    operationId: string;
  }): Promise<RpcResult<{ accountId: string; verificationStatus: string; reviewId: number }>> {
    return callRpc(
      "backoffice_review_document",
      {
        p_account_id: a.accountId,
        p_document_id: a.documentId,
        p_decision: a.decision,
        p_user_message: a.userMessage,
        p_internal_note: a.internalNote,
        p_checks: a.checks,
        p_operation_id: a.operationId,
      },
      S.backoffice_review_document,
    );
  },

  setAccountStatus(a: {
    accountId: string;
    status: "active" | "suspended";
    reason: string;
    userMessage: string;
    banLogin: boolean;
    operationId: string;
  }): Promise<RpcResult<{ accountId: string; status: "active" | "suspended"; loginBanned: boolean }>> {
    return callRpc(
      "backoffice_set_account_status",
      {
        p_account_id: a.accountId,
        p_status: a.status,
        p_reason: a.reason,
        p_user_message: a.userMessage,
        p_ban_login: a.banLogin,
        p_operation_id: a.operationId,
      },
      S.backoffice_set_account_status,
    );
  },

  addNote(a: { targetType: NoteTarget; targetId: string; body: string; operationId: string }): Promise<RpcResult<{ noteId: number }>> {
    return callRpc(
      "backoffice_add_note",
      { p_target_type: a.targetType, p_target_id: a.targetId, p_body: a.body, p_operation_id: a.operationId },
      S.backoffice_add_note,
    );
  },

  openCase(a: {
    targetType: CaseTarget;
    targetId: string;
    title: string;
    severity: CaseSeverity;
    assigneeId?: string;
    note?: string;
    operationId: string;
  }): Promise<RpcResult<{ caseId: string }>> {
    return callRpc(
      "backoffice_open_case",
      args({
        p_target_type: a.targetType,
        p_target_id: a.targetId,
        p_title: a.title,
        p_severity: a.severity,
        p_assignee_id: a.assigneeId,
        p_note: a.note,
        p_operation_id: a.operationId,
      }),
      S.backoffice_open_case,
    );
  },

  updateCase(a: {
    caseId: string;
    version: number;
    status?: CaseStatus;
    severity?: CaseSeverity;
    assigneeId?: string;
    clearAssignee?: boolean;
    note?: string;
    operationId: string;
  }): Promise<RpcResult<{ caseId: string; version: number; status: CaseStatus }>> {
    return callRpc(
      "backoffice_update_case",
      args({
        p_case_id: a.caseId,
        p_version: a.version,
        p_status: a.status,
        p_severity: a.severity,
        p_assignee_id: a.assigneeId,
        p_clear_assignee: a.clearAssignee,
        p_note: a.note,
        p_operation_id: a.operationId,
      }),
      S.backoffice_update_case,
    );
  },

  /** Create (no noticeId) or update; deactivate with active=false. Critical needs the owner. */
  saveNotice(a: NoticeInput & { operationId: string }): Promise<RpcResult<{ noticeId: string; version: number; active: boolean }>> {
    return callRpc(
      "backoffice_save_notice",
      args({
        p_notice_id: a.noticeId,
        p_version: a.version,
        p_title: a.title,
        p_body: a.body,
        p_audience: a.audience,
        p_severity: a.severity,
        p_link_url: a.linkUrl,
        p_starts_at: a.startsAt,
        p_ends_at: a.endsAt,
        p_active: a.active,
        p_dismissible: a.dismissible,
        p_operation_id: a.operationId,
      }),
      S.backoffice_save_notice,
    );
  },

  setConfig(a: {
    key: string;
    value: unknown;
    reason: string;
    version?: number;
    isPublic?: boolean;
    description?: string;
    operationId: string;
  }): Promise<RpcResult<{ key: string; version: number }>> {
    return callRpc(
      "backoffice_set_config",
      args({
        p_key: a.key,
        p_value: a.value,
        p_reason: a.reason,
        p_version: a.version,
        p_is_public: a.isPublic,
        p_description: a.description,
        p_operation_id: a.operationId,
      }),
      S.backoffice_set_config,
    );
  },

  grantAdmin(a: {
    userId: string;
    role: AdminRole;
    displayName: string;
    requireMfa: boolean;
    allowAppAccount?: boolean;
    operationId: string;
  }): Promise<RpcResult<{ userId: string; role: AdminRole }>> {
    return callRpc(
      "backoffice_grant_admin",
      args({
        p_user_id: a.userId,
        p_role: a.role,
        p_display_name: a.displayName,
        p_require_mfa: a.requireMfa,
        p_allow_app_account: a.allowAppAccount,
        p_operation_id: a.operationId,
      }),
      S.backoffice_grant_admin,
    );
  },

  revokeAdmin(a: { userId: string; reason: string; operationId: string }): Promise<RpcResult<{ userId: string; revoked: true }>> {
    return callRpc(
      "backoffice_revoke_admin",
      { p_user_id: a.userId, p_reason: a.reason, p_operation_id: a.operationId },
      S.backoffice_revoke_admin,
    );
  },

  setLeadStatus(a: {
    leadId: string;
    status: LeadStatus;
    assigneeId?: string;
    note?: string;
    operationId: string;
  }): Promise<RpcResult<{ leadId: string; status: LeadStatus }>> {
    return callRpc(
      "backoffice_set_lead_status",
      args({ p_lead_id: a.leadId, p_status: a.status, p_assignee_id: a.assigneeId, p_note: a.note, p_operation_id: a.operationId }),
      S.backoffice_set_lead_status,
    );
  },
};
