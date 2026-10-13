"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/admin/states/ErrorState";

/**
 * A console screen failed to render (tasks appendix WP-04). The shell stays;
 * "다시 시도" re-fetches and re-renders the segment (Next 16 `retry`).
 */
export default function ConsoleError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[backoffice] console screen failed", error.digest ?? error.message);
  }, [error]);

  return <ErrorState message="화면을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." onRetry={retry} className="flex min-h-[50vh] flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card/60 p-8 text-center" />;
}
