"use client";

import { useId, useState } from "react";

import { revokeAdminAction } from "@/app/(admin)/admin/(console)/admins/actions";
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

/** "해제" (screens 10.18): the question, its consequence and a 사유. */
export function RevokeDialog({ userId, name, operationId }: { userId: string; name: string; operationId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="text-status-attention hover:bg-status-attention-bg" aria-label={`${name} 해제`}>
          해제
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="sm:max-w-md">
        <ActionForm action={revokeAdminAction} operationId={operationId} onSuccess={() => setOpen(false)} aria-label="운영 계정 해제">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">이 운영 계정을 해제할까요?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">로그인은 되지만 모든 운영 화면과 작업이 바로 막혀요.</AlertDialogDescription>
          </AlertDialogHeader>
          <input type="hidden" name="userId" value={userId} />
          <p className="text-sm text-foreground">
            해제할 계정: <span className="font-semibold">{name}</span>
          </p>
          <ReasonField />
          <AlertDialogFooter>
            <AlertDialogCancel size="lg">닫기</AlertDialogCancel>
            <SubmitButton variant="destructive" pendingLabel="해제하는 중…">
              해제
            </SubmitButton>
          </AlertDialogFooter>
        </ActionForm>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ReasonField() {
  const id = useId();
  const { fieldError } = useActionForm();
  const error = fieldError("reason");
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-sm">
        사유
      </Label>
      <Textarea id={id} name="reason" rows={3} maxLength={2000} required aria-invalid={error ? true : undefined} className="text-sm" />
      <p className={error ? "text-xs text-status-attention" : "text-xs text-muted-foreground"}>{error ?? "5자 이상 적어 주세요. 감사 로그에 남아요."}</p>
    </div>
  );
}
