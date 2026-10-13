"use server";

import { z } from "zod";

import { runAdminAction, type ActionState } from "@/lib/admin/actions";
import { REVIEW_DECISIONS, rpc } from "@/lib/admin/rpc";

/*
 * 계정·가입 writes (screens 10.7). Each is reachable by a direct POST, so
 * runAdminAction re-checks the session, the role and the operationId; the
 * SECURITY DEFINER RPCs re-check everything again (staff targets need the
 * owner, never the caller's own account, 확인함 needs an audited file open
 * within 24 h). Role changes, profile edits and deletion do not exist here.
 */

const accountId = z.uuid("계정을 찾을 수 없어요.");
const checkbox = z
  .string()
  .optional()
  .transform((value) => value === "on" || value === "true");

const reviewSchema = z
  .object({
    accountId,
    documentId: z.string().trim().min(1, "제출된 사업자등록증이 없어요.").max(200),
    decision: z.enum(REVIEW_DECISIONS, "검토 결과를 선택해 주세요."),
    userMessage: z
      .string()
      .optional()
      .transform((value) => value?.trim() ?? "")
      .pipe(z.string().max(300, "앱에 보일 안내는 300자 이하로 입력해 주세요.")),
    internalNote: z
      .string()
      .optional()
      .transform((value) => value?.trim() ?? "")
      .pipe(z.string().max(2000, "내부 메모는 2,000자 이하로 입력해 주세요.")),
    checkName: checkbox,
    checkNumber: checkbox,
    checkImage: checkbox,
  })
  .refine((input) => input.decision !== "rejected" || input.userMessage.length > 0, {
    path: ["userMessage"],
    message: "재제출 안내 문구를 입력해 주세요.",
  });

/** fields: accountId, documentId, decision, userMessage, internalNote, checkName, checkNumber, checkImage, operationId */
export async function reviewDocumentAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAdminAction({
    minRole: "operator",
    formData: fd,
    schema: reviewSchema,
    call: (input, operationId) =>
      rpc.reviewDocument({
        accountId: input.accountId,
        documentId: input.documentId,
        decision: input.decision,
        userMessage: input.decision === "rejected" ? input.userMessage : "",
        internalNote: input.internalNote,
        checks: { businessName: input.checkName, businessNumber: input.checkNumber, imageClear: input.checkImage },
        operationId,
      }),
    success: "검토 결과를 저장했어요",
    revalidate: (input) => [`/admin/accounts/${input.accountId}`, "/admin/accounts"],
  });
}

const statusSchema = z.object({
  accountId,
  status: z.enum(["active", "suspended"], "계정 상태를 확인해 주세요."),
  reason: z.string().trim().min(5, "사유를 5자 이상 입력해 주세요.").max(2000, "사유는 2,000자 이하로 입력해 주세요."),
  userMessage: z
    .string()
    .optional()
    .transform((value) => value?.trim() ?? "")
    .pipe(z.string().max(300, "앱에 보일 안내는 300자 이하로 입력해 주세요.")),
  banLogin: checkbox,
});

/** fields: accountId, status (suspended | active), reason, userMessage, banLogin, operationId */
export async function setAccountStatusAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAdminAction({
    minRole: "operator",
    formData: fd,
    schema: statusSchema,
    call: (input, operationId) =>
      rpc.setAccountStatus({
        accountId: input.accountId,
        status: input.status,
        reason: input.reason,
        userMessage: input.status === "suspended" ? input.userMessage : "",
        banLogin: input.status === "suspended" ? input.banLogin : false,
        operationId,
      }),
    success: (data) => (data.status === "suspended" ? "이용을 제한했어요" : "이용을 다시 허용했어요"),
    revalidate: (input) => [`/admin/accounts/${input.accountId}`, "/admin/accounts"],
  });
}
