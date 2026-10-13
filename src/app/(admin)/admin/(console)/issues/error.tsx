"use client";

import { useEffect } from "react";

import { ErrorState, LIST_ERROR_MESSAGE } from "@/components/admin/states/ErrorState";

/** 문제·정정 failed to render: the list error copy, and "다시 시도" re-fetches with the same tab and view. */
export default function IssuesError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[backoffice] issues failed", error.digest ?? error.message);
  }, [error]);

  return <ErrorState message={LIST_ERROR_MESSAGE} onRetry={retry} />;
}
