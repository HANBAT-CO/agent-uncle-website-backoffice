"use client";

import { useEffect } from "react";

import { ErrorState, LIST_ERROR_MESSAGE } from "@/components/admin/states/ErrorState";

/** 전달·수령 failed to render: the list error copy, and "다시 시도" re-fetches with the same URL filters. */
export default function DeliveriesError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[backoffice] deliveries failed", error.digest ?? error.message);
  }, [error]);

  return <ErrorState message={LIST_ERROR_MESSAGE} onRetry={retry} />;
}
