"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/admin/ui/button";
import { signOutAction } from "@/lib/admin/auth/actions";
import { cn } from "@/lib/admin/utils";

function Submit({
  label,
  variant,
  className,
}: {
  label: string;
  variant: React.ComponentProps<typeof Button>["variant"];
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} className={className}>
      {pending ? "로그아웃하는 중…" : label}
    </Button>
  );
}

/**
 * 로그아웃 (this browser, scope local) or 모든 기기에서 로그아웃 (scope global),
 * spec 5. Also used as "다른 계정으로 로그인" on the MFA screen.
 */
export function SignOutButton({
  scope = "local",
  label = "로그아웃",
  variant = "outline",
  className,
  formClassName,
}: {
  scope?: "local" | "global";
  label?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  className?: string;
  formClassName?: string;
}) {
  return (
    <form action={signOutAction} className={formClassName}>
      <input type="hidden" name="scope" value={scope} />
      <Submit label={label} variant={variant} className={cn(className)} />
    </form>
  );
}
