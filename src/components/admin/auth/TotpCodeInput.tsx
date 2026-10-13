import { Input } from "@/components/admin/ui/input";
import { Label } from "@/components/admin/ui/label";

/** The 6-digit code field shared by the MFA challenge and enrolment (screens 10.2). */
export function TotpCodeInput({
  id,
  label,
  error,
  autoFocus,
}: {
  id: string;
  label: string;
  error?: string;
  autoFocus?: boolean;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="text-sm leading-snug">
        {label}
      </Label>
      <Input
        id={id}
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        autoFocus={autoFocus}
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="h-11 px-3 text-lg tracking-[0.4em] num md:text-lg"
      />
      <p id={errorId} aria-live="polite" className="min-h-5 text-sm text-status-attention empty:hidden">
        {error ?? null}
      </p>
    </div>
  );
}
