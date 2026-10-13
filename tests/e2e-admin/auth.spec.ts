import { expect, loginThroughUi, test } from "./fixtures";
import { STAFF, demoUserRpc, psql, signIn } from "./helpers/rest";

/*
 * Staff sign-in, session gate and proxy (WP-02; spec 4, 5, screens 10.1 to
 * 10.4) against the local stack with the seeded logins.
 */

const SB_COOKIE = /^sb-/;

test.describe("signed out", () => {
  test("/admin redirects to the login page with next", async ({ request }) => {
    const response = await request.get("/admin", { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers()["location"]).toBe("/admin/login?next=%2Fadmin");
    expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    expect(response.headers()["cache-control"]).toContain("no-store");

    const deep = await request.get("/admin/requests?view=attention", { maxRedirects: 0 });
    expect(deep.status()).toBe(307);
    expect(deep.headers()["location"]).toBe("/admin/login?next=%2Fadmin%2Frequests%3Fview%3Dattention");
  });

  test("the login page shows the ID and password form only", async ({ page }) => {
    const response = await page.goto("/admin/login");
    expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    await expect(page.getByRole("heading", { level: 1, name: "한밭만물상 사입삼춘 관리자 패널" })).toBeVisible();
    await expect(page.getByText("운영 계정으로 로그인해 주세요.")).toBeVisible();
    await expect(page.getByLabel("아이디")).toBeVisible();
    await expect(page.getByLabel("비밀번호")).toBeVisible();
    await expect(page.getByText("운영 화면의 열람과 변경은 모두 기록돼요.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Google 계정으로 로그인" })).toHaveCount(0);
    await expect(page).toHaveTitle("로그인 | 한밭만물상 사입삼춘 관리자 패널");
  });

  test("expired sessions and sign-in failures explain themselves", async ({ page }) => {
    await page.goto("/admin/login?reason=expired");
    await expect(page.getByRole("main").getByRole("status")).toHaveText("보안을 위해 다시 로그인해 주세요.");
    await page.goto("/admin/login?error=oauth");
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("로그인하지 못했어요. 다시 시도해 주세요.");
  });

  test("a wrong password shows the exact error and keeps the ID", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("아이디").fill(STAFF.viewer.email);
    await page.getByLabel("비밀번호").fill("not-the-password");
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await expect(page.getByText("아이디 또는 비밀번호를 확인해 주세요.")).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByLabel("아이디")).toHaveValue(STAFF.viewer.email);
    expect((await page.context().cookies()).filter((c) => SB_COOKIE.test(c.name))).toHaveLength(0);
  });

  test("the unavailable page reads its reason", async ({ page }) => {
    await page.goto("/admin/unavailable?reason=not_installed");
    await expect(
      page.getByText("운영 데이터 계층이 아직 설치되지 않았어요. 앱 저장소에 마이그레이션이 반영된 뒤 이용할 수 있어요."),
    ).toBeVisible();
    await page.goto("/admin/unavailable?reason=nonsense");
    await expect(page.getByText("운영 화면 설정을 확인해 주세요.")).toBeVisible();
  });
});

test.describe("signing in", () => {
  test("a viewer lands under /admin with an httpOnly session cookie scoped to /admin", async ({ page, baseURL }) => {
    await loginThroughUi(page, "viewer");
    const url = new URL(page.url());
    expect(url.origin).toBe(new URL(baseURL!).origin);
    expect(url.pathname === "/admin" || url.pathname.startsWith("/admin/")).toBe(true);
    expect(url.pathname).not.toMatch(/^\/admin\/(login|no-access|mfa|unavailable)/);

    const cookies = (await page.context().cookies()).filter((c) => SB_COOKIE.test(c.name));
    expect(cookies.length).toBeGreaterThan(0);
    for (const cookie of cookies) {
      expect(cookie.httpOnly, cookie.name).toBe(true);
      expect(cookie.path, cookie.name).toBe("/admin");
      expect(cookie.sameSite, cookie.name).toBe("Lax");
    }
    // No Supabase token is readable from JS, even on a page inside the cookie path.
    const probe = await page.context().newPage();
    await page.close();
    await probe.goto("/admin/unavailable");
    expect(await probe.evaluate(() => document.cookie)).not.toMatch(/sb-/);
  });

  test("next=//evil.com stays on /admin", async ({ page, baseURL }) => {
    await loginThroughUi(page, "operator", "//evil.com");
    const url = new URL(page.url());
    expect(url.origin).toBe(new URL(baseURL!).origin);
    expect(url.pathname).toBe("/admin");
  });

  test("a safe next is honoured", async ({ page }) => {
    await loginThroughUi(page, "operator", "/admin/requests?view=attention");
    expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe("/admin/requests?view=attention");
  });

  test("a signed-in visit to the login page goes straight to next", async ({ asRole }) => {
    const page = await asRole("owner");
    await page.goto("/admin/login?next=%2Fadmin%2Faudit");
    await expect(page).toHaveURL(/\/admin\/audit$/);
  });
});

