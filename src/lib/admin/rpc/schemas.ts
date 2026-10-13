import { z } from "zod";

import { whoamiSchema } from "../auth/whoami";
import {
  ANOMALY_SEVERITIES,
  CASE_SEVERITIES,
  CASE_STATUSES,
  LEAD_STATUSES,
  NOTICE_AUDIENCES,
  NOTICE_SEVERITIES,
  NOTICE_STATES,
  REVIEW_DECISIONS,
  type RecordCollection,
} from "./enums";

/*
 * zod contracts of every backoffice RPC result (migration
 * 20261013090000_backoffice_admin_layer.sql, spec 8). Shapes come from the
 * fixtures captured on the local stack (scripts/admin/capture-rpc-fixtures.mjs)
 * and are tested against them in schemas.test.ts.
 *
 * - Objects strip unknown keys (zod 4 default, no passthrough): a new column
 *   in the database never leaks into the UI by accident.
 * - App record fields (saip_records.data) are optional: the app owns that JSON
 *   and one old or partial row must never break an admin list.
 * - Rows the SQL builds with to_jsonb(table) arrive in snake_case; they are
 *   transformed to camelCase here, so the UI only ever sees camelCase.
 *
 * Client-safe (no server-only import): components import the inferred types.
 */

const str = z.string();
const num = z.number();
const bool = z.boolean();
/** Text from app JSON: may be missing or null. */
const text = z.string().nullish();
const count = z.number().nullish();
const jsonObject = z.record(z.string(), z.unknown());

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

/** backoffice_private.account_brief */
export const accountBriefSchema = z.object({
  id: str,
  name: z.string().nullable(),
  role: z.string().nullable(),
  complete: bool,
  demo: bool,
});
export type AccountBrief = z.infer<typeof accountBriefSchema>;

/** backoffice_private.ledger: the request counters in 장 (always numbers). */
export const ledgerSchema = z.object({
  quantity: num,
  acquired: num,
  delivered: num,
  received: num,
  cancelled: num,
  acquiredCancelled: num,
  held: num,
  openIssues: num,
  remaining: num,
  available: num,
  backorder: num,
});
export type Ledger = z.infer<typeof ledgerSchema>;

function listOf<T extends z.ZodType>(row: T) {
  return z.object({ total: num, limit: num, offset: num, rows: z.array(row) });
}

/** Request fields of saip_records.data (requests), all optional. Also used for event snapshots. */
const requestDataShape = {
  status: text,
  retailerId: text,
  uncleId: text,
  product: text,
  option: text,
  wholesaler: text,
  location: text,
  address: text,
  addressDetail: text,
  note: text,
  photos: z.array(z.string()).nullish(),
  quantity: count,
  acquired: count,
  delivered: count,
  received: count,
  cancelled: count,
  acquiredCancelled: count,
  held: count,
  openIssues: count,
  needsReply: z.boolean().nullish(),
  resultShared: z.boolean().nullish(),
  recheck: text,
  proposalId: text,
  version: count,
  createdAt: text,
  updatedAt: text,
};
export const requestSnapshotSchema = z.object(requestDataShape);
export type RequestSnapshot = z.infer<typeof requestSnapshotSchema>;

/**
 * An event's before/after. Delivery-scoped events (deliveryId set) carry the
 * delivery record instead of the request, so its receipt fields are kept too.
 */
export const eventSnapshotSchema = requestSnapshotSchema.extend({
  actual: count,
  receiptRecorded: z.boolean().nullish(),
  correctedAt: text,
});
export type EventSnapshot = z.infer<typeof eventSnapshotSchema>;

/** backoffice_notes row (to_jsonb), as camelCase. */
export const noteSchema = z
  .object({ id: num, target_type: str, target_id: str, body: str, author_id: str, created_at: str })
  .transform((n) => ({ id: n.id, targetType: n.target_type, targetId: n.target_id, body: n.body, authorId: n.author_id, createdAt: n.created_at }));
export type Note = z.infer<typeof noteSchema>;

