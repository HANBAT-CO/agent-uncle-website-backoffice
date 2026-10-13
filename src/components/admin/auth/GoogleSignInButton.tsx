"use client";

import { GoogleLogoIcon } from "@phosphor-icons/react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/admin/ui/button";
import { signInWithGoogleAction } from "@/lib/admin/auth/actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="h-10 w-full gap-2 text-sm">
      <GoogleLogoIcon aria-hidden weight="bold" className="size-4" />
      {pending ? "Google로 이동하는 중…" : "Google 계정으로 로그인"}
    </Button>
  );
}

/** Production sign-in (spec 5): Google OAuth with PKCE, account picker every time. */
export function GoogleSignInButton({ next }: { next: string }) {
  return (
    <form action={signInWithGoogleAction}>
      <input type="hidden" name="next" value={next} />
      <Submit />
    </form>
  );
}
