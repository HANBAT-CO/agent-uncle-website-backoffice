"use client";

import { ArrowClockwiseIcon, CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/admin/ui/button";
import type { ActionState } from "@/lib/admin/actions";
import { cn } from "@/lib/admin/utils";

/**
 * The result line of an ActionForm, in an aria-live region.
 * - conflict (another operator saved first, or a replayed id): "최신 내용 불러오기"
 * - unauthenticated: a link back through the login page; the input stays
 */
export function FormMessage({ state, className }: { state: ActionState; className?: string }) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();

  return (
    <div aria-live="polite" className={cn("min-h-0 text-sm empty:hidden", className)}>
      {state.status === "success" ? (
        <p className="flex items-start gap-1.5 text-status-normal">
          <CheckCircleIcon aria-hidden weight="fill" className="mt-[0.2em] size-4 shrink-0" />
          <span>{state.message}</span>
        </p>
      ) : null}
      {state.status === "error" ? (
        <div role="alert" className="flex flex-col gap-2 rounded-md bg-status-attention-bg px-3 py-2 text-status-attention">
          <p className="flex items-start gap-1.5">
            <WarningCircleIcon aria-hidden weight="bold" className="mt-[0.2em] size-4 shrink-0" />
            <span>{state.message}</span>
          </p>
          {state.kind === "conflict" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start bg-card"
              disabled={refreshing}
              onClick={() => startTransition(() => router.refresh())}
            >
              <ArrowClockwiseIcon aria-hidden data-icon="inline-start" />
              {refreshing ? "불러오는 중…" : "최신 내용 불러오기"}
            </Button>
          ) : null}
          {state.kind === "unauthenticated" && state.loginHref ? (
            <a href={state.loginHref} className="self-start text-sm font-medium underline underline-offset-4">
              다시 로그인하기
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
