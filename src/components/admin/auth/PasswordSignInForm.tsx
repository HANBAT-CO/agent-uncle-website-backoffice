"use client";

import { useActionState } from "react";

import { Button } from "@/components/admin/ui/button";
import { Input } from "@/components/admin/ui/input";
import { Label } from "@/components/admin/ui/label";
import { signInWithPasswordAction, type AuthFormState } from "@/lib/admin/auth/actions";

const initial: AuthFormState = { status: "idle" };

/** Local sign-in for the seeded staff (target=local only; the action refuses otherwise). */
export function PasswordSignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signInWithPasswordAction, initial);
  const failed = state.status === "error";

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="admin-email" className="text-sm">
          이메일
        </Label>
        <Input
          id="admin-email"
          name="email"
          type="email"
          autoComplete="username"
          spellCheck={false}
          required
          defaultValue={state.email}
          aria-invalid={failed || undefined}
          aria-describedby={failed ? "admin-login-error" : undefined}
          className="h-10 px-3 text-sm md:text-sm"
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
          className="h-10 px-3 text-sm md:text-sm"
        />
      </div>
      <p id="admin-login-error" aria-live="polite" className="-mt-2 min-h-5 text-sm text-status-attention empty:hidden">
        {failed ? state.message : null}
      </p>
      <Button type="submit" size="lg" disabled={pending} className="h-10 w-full text-sm">
        {pending ? "로그인하는 중…" : "로그인"}
      </Button>
      <p className="text-xs/relaxed text-muted-foreground">로컬 테스트 계정만 쓸 수 있어요.</p>
    </form>
  );
}