/** backoffice_cases row (to_jsonb), as camelCase. */
export const caseSchema = z
  .object({
    id: str,
    target_type: str,
    target_id: str,
    title: str,
    severity: z.enum(CASE_SEVERITIES),
    status: z.enum(CASE_STATUSES),
    assignee_id: z.string().nullable(),
    created_by: str,
    created_at: str,
    updated_at: str,
    resolved_at: z.string().nullable(),
    version: num,
  })
  .transform((c) => ({
    id: c.id,
    targetType: c.target_type,
    targetId: c.target_id,
    title: c.title,
    severity: c.severity,
    status: c.status,
    assigneeId: c.assignee_id,
    createdBy: c.created_by,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    resolvedAt: c.resolved_at,
    version: c.version,
  }));
export type Case = z.infer<typeof caseSchema>;

/** backoffice_account_reviews row (internal_note only for operator+), as camelCase. */
export const reviewSchema = z
  .object({
    id: num,
    account_id: str,
    document_id: str,
    decision: z.enum(REVIEW_DECISIONS),
    user_message: str,
    internal_note: z.string().optional(),
    checks: jsonObject,
    reviewed_by: str,
    reviewed_at: str,
  })
  .transform((r) => ({
    id: r.id,
    accountId: r.account_id,
    documentId: r.document_id,
    decision: r.decision,
    userMessage: r.user_message,
    internalNote: r.internal_note ?? null,
    checks: r.checks,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
  }));
export type Review = z.infer<typeof reviewSchema>;

/** backoffice_account_moderation row without account_id, as camelCase. */
export const moderationSchema = z
  .object({
    status: z.enum(["active", "suspended"]),
    reason: str,
    user_message: str,
    login_banned: bool,
    updated_by: str,
    updated_at: str,
  })
  .transform((m) => ({
    status: m.status,
    reason: m.reason,
    userMessage: m.user_message,
    loginBanned: m.login_banned,
    updatedBy: m.updated_by,
    updatedAt: m.updated_at,
  }));
export type Moderation = z.infer<typeof moderationSchema>;

// ---------------------------------------------------------------------------
// Read RPCs
// ---------------------------------------------------------------------------

export const anomalyItemSchema = z.object({
  kind: str,
  severity: z.enum(ANOMALY_SEVERITIES),
  targetType: str,
  targetId: str,
  detail: jsonObject,
  since: z.string().nullable(),
});
export type AnomalyItem = z.infer<typeof anomalyItemSchema>;

export const overviewSchema = z.object({
  generatedAt: str,
  includeDemo: bool,
  days: num,
  since: str,
  kpi: z.object({
    newRequests: num,
    attention: num,
    overdueRechecks: num,
    deliveriesAwaitingReceipt: num,
    incompleteSignups: num,
    newLeads: num,
  }),
  authUsers: num,
  accounts: z.object({
    total: num,
    retailer: num,
    uncle: num,
    noRole: num,
    complete: num,
    documentSubmitted: num,
    awaitingReview: num,
    verified: num,
    unclesWorking: num,
  }),
  signupStages: z.record(z.string(), num),
  suspended: num,
  connections: z.record(z.string(), num),
  requestStatus: z.record(z.string(), num),
  requestLabels: z.record(z.string(), num),
  newRequestsByDay: z.array(z.object({ day: str, count: num })).nullable(),
  backorderAging: z.object({ "0-1": num, "2-3": num, "4-7": num, "8+": num }),
  issues: z.record(z.string(), num),
  proposalsPending: num,
  userMessages24h: num,
  attachments: z.object({ count: num, bytes: num }),
  openCases: num,
  leads: z.object({ total: num, inPeriod: num, unhandled: num }),
  liveNotices: num,
  maintenance: z.object({ active: bool, blockWrites: bool }).nullable(),
  queue: z.array(anomalyItemSchema),
});
export type Overview = z.infer<typeof overviewSchema>;

export const anomaliesSchema = z.object({
  generatedAt: str,
  items: z.array(anomalyItemSchema),
  counts: z.record(z.string(), num),
});
export type Anomalies = z.infer<typeof anomaliesSchema>;

export const accountRowSchema = z.object({
  id: str,
  email: z.string().nullable(),
  provider: str,
  createdAt: str,
  lastSignInAt: z.string().nullable(),
  loginBanned: bool,
  moderation: z.enum(["active", "suspended"]),
  isStaff: bool,
  hasAccount: bool,
  role: z.string().nullable(),
  name: z.string().nullable(),
  businessName: z.string().nullable(),
  complete: bool,
  stage: z.string().nullable(),
  missing: z.array(z.string()),
  verification: str,
  documentStatus: str,
  working: bool,
  markets: z.array(z.string()).catch([]),
  connections: num,
  activeRequests: num,
  demo: bool,
});
export type AccountRow = z.infer<typeof accountRowSchema>;

