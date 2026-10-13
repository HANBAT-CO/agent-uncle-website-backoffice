import "server-only";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ZodType } from "zod";

import { currentAdminPath, gateRedirectPath, getAdminGate } from "./dal";
import { isOperationId } from "./operation-id";
import { hasRole, ROLE_LABEL, type AdminRole } from "./roles";
import { RPC_MESSAGES, type RpcErrorKind, type RpcResult } from "./rpc/core";

/*
 * The shared Server Action pipeline (spec 7, 9; Review Focus 1 and 2):
 *   gate -> role -> operationId (UUID rendered by the Server Component)
 *   -> zod -> rpc -> revalidatePath -> ActionState
 * A signed-out or expired session returns an `unauthenticated` state with a
 * login link instead of redirecting, so the form keeps what was typed. Other
 * non-ok gates (권한 없음, MFA, 사용할 수 없음) redirect like verifyAdmin().
 */

export type ActionState =
  | { status: "idle" }
  | { status: "success"; message: string; data?: unknown }
  | {
      status: "error";
      message: string;
      kind: RpcErrorKind | "validation";
      fieldErrors?: Record<string, string>;
      /** Set for `unauthenticated`: where to sign in again and come back. */
      loginHref?: string;
    };

export const IDLE: ActionState = { status: "idle" };

export const ACTION_MESSAGES = {
  saveFailed: "저장하지 못했어요. 입력은 그대로 있어요. 다시 시도해 주세요.",
  validation: "입력한 내용을 확인해 주세요.",
  operationId: "작업 번호가 없어요. 화면을 새로고침한 뒤 다시 시도해 주세요.",
} as const;

function forbiddenFor(min: AdminRole): string {
  return `이 작업은 ${ROLE_LABEL[min]} 이상만 할 수 있어요.`;
}

/** FormData to a plain object: repeated keys become arrays; Next's $ACTION_ fields and operationId are left out. */
export function formDataToObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION_") || key === "operationId") continue;
    if (typeof value !== "string") continue;
    const previous = out[key];
    if (previous === undefined) out[key] = value;
    else out[key] = Array.isArray(previous) ? [...previous, value] : [previous, value];
  }
  return out;
}

async function loginState(): Promise<ActionState> {
  const next = await currentAdminPath();
  return {
    status: "error",
    kind: "unauthenticated",
    message: RPC_MESSAGES.unauthenticated,
    loginHref: `/admin/login?next=${encodeURIComponent(next)}`,
  };
}

export async function runAdminAction<I, O>(o: {
  minRole: AdminRole;
  formData: FormData;
  schema: ZodType<I>;
  call: (input: I, operationId: string) => Promise<RpcResult<O>>;
  success: string | ((data: O) => string);
  revalidate?: string[] | ((input: I) => string[]);
}): Promise<ActionState> {
  const gate = await getAdminGate();
  if (gate.state === "signed_out" || gate.state === "expired") return loginState();
  if (gate.state !== "ok") redirect(gateRedirectPath(gate, await currentAdminPath()));
  if (!hasRole(gate.session.role, o.minRole)) {
    return { status: "error", kind: "forbidden", message: forbiddenFor(o.minRole) };
  }

  const operationId = o.formData.get("operationId");
  if (!isOperationId(operationId)) {
    return { status: "error", kind: "validation", message: ACTION_MESSAGES.operationId };
  }

  const parsed = o.schema.safeParse(formDataToObject(o.formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_";
      fieldErrors[key] ??= issue.message;
    }
    const first = parsed.error.issues[0]?.message;
    return { status: "error", kind: "validation", message: first || ACTION_MESSAGES.validation, fieldErrors };
  }

  const result = await o.call(parsed.data, operationId);
  if (!result.ok) {
    const { kind, message } = result.error;
    if (kind === "unauthenticated") return loginState();
    if (kind === "unknown") return { status: "error", kind, message: ACTION_MESSAGES.saveFailed };
    return { status: "error", kind, message };
  }

  const paths = typeof o.revalidate === "function" ? o.revalidate(parsed.data) : (o.revalidate ?? []);
  for (const path of new Set(paths)) revalidatePath(path);
  const message = typeof o.success === "function" ? o.success(result.data) : o.success;
  return { status: "success", message, data: result.data };
}
