import type { NextRequest } from "next/server";

import { updateAdminSession } from "@/lib/admin/supabase/proxy";

/*
 * Proxy (Next 16, Node runtime) for the operator console only. The landing
 * never pays for the auth round trip and never gets a Supabase cookie.
 */
export async function proxy(request: NextRequest) {
  return updateAdminSession(request);
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
