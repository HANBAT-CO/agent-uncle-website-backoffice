import "server-only";
import { callRpc } from "./core";
import {
  bankSchema,
  invoiceSchema,
  lifecycleSchema,
  paymentResultSchema,
  pushSchema,
  releaseListSchema,
  teamChatSchema,
  workflowDetailSchema,
  workflowListSchema,
} from "./workflow-schemas";
import type { WorkflowCollection } from "../workflows";

export const workflowRpc = {
  list: (
    collection: WorkflowCollection,
    opts: {
      query?: string;
      status?: string;
      related?: string;
      demo?: boolean;
      offset?: number;
    } = {},
  ) =>
    callRpc(
      "backoffice_list_workflow",
      {
        p_collection: collection,
        p_query: opts.query,
        p_status: opts.status,
        p_related_id: opts.related,
        p_include_demo: opts.demo ?? false,
        p_limit: 25,
        p_offset: opts.offset ?? 0,
      },
      workflowListSchema,
    ),
  invoice: (id: string) =>
    callRpc("backoffice_get_invoice", { p_invoice_id: id }, invoiceSchema),
  lifecycle: (offset = 0) =>
    callRpc(
      "backoffice_lifecycle",
      { p_limit: 25, p_offset: offset },
      lifecycleSchema,
    ),
  push: () => callRpc("backoffice_push_health", {}, pushSchema),
  releases: (offset = 0) => callRpc("backoffice_list_app_releases", { p_limit: 25, p_offset: offset }, releaseListSchema),
  bank: (id: string, reason: string) =>
    callRpc(
      "backoffice_bank_access",
      { p_account_id: id, p_reason: reason },
      bankSchema,
    ),
  chat: (id: string, reason: string, offset = 0) =>
    callRpc(
      "backoffice_team_chat",
      { p_team_id: id, p_reason: reason, p_limit: 25, p_offset: offset },
      teamChatSchema,
    ),
  detail: (collection: WorkflowCollection, id: string, reason: string) =>
    callRpc(
      "backoffice_workflow_detail",
      { p_collection: collection, p_id: id, p_reason: reason },
      workflowDetailSchema,
    ),
  payment: (
    input: {
      action: string;
      recordId: string;
      version: number;
      reference: string;
      amount: number;
      reason: string;
    },
    operationId: string,
  ) =>
    callRpc(
      "backoffice_process_payment",
      {
        p_operation_id: operationId,
        p_action: input.action,
        p_record_id: input.recordId,
        p_expected_version: input.version,
        p_bank_reference: input.reference,
        p_amount: input.amount,
        p_reason: input.reason,
      },
      paymentResultSchema,
    ),
};
