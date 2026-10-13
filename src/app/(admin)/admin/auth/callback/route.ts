import { NextResponse, type NextRequest } from "next/server";

import { gateRedirectPath, resolveAdminGate } from "@/lib/admin/dal";
import { getBackofficeEnv } from "@/lib/admin/env";
import { safeNext } from "@/lib/admin/session";
import { createAdminServerClient } from "@/lib/admin/supabase/server";

/*
 * Google OAuth (PKCE) return (backoffice spec 5). Exchanges the code with the
 * verifier cookie set by signInWithGoogleAction (path /admin), then routes by
 * whoami: the console, 2단계 인증, or 권한 없음. Only console paths survive `next`.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const to = (path: string) => {
    const response = NextResponse.redirect(new URL(path, request.nextUrl.origin));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  };

  const env = getBackofficeEnv();
  if (!env.enabled) return to(`/admin/unavailable?reason=${env.reason}`);

  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));
  if (!code || searchParams.has("error")) return to("/admin/login?error=oauth");

  const supabase = await createAdminServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return to("/admin/login?error=oauth");

  const gate = await resolveAdminGate(supabase, env.target);
  return to(gate.state === "ok" ? next : gateRedirectPath(gate, next));
}
