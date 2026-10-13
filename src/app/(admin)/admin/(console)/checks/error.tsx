"use client";

import { useEffect } from "react";

import { ErrorState, LIST_ERROR_MESSAGE } from "@/components/admin/states/ErrorState";

/** 운영 점검 failed to render: the list error copy plus "다시 시도" (Next 16 `retry`). The shell stays. */
export default function ChecksError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[backoffice] checks failed", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold tracking-tight text-foreground">운영 점검</h1>
      <ErrorState message={LIST_ERROR_MESSAGE} onRetry={retry} />
    </div>
  );
}
