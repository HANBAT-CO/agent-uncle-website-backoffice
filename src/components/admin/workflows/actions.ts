"use server";
import { z } from "zod";
import { runAdminAction, type ActionState } from "@/lib/admin/actions";
import { workflowRpc } from "@/lib/admin/rpc/workflows";
import type { RpcResult } from "@/lib/admin/rpc/core";
import { WORKFLOWS, type WorkflowCollection } from "@/lib/admin/workflows";
const reason = z
  .string()
  .trim()
  .min(5, "사유를 5자 이상 입력해 주세요.")
  .max(1000);
export async function revealWorkflow(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAdminAction({
    minRole: "operator",
    formData,
    schema: z.object({
      kind: z.enum(["bank", "chat", "detail"]),
      id: z.string().min(1).max(300),
      collection: z.string().default(""),
      reason,
      offset: z.coerce.number().int().min(0).max(1000000).default(0),
    }),
    call: async (i): Promise<RpcResult<unknown>> => {
      if (i.kind === "bank") return workflowRpc.bank(i.id, i.reason);
      if (i.kind === "chat") return workflowRpc.chat(i.id, i.reason, i.offset);
      if (!(i.collection in WORKFLOWS))
        return {
          ok: false,
          error: { kind: "invalid", message: "업무 종류를 확인해 주세요." },
        };
      return workflowRpc.detail(
        i.collection as WorkflowCollection,
        i.id,
        i.reason,
      );
    },
    success: "열람 사유를 감사 로그에 기록했어요.",
  });
}
export async function recordPayment(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAdminAction({
    minRole: "operator",
    formData,
    schema: z.object({
      action: z.enum(["confirm_receipt", "reject_receipt", "pay_uncle"]),
      recordId: z.string().min(1).max(300),
      version: z.coerce.number().int().nonnegative(),
      reference: z
        .string()
        .trim()
        .min(1, "은행 확인 기록을 입력해 주세요.")
        .max(300),
      amount: z
        .string()
        .regex(/^\d+$/, "원 단위 금액을 입력해 주세요.")
        .transform(Number)
        .pipe(z.number().int().min(0).max(2147483647)),
      reason,
    }),
    call: workflowRpc.payment,
    success: "은행 확인 결과를 기록했어요.",
    revalidate: ["/admin/billing", "/admin/requests", "/admin"],
  });
}
