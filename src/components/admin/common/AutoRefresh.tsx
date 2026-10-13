"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-renders the Server Components every `intervalMs` while the tab is
 * visible (spec 4: dashboard, 운영 점검 and the lists; off on 랜딩 문의,
 * 채팅 열람 and 감사 로그). Coming back to a stale tab refreshes at once.
 */
export function AutoRefresh({ intervalMs = 30_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    let last = Date.now();
    const refresh = () => {
      last = Date.now();
      router.refresh();
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - last >= intervalMs) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, intervalMs]);

  return null;
}
