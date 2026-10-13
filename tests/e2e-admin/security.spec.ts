import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { expect, loginThroughUi, test } from "./fixtures";
import { REPO_ROOT, psql } from "./helpers/rest";

/*
 * Security smoke (WP-11; spec 4, 5, 7, 12; tasks WP-11 step 2):
 * - the production client bundle (.next/static) holds no secret key and no JWT;
 * - console responses are noindex and never stored; the console cookies are
 *   httpOnly and scoped to /admin; the landing gets no Supabase cookie;
 * - the CSV export refuses a foreign Origin;
 * - a session that disappears mid-action keeps the typed note and asks for a
 *   new login (Review Focus 2);
 * - `next start` without the BACKOFFICE_* variables serves the console off.
 * The build-dependent checks skip with a note when no production build exists
 * (run `npm run build` first; CI runs them in the step after the build).
 */

const BUILD_ID = path.join(REPO_ROOT, ".next/BUILD_ID");
const hasBuild = existsSync(BUILD_ID);
const SB_COOKIE = /^sb-/;

/** Next may rewrite the exact Cache-Control value (WP-02): assert the directives, not the string. */
function expectConsoleHeaders(response: { headers(): Record<string, string> } | null, label: string): void {
  expect(response, label).not.toBeNull();
  const headers = response!.headers();
  expect(headers["cache-control"] ?? "", `${label} cache-control`).toContain("no-store");
  expect(headers["x-robots-tag"] ?? "", `${label} x-robots-tag`).toContain("noindex");
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

test.describe("client bundle", () => {
  test("no sb_secret_, service_role or JWT-shaped string in .next/static", () => {
    test.skip(!hasBuild, "needs a production build: run npm run build first");
    const patterns: [string, RegExp][] = [
      ["sb_secret_", /sb_secret_/],
      ["service_role", /service_role/],
      ["JWT", /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{16,}/],
    ];
    // The local stack's own keys, if the seed env exists, must not be inlined either.
    const seedEnv = path.join(REPO_ROOT, "supabase-local/.env.seed.local");
    if (existsSync(seedEnv)) {
      const secret = /^LOCAL_SUPABASE_SERVICE_ROLE_KEY=(.+)$/m.exec(readFileSync(seedEnv, "utf8"))?.[1]?.trim();
      if (secret) patterns.push(["local service-role key", new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))]);
    }

    const hits: string[] = [];
    let scanned = 0;
    for (const file of walk(path.join(REPO_ROOT, ".next/static"))) {
      if (!/\.(js|mjs|css|json|map|txt|html)$/.test(file)) continue;
      scanned += 1;
      const text = readFileSync(file, "utf8");
      for (const [name, pattern] of patterns) if (pattern.test(text)) hits.push(`${name} in ${path.relative(REPO_ROOT, file)}`);
    }
    expect(scanned).toBeGreaterThan(0);
    expect(hits).toEqual([]);
  });
});

test.describe("headers and cookies", () => {
  test("console responses are noindex and no-store, signed in and signed out", async ({ asRole, request }) => {
    const redirect = await request.get("/admin/requests", { maxRedirects: 0 });
    expect(redirect.status()).toBe(307);
    expectConsoleHeaders(redirect, "signed-out redirect");
    expectConsoleHeaders(await request.get("/admin/login"), "login page");

    const page = await asRole("viewer");
    for (const url of ["/admin", "/admin/requests", "/admin/account"]) {
      const response = await page.request.get(url, { maxRedirects: 0 });
      expect(response.status(), url).toBe(200);
      expectConsoleHeaders(response, url);
      expect(response.headers()["x-frame-options"], url).toBe("DENY");
      expect(response.headers()["referrer-policy"], url).toBe("no-referrer");
    }
  });

  test("the session cookies are httpOnly, SameSite=Lax and scoped to /admin", async ({ asRole }) => {
    const page = await asRole("operator");
    await page.goto("/admin/account");
    const cookies = (await page.context().cookies()).filter((cookie) => SB_COOKIE.test(cookie.name));
    expect(cookies.length).toBeGreaterThan(0);
    for (const cookie of cookies) {
      expect(cookie.httpOnly, cookie.name).toBe(true);
      expect(cookie.path, cookie.name).toBe("/admin");
      expect(cookie.sameSite, cookie.name).toBe("Lax");
    }
    expect(await page.evaluate(() => document.cookie)).not.toMatch(/sb-/);
  });

  test("the landing sets no Supabase cookie and gets none from a signed-in browser", async ({ asRole, request }) => {
    const response = await request.get("/");
    expect(response.ok()).toBe(true);
    const setCookies = response.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie");
    expect(setCookies.filter((h) => /(^|\s)sb-/.test(h.value))).toEqual([]);
    expect(response.headers()["x-robots-tag"]).toBeUndefined();

    const page = await asRole("viewer");
    const sent: string[] = [];
    page.on("request", (req) => {
      if (new URL(req.url()).pathname === "/") sent.push(req.headers()["cookie"] ?? "");
    });
    await page.goto("/");
    expect(sent.length).toBeGreaterThan(0);
    for (const cookie of sent) expect(cookie).not.toMatch(/sb-/);
  });
});

