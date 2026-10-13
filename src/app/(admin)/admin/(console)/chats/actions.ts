"use server";

import { CHAT_COPY, isPairId } from "@/components/admin/chats/transcript";
import { requireRole } from "@/lib/admin/dal";
import { rpc, type Conversation } from "@/lib/admin/rpc";

/*
 * 채팅 열람 transcript (spec D7, 7; screens 10.13). backoffice_get_conversation
 * checks operator+ and the reason, masks phone numbers and writes the
 * conversation.view audit row. The result goes straight back to the caller's
 * client state: no revalidation, no redirect, no logging, so the transcript
 * never reaches a URL, the RSC payload of a page or the server log.
 */

/** Messages per page; "이전 대화 더 보기" asks for the next older page. */
const PAGE_SIZE = 50;
const REASON_MIN = 5;
const REASON_MAX = 2000;

export type OpenConversationResult = { ok: true; data: Conversation } | { ok: false; message: string };

export async function openConversationAction(a: string, b: string, reason: string, before?: string): Promise<OpenConversationResult> {
  const session = await requireRole("operator");
  if (!session) return { ok: false, message: CHAT_COPY.viewerTooltip };
  if (!isPairId(a) || !isPairId(b) || a === b) return { ok: false, message: "대화 당사자를 확인해 주세요." };

  const why = typeof reason === "string" ? reason.trim() : "";
  if (why.length < REASON_MIN) return { ok: false, message: "사유를 5자 이상 입력해 주세요." };
  if (why.length > REASON_MAX) return { ok: false, message: "사유는 2,000자 이하로 입력해 주세요." };

  let cursor: string | undefined;
  if (before !== undefined && before !== null) {
    if (typeof before !== "string" || before.length > 40 || Number.isNaN(Date.parse(before))) {
      return { ok: false, message: "이전 대화를 불러오지 못했어요. 다시 열람해 주세요." };
    }
    cursor = before;
  }

  const result = await rpc.getConversation({ a, b, reason: why, before: cursor, limit: PAGE_SIZE });
  if (!result.ok) {
    const message = result.error.kind === "unknown" ? "대화를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." : result.error.message;
    return { ok: false, message };
  }
  return { ok: true, data: result.data };
}
