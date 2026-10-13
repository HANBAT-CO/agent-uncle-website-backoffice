import "server-only";

import type { ZodType } from "zod";

import type { Database } from "../database.types";
import { createAdminServerClient } from "../supabase/server";

/*
 * One door to Postgres for the console (backoffice spec 3, 7, 8). Every call
 * runs with the staff member's own JWT (publishable key + cookie session):
 * the SECURITY DEFINER RPCs decide permissions with require_admin(). Results
 * are validated with zod; errors are mapped to a small set of kinds whose
 * messages are safe to show. Raw Postgres text is shown only for P0001
 * (Korean validation messages written for operators) and 42501 (permission).
 */

export type RpcErrorKind = "forbidden" | "invalid" | "conflict" | "not_installed" | "unauthenticated" | "network" | "unknown";
export type RpcError = { kind: RpcErrorKind; message: string; code?: string };
export type RpcResult<T> = { ok: true; data: T } | { ok: false; error: RpcError };

export type RpcFunction = keyof Database["public"]["Functions"];

export const RPC_MESSAGES = {
  forbidden: "이 작업을 처리할 권한이 없어요.",
  conflictReplay: "이미 처리된 작업이에요. 화면을 새로고침한 뒤 다시 시도해 주세요.",
  not_installed: "운영 데이터 계층이 아직 설치되지 않았어요. 앱 저장소에 마이그레이션이 반영된 뒤 이용할 수 있어요.",
  unauthenticated: "로그인이 만료됐어요. 다시 로그인해 주세요.",
  network: "서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.",
  unknown: "잠시 후 다시 시도해 주세요.",
} as const;

type ErrorLike = { code?: string | null; message?: string | null; name?: string } | null | undefined;

function isNetworkFailure(err: ErrorLike, status?: number): boolean {
  if (err instanceof TypeError) return true;
  if (err?.name === "TypeError" || err?.name === "FetchError") return true;
  const message = err?.message ?? "";
  // postgrest-js turns a thrown fetch into { code: '', message: 'TypeError: fetch failed' } with status 0.
  return status === 0 || /^(TypeError|FetchError)\b/.test(message);
}

/** Maps a PostgREST / Postgres error to a kind and a message that is safe to show. */
export function mapRpcError(err: ErrorLike, status?: number): RpcError {
  const code = err?.code || undefined;
  const message = err?.message?.trim() ?? "";
  const withCode = (error: Omit<RpcError, "code">): RpcError => (code ? { ...error, code } : error);

  if (code === "42501") return withCode({ kind: "forbidden", message: message || RPC_MESSAGES.forbidden });
  if (code === "P0001") {
    if (message.includes("같은 작업 번호로")) return withCode({ kind: "conflict", message: RPC_MESSAGES.conflictReplay });
    if (message.includes("다른 운영자가")) return withCode({ kind: "conflict", message });
    return withCode({ kind: "invalid", message: message || RPC_MESSAGES.unknown });
  }
  if (code === "PGRST202") return withCode({ kind: "not_installed", message: RPC_MESSAGES.not_installed });
  if (code === "PGRST301" || code === "PGRST302" || status === 401) {
    return withCode({ kind: "unauthenticated", message: RPC_MESSAGES.unauthenticated });
  }
  if (err && isNetworkFailure(err, status)) return withCode({ kind: "network", message: RPC_MESSAGES.network });
  return withCode({ kind: "unknown", message: RPC_MESSAGES.unknown });
}

/**
 * Calls one backoffice RPC as the signed-in staff member and validates the
 * result. A result that does not match its contract becomes `unknown`; only
 * the function name and the zod issue paths are logged, never the data.
 */
export async function callRpc<T>(fn: RpcFunction, args: Record<string, unknown>, schema: ZodType<T>): Promise<RpcResult<T>> {
  let response: { data: unknown; error: ErrorLike; status: number };
  try {
    const supabase = await createAdminServerClient();
    // Args are built by the typed wrappers in rpc/index.ts; the generated
    // Database types cannot express the camelCase-to-p_snake mapping.
    response = (await supabase.rpc(fn as never, args as never)) as typeof response;
  } catch (error) {
    return { ok: false, error: mapRpcError(error as ErrorLike) };
  }
  if (response.error) return { ok: false, error: mapRpcError(response.error, response.status) };

  const parsed = schema.safeParse(response.data);
  if (!parsed.success) {
    const paths = parsed.error.issues.slice(0, 5).map((issue) => issue.path.join("."));
    console.error(`[backoffice rpc] ${fn} returned an unexpected shape`, paths);
    return { ok: false, error: { kind: "unknown", message: RPC_MESSAGES.unknown } };
  }
  return { ok: true, data: parsed.data };
}
