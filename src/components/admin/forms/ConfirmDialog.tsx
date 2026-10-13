"use client";

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
import { Input } from "@/components/admin/ui/input";
import { Label } from "@/components/admin/ui/label";

/**
 * Destructive or app-wide actions (screens 9): a question plus one line of
 * consequence. Risky config adds a typed confirmation (e.g. "점검 시작").
 * The confirm button either submits an ActionForm by id (`formId`, the form
 * may live outside the dialog) or runs `onConfirm`.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  pendingLabel = "처리하는 중…",
  typedConfirmation,
  destructive = false,
  formId,
  onConfirm,
  pending: pendingProp = false,
  children,
  open: openProp,
  onOpenChange,
}: {
  trigger?: React.ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel?: string;
  typedConfirmation?: string;
  destructive?: boolean;
  formId?: string;
  onConfirm?: () => Promise<void> | void;
  pending?: boolean;
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const fieldId = useId();
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const [typed, setTyped] = useState("");
  const [running, startTransition] = useTransition();
  const pending = pendingProp || running;
  const confirmed = !typedConfirmation || typed.trim() === typedConfirmation;

  const setOpen = (next: boolean) => {
    if (openProp === undefined) setOpenState(next);
    onOpenChange?.(next);
    if (next) setTyped("");
  };

  const run = () => {
    if (!onConfirm || !confirmed) return;
    startTransition(async () => {
      await onConfirm();
      setOpen(false);
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
        {children}
        {typedConfirmation ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor={fieldId} className="text-sm">
              확인하려면 &ldquo;{typedConfirmation}&rdquo;을(를) 입력해 주세요.
            </Label>
            <Input
              id={fieldId}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="h-9 text-sm"
            />
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending} size="lg">
            닫기
          </AlertDialogCancel>
          {formId ? (
            <Button type="submit" form={formId} size="lg" variant={destructive ? "destructive" : "default"} disabled={!confirmed || pending}>
              {pending ? pendingLabel : confirmLabel}
            </Button>
          ) : (
            <Button type="button" size="lg" variant={destructive ? "destructive" : "default"} disabled={!confirmed || pending} onClick={run}>
              {pending ? pendingLabel : confirmLabel}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
