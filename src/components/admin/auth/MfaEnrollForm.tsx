"use client";

import { CopyIcon } from "@phosphor-icons/react";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/admin/ui/button";
import { Skeleton } from "@/components/admin/ui/skeleton";
import { enrollTotpAction, verifyTotpAction, type AuthFormState, type EnrollTotpResult } from "@/lib/admin/auth/actions";

import { AuthNotice } from "./AuthNotice";
import { TotpCodeInput } from "./TotpCodeInput";

const initial: AuthFormState = { status: "idle" };

type Enrolment = { status: "loading" } | EnrollTotpResult;

function StepTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
      <span aria-hidden className="grid size-5 place-items-center rounded-full bg-secondary text-[0.6875rem] font-bold text-secondary-foreground num">
        {n}
      </span>
      {children}
    </p>
  );
}

/**
 * TOTP enrolment (spec 5, screens 10.2): a fresh factor's QR code and key,
 * then the first code, which verifies the factor and lifts the session to aal2.
 * The factor is created on mount, never during a server render or prefetch.
 */
export function MfaEnrollForm({ next }: { next: string }) {
  const [enrolment, setEnrolment] = useState<Enrolment>({ status: "loading" });
  const [copied, setCopied] = useState(false);
  const [state, action, pending] = useActionState(verifyTotpAction, initial);
  const started = useRef(false);

  const start = useCallback(() => {
    enrollTotpAction().then(setEnrolment, () => setEnrolment({ ok: false, message: "잠시 후 다시 시도해 주세요." }));
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    start();
  }, [start]);

  function retry() {
    setEnrolment({ status: "loading" });
    start();
  }

  if ("ok" in enrolment && !enrolment.ok) {
    return (
      <div className="flex flex-col gap-4">
        <AuthNotice tone="attention">{enrolment.message}</AuthNotice>
        <Button type="button" variant="outline" size="lg" className="h-10 text-sm" onClick={retry}>
          다시 시도
        </Button>
      </div>
    );
  }

  const ready = "ok" in enrolment && enrolment.ok ? enrolment : null;

  async function copySecret() {
    if (!ready) return;
    try {
      await navigator.clipboard.writeText(ready.secret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <form action={action} className="flex flex-col gap-6" aria-busy={!ready}>
      <input type="hidden" name="factorId" value={ready?.factorId ?? ""} />
      <input type="hidden" name="next" value={next} />
      <ol className="flex flex-col gap-6">
        <li className="flex flex-col gap-3">
          <StepTitle n={1}>인증 앱으로 QR 코드를 찍어 주세요</StepTitle>
          {ready ? (
            // eslint-disable-next-line @next/next/no-img-element -- data: URI from the MFA API, nothing to optimise
            <img
              src={ready.qrSvg}
              alt="2단계 인증 등록용 QR 코드"
              width={168}
              height={168}
              className="size-42 rounded-md bg-white p-2 ring-1 ring-foreground/10"
            />
          ) : (
            <Skeleton className="size-42 rounded-md" />
          )}
        </li>
        <li className="flex flex-col gap-3">
          <StepTitle n={2}>직접 입력할 키</StepTitle>
          {ready ? (
            <div className="flex items-stretch gap-2">
              <code className="min-w-0 flex-1 rounded-md bg-muted px-3 py-2 font-mono text-xs/relaxed break-all text-foreground select-all">
                {ready.secret}
              </code>
              <Button type="button" variant="outline" className="h-auto px-3 text-xs" onClick={() => void copySecret()}>
                <CopyIcon aria-hidden className="size-3.5" />
                {copied ? "복사했어요" : "복사"}
              </Button>
            </div>
          ) : (
            <Skeleton className="h-9 w-full rounded-md" />
          )}
        </li>
        <li className="flex flex-col gap-3">
          <StepTitle n={3}>앱에 표시된 6자리 코드</StepTitle>
          <TotpCodeInput id="mfa-enroll-code" label="6자리 코드" error={state.status === "error" ? state.message : undefined} />
        </li>
      </ol>
      <Button type="submit" size="lg" disabled={!ready || pending} className="h-10 w-full text-sm">
        {pending ? "등록하는 중…" : "등록하고 계속하기"}
      </Button>
      {!ready ? <p className="sr-only" aria-live="polite">QR 코드를 만드는 중…</p> : null}
    </form>
  );
}
