"use client";

import { ProhibitIcon } from "@phosphor-icons/react";
import { useId, useState } from "react";

import { ActionForm, useActionForm } from "@/components/admin/forms/ActionForm";
import { SubmitButton } from "@/components/admin/forms/SubmitButton";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/admin/ui/alert-dialog";
import { Button } from "@/components/admin/ui/button";
import { Label } from "@/components/admin/ui/label";
import { Textarea } from "@/components/admin/ui/textarea";

import { setAccountStatusAction } from "@/app/(admin)/admin/(console)/accounts/actions";

export const SUSPEND_USER_MESSAGE = "이용이 제한된 계정이에요. 고객센터로 문의해 주세요.";

/**
 * 이용 제한 (screens 10.7): an AlertDialog with the question, one line of
 * consequence, 사유 (내부용), 앱에 보일 안내 and "로그인도 막기". Business
 * records stay; the server guard refuses the account's writes at once.
 */
export function SuspendDialog({ accountId, operationId }: { accountId: string; operationId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" size="lg">
          <ProhibitIcon aria-hidden data-icon="inline-start" />
          이용 제한
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="sm:max-w-md">
        <ActionForm action={setAccountStatusAction} operationId={operationId} aria-label="이용 제한" onSuccess={() => setOpen(false)} className="gap-4">
          <input type="hidden" name="accountId" value={accountId} />
          <input type="hidden" name="status" value="suspended" />
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">이 계정의 이용을 제한할까요?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">요청과 채팅 기록은 그대로 남고, 이 계정은 앱에서 새 기록을 남길 수 없어요.</AlertDialogDescription>
          </AlertDialogHeader>
          <SuspendFields />
          <AlertDialogFooter>
            <CancelButton />
            <SubmitButton variant="destructive">이용 제한</SubmitButton>
          </AlertDialogFooter>
        </ActionForm>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function SuspendFields() {
  const id = useId();
  const { fieldError } = useActionForm();
  return (
    <div className="flex flex-col gap-3">
      <ReasonField id={`${id}-reason`} label="사유 (내부용)" error={fieldError("reason")} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-message`} className="text-sm">
          앱에 보일 안내
        </Label>
        <Textarea
          id={`${id}-message`}
          name="userMessage"
          defaultValue={SUSPEND_USER_MESSAGE}
          maxLength={300}
          rows={2}
          aria-invalid={fieldError("userMessage") ? true : undefined}
          className="text-sm"
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="banLogin" defaultChecked className="size-4 accent-(--primary)" />
        로그인도 막기
      </label>
    </div>
  );
}

export function ReasonField({ id, label, error }: { id: string; label: string; error?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
      <Textarea
        id={id}
        name="reason"
        required
        minLength={5}
        maxLength={2000}
        rows={2}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-hint`}
        className="text-sm"
      />
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        5자 이상 적어 주세요. 감사 로그에 남아요.
      </p>
    </div>
  );
}

export function CancelButton() {
  const { pending } = useActionForm();
  return (
    <AlertDialogCancel type="button" disabled={pending} size="lg">
      닫기
    </AlertDialogCancel>
  );
}
