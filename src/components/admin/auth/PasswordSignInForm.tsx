"use client";

import { ArrowRightIcon } from "@phosphor-icons/react";
import { useActionState } from "react";

import { Button } from "@/components/admin/ui/button";
import { Input } from "@/components/admin/ui/input";
import { Label } from "@/components/admin/ui/label";
import { signInWithPasswordAction, type AuthFormState } from "@/lib/admin/auth/actions";

const initial: AuthFormState = { status: "idle" };

/** Staff sign-in with an ID and a password (the only console sign-in). */
export function PasswordSignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signInWithPasswordAction, initial);
  const failed = state.status === "error";

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="next" value={next} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="admin-id" className="text-sm">
          아이디
        </Label>
        <Input
          id="admin-id"
          name="id"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          defaultValue={state.id}
          aria-invalid={failed || undefined}
          aria-describedby={failed ? "admin-login-error" : undefined}
          className="h-12 rounded-lg bg-background/45 px-4 text-base md:text-sm"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="admin-password" className="text-sm">
          비밀번호
        </Label>
        <Input
          id="admin-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={failed || undefined}
          aria-describedby={failed ? "admin-login-error" : undefined}
          className="h-12 rounded-lg bg-background/45 px-4 text-base md:text-sm"
        />
      </div>
      <p id="admin-login-error" aria-live="polite" className="-mt-2 min-h-5 text-sm text-status-attention empty:hidden">
        {failed ? state.message : null}
      </p>
      <Button type="submit" size="lg" disabled={pending} className="mt-1 h-12 w-full justify-between rounded-lg px-4 text-sm">
        <span>{pending ? "로그인하는 중…" : "로그인"}</span>
        <ArrowRightIcon aria-hidden className="size-4" />
      </Button>
    </form>
  );
}
