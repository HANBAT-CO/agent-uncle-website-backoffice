"use server";

import { z } from "zod";

import { runAdminAction, type ActionState } from "@/lib/admin/actions";
import { LEAD_STATUSES, rpc } from "@/lib/admin/rpc";

/*
 * 랜딩 문의 처리 상태, 담당, 메모 (screens 10.16). backoffice_set_lead_status
 * sets the status and the assignee together (an empty assignee clears it)
 * and stores the optional note as an immutable backoffice note.
 */

const leadStatusSchema = z.object({
  leadId: z.uuid("문의를 찾을 수 없어요."),
  status: z.enum(LEAD_STATUSES, { error: "문의 상태를 확인해 주세요." }),
  assigneeId: z
    .union([z.literal(""), z.literal("none"), z.uuid("담당자를 다시 선택해 주세요.")])
    .optional()
    .transform((value) => (value && value !== "none" ? value : undefined)),
  note: z
    .string()
    .optional()
    .transform((value) => value?.trim() ?? "")
    .pipe(z.string().max(4000, "메모는 4,000자 이하로 입력해 주세요.")),
});

/** fields: leadId, status, assigneeId ('' clears), note?, operationId */
export async function setLeadStatusAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAdminAction({
    minRole: "operator",
    formData: fd,
    schema: leadStatusSchema,
    call: async (input, operationId) => {
      const result = await rpc.setLeadStatus({
        leadId: input.leadId,
        status: input.status,
        assigneeId: input.assigneeId,
        note: input.note || undefined,
        operationId,
      });
      return result.ok ? { ok: true, data: { ...result.data, noted: input.note.length > 0 } } : result;
    },
    success: (data) => (data.noted ? "처리 상태와 메모를 저장했어요" : "처리 상태를 저장했어요"),
    revalidate: ["/admin/leads"],
  });
}
