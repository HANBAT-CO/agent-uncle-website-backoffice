"use client";

import { useEffect } from "react";

import { ErrorState, LIST_ERROR_MESSAGE } from "@/components/admin/states/ErrorState";

/** 계정·가입 failed to render: the list error copy, "다시 시도" re-fetches the segment and keeps the URL filters. */
export default function AccountsError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[backoffice] accounts list failed", error.digest ?? "unknown");
  }, [error]);

  return <ErrorState message={LIST_ERROR_MESSAGE} onRetry={retry} />;
}
