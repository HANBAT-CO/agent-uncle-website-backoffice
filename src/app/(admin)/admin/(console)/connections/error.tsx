"use client";

import { useEffect } from "react";

import { ErrorState, LIST_ERROR_MESSAGE } from "@/components/admin/states/ErrorState";

/** 거래처 연결 failed to render: the list error copy and "다시 시도" (the URL view stays). */
export default function ConnectionsError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[backoffice] connections list failed", error.digest ?? "unknown");
  }, [error]);

  return <ErrorState message={LIST_ERROR_MESSAGE} onRetry={retry} />;
}
