"use client";

import { useId, useState } from "react";

import { ActionForm, useActionForm } from "@/components/admin/forms/ActionForm";
import { SubmitButton } from "@/components/admin/forms/SubmitButton";
import { Label } from "@/components/admin/ui/label";
import { Textarea } from "@/components/admin/ui/textarea";
import { cn } from "@/lib/admin/utils";

import { reviewDocumentAction } from "@/app/(admin)/admin/(console)/accounts/actions";

import { REVIEW_CHECKS, REVIEW_DECISION_LABEL, type ReviewDecisionKey as Decision } from "./review";

/**
 * 서류 review form (screens 10.7). "확인함" stays disabled until this page
 * opened the original file (the server also requires an audited open by the
 * same person within 24 hours). "앱에 보일 안내" is required for 재제출 요청.
 */
export function DocumentReviewForm({
  accountId,
  documentId,
  operationId,
  documentOpened,
}: {
  accountId: string;
  documentId: string;
  operationId: string;
  documentOpened: boolean;
}) {
  return (
    <ActionForm action={reviewDocumentAction} operationId={operationId} aria-label="서류 검토" className="gap-4 rounded-xl border bg-card p-4">
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="documentId" value={documentId} />
      <ReviewFields documentOpened={documentOpened} />
    </ActionForm>
  );
}

function ReviewFields({ documentOpened }: { documentOpened: boolean }) {
  const id = useId();
  const { fieldError, state } = useActionForm();
  const [decision, setDecision] = useState<Decision | null>(null);
  const [lastState, setLastState] = useState(state);
  // A saved review resets the form (ActionForm calls form.reset()), so the
  // controlled radio follows.
  if (state !== lastState) {
    setLastState(state);
    if (state.status === "success") setDecision(null);
  }
  const messageError = fieldError("userMessage");

  return (
    <>
      <h3 className="text-sm font-semibold">검토 결과</h3>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-xs text-muted-foreground">결과</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(REVIEW_DECISION_LABEL) as Decision[]).map((value) => {
            const disabled = value === "verified" && !documentOpened;
            return (
              <label
                key={value}
                className={cn(
                  "flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-background/60 px-3 text-sm has-checked:border-primary has-checked:bg-secondary has-checked:font-semibold has-checked:text-secondary-foreground",
                  disabled && "cursor-not-allowed opacity-50",
                )}
              >
                <input
                  type="radio"
                  name="decision"
                  value={value}
                  required
                  disabled={disabled}
                  checked={decision === value}
                  onChange={() => setDecision(value)}
                  aria-describedby={value === "verified" ? `${id}-verified-hint` : undefined}
                  className="size-4 accent-(--primary)"
                />
                {REVIEW_DECISION_LABEL[value]}
              </label>
            );
          })}
        </div>
        {!documentOpened ? (
          <p id={`${id}-verified-hint`} className="text-xs text-muted-foreground">
            먼저 서류 원본을 열람해 주세요
          </p>
        ) : null}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-message`} className="text-sm">
          앱에 보일 안내
        </Label>
        <Textarea
          id={`${id}-message`}
          name="userMessage"
          maxLength={300}
          rows={2}
          required={decision === "rejected"}
          placeholder={decision === "rejected" ? "다시 제출할 때 확인할 점을 적어 주세요." : undefined}
          aria-invalid={messageError ? true : undefined}
          aria-describedby={`${id}-message-hint`}
          className="text-sm"
        />
        <p id={`${id}-message-hint`} className="text-xs text-muted-foreground">
          재제출 요청일 때 꼭 적어 주세요. 300자까지 쓸 수 있어요.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-note`} className="text-sm">
          내부 메모
        </Label>
        <Textarea id={`${id}-note`} name="internalNote" maxLength={2000} rows={2} aria-describedby={`${id}-note-hint`} className="text-sm" />
        <p id={`${id}-note-hint`} className="text-xs text-muted-foreground">
          사용자에게는 보이지 않아요. 2,000자까지 쓸 수 있어요.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-xs text-muted-foreground">확인한 항목</legend>
        {REVIEW_CHECKS.map((check) => (
          <label key={check.name} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name={check.name} className="size-4 accent-(--primary)" />
            {check.label}
          </label>
        ))}
      </fieldset>

      <SubmitButton className="self-end">검토 결과 저장</SubmitButton>
    </>
  );
}
