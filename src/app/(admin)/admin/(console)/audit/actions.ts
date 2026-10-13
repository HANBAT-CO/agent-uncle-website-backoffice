"use server";

import type { ChainOutcome } from "@/components/admin/audit/audit-format";
import { requireRole } from "@/lib/admin/dal";
import { rpc } from "@/lib/admin/rpc";

export type ChainActionResult = ChainOutcome | { ok: "error"; message: string };

/**
 * 무결성 확인 (spec 7.6, screens 10.17): owner only. Postgres walks the whole
 * sha256 chain; this only relays the result. Reachable by a direct POST, so
 * the role is checked here as well as in the RPC.
 */
export async function verifyChainAction(): Promise<ChainActionResult> {
  const session = await requireRole("owner");
  if (!session) return { ok: "error", message: "이 작업은 관리자 이상만 할 수 있어요." };
  const result = await rpc.verifyAuditChain();
  if (!result.ok) return { ok: "error", message: result.error.message };
  return result.data;
}
