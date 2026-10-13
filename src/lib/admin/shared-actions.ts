"use server";

import { z } from "zod";

import { runAdminAction, type ActionState } from "./actions";
import { requireRole, verifyAdmin } from "./dal";
import { CASE_SEVERITIES, CASE_STATUSES, CASE_TARGETS, NOTE_TARGETS, rpc, type SearchResult } from "./rpc";
import { safeNext } from "./session";
import { createAdminServerClient } from "./supabase/server";

/*
 * Server Actions shared by several screens (notes, cases, audited file
 * access, search). Every export is reachable by a direct POST, so each one
 * re-checks the session and role itself (runAdminAction / verifyAdmin).
 */

const SIGNED_URL_SECONDS = 60;
const REASON_MIN = 5;

/** The console page to refresh after a write; anything else falls back to nothing. */
const pathField = z
  .string()
  .optional()
  .transform((value) => (value && value.startsWith("/admin") ? safeNext(value).split("?")[0] : undefined));

const optionalUuid = z
  .string()
  .optional()
  .transform((value) => (value ? value : undefined))
  .pipe(z.uuid("담당자를 다시 선택해 주세요.").optional());

const optionalText = (max: number, message: string) =>
  z
    .string()
    .optional()
    .transform((value) => value?.trim() ?? "")
    .pipe(z.string().max(max, message));

const noteSchema = z.object({
  targetType: z.enum(NOTE_TARGETS),
  targetId: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1, "메모를 입력해 주세요.").max(4000, "메모는 4,000자 이하로 입력해 주세요."),
  path: pathField,
});

/** fields: targetType, targetId, body, operationId, path */
export async function addNoteAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAdminAction({
    minRole: "operator",
    formData: fd,
    schema: noteSchema,
    call: (input, operationId) => rpc.addNote({ targetType: input.targetType, targetId: input.targetId, body: input.body, operationId }),
    success: "메모를 남겼어요",
    revalidate: (input) => (input.path ? [input.path] : []),
  });
}

const openCaseSchema = z.object({
  targetType: z.enum(CASE_TARGETS),
  targetId: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1, "케이스 제목을 입력해 주세요.").max(120, "케이스 제목은 120자 이하로 입력해 주세요."),
  severity: z.enum(CASE_SEVERITIES).default("normal"),
  assigneeId: optionalUuid,
  note: optionalText(4000, "메모는 4,000자 이하로 입력해 주세요."),
  path: pathField,
});

/** fields: targetType, targetId, title, severity, assigneeId?, note?, operationId, path */
export async function openCaseAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAdminAction({
    minRole: "operator",
    formData: fd,
    schema: openCaseSchema,
    call: (input, operationId) =>
      rpc.openCase({
        targetType: input.targetType,
        targetId: input.targetId,
        title: input.title,
        severity: input.severity,
        assigneeId: input.assigneeId,
        note: input.note || undefined,
        operationId,
      }),
    success: "케이스를 열었어요",
    revalidate: (input) => (input.path ? [input.path] : []),
  });
}

const updateCaseSchema = z.object({
  caseId: z.uuid(),
  version: z.coerce.number().int().min(0),
  status: z.enum(CASE_STATUSES).optional(),
  severity: z.enum(CASE_SEVERITIES).optional(),
  assigneeId: z.union([z.literal(""), z.literal("none"), z.uuid("담당자를 다시 선택해 주세요.")]).optional(),
  note: optionalText(4000, "메모는 4,000자 이하로 입력해 주세요."),
  path: pathField,
});

/**
 * fields: caseId, version, status?, severity?, assigneeId? ('' or 'none' clears
 * the assignee, a UUID sets it, absent keeps it), note?, operationId, path
 */
export async function updateCaseAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAdminAction({
    minRole: "operator",
    formData: fd,
    schema: updateCaseSchema,
    call: (input, operationId) => {
      const clear = input.assigneeId === "" || input.assigneeId === "none";
      const assigneeId = clear ? undefined : input.assigneeId;
      return rpc.updateCase({
        caseId: input.caseId,
        version: input.version,
        status: input.status,
        severity: input.severity,
        assigneeId,
        clearAssignee: clear || undefined,
        note: input.note || undefined,
        operationId,
      });
    },
    success: "케이스를 변경했어요",
    revalidate: (input) => (input.path ? [input.path] : []),
  });
}

export type OpenAttachmentResult =
  | { ok: true; url: string; mime: string; name: string | null; expiresAt: string }
  | { ok: false; message: string };

/**
 * Audited file access (spec 7): backoffice_attachment_access writes the
 * attachment.view row with the reason, then the storage policy lets the same
 * staff member sign the object for 60 s. The URL never goes into the page
 * HTML; render it with referrerPolicy="no-referrer".
 */
export async function openAttachmentAction(attachmentId: string, reason: string): Promise<OpenAttachmentResult> {
  const session = await requireRole("operator");
  if (!session) return { ok: false, message: "운영자 이상만 파일을 열람할 수 있어요." };
  const why = typeof reason === "string" ? reason.trim() : "";
  if (why.length < REASON_MIN || why.length > 2000) return { ok: false, message: "열람 사유를 5자 이상 입력해 주세요." };
  if (typeof attachmentId !== "string" || attachmentId.length === 0 || attachmentId.length > 200) {
    return { ok: false, message: "첨부파일을 찾을 수 없어요." };
  }

  const access = await rpc.attachmentAccess(attachmentId, why);
  if (!access.ok) return { ok: false, message: access.error.message };

  const supabase = await createAdminServerClient();
  const { data, error } = await supabase.storage.from(access.data.bucket).createSignedUrl(access.data.path, SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) return { ok: false, message: "파일을 열지 못했어요. 잠시 후 다시 시도해 주세요." };
  return {
    ok: true,
    url: data.signedUrl,
    mime: access.data.mime ?? "application/octet-stream",
    name: access.data.name,
    expiresAt: new Date(Date.now() + SIGNED_URL_SECONDS * 1000).toISOString(),
  };
}

function searchTerm(q: unknown): string | null {
  if (typeof q !== "string") return null;
  const term = q.trim();
  return term.length >= 1 && term.length <= 100 ? term : null;
}

/** ⌘K palette: accounts, requests and leads (viewers cannot search contact data; the SQL decides). */
export async function searchAction(q: string): Promise<SearchResult | null> {
  await verifyAdmin();
  const term = searchTerm(q);
  if (!term) return null;
  const result = await rpc.search(term, 5);
  return result.ok ? result.data : null;
}

/** 거래처 combobox (requests filter): accounts only. */
export async function searchAccountsAction(q: string): Promise<{ id: string; name: string; role: string | null }[]> {
  await verifyAdmin();
  const term = searchTerm(q);
  if (!term) return [];
  const result = await rpc.search(term, 8);
  if (!result.ok) return [];
  return result.data.accounts.map((account) => ({ id: account.id, name: account.name || account.businessName || account.id, role: account.role }));
}
