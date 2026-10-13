import "server-only";

import { rpc } from "@/lib/admin/rpc";

/** backoffice_list_accounts returns at most this many rows per call. */
const NAME_LIMIT = 200;

/**
 * Account id to display name (매장명, or the label), for the 대상 column of
 * 운영 점검 and the dashboard queue. One list call, not audited, already
 * masked by role in SQL. Best effort: on failure the rows show short ids.
 */
export async function loadAccountNames(includeDemo: boolean): Promise<Map<string, string>> {
  const result = await rpc.listAccounts({ includeDemo, limit: NAME_LIMIT, offset: 0 });
  const names = new Map<string, string>();
  if (!result.ok) return names;
  for (const row of result.data.rows) {
    const name = row.name?.trim() || row.businessName?.trim();
    if (name) names.set(row.id, name);
  }
  return names;
}