test.describe("12 h session limit", () => {
  test("a session signed in more than 12 h ago is signed out with the expired notice", async ({ page }) => {
    // A real session whose sign-in (amr) is moved 13 h back, then refreshed so the JWT carries it.
    const client = await signIn(STAFF.operator.email, STAFF.operator.password);
    const { data: claims } = await client.auth.getClaims();
    const sessionId = String(claims?.claims?.session_id ?? "");
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/);
    psql(
      `update auth.mfa_amr_claims set created_at = now() - interval '13 hours', updated_at = now() - interval '13 hours' where session_id = '${sessionId}'`,
    );
    const { data: refreshed, error } = await client.auth.refreshSession();
    expect(error).toBeNull();
    const session = refreshed.session!;
    const amr = (JSON.parse(Buffer.from(session.access_token.split(".")[1], "base64url").toString()) as {
      amr: { timestamp: number }[];
    }).amr;
    expect(Math.floor(Date.now() / 1000) - Math.min(...amr.map((a) => a.timestamp))).toBeGreaterThan(12 * 3600);

    // The same cookie @supabase/ssr writes: base64url JSON of the session, path /admin.
    await page.context().addCookies([
      {
        name: "sb-127-auth-token",
        value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`,
        domain: "localhost",
        path: "/admin",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await page.goto("/admin/requests");
    await expect(page).toHaveURL(/\/admin\/login\?reason=expired$/);
    await expect(page.getByRole("main").getByRole("status")).toHaveText("보안을 위해 다시 로그인해 주세요.");
    expect((await page.context().cookies()).filter((c) => SB_COOKIE.test(c.name))).toHaveLength(0);
  });
});

test.describe("권한 없음", () => {
  test("spare@ lands on no-access, sees its email, and can sign out", async ({ page }) => {
    await loginThroughUi(page, "spare");
    await expect(page).toHaveURL(/\/admin\/no-access$/);
    await expect(page.getByRole("heading", { level: 1, name: "운영 권한이 없는 계정이에요" })).toBeVisible();
    await expect(page.getByTestId("no-access-email")).toHaveText(STAFF.spare.email);
    await expect(page.getByText("로 로그인했어요. 관리자에게 이 이메일을 알려 주시면 권한을 받을 수 있어요.")).toBeVisible();
    // spare@ has no app account, so the app-account hint is absent.
    await expect(page.getByText("앱에서 쓰는 계정은 운영 계정으로 쓸 수 없어요.", { exact: false })).toHaveCount(0);

    await page.getByRole("button", { name: "로그아웃" }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);
    await page.goto("/admin/no-access");
    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Fno-access$/);
  });

  test("an app account cannot sign in through the staff ID form", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("아이디").fill("mangwon.select@demo.agentuncle.local");
    await page.getByLabel("비밀번호").fill("agentuncle-demo-local");
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await expect(page.getByText("아이디 또는 비밀번호를 확인해 주세요.")).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/login$/);
    expect((await page.context().cookies()).filter((c) => SB_COOKIE.test(c.name))).toHaveLength(0);
  });

  test("a staff ID without the domain signs in", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("아이디").fill("viewer");
    await page.getByLabel("비밀번호").fill(STAFF.viewer.password);
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await expect(page).toHaveURL(/\/admin(\/|$)/);
  });

  test("a demo app user gets 403 from a backoffice RPC", async () => {
    const outcome = await demoUserRpc("mangwon.select", "backoffice_overview", { p_include_demo: false, p_days: 1 });
    expect(outcome.status).toBe(403);
  });
});

test.describe("2단계 인증", () => {
  test.afterAll(() => {
    // Enrolment creates an unverified factor when TOTP is on; never leave one behind.
    psql(
      "delete from auth.mfa_factors where status = 'unverified' and user_id = (select id from auth.users where email = 'admin@agentuncle.local')",
    );
  });

  test("a staff member without a factor gets the enrolment steps", async ({ asRole }) => {
    const page = await asRole("owner");
    await page.goto("/admin/mfa?next=%2Fadmin%2Faccount");
    await expect(page.getByRole("heading", { level: 1, name: "2단계 인증" })).toBeVisible();
    await expect(page.getByText("2단계 인증을 등록해 주세요.")).toBeVisible();
    // The local stack mirrors config.toml: TOTP enrolment may be off there, which has its own copy.
    const disabled = page.getByText("2단계 인증이 아직 켜지지 않았어요. 관리자에게 문의해 주세요.");
    const qr = page.getByRole("img", { name: "2단계 인증 등록용 QR 코드" });
    await expect(disabled.or(qr)).toBeVisible();
    if (await qr.isVisible()) {
      await expect(page.getByText("인증 앱으로 QR 코드를 찍어 주세요")).toBeVisible();
      await expect(page.getByText("직접 입력할 키")).toBeVisible();
      await expect(page.getByText("앱에 표시된 6자리 코드")).toBeVisible();
      await expect(page.getByRole("button", { name: "등록하고 계속하기" })).toBeEnabled();
    }
    await expect(page.getByRole("button", { name: "다른 계정으로 로그인" })).toBeVisible();
  });

  test("spare@ is not offered MFA", async ({ asRole }) => {
    const page = await asRole("spare");
    await page.goto("/admin/mfa");
    await expect(page).toHaveURL(/\/admin\/no-access$/);
  });
});

test.describe("the landing stays outside the console", () => {
  test("GET / sets no sb- cookie and no noindex header", async ({ request }) => {
    const response = await request.get("/");
    expect(response.ok()).toBe(true);
    const headers = response.headersArray();
    expect(headers.filter((h) => h.name.toLowerCase() === "set-cookie" && /(^|\s)sb-/.test(h.value))).toHaveLength(0);
    expect(headers.find((h) => h.name.toLowerCase() === "x-robots-tag")).toBeUndefined();
  });

  test("a signed-in browser sends no session cookie to /", async ({ asRole }) => {
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
