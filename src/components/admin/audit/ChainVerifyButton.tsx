"use client";

import { CheckCircleIcon, ShieldCheckIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useState, useTransition } from "react";

import { verifyChainAction, type ChainActionResult } from "@/app/(admin)/admin/(console)/audit/actions";
import { Button } from "@/components/admin/ui/button";
import { cn } from "@/lib/admin/utils";

import { chainMessage } from "./audit-format";

/**
 * 무결성 확인 (owner, screens 10.17): runs verify_audit_chain and shows the
 * success copy with the head hash, or the broken copy with the first bad id.
 */
export function ChainVerifyButton({ className }: { className?: string }) {
  const [result, setResult] = useState<ChainActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () =>
    startTransition(async () => {
      try {
        setResult(await verifyChainAction());
      } catch {
        setResult({ ok: "error", message: "잠시 후 다시 시도해 주세요." });
      }
    });

  const tone = result === null ? null : result.ok === true ? "ok" : "bad";

  return (
    <section aria-labelledby="chain-verify" className={cn("flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3", className)}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 id="chain-verify" className="text-sm font-semibold text-foreground">
          무결성 확인
        </h2>
        <p className="text-xs text-muted-foreground">감사 기록이 처음부터 끊김 없이 이어져 있는지 해시로 확인해요.</p>
        <div aria-live="polite" className="empty:hidden">
          {result ? (
            <p
              data-testid="chain-result"
              data-tone={tone}
              className={cn(
                "mt-2 flex items-start gap-1.5 rounded-md px-2.5 py-1.5 text-sm",
                tone === "ok" ? "bg-status-normal-bg text-status-normal" : "bg-status-attention-bg text-status-attention",
              )}
            >
              {tone === "ok" ? (
                <CheckCircleIcon aria-hidden weight="fill" className="mt-[0.2em] size-4 shrink-0" />
              ) : (
                <WarningCircleIcon aria-hidden weight="bold" className="mt-[0.2em] size-4 shrink-0" />
              )}
              <span className="break-all">{result.ok === "error" ? result.message : chainMessage(result)}</span>
            </p>
          ) : null}
        </div>
      </div>
      <Button type="button" variant="outline" size="lg" onClick={run} disabled={pending}>
        <ShieldCheckIcon aria-hidden data-icon="inline-start" />
        {pending ? "확인하는 중…" : "무결성 확인"}
      </Button>
    </section>
  );
}
