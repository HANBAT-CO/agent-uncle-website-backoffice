"use client";

import { WarningCircleIcon } from "@phosphor-icons/react";
import { useId, useState, useTransition } from "react";

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

export const REASON_MIN_LENGTH = 5;
export const REASON_TOO_SHORT = "사유를 5자 이상 입력해 주세요.";

/**
 * Reason-gated access (spec 7, screens 10.7, 10.9, 10.13): a question, the
 * line about the audit log, and a 사유 of at least 5 characters. `onConfirm`
 * returns an error message to keep the dialog open, or nothing to close it.
 */
export function ReasonDialog({
  trigger,
  title,
  description = "열람 사유와 운영자 이름이 감사 로그에 남아요.",
  defaultReason = "",
  confirmLabel = "열람하기",
  pendingLabel = "여는 중…",
  onConfirm,
  open: openProp,
  onOpenChange,
}: {
  trigger?: React.ReactNode;
  title: string;
  description?: string;
  defaultReason?: string;
  confirmLabel?: string;
  pendingLabel?: string;
  onConfirm: (reason: string) => Promise<string | void> | string | void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const fieldId = useId();
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const [reason, setReason] = useState(defaultReason);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const setOpen = (next: boolean) => {
    if (openProp === undefined) setOpenState(next);
    onOpenChange?.(next);
    if (next) {
      setReason(defaultReason);
      setError(null);
    }
  };

  const confirm = () => {
    const trimmed = reason.trim();
    if (trimmed.length < REASON_MIN_LENGTH) {
      setError(REASON_TOO_SHORT);
      return;
    }
    setError(null);
    startTransition(async () => {
      const failure = await onConfirm(trimmed);
      if (failure) setError(failure);
      else setOpen(false);
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={(next) => (pending ? undefined : setOpen(next))}>
      {trigger ? <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger> : null}
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-sm">{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor={fieldId} className="text-sm">
            사유
          </Label>
          <Textarea
            id={fieldId}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={2000}
            rows={3}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${fieldId}-hint`}
            className="text-sm"
          />
          <p id={`${fieldId}-hint`} aria-live="polite" className={error ? "flex items-start gap-1.5 text-sm text-status-attention" : "text-xs text-muted-foreground"}>
            {error ? <WarningCircleIcon aria-hidden weight="bold" className="mt-[0.2em] size-4 shrink-0" /> : null}
            {error ?? "5자 이상 적어 주세요."}
          </p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending} size="lg">
            닫기
          </AlertDialogCancel>
          <Button type="button" size="lg" onClick={confirm} disabled={pending}>
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
