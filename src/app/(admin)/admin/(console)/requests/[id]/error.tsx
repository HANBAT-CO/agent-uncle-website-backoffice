"use client";

import { useEffect } from "react";

import { DETAIL_ERROR_MESSAGE } from "@/components/admin/requests/detail-copy";
import { ErrorState } from "@/components/admin/states/ErrorState";

/** The request page failed to render; "다시 시도" re-renders the segment. */
export default function RequestError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[backoffice] request detail failed", error.digest ?? error.message);
  }, [error]);
  return <ErrorState message={DETAIL_ERROR_MESSAGE} onRetry={retry} />;
}
