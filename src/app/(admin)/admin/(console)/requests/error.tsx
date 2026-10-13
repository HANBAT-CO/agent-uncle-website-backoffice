"use client";

import { useEffect } from "react";

import { ErrorState, LIST_ERROR_MESSAGE } from "@/components/admin/states/ErrorState";

/** The 사입 요청 list failed to render: the list error copy, and "다시 시도" keeps the URL filters. */
export default function RequestsError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[backoffice] requests list failed", error.digest ?? error.message);
  }, [error]);
  return <ErrorState message={LIST_ERROR_MESSAGE} onRetry={retry} />;
}
