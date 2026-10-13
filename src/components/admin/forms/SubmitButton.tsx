"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/admin/ui/button";

import { useActionForm } from "./ActionForm";

/** Submit for an ActionForm; reads "저장하는 중…" while the action runs (screens 9). */
export function SubmitButton({
  children,
  pendingLabel = "저장하는 중…",
  disabled,
  ...props
}: React.ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending: actionPending } = useActionForm();
  const { pending: formPending } = useFormStatus();
  const pending = actionPending || formPending;
  return (
    <Button type="submit" size="lg" disabled={pending || disabled} aria-disabled={pending || disabled || undefined} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
