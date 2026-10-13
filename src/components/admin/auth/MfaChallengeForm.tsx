"use client";

import { useActionState } from "react";

import { Button } from "@/components/admin/ui/button";
import { verifyTotpAction, type AuthFormState } from "@/lib/admin/auth/actions";

import { TotpCodeInput } from "./TotpCodeInput";

const initial: AuthFormState = { status: "idle" };

/** Sign-in with an enrolled TOTP factor: challenge and verify to reach aal2 (spec 5). */
export function MfaChallengeForm({ factorId, next }: { factorId: string; next: string }) {
  const [state, action, pending] = useActionState(verifyTotpAction, initial);
  const failed = state.status === "error";

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="factorId" value={factorId} />
      <input type="hidden" name="next" value={next} />
      <TotpCodeInput
        id="mfa-code"
        label="인증 앱의 6자리 코드를 입력해 주세요."
        error={failed ? state.message : undefined}
        autoFocus
      />
      <Button type="submit" size="lg" disabled={pending} className="h-10 w-full text-sm">
        {pending ? "확인하는 중…" : "확인"}
      </Button>
    </form>
  );
}
