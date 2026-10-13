"use client";

import { Label } from "@/components/admin/ui/label";
import { Switch } from "@/components/admin/ui/switch";
import { cn } from "@/lib/admin/utils";

/*
 * Small controlled fields for the config editors. They hold no `name`: the
 * editor serializes its typed draft into the form's single `value` field.
 */

/** Issue messages of a zod result keyed by their path ('ios.minimum'), first one wins. */
export function issuesByPath(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }): Record<string, string> {
  const out: Record<string, string> = {};
  if (result.success || !result.error) return out;
  for (const issue of result.error.issues) {
    const key = issue.path.map(String).join(".");
    out[key] ??= issue.message;
  }
  return out;
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-xs text-status-attention">
      {message}
    </p>
  );
}

export function SwitchRow({
  id,
  label,
  hint,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 rounded-lg border bg-background/50 px-3 py-2.5", disabled && "opacity-70")}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        {hint ? (
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-0.5"
      />
    </div>
  );
}

/** "12 / 60" under a limited text field. */
export function Counter({ value, max }: { value: string; max: number }) {
  return (
    <span className={cn("num text-xs", value.length > max ? "text-status-attention" : "text-muted-foreground")}>
      {value.length} / {max}
    </span>
  );
}
