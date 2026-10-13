"use client";

import { createContext, startTransition, use, useActionState, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import type { ActionState } from "@/lib/admin/actions";
import { newOperationId } from "@/lib/admin/operation-id";
import { cn } from "@/lib/admin/utils";

import { FormMessage } from "./FormMessage";

/*
 * Every staff write goes through an ActionForm (screens 9, Review Focus 1-2):
 * - a hidden `operationId` rendered by the Server Component; after a success
 *   the revalidated page delivers a fresh one, and if it does not (no
 *   revalidation) the form rotates to a client UUID so the next, different
 *   submit is never refused as a replay;
 * - submit is intercepted so React never auto-resets the form: a failure keeps
 *   every typed value, a success resets it (unless resetOnSuccess=false);
 * - the result shows in an aria-live line (FormMessage) and, on success, a toast.
 */

export type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

const IDLE: ActionState = { status: "idle" };

type ActionFormContextValue = { state: ActionState; pending: boolean };
const ActionFormContext = createContext<ActionFormContextValue | null>(null);

/** State of the enclosing ActionForm (pending, last result, field errors). */
export function useActionForm(): ActionFormContextValue & { fieldError: (name: string) => string | undefined } {
  const value = use(ActionFormContext) ?? { state: IDLE, pending: false };
  return {
    ...value,
    fieldError: (name) => (value.state.status === "error" ? value.state.fieldErrors?.[name] : undefined),
  };
}

export function ActionForm({
  action,
  operationId,
  children,
  successMessage,
  onSuccess,
  resetOnSuccess = true,
  showMessage = true,
  id,
  className,
  "aria-label": ariaLabel,
}: {
  action: FormAction;
  operationId: string;
  children: React.ReactNode;
  successMessage?: string;
  onSuccess?: (state: Extract<ActionState, { status: "success" }>) => void;
  resetOnSuccess?: boolean;
  showMessage?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  // Ids this form already used successfully, and the client-side replacement.
  const [ops, setOps] = useState<{ used: string[]; local: string }>({ used: [], local: "" });
  const currentId = ops.used.includes(operationId) && ops.local ? ops.local : operationId;

  const [state, dispatch, pending] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const next = await action(prev, formData);
    if (next.status !== "success") return next;
    const used = String(formData.get("operationId") ?? "");
    setOps((current) => ({ used: [...current.used, used].slice(-20), local: newOperationId() }));
    const result = successMessage ? { ...next, message: successMessage } : next;
    toast.success(result.message);
    if (resetOnSuccess) formRef.current?.reset();
    onSuccess?.(result);
    return result;
  }, IDLE);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => dispatch(formData));
  };

  return (
    <ActionFormContext value={{ state, pending }}>
      <form
        ref={formRef}
        id={id}
        onSubmit={onSubmit}
        aria-label={ariaLabel}
        aria-busy={pending || undefined}
        className={cn("flex flex-col gap-4", className)}
      >
        <input type="hidden" name="operationId" value={currentId} />
        {children}
        {showMessage ? <FormMessage state={state} /> : null}
      </form>
    </ActionFormContext>
  );
}
