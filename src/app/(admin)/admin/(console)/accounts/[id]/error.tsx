"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/admin/states/ErrorState";

/** The account dossier failed to render; "다시 시도" re-fetches the segment. */
export default function AccountError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[backoffice] account dossier failed", error.digest ?? "unknown");
  }, [error]);

  return <ErrorState message="계정 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." onRetry={retry} />;
}
