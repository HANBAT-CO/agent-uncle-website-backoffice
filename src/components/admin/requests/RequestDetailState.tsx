import { EmptyState } from "@/components/admin/states/EmptyState";
import { ErrorState } from "@/components/admin/states/ErrorState";
import type { RpcError } from "@/lib/admin/rpc/core";

import { DETAIL_ERROR_MESSAGE } from "./detail-copy";

/** A request that is gone, or one that failed to load (the DB's own message for P0001 and 42501). */
export function RequestDetailState({ state, error }: { state: "not_found" | "error"; error?: RpcError }) {
  if (state === "not_found") {
    return <EmptyState title="요청을 찾을 수 없어요" description="링크가 맞는지 확인해 주세요. 사입 요청 기록은 지우지 않아요." />;
  }
  const message = error && (error.kind === "forbidden" || error.kind === "invalid") ? error.message : DETAIL_ERROR_MESSAGE;
  return <ErrorState message={message} />;
}
