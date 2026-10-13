"use client";

import { NotePencilIcon } from "@phosphor-icons/react";
import { usePathname } from "next/navigation";
import { useId } from "react";

import { KstTime } from "@/components/admin/common/KstTime";
import { ActionForm, useActionForm } from "@/components/admin/forms/ActionForm";
import { SubmitButton } from "@/components/admin/forms/SubmitButton";
import { Label } from "@/components/admin/ui/label";
import { Textarea } from "@/components/admin/ui/textarea";
import type { NoteTarget } from "@/lib/admin/rpc/enums";
import type { Note } from "@/lib/admin/rpc/schemas";
import { addNoteAction } from "@/lib/admin/shared-actions";

/**
 * 운영 메모 (spec D6): internal, permanent notes on a record. Operators and
 * owners write; viewers read. `authors` maps staff ids to display names
 * (backoffice_list_admins is readable by every role).
 */
export function NotesPanel({
  targetType,
  targetId,
  notes,
  canWrite,
  operationId,
  authors = {},
  title = "운영 메모",
}: {
  targetType: NoteTarget;
  targetId: string;
  notes: Note[];
  canWrite: boolean;
  operationId: string;
  authors?: Record<string, string>;
  title?: string;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-4">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold">
        <NotePencilIcon aria-hidden weight="bold" className="size-4 text-muted-foreground" />
        {title}
        <span className="num text-xs font-normal text-muted-foreground">{notes.length}건</span>
      </h2>
      {canWrite ? <NoteForm targetType={targetType} targetId={targetId} operationId={operationId} /> : null}
      {notes.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">아직 남긴 메모가 없어요</p>
      ) : (
        <ol className="flex flex-col divide-y rounded-md border bg-card">
          {notes.map((note) => (
            <li key={note.id} className="flex flex-col gap-1 px-3 py-2.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{authors[note.authorId] ?? "운영 계정"}</span>
                <KstTime iso={note.createdAt} />
              </div>
              <p className="text-sm whitespace-pre-wrap break-words">{note.body}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function NoteForm({ targetType, targetId, operationId }: { targetType: NoteTarget; targetId: string; operationId: string }) {
  const pathname = usePathname();
  return (
    <ActionForm action={addNoteAction} operationId={operationId} aria-label="메모 남기기" className="gap-2">
      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="targetId" value={targetId} />
      <input type="hidden" name="path" value={pathname} />
      <NoteFields />
    </ActionForm>
  );
}

function NoteFields() {
  const id = useId();
  const { fieldError } = useActionForm();
  const error = fieldError("body");
  return (
    <>
      <Label htmlFor={id} className="sr-only">
        메모
      </Label>
      <Textarea
        id={id}
        name="body"
        required
        maxLength={4000}
        rows={3}
        placeholder="확인한 내용과 다음 할 일을 적어 주세요."
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-hint`}
        className="text-sm"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          메모는 고치거나 지울 수 없어요. 개인정보는 적지 말아 주세요.
        </p>
        <SubmitButton>메모 남기기</SubmitButton>
      </div>
    </>
  );
}
