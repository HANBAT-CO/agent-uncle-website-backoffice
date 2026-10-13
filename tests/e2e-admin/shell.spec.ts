import path from "node:path";

import type { Page, Request } from "@playwright/test";

import { expect, loginThroughUi, test } from "./fixtures";
import { REPO_ROOT } from "./helpers/rest";

/*
 * Console shell (WP-04; spec 4, 9; screens appendix 9 and 10.19): role-aware
 * navigation, the environment pill, the ⌘K palette with Hangul IME
 * composition, /admin/search, 내 계정, the admin not-found page, and axe on
 * the shell. Read-only against the seeded local stack.
 */

const NAV_ALL = [
  ["운영 현황", ["대시보드", "운영 점검"]],
  ["계정·관계", ["계정·가입", "거래처 연결"]],
  ["거래 흐름", ["사입 요청", "전달·수령", "미송 재확인", "문제·정정"]],
  ["소통", ["채팅 열람", "알림·공지"]],
  ["앱 제어", ["원격 설정"]],
  ["웹사이트", ["랜딩 문의"]],
  ["관리", ["감사 로그", "운영 계정"]],
] as const;

/** Sidebar groups and item labels, in order. */
async function sidebarNav(page: Page): Promise<[string, string[]][]> {
  const nav = page.getByTestId("admin-nav");
  await expect(nav).toBeVisible();
  return nav.locator("[data-nav-group]").evaluateAll((groups) =>
    groups.map((group) => [
      group.getAttribute("data-nav-group") ?? "",
      Array.from(group.querySelectorAll("a[data-nav-key] span.truncate")).map((span) => span.textContent?.trim() ?? ""),
    ]),
  );
}

function isServerAction(request: Request): boolean {
  return request.method() === "POST" && Boolean(request.headers()["next-action"]);
}

async function openPalette(page: Page) {
  await page.keyboard.press("ControlOrMeta+KeyK");
  const dialog = page.getByRole("dialog", { name: "계정·요청·화면 찾기" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("navigation per role", () => {
  test("viewer sees every viewer screen, no 관리 group, and the local pill", async ({ asRole }) => {
    const page = await asRole("viewer");
    await page.goto("/admin/account");
    expect(await sidebarNav(page)).toEqual(NAV_ALL.slice(0, 6).map(([group, items]) => [group, [...items]]));
    await expect(page.getByTestId("env-pill")).toHaveText("로컬 데이터 · 테스트");
    await expect(page.getByTestId("env-pill")).toHaveAttribute("data-tone", "local");
    await expect(page.getByRole("switch")).toHaveCount(0); // the demo toggle is live only
  });

  test("operator also sees 감사 로그 but not 운영 계정", async ({ asRole }) => {
    const page = await asRole("operator");
    await page.goto("/admin/account");
    const nav = await sidebarNav(page);
    expect(nav.at(-1)).toEqual(["관리", ["감사 로그"]]);
    await expect(page.getByTestId("env-pill")).toHaveText("로컬 데이터 · 테스트");
  });

  test("owner sees every group, the footer, badges, the skip link and the 4px rule", async ({ asRole }) => {
    const page = await asRole("owner");
    await page.goto("/admin/account");
    expect(await sidebarNav(page)).toEqual(NAV_ALL.map(([group, items]) => [group, [...items]]));

    const sidebar = page.locator("[data-slot=sidebar]");
    await expect(sidebar.getByRole("link", { name: "내 계정" })).toHaveAttribute("aria-current", "page");
    await expect(sidebar.getByRole("button", { name: "로그아웃" })).toBeVisible();
    await expect(page.getByTestId("nav-badge-requests")).toHaveText(/^\d+건$/);

    await expect(page.locator("[data-slot=live-rule]")).toHaveCSS("height", "4px");
    await expect(page.locator("[data-slot=live-rule]")).toHaveCSS("background-color", "rgb(12, 72, 62)");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "본문으로 건너뛰기" })).toBeFocused();

    await expect(page.getByRole("navigation", { name: "현재 위치" })).toContainText("내 계정");
    await sidebar.getByRole("link", { name: /^사입 요청/ }).click();
    await expect(page).toHaveURL(/\/admin\/requests$/);
    await expect(page.getByRole("navigation", { name: "현재 위치" })).toContainText("거래 흐름");
  });
});