export const accountListSchema = listOf(accountRowSchema).extend({
  facets: z.object({
    retailer: num,
    uncle: num,
    noRole: num,
    signup: num,
    complete: num,
    documentMissing: num,
    awaitingReview: num,
    verified: num,
    rejected: num,
    suspended: num,
    noAccount: num,
    staff: num,
  }),
});
export type AccountList = z.infer<typeof accountListSchema>;

/** backoffice_private.account_json: masked contact fields plus `masked: true` for viewers. */
export const accountProfileSchema = z.object({
  id: str,
  verification: str,
  masked: z.boolean().optional(),
  role: text,
  name: text,
  label: text,
  complete: z.boolean().nullish(),
  working: z.boolean().nullish(),
  photoId: text,
  documentId: text,
  documentStatus: text,
  verificationStatus: text,
  verificationNote: text,
  verifiedDocumentId: text,
  verificationReviewedAt: text,
  pickupArea: text,
  deliveryArea: text,
  deadline: text,
  holiday: text,
  intro: text,
  salesChannel: text,
  markets: z.array(z.string()).nullish(),
  transport: text,
  activityHours: text,
  activityStart: text,
  activityEnd: text,
  activityDays: z.array(z.string()).nullish(),
  terms: z.boolean().nullish(),
  privacy: z.boolean().nullish(),
  provider: text,
  codeExpires: text,
  version: count,
  demoBatch: z.unknown().optional(),
  contact: text,
  phone: text,
  email: text,
  businessName: text,
  businessNumber: text,
  verifiedBusinessNumber: text,
  address: text,
  addressDetail: text,
  deliveryNote: text,
});
export type AccountProfile = z.infer<typeof accountProfileSchema>;

export const accountAttachmentSchema = z.object({
  id: str,
  name: z.string().nullish(),
  mime: text,
  size: num,
  createdAt: text,
  usage: z.array(z.string()),
});

export const accountDossierSchema = z.object({
  account: accountProfileSchema.nullable(),
  auth: z.object({
    email: z.string().nullable(),
    provider: str,
    createdAt: str,
    lastSignInAt: z.string().nullable(),
    emailConfirmed: bool,
    bannedUntil: z.string().nullable(),
    isStaff: bool,
  }),
  signup: z.object({ stage: z.string().nullable(), updatedAt: z.string().nullable(), missing: z.array(z.string()) }),
  moderation: moderationSchema.nullable(),
  reviews: z.array(reviewSchema),
  connections: z.array(
    z.object({
      id: str,
      status: z.string().nullable(),
      direction: z.enum(["sent", "received"]),
      partner: accountBriefSchema,
      createdAt: z.string().nullable(),
      version: num,
    }),
  ),
  requestStats: z.object({ asRetailer: z.record(z.string(), num), asUncle: z.record(z.string(), num) }),
  recentRequests: z.array(
    z.object({
      id: str,
      product: z.string().nullable(),
      option: z.string().nullable(),
      label: str,
      ledger: ledgerSchema,
      partner: accountBriefSchema,
      createdAt: z.string().nullable(),
      updatedAt: str,
    }),
  ),
  draftCount: num,
  unreadNotices: num,
  attachments: z.array(accountAttachmentSchema),
  notes: z.array(noteSchema),
  cases: z.array(caseSchema),
  recentAudit: z.array(
    z.object({ id: num, at: str, action: str, actorId: str, actorName: z.string().nullable(), reason: str }),
  ),
});
export type AccountDossier = z.infer<typeof accountDossierSchema>;

export const requestRowSchema = z.object({
  id: str,
  status: z.string().nullable(),
  label: str,
  product: z.string().nullable(),
  option: z.string().nullable(),
  wholesaler: z.string().nullable(),
  location: z.string().nullable(),
  retailer: accountBriefSchema,
  uncle: accountBriefSchema,
  ledger: ledgerSchema,
  recheck: z.string().nullable(),
  recheckDays: z.number().nullable(),
  needsReply: bool,
  proposalId: str,
  photoCount: num,
  violations: z.array(z.string()),
  lastEvent: z.object({ title: z.string().nullable(), createdAt: z.string().nullable() }).nullable(),
  recheckNoticeAt: z.string().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: str,
  version: num,
  demo: bool,
});
export type RequestRow = z.infer<typeof requestRowSchema>;

