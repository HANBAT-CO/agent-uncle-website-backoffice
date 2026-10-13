"use client";

import { ArrowClockwiseIcon, WarningCircleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/admin/ui/button";

export const LIST_ERROR_MESSAGE = "목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.";

/**
 * Load failure (screens 9). "다시 시도" keeps the filters: a link to the same
 * URL (`retryHref`), the error boundary's reset (`onRetry`), or a refresh.
 */
export function ErrorState({
  message = LIST_ERROR_MESSAGE,
  retryHref,
  onRetry,
  className,
}: {
  message?: string;
  retryHref?: string;
  onRetry?: () => void;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const retry = () =>
    startTransition(() => {
      if (onRetry) onRetry();
      router.refresh();
    });

  return (
    <div
      role="alert"
      className={
        className ??
        "flex min-h-56 flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card/60 p-6 text-center"
      }
    >
      <span className="flex size-8 items-center justify-center rounded-md bg-status-attention-bg text-status-attention">
        <WarningCircleIcon aria-hidden weight="bold" className="size-4" />
      </span>
      <p className="max-w-sm text-sm text-foreground">{message}</p>
      {retryHref && !onRetry ? (
        <Button asChild variant="outline" size="lg">
          <Link href={retryHref}>
            <ArrowClockwiseIcon aria-hidden data-icon="inline-start" />
            다시 시도
          </Link>
        </Button>
      ) : (
        <Button variant="outline" size="lg" onClick={retry} disabled={pending}>
          <ArrowClockwiseIcon aria-hidden data-icon="inline-start" />
          {pending ? "다시 불러오는 중…" : "다시 시도"}
        </Button>
      )}
    </div>
  );
}
