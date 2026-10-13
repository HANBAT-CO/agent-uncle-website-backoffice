"use client";

import { useEffect } from "react";

import { ErrorState, LIST_ERROR_MESSAGE } from "@/components/admin/states/ErrorState";

/** 랜딩 문의 failed to render: the list error with "다시 시도" (Next 16 `retry`). */
export default function LeadsError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[backoffice] leads screen failed", error.digest ?? "no digest");
  }, [error]);
  return <ErrorState message={LIST_ERROR_MESSAGE} onRetry={retry} />;
}
