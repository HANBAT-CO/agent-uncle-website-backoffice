"use server";

import { NOTICE_COPY, canSaveSeverity, noticeFormSchema, noticeInputFromForm, type NoticeIntent } from "@/components/admin/notices/notice-form";
import { runAdminAction, type ActionState } from "@/lib/admin/actions";
import { verifyAdmin } from "@/lib/admin/dal";
import { rpc } from "@/lib/admin/rpc";

/*
 * 공지 저장, 게시, 내리기 (screens 10.14). One action for the three buttons:
 * `intent` decides the active flag. Critical notices need the owner; the
 * check runs here with the spec's copy, and backoffice_save_notice re-checks
 * it (42501). A stale version comes back as the DB's conflict message
 * ("다른 운영자가 …"), and the editor keeps what was typed.
 */

const SUCCESS: Record<NoticeIntent, string> = {
  draft: NOTICE_COPY.savedDraft,
  publish: NOTICE_COPY.published,
  end: NOTICE_COPY.ended,
};

/** fields: noticeId?, version?, title, body, audience, severity, linkUrl?, startsAt?, endsAt?, dismissible, intent, operationId */
export async function saveNoticeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAdminAction({
    minRole: "operator",
    formData: fd,
    schema: noticeFormSchema,
    call: async (input, operationId) => {
      const session = await verifyAdmin();
      if (!canSaveSeverity(session.role, input.severity)) {
        return { ok: false, error: { kind: "forbidden", message: NOTICE_COPY.criticalOwnerOnly } };
      }
      const result = await rpc.saveNotice({ ...noticeInputFromForm(input), operationId });
      return result.ok ? { ok: true, data: { ...result.data, intent: input.intent } } : result;
    },
    success: (data) => SUCCESS[data.intent],
    revalidate: ["/admin/notices"],
  });
}
