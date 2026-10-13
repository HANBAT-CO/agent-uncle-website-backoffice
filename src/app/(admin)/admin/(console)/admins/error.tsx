"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/admin/states/ErrorState";

/** 운영 계정 failed to render; "다시 시도" re-renders the segment (Next 16 `retry`). */
export default function AdminsError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[backoffice] admins failed", error.digest ?? error.message);
  }, [error]);
  return <ErrorState message="운영 계정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." onRetry={retry} />;
}