export const requestListSchema = listOf(requestRowSchema).extend({
  labels: z.record(z.string(), num),
  totals: z.object({ quantity: num, acquired: num, delivered: num, received: num, backorder: num }),
});
export type RequestList = z.infer<typeof requestListSchema>;

const deliveryDataShape = {
  requestId: text,
  retailerId: text,
  uncleId: text,
  product: text,
  option: text,
  quantity: count,
  received: count,
  actual: count,
  receiptRecorded: z.boolean().nullish(),
  correctedAt: text,
  address: text,
  addressDetail: text,
  createdAt: text,
  version: count,
};

const receiptDataShape = {
  requestId: text,
  deliveryId: text,
  deliveryVersion: count,
  kind: text,
  actorId: text,
  confirmed: count,
  previousConfirmed: count,
  actual: count,
  reason: text,
  proposalId: text,
  createdAt: text,
};

const proposalDataShape = {
  requestId: text,
  kind: text,
  status: text,
  proposerId: text,
  resolvedBy: text,
  held: count,
  values: requestSnapshotSchema.extend({ reason: text }).nullish(),
  version: count,
  createdAt: text,
};

const issueDataShape = {
  requestId: text,
  deliveryId: text,
  reporterId: text,
  reason: text,
  status: text,
  held: count,
  actual: count,
  action: text,
  version: count,
  createdAt: text,
};

/**
 * A request event. Operator+ get the app record (title, before and after
 * snapshots); viewers get title, status and the ledgers only.
 */
export const requestEventSchema = z.object({
  id: str,
  title: text,
  actorId: text,
  requestId: text,
  deliveryId: text,
  createdAt: text,
  before: eventSnapshotSchema.nullish(),
  after: eventSnapshotSchema.nullish(),
  scope: z.enum(["request", "delivery"]).optional(),
  status: text,
  ledgerBefore: ledgerSchema.optional(),
  ledger: ledgerSchema.optional(),
});
export type RequestEvent = z.infer<typeof requestEventSchema>;

export const requestDossierSchema = z.object({
  request: requestSnapshotSchema.extend({
    id: str,
    label: str,
    ledger: ledgerSchema,
    updatedAt: str,
    participants: z.array(z.string()),
    masked: z.boolean().optional(),
  }),
  retailer: accountBriefSchema,
  uncle: accountBriefSchema,
  checks: z.object({
    violations: z.array(z.string()),
    deliveries: num,
    unconfirmedDeliveries: num,
    unresolvedIssues: num,
    pendingProposals: num,
  }),
  deliveries: z.array(z.object({ ...deliveryDataShape, id: str, round: num })),
  receipts: z.array(z.object({ ...receiptDataShape, id: str })),
  proposals: z.array(z.object({ ...proposalDataShape, id: str })),
  issues: z.array(z.object({ ...issueDataShape, id: str })),
  events: z.array(requestEventSchema),
  messages: z.object({ system: num, user: num, unread: num }),
  recheckNotices: z.array(z.object({ id: str, createdAt: z.string().nullable(), read: bool })),
  photos: z.array(z.object({ id: str, name: z.string().nullish(), mime: text, size: num })),
  notes: z.array(noteSchema),
  cases: z.array(caseSchema),
});
export type RequestDossier = z.infer<typeof requestDossierSchema>;

/** Fields every backoffice_list_records row carries. */
const recordCommon = {
  id: str,
  updatedAt: str,
  participants: z.array(z.string()),
  parties: z.array(accountBriefSchema),
  request: z.object({ id: str, product: text, option: text, status: text, label: str }).nullable(),
  round: z.number().nullable(),
};

