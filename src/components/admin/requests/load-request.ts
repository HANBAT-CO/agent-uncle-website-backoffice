import "server-only";

import { newOperationId } from "@/lib/admin/operation-id";
import { rpc, type AdminRow, type RequestDossier, type RpcError } from "@/lib/admin/rpc";

import type { RequestOperationIds } from "./RequestDetail";

/** The SQL's message for an unknown request id (backoffice_get_request). */
export const REQUEST_NOT_FOUND = "요청을 찾을 수 없어요.";

export type RequestDetailLoad =
  | { state: "ok"; data: RequestDossier; staff: AdminRow[]; operationIds: RequestOperationIds }
  | { state: "not_found" }
  | { state: "error"; error: RpcError };

/** The [id] segment as text; a malformed escape reads as no id. */
function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/**
 * Everything RequestDetail needs, for the Sheet and the full page alike: the
 * dossier, the staff names (note authors, case assignees) and fresh operation
 * ids for the note and case forms. Call after verifyAdmin().
 */
export async function loadRequestDetail(rawId: string): Promise<RequestDetailLoad> {
  const id = safeDecode(rawId);
  if (!id || id.length > 200) return { state: "not_found" };
  const [request, admins] = await Promise.all([rpc.getRequest(id), rpc.listAdmins()]);
  if (!request.ok) {
    return request.error.kind === "invalid" && request.error.message === REQUEST_NOT_FOUND ? { state: "not_found" } : { state: "error", error: request.error };
  }
  return {
    state: "ok",
    data: request.data,
    // Names only reach the console when the list loads; a failure just shows "운영 계정".
    staff: admins.ok ? admins.data : [],
    operationIds: { note: newOperationId(), case: newOperationId() },
  };
}