test.describe("⌘K palette", () => {
  test("finds accounts by name and Enter opens the first one", async ({ asRole }) => {
    const page = await asRole("owner");
    await page.goto("/admin/account");
    const dialog = await openPalette(page);
    await expect(dialog.getByText("바로가기")).toBeVisible();
    await expect(dialog.getByText("기한 지난 미송 보기")).toBeVisible();

    await dialog.getByRole("combobox").fill("셀렉트");
    const accounts = dialog.locator("[cmdk-group]").filter({ has: page.getByText("계정", { exact: true }) });
    await expect(accounts.locator("[cmdk-item]").first()).toContainText("셀렉트");
    await expect(accounts.locator("mark").first()).toHaveText("셀렉트");

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/admin\/accounts\/[0-9a-f-]{36}$/);
    await expect(dialog).toBeHidden();

    const again = await openPalette(page);
    await expect(again.getByText("최근 항목")).toBeVisible();
    const stored = await page.evaluate(() => window.localStorage.getItem("au-admin-recent"));
    const recent = JSON.parse(stored ?? "[]") as Record<string, unknown>[];
    expect(recent[0]).toMatchObject({ kind: "account" });
    expect(Object.keys(recent[0]).sort()).toEqual(["id", "kind", "label"]);
  });

  test("Hangul IME: nothing is sent while composing; the full word goes out after compositionend", async ({ asRole }) => {
    const page = await asRole("owner");
    await page.goto("/admin/account");
    const actions: Request[] = [];
    page.on("request", (request) => {
      if (isServerAction(request)) actions.push(request);
    });

    const dialog = await openPalette(page);
    const input = dialog.getByRole("combobox");
    await input.dispatchEvent("compositionstart", { data: "" });
    for (const syllable of ["셀", "렉", "트"]) {
      await page.keyboard.insertText(syllable);
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(700);
    expect(actions, "no search while the IME composition is open").toHaveLength(0);

    const sent = page.waitForRequest((request) => isServerAction(request) && (request.postData() ?? "").includes("셀렉트"));
    await input.dispatchEvent("compositionend", { data: "트" });
    await sent;
    await expect(dialog.locator("mark").first()).toHaveText("셀렉트");
    expect(actions.every((request) => (request.postData() ?? "").includes("셀렉트"))).toBe(true);
  });

  test("an unknown term shows the empty copy", async ({ asRole }) => {
    const page = await asRole("viewer");
    await page.goto("/admin/account");
    const dialog = await openPalette(page);
    await dialog.getByRole("combobox").fill("없는검색어zz");
    await expect(dialog.getByTestId("palette-empty")).toHaveText('"없는검색어zz"에 맞는 결과가 없어요');
  });
});

test.describe("search page", () => {
  test("scope tabs, counts and highlighted matches", async ({ asRole }) => {
    const page = await asRole("owner");
    await page.goto(`/admin/search?q=${encodeURIComponent("셀렉트")}`);
    await expect(page.getByRole("heading", { level: 1, name: "검색" })).toBeVisible();
    const tabs = page.getByRole("navigation", { name: "검색 범위" });
    await expect(tabs.getByRole("link")).toHaveText([/^전체\d+$/, /^계정\d+$/, /^요청\d+$/, /^문의\d+$/]);
    await expect(page.getByRole("heading", { level: 2, name: /^계정 \d+건$/ })).toBeVisible();
    await expect(page.getByTestId("search-results").locator("mark").first()).toHaveText("셀렉트");

    await tabs.getByRole("link", { name: /^문의/ }).click();
    await expect(page).toHaveURL(/scope=leads/);
    await expect(page.getByRole("heading", { level: 2, name: /^계정/ })).toHaveCount(0);
  });

  test("an empty query asks for input and an unknown one says so", async ({ asRole }) => {
    const page = await asRole("viewer");
    await page.goto("/admin/search");
    await expect(page.getByText("찾을 내용을 입력해 주세요")).toBeVisible();
    await expect(page.getByText("연락처와 이메일로 찾기는 운영자 이상만 할 수 있어요.")).toBeVisible();
    await page.getByRole("searchbox", { name: "찾을 내용" }).fill("없는검색어zz");
    await page.getByRole("button", { name: "찾기", exact: true }).click();
    await expect(page.getByText('"없는검색어zz"에 맞는 결과가 없어요')).toBeVisible();
  });
});