export const recordRowSchemas = {
  connections: z.object({ ...recordCommon, from: text, to: text, status: text, createdAt: text, version: count }),
  deliveries: z.object({ ...recordCommon, ...deliveryDataShape }),
  receipts: z.object({ ...recordCommon, ...receiptDataShape }),
  proposals: z.object({ ...recordCommon, ...proposalDataShape }),
  issues: z.object({ ...recordCommon, ...issueDataShape }),
  events: z.object({
    ...recordCommon,
    requestId: text,
    deliveryId: text,
    actorId: text,
    title: text,
    createdAt: text,
    before: eventSnapshotSchema.nullish(),
    after: eventSnapshotSchema.nullish(),
    status: text,
    ledger: ledgerSchema.optional(),
  }),
  notices: z.object({
    ...recordCommon,
    ownerId: text,
    kind: text,
    title: text,
    read: z.boolean().nullish(),
    requestId: text,
    targetId: text,
    createdAt: text,
  }),
  attachments: z.object({ ...recordCommon, ownerId: text, name: text, mime: text, size: count, createdAt: text }),
  signupProgress: z.object({ ...recordCommon, accountId: text, role: text, stage: text }),
} satisfies Record<RecordCollection, z.ZodType>;

export const recordFacetsSchema = z.object({
  status: z.record(z.string(), num),
  awaitingReceipt: num,
  awaitingReceipt48h: num,
  mismatch: num,
  corrected: num,
  pending3d: num,
  today: num,
  unread: num,
});
export type RecordFacets = z.infer<typeof recordFacetsSchema>;

/** Takes the concrete row schema (not a collection key), so RecordList<C>["rows"] stays RecordRow<C>[]. */
function recordList<T extends z.ZodType>(row: T) {
  return listOf(row).extend({ facets: recordFacetsSchema });
}

export const recordListSchemas = {
  connections: recordList(recordRowSchemas.connections),
  deliveries: recordList(recordRowSchemas.deliveries),
  receipts: recordList(recordRowSchemas.receipts),
  proposals: recordList(recordRowSchemas.proposals),
  issues: recordList(recordRowSchemas.issues),
  events: recordList(recordRowSchemas.events),
  notices: recordList(recordRowSchemas.notices),
  attachments: recordList(recordRowSchemas.attachments),
  signupProgress: recordList(recordRowSchemas.signupProgress),
} satisfies Record<RecordCollection, z.ZodType>;

export type RecordRow<C extends RecordCollection> = z.infer<(typeof recordRowSchemas)[C]>;
export type RecordList<C extends RecordCollection> = z.infer<(typeof recordListSchemas)[C]>;

export const conversationRowSchema = z.object({
  accountA: accountBriefSchema,
  accountB: accountBriefSchema,
  lastAt: z.string().nullable(),
  userMessages: num,
  systemMessages: num,
  linkedRequests: num,
  unread: num,
  withAttachments: num,
  connection: z.string().nullable(),
});
export type ConversationRow = z.infer<typeof conversationRowSchema>;
export const conversationListSchema = listOf(conversationRowSchema);
export type ConversationList = z.infer<typeof conversationListSchema>;

