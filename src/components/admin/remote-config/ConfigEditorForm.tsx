"use client";

import { useId, useState } from "react";

import { ActionForm, useActionForm } from "@/components/admin/forms/ActionForm";
import { ConfirmDialog } from "@/components/admin/forms/ConfirmDialog";
import { SubmitButton } from "@/components/admin/forms/SubmitButton";
import { Button } from "@/components/admin/ui/button";
import { Label } from "@/components/admin/ui/label";
import { Textarea } from "@/components/admin/ui/textarea";
import type { ConfigRow } from "@/lib/admin/rpc/schemas";
import { setConfigAction } from "@/app/(admin)/admin/(console)/remote-config/actions";

import { ConfigDiff } from "./ConfigDiff";
import { configDiff } from "./config-forms";

export type TypedConfirmation = { title: string; description: string; typed: string };

/**
 * The shared half of every 원격 설정 editor (screens 10.15): the typed draft
 * serialized into one `value` field, the optimistic `version`, the before →
 * after diff, a required 사유, and save. App-wide changes go through a typed
 * confirmation first. A failure (for example a version conflict) keeps the
 * draft and the reason; "최신 내용 불러오기" refreshes the current value and
 * version underneath without touching what was typed.
 */
export function ConfigEditorForm({
  row,
  draft,
  invalid,
  confirmation,
  operationId,
  onSaved,
  children,
}: {
  row: ConfigRow;
  draft: unknown;
  invalid: boolean;
  confirmation: TypedConfirmation | null;
  operationId: string;
  onSaved: () => void;
  children: React.ReactNode;
}) {
  const formId = useId();
  const diff = configDiff(row.key, row.value, draft);

  return (
    <ActionForm
      id={formId}
      action={setConfigAction}
      operationId={operationId}
      onSuccess={onSaved}
      aria-label={`${row.key} 설정 변경`}
      className="gap-6"
    >
      <input type="hidden" name="key" value={row.key} />
      <input type="hidden" name="version" value={row.version} />
      <input type="hidden" name="value" value={JSON.stringify(draft)} />

      {children}

      <section aria-labelledby={`${formId}-diff`} data-testid="config-diff" className="flex flex-col gap-2 rounded-lg border bg-background/50 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 id={`${formId}-diff`} className="text-xs font-semibold text-foreground">
            변경 내용
          </h3>
          <span className="num text-xs text-muted-foreground" data-testid="config-version">
            버전 v{row.version}
          </span>
        </div>
        <ConfigDiff entries={diff} />
      </section>

      <ReasonField id={`${formId}-reason`} />

      <SaveControls formId={formId} disabled={invalid || diff.length === 0} confirmation={confirmation} />
    </ActionForm>
  );
}

function ReasonField({ id }: { id: string }) {
  const { fieldError } = useActionForm();
  const error = fieldError("reason");
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-sm">
        사유
      </Label>
      <Textarea
        id={id}
        name="reason"
        rows={2}
        maxLength={2000}
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-hint`}
        className="text-sm"
      />
      <p id={`${id}-hint`} className={error ? "text-xs text-status-attention" : "text-xs text-muted-foreground"}>
        {error ?? "5자 이상 적어 주세요. 사유와 운영자 이름이 감사 로그에 남아요."}
      </p>
    </div>
  );
}

function SaveControls({
  formId,
  disabled,
  confirmation,
}: {
  formId: string;
  disabled: boolean;
  confirmation: TypedConfirmation | null;
}) {
  const { pending } = useActionForm();
  const [open, setOpen] = useState(false);

  if (!confirmation) {
    return (
      <div className="flex justify-end">
        <SubmitButton disabled={disabled}>설정 저장</SubmitButton>
      </div>
    );
  }

  return (
    <div className="flex justify-end">
      <Button type="button" size="lg" disabled={disabled || pending} onClick={() => setOpen(true)}>
        {pending ? "저장하는 중…" : "설정 저장"}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={confirmation.title}
        description={confirmation.description}
        confirmLabel={confirmation.typed}
        typedConfirmation={confirmation.typed}
        destructive
        onConfirm={() => {
          const form = document.getElementById(formId);
          if (form instanceof HTMLFormElement) form.requestSubmit();
        }}
      />
    </div>
  );
}