test.describe("CSV export route", () => {
  const form = { reason: "보안 점검 확인용", returnTo: "/admin/requests" };

  test("refuses a foreign Origin, a missing Origin and a cross-site null Origin with 403", async ({ asRole }) => {
    const page = await asRole("operator");
    const before = psql("select count(*) from public.backoffice_audit_log where action like 'export.%'");

    const foreign = await page.request.post("/admin/export/requests", { headers: { origin: "https://evil.example" }, form, maxRedirects: 0 });
    expect(foreign.status()).toBe(403);
    const missing = await page.request.post("/admin/export/requests", { form, maxRedirects: 0 });
    expect(missing.status()).toBe(403);
    const nullCrossSite = await page.request.post("/admin/export/requests", {
      headers: { origin: "null", "sec-fetch-site": "cross-site" },
      form,
      maxRedirects: 0,
    });
    expect(nullCrossSite.status()).toBe(403);

    expect(psql("select count(*) from public.backoffice_audit_log where action like 'export.%'")).toBe(before);
  });

  test("accepts a same-origin post (here refused for a short reason, before any export)", async ({ asRole, baseURL }) => {
    const page = await asRole("operator");
    const response = await page.request.post("/admin/export/requests", {
      headers: { origin: new URL(baseURL!).origin },
      form: { reason: "짧음", returnTo: "/admin/requests" },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(303);
    const location = new URL(response.headers()["location"], baseURL);
    expect(location.pathname).toBe("/admin/requests");
    expect(location.searchParams.get("exportError")).toBe("사유를 5자 이상 입력해 주세요.");
  });
});

test.describe("session expiry mid-action", () => {
  test("a note submitted after the cookies are gone keeps its text and asks for a new login", async ({ browser, baseURL }) => {
    const id = psql("select id from public.saip_records where collection = 'requests' order by updated_at desc limit 1");
    const notesBefore = psql(`select count(*) from public.backoffice_notes where target_id = '${id}'`);

    // A fresh session, so the cached role states stay valid.
    const context = await browser.newContext({ baseURL, locale: "ko-KR", timezoneId: "Asia/Seoul", viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await loginThroughUi(page, "operator", `/admin/requests/${id}`);
    await expect(page).toHaveURL(new RegExp(`/admin/requests/${id}$`));

    await page.getByRole("toolbar", { name: "요청 작업" }).getByRole("button", { name: "메모 남기기" }).click();
    const noteForm = page.getByRole("form", { name: "메모 남기기" });
    const body = noteForm.getByRole("textbox", { name: "메모" });
    const text = `WP-11 만료 확인 ${Date.now()}`;
    await body.fill(text);

    await context.clearCookies();
    await noteForm.getByRole("button", { name: "메모 남기기" }).click();

    const expired = noteForm.getByText("로그인이 만료됐어요. 다시 로그인해 주세요.");
    await expect(expired.or(page.getByLabel("아이디"))).toBeVisible();
    if (new URL(page.url()).pathname === "/admin/login") {
      expect(new URL(page.url()).searchParams.get("next")).toBe(`/admin/requests/${id}`);
    } else {
      await expect(expired).toBeVisible();
      await expect(body).toHaveValue(text);
      await expect(noteForm.getByRole("link", { name: "다시 로그인하기" })).toHaveAttribute(
        "href",
        `/admin/login?next=${encodeURIComponent(`/admin/requests/${id}`)}`,
      );
    }
    expect(psql(`select count(*) from public.backoffice_notes where target_id = '${id}'`)).toBe(notesBefore);
    await context.close();
  });
});

test.describe("console off in production mode", () => {
  const PORT = 3102;
  const origin = `http://localhost:${PORT}`;
  let server: ChildProcess | undefined;
  let log = "";

  test.beforeAll(async () => {
    if (!hasBuild) return;
    test.setTimeout(120_000);
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production", PORT: String(PORT), LEAD_DRY_RUN: "1" };
    for (const key of Object.keys(env)) if (key.startsWith("BACKOFFICE_") || key.startsWith("NEXT_PUBLIC_BACKOFFICE_")) delete env[key];
    server = spawn("npx", ["next", "start", "-p", String(PORT)], { cwd: REPO_ROOT, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    server.stdout?.on("data", (chunk: Buffer) => (log += chunk.toString()));
    server.stderr?.on("data", (chunk: Buffer) => (log += chunk.toString()));

    const deadline = Date.now() + 90_000;
    for (;;) {
      try {
        const response = await fetch(`${origin}/`, { signal: AbortSignal.timeout(2_000) });
        if (response.ok) break;
      } catch {
        // not up yet
      }
      if (Date.now() > deadline) throw new Error(`next start did not come up on ${PORT}:\n${log.slice(-2_000)}`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  });

  test.afterAll(() => {
    if (server?.pid) {
      try {
        process.kill(-server.pid, "SIGTERM");
      } catch {
        // already gone
      }
    }
  });

  test("/admin shows 이 배포에서는 운영 화면이 꺼져 있어요 and the landing still serves", async ({ page, request }) => {
    test.skip(!hasBuild, "needs a production build: run npm run build first");
    for (const url of ["/admin", "/admin/login", "/admin/requests?view=attention"]) {
      const response = await page.goto(`${origin}${url}`);
      expect(response?.status(), url).toBe(200);
      expect(new URL(page.url()).pathname, url).toBe(new URL(`${origin}${url}`).pathname);
      await expect(page.getByText("이 배포에서는 운영 화면이 꺼져 있어요.")).toBeVisible();
      await expect(page.getByLabel("비밀번호")).toHaveCount(0);
      expectConsoleHeaders(response, url);
    }
    expect((await page.context().cookies(origin)).filter((cookie) => SB_COOKIE.test(cookie.name))).toEqual([]);
    const landing = await request.get(`${origin}/`);
    expect(landing.ok()).toBe(true);
    expect(landing.headers()["x-robots-tag"]).toBeUndefined();
  });
});