export const chatMessageSchema = z.object({
  id: str,
  body: z.string().nullable(),
  senderId: text,
  recipientId: text,
  requestId: text,
  system: z.boolean().nullish(),
  read: z.boolean().nullish(),
  status: text,
  attachments: z.array(z.string()).nullish(),
  createdAt: text,
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const conversationSchema = z.object({
  participants: z.array(accountBriefSchema),
  hasMore: bool,
  messages: z.array(chatMessageSchema),
});
export type Conversation = z.infer<typeof conversationSchema>;

export const attachmentAccessSchema = z.object({
  id: str,
  bucket: str,
  path: str,
  ownerId: z.string().nullable(),
  name: z.string().nullable(),
  mime: z.string().nullable(),
  size: num,
  createdAt: z.string().nullable(),
});
export type AttachmentAccess = z.infer<typeof attachmentAccessSchema>;

export const searchResultSchema = z.object({
  accounts: z.array(
    z.object({
      id: str,
      name: z.string().nullable(),
      role: z.string().nullable(),
      complete: bool,
      businessName: z.string().nullable(),
      phoneTail: z.string().nullable(),
    }),
  ),
  requests: z.array(
    z.object({
      id: str,
      product: z.string().nullable(),
      option: z.string().nullable(),
      label: str,
      retailer: z.string().nullable(),
      uncle: z.string().nullable(),
    }),
  ),
  leads: z.array(
    z.object({ id: str, name: z.string().nullable(), businessName: z.string().nullable(), role: str, createdAt: str }),
  ),
});
export type SearchResult = z.infer<typeof searchResultSchema>;

export const leadRowSchema = z.object({
  id: str,
  createdAt: str,
  role: str,
  name: z.string().nullable(),
  businessName: z.string().nullable(),
  contact: z.string().nullable(),
  market: z.string().nullable(),
  message: z.string().nullable(),
  source: z.string().nullable(),
  utm: z.record(z.string(), z.string()).nullable().catch(null),
  suspect: bool,
  status: z.enum(LEAD_STATUSES),
  assignee: z.object({ userId: str, displayName: str }).nullable(),
  statusUpdatedAt: z.string().nullable(),
  notes: num,
});
export type LeadRow = z.infer<typeof leadRowSchema>;
export const leadListSchema = listOf(leadRowSchema).extend({ facets: z.record(z.string(), num) });
export type LeadList = z.infer<typeof leadListSchema>;

export const configRowSchema = z
  .object({
    key: str,
    value: z.unknown(),
    is_public: bool,
    write_role: z.enum(["owner", "operator"]),
    description: str,
    version: num,
    updated_by: z.string().nullable(),
    updated_at: str,
    updatedByName: z.string().nullable(),
  })
  .transform((c) => ({
    key: c.key,
    value: c.value,
    isPublic: c.is_public,
    writeRole: c.write_role,
    description: c.description,
    version: c.version,
    updatedBy: c.updated_by,
    updatedAt: c.updated_at,
    updatedByName: c.updatedByName,
  }));
export type ConfigRow = z.infer<typeof configRowSchema>;
export const configListSchema = z.array(configRowSchema);

export const noticeRowSchema = z
  .object({
    id: str,
    title: str,
    body: str,
    audience: z.enum(NOTICE_AUDIENCES),
    severity: z.enum(NOTICE_SEVERITIES),
    link_url: z.string().nullable(),
    starts_at: str,
    ends_at: z.string().nullable(),
    active: bool,
    dismissible: bool,
    version: num,
    created_by: str,
    created_at: str,
    updated_by: str,
    updated_at: str,
    state: z.enum(NOTICE_STATES),
  })
  .transform((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    audience: n.audience,
    severity: n.severity,
    linkUrl: n.link_url,
    startsAt: n.starts_at,
    endsAt: n.ends_at,
    active: n.active,
    dismissible: n.dismissible,
    version: n.version,
    createdBy: n.created_by,
    createdAt: n.created_at,
    updatedBy: n.updated_by,
    updatedAt: n.updated_at,
    state: n.state,
  }));
export type NoticeRow = z.infer<typeof noticeRowSchema>;
export const noticeListSchema = z.array(noticeRowSchema);

export const auditRowSchema = z.object({
  id: num,
  at: str,
  actorId: str,
  actorRole: str,
  actorName: z.string().nullable(),
  action: str,
  targetType: str,
  targetId: str,
  reason: str,
  before: jsonObject.nullable(),
  after: jsonObject.nullable(),
  operationId: z.string().nullable(),
  client: z.object({ ip: text, userAgent: text, gatewayIp: text, clientInfo: text }),
});
export type AuditRow = z.infer<typeof auditRowSchema>;
export const auditListSchema = listOf(auditRowSchema);
export type AuditList = z.infer<typeof auditListSchema>;

export const operationRowSchema = z.object({
  actor: accountBriefSchema,
  operationId: str,
  command: z.string().nullable(),
  result: z.string().nullable(),
  createdAt: str,
});
export type OperationRow = z.infer<typeof operationRowSchema>;
export const operationListSchema = listOf(operationRowSchema).extend({ commands: z.record(z.string(), num) });
export type OperationList = z.infer<typeof operationListSchema>;

/** Emails, last sign-in, MFA factors and app-account flags only reach the owner. */
export const adminRowSchema = z.object({
  userId: str,
  role: z.enum(["viewer", "operator", "owner"]),
  displayName: str,
  requireMfa: bool,
  createdAt: str,
  revokedAt: z.string().nullable(),
  isMe: bool,
  email: z.string().nullish(),
  lastSignInAt: z.string().nullish(),
  mfaFactors: z.number().optional(),
  hasAppAccount: z.boolean().optional(),
});
export type AdminRow = z.infer<typeof adminRowSchema>;
export const adminListSchema = z.array(adminRowSchema);

export const lookupUserSchema = z.object({
  userId: str,
  email: z.string().nullable(),
  provider: str,
  createdAt: str,
  lastSignInAt: z.string().nullable(),
  emailConfirmed: bool,
  providers: z.array(z.string()),
  hasAppAccount: bool,
  staff: z.object({ role: z.enum(["viewer", "operator", "owner"]), revokedAt: z.string().nullable() }).nullable(),
});
export type LookupUser = z.infer<typeof lookupUserSchema>;

/** CSV-ready rows; the column map per kind lives in the export route. */
export const exportResultSchema = z.object({
  kind: str,
  generatedAt: str,
  rowCount: num,
  truncated: bool,
  rows: z.array(jsonObject),
});
export type ExportResult = z.infer<typeof exportResultSchema>;

export const chainResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), checked: num, headHash: z.string().nullable(), verifiedAt: str }),
  z.object({ ok: z.literal(false), brokenAtId: num, checked: num }),
]);
export type ChainResult = z.infer<typeof chainResultSchema>;

