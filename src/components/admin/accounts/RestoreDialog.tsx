"use client";

import { useId, useState } from "react";

import { ActionForm, useActionForm } from "@/components/admin/forms/ActionForm";
import { SubmitButton } from "@/components/admin/forms/SubmitButton";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/admin/ui/alert-dialog";
import { Button } from "@/components/admin/ui/button";

import { setAccountStatusAction } from "@/app/(admin)/admin/(console)/accounts/actions";

import { CancelButton, ReasonField } from "./SuspendDialog";

/**
 * 이용 재개: "이용을 다시 허용할까요?" with 사유. Lifting the suspension also
 * lifts the login ban this layer set.
 */
export function RestoreDialog({ accountId, operationId }: { accountId: string; operationId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" size="lg">
          이용 재개
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="sm:max-w-md">
        <ActionForm action={setAccountStatusAction} operationId={operationId} aria-label="이용 재개" onSuccess={() => setOpen(false)} className="gap-4">
          <input type="hidden" name="accountId" value={accountId} />
          <input type="hidden" name="status" value="active" />
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">이용을 다시 허용할까요?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">제한하면서 막은 로그인도 함께 풀려요.</AlertDialogDescription>
          </AlertDialogHeader>
          <RestoreFields />
          <AlertDialogFooter>
            <CancelButton />
            <SubmitButton>이용 재개</SubmitButton>
          </AlertDialogFooter>
        </ActionForm>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RestoreFields() {
  const id = useId();
  const { fieldError } = useActionForm();
  return <ReasonField id={`${id}-reason`} label="사유" error={fieldError("reason")} />;
}
