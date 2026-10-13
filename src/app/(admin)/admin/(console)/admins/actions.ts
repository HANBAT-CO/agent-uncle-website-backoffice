"use server";

import { z } from "zod";

import { runAdminAction, type ActionState } from "@/lib/admin/actions";
import { requireRole } from "@/lib/admin/dal";
import { ADMIN_ROLES, ROLE_LABEL } from "@/lib/admin/roles";
import { rpc, type LookupUser } from "@/lib/admin/rpc";

/*
 * 운영 계정 (spec 5 staff onboarding, 6; screens 10.18): owner only. Every
 * export is reachable by a direct POST, so each checks the owner role itself;
 * Postgres re-checks and refuses your own row, the last owner, unconfirmed
 * emails and app accounts with messages shown verbatim.
 */

const REVALIDATE = ["/admin/admins", "/admin/audit"];

export type LookupResult = { ok: true; user: LookupUser } | { ok: false; message: string };

const emailSchema = z.email("이메일 형식을 확인해 주세요.").max(320);

/** Audited (admin.lookup): providers, email confirmation, app account, current staff row. */
export async function lookupUserAction(email: string): Promise<LookupResult> {
  const session = await requireRole("owner");
  if (!session) return { ok: false, message: "이 작업은 관리자 이상만 할 수 있어요." };
  const parsed = emailSchema.safeParse(email.trim());
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "이메일 형식을 확인해 주세요." };
  const result = await rpc.lookupUser(parsed.data);
  return result.ok ? { ok: true, user: result.data } : { ok: false, message: result.error.message };
}

const grantSchema = z.object({
  userId: z.uuid("조회한 계정을 다시 선택해 주세요."),
  role: z.enum(ADMIN_ROLES, { error: "역할을 확인해 주세요." }),
  displayName: z.string().trim().min(1, "이름을 입력해 주세요.").max(60, "이름은 60자 이하로 입력해 주세요."),
  requireMfa: z.enum(["true", "false"]).transform((value) => value === "true"),
});

/** fields: userId, role, displayName, requireMfa ('true' | 'false'), operationId */
export async function grantAdminAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAdminAction({
    minRole: "owner",
    formData: fd,
    schema: grantSchema,
    call: (input, operationId) =>
      rpc.grantAdmin({ userId: input.userId, role: input.role, displayName: input.displayName, requireMfa: input.requireMfa, operationId }),
    success: (data) => `${ROLE_LABEL[data.role]} 권한을 부여했어요`,
    revalidate: REVALIDATE,
  });
}

const revokeSchema = z.object({
  userId: z.uuid("운영 계정을 다시 선택해 주세요."),
  reason: z.string().trim().min(5, "사유를 5자 이상 입력해 주세요.").max(2000, "사유는 2,000자 이하로 입력해 주세요."),
});

/** fields: userId, reason, operationId */
export async function revokeAdminAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAdminAction({
    minRole: "owner",
    formData: fd,
    schema: revokeSchema,
    call: (input, operationId) => rpc.revokeAdmin({ userId: input.userId, reason: input.reason, operationId }),
    success: "운영 계정을 해제했어요",
    revalidate: REVALIDATE,
  });
}