// ---------------------------------------------------------------------------
// Write RPCs (the stored result is returned again on a replay)
// ---------------------------------------------------------------------------

export const reviewDocumentResultSchema = z.object({ accountId: str, verificationStatus: str, reviewId: num });
export const setAccountStatusResultSchema = z.object({ accountId: str, status: z.enum(["active", "suspended"]), loginBanned: bool });
export const addNoteResultSchema = z.object({ noteId: num });
export const openCaseResultSchema = z.object({ caseId: str });
export const updateCaseResultSchema = z.object({ caseId: str, version: num, status: z.enum(CASE_STATUSES) });
export const saveNoticeResultSchema = z.object({ noticeId: str, version: num, active: bool });
export const setConfigResultSchema = z.object({ key: str, version: num });
export const grantAdminResultSchema = z.object({ userId: str, role: z.enum(["viewer", "operator", "owner"]) });
export const revokeAdminResultSchema = z.object({ userId: str, revoked: z.literal(true) });
export const setLeadStatusResultSchema = z.object({ leadId: str, status: z.enum(LEAD_STATUSES) });

/** One schema per RPC name (list_records: see recordListSchemas per collection). */
export const RPC_RESULT_SCHEMAS = {
  backoffice_whoami: whoamiSchema,
  backoffice_overview: overviewSchema,
  backoffice_ledger_anomalies: anomaliesSchema,
  backoffice_list_accounts: accountListSchema,
  backoffice_get_account: accountDossierSchema,
  backoffice_list_requests: requestListSchema,
  backoffice_get_request: requestDossierSchema,
  backoffice_list_records: z.union([
    recordListSchemas.connections,
    recordListSchemas.deliveries,
    recordListSchemas.receipts,
    recordListSchemas.proposals,
    recordListSchemas.issues,
    recordListSchemas.events,
    recordListSchemas.notices,
    recordListSchemas.attachments,
    recordListSchemas.signupProgress,
  ]),
  backoffice_list_conversations: conversationListSchema,
  backoffice_get_conversation: conversationSchema,
  backoffice_attachment_access: attachmentAccessSchema,
  backoffice_search: searchResultSchema,
  backoffice_list_leads: leadListSchema,
  backoffice_list_config: configListSchema,
  backoffice_list_notices: noticeListSchema,
  backoffice_list_audit: auditListSchema,
  backoffice_list_operations: operationListSchema,
  backoffice_list_admins: adminListSchema,
  backoffice_lookup_user: lookupUserSchema,
  backoffice_export: exportResultSchema,
  backoffice_verify_audit_chain: chainResultSchema,
  backoffice_review_document: reviewDocumentResultSchema,
  backoffice_set_account_status: setAccountStatusResultSchema,
  backoffice_add_note: addNoteResultSchema,
  backoffice_open_case: openCaseResultSchema,
  backoffice_update_case: updateCaseResultSchema,
  backoffice_save_notice: saveNoticeResultSchema,
  backoffice_set_config: setConfigResultSchema,
  backoffice_grant_admin: grantAdminResultSchema,
  backoffice_revoke_admin: revokeAdminResultSchema,
  backoffice_set_lead_status: setLeadStatusResultSchema,
} as const;

export type RpcName = keyof typeof RPC_RESULT_SCHEMAS;
