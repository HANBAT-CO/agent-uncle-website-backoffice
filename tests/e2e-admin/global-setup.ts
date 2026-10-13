import { rmSync } from "node:fs";

import { STATE_DIR } from "./fixtures";
import { localSupabase, staffRpc } from "./helpers/rest";

const DOWN = "로컬 Supabase가 꺼져 있어요: supabase-local/scripts/start.sh 후 reset.sh를 실행해 주세요";

/**
 * Fails fast unless the local stack answers and the seeded owner is ready
 * (backoffice layer installed, staff seeded). Clears the cached role sessions,
 * because a reset recreates the users and invalidates them.
 */
export default async function globalSetup(): Promise<void> {
  const { url, key } = localSupabase();
  try {
    const response = await fetch(`${url}/rest/v1/rpc/app_bootstrap_config`, {
      method: "POST",
      headers: { apikey: key, "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`app_bootstrap_config answered ${response.status}`);
    const who = await staffRpc<{ ready?: boolean }>("owner", "backoffice_whoami");
    if (!who.data?.ready) throw new Error(`owner whoami is not ready (${who.error?.message ?? "no staff row"})`);
  } catch (error) {
    throw new Error(`${DOWN} (${error instanceof Error ? error.message : String(error)})`);
  }
  rmSync(STATE_DIR, { recursive: true, force: true });
}