test.describe("내 계정", () => {
  test("shows the account, MFA status and both sign-out buttons", async ({ asRole }) => {
    const page = await asRole("owner");
    await page.goto("/admin/account");
    await expect(page.getByRole("heading", { level: 1, name: "내 계정" })).toBeVisible();
    await expect(page.getByText("admin@agentuncle.local").first()).toBeVisible();
    await expect(page.locator("dd").filter({ hasText: "관리자" })).toBeVisible();
    await expect(page.getByTestId("mfa-status")).toContainText(/등록됨 \d+개|미등록/);
    await expect(page.getByText("운영 계정은 앱 계정과 분리해서 써 주세요.")).toBeVisible();
    const main = page.getByRole("main");
    await expect(main.getByRole("button", { name: "로그아웃", exact: true })).toBeVisible();
    await expect(main.getByRole("button", { name: "모든 기기에서 로그아웃" })).toBeVisible();
  });

  test("로그아웃 in the sidebar ends this session", async ({ browser, baseURL }) => {
    // A fresh session: signing out must not revoke the cached role states.
    const context = await browser.newContext({ baseURL, locale: "ko-KR", timezoneId: "Asia/Seoul", viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await loginThroughUi(page, "operator", "/admin/account");
    await expect(page).toHaveURL(/\/admin\/account$/);
    await page.locator("[data-slot=sidebar]").getByRole("button", { name: "로그아웃" }).click();
    await expect(page).toHaveURL(/\/admin\/login/);
    await page.goto("/admin/account");
    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Faccount/);
    await context.close();
  });
});

test.describe("not found and a11y", () => {
  test("/admin/nope renders the admin not-found inside the shell", async ({ asRole }) => {
    const page = await asRole("viewer");
    await page.goto("/admin/nope");
    await expect(page.getByRole("heading", { level: 1, name: "찾는 화면이 없어요" })).toBeVisible();
    await expect(page.getByText("주소를 다시 확인해 주세요.")).toBeVisible();
    await expect(page.getByTestId("admin-not-found").getByRole("link", { name: "대시보드로 가기" })).toHaveAttribute("href", "/admin");
    await expect(page.getByTestId("admin-nav")).toBeVisible();
  });

  test("axe finds no serious or critical violations on the shell", async ({ asRole }) => {
    const page = await asRole("owner");
    for (const url of ["/admin/account", `/admin/search?q=${encodeURIComponent("셀렉트")}`]) {
      await page.goto(url);
      await expect(page.getByTestId("admin-nav")).toBeVisible();
      await page.addScriptTag({ path: path.join(REPO_ROOT, "node_modules/axe-core/axe.min.js") });
      const violations = await page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run: (ctx: Document, opts: object) => Promise<{ violations: { id: string; impact: string; nodes: { target: string[] }[] }[] }> } }).axe;
        const result = await axe.run(document, { resultTypes: ["violations"] });
        return result.violations
          .filter((v) => v.impact === "serious" || v.impact === "critical")
          .map((v) => ({ id: v.id, impact: v.impact, targets: v.nodes.slice(0, 3).map((n) => n.target.join(" ")) }));
      });
      expect(violations, url).toEqual([]);
    }
  });
});
