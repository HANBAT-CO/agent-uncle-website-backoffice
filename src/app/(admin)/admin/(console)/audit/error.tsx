"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/admin/states/ErrorState";

/** 감사 로그 failed to render; "다시 시도" re-renders the segment (Next 16 `retry`). */
export default function AuditError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[backoffice] audit failed", error.digest ?? error.message);
  }, [error]);
  return <ErrorState message="감사 로그를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." onRetry={retry} />;
}
