"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/admin/states/ErrorState";

/** 원격 설정 failed to render; "다시 시도" re-renders the segment (Next 16 `retry`). */
export default function RemoteConfigError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[backoffice] remote-config failed", error.digest ?? error.message);
  }, [error]);
  return <ErrorState message="원격 설정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." onRetry={retry} />;
}
