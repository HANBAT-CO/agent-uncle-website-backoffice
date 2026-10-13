import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { updateAdminSession } from "./proxy";

const LOCAL = {
  BACKOFFICE_SUPABASE_TARGET: "local",
  BACKOFFICE_SUPABASE_URL: "http://127.0.0.1:55321",
  BACKOFFICE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key_value",
};

function stubEnv(vars: Partial<typeof LOCAL>) {
  for (const key of Object.keys(LOCAL) as (keyof typeof LOCAL)[]) vi.stubEnv(key, vars[key] ?? "");
}

function request(path: string, method = "GET") {
  return new NextRequest(new URL(path, "http://localhost:3100"), { method });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("updateAdminSession", () => {
  it("rewrites every console URL to 사용할 수 없음 when the console is off", async () => {
    stubEnv({});
    const response = await updateAdminSession(request("/admin/requests"));
    expect(response.headers.get("x-middleware-rewrite")).toBe("http://localhost:3100/admin/unavailable?reason=disabled");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("names a misconfigured environment", async () => {
    stubEnv({ ...LOCAL, BACKOFFICE_SUPABASE_URL: "https://x.supabase.co" });
    const response = await updateAdminSession(request("/admin"));
    expect(response.headers.get("x-middleware-rewrite")).toBe("http://localhost:3100/admin/unavailable?reason=misconfigured");
  });

  it("sends a signed-out page visit to the login page with next", async () => {
    stubEnv(LOCAL);
    const response = await updateAdminSession(request("/admin/requests?view=attention"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3100/admin/login?next=%2Fadmin%2Frequests%3Fview%3Dattention",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("lets the public screens through and forwards the console path", async () => {
    stubEnv(LOCAL);
    for (const path of ["/admin/login?next=%2Fadmin", "/admin/unavailable"]) {
      const response = await updateAdminSession(request(path));
      expect(response.status, path).toBe(200);
      expect(response.headers.get("x-middleware-next"), path).toBe("1");
      expect(response.headers.get("x-middleware-request-x-admin-path"), path).toBe(path);
      expect(response.headers.get("x-robots-tag"), path).toBe("noindex, nofollow");
    }
  });

  it("never redirects a Server Action POST; the action's own verifyAdmin answers", async () => {
    stubEnv(LOCAL);
    const response = await updateAdminSession(request("/admin/accounts", "POST"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
  });

  it("ignores a client-sent x-admin-path", async () => {
    stubEnv(LOCAL);
    const forged = new NextRequest(new URL("/admin/login", "http://localhost:3100"), {
      headers: { "x-admin-path": "//evil.com" },
    });
    const response = await updateAdminSession(forged);
    expect(response.headers.get("x-middleware-request-x-admin-path")).toBe("/admin/login");
  });
});
