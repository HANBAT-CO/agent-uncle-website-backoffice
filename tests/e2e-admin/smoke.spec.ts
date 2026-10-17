import type { Page } from "@playwright/test";

import { allows, consoleRoutes, FORBIDDEN, waitForHydration, type ConsoleRole } from "./console-routes";
import { expect, test } from "./fixtures";

/*
 * Console smoke (WP-11; spec 9, 10; screens appendix 9). For each staff role:
 * - every console route renders its h1 and logs no console error;
 * - a screen above the role renders the ForbiddenState with its exact copy;
 * - the sidebar matches the role's navigation exactly.
 * Read-only against the seeded local stack (operator dossier views add the
 * usual throttled account.view audit row).
 */

/** Sidebar groups per spec 9, in order. Items above the role are hidden. */
const NAV: [group: string, items: [label: string, min: ConsoleRole][]][] = [
  ["운영 현황", [["대시보드", "viewer"], ["운영 점검", "viewer"]]],
  ["계정·관계", [["계정·가입", "viewer"], ["탈퇴·개인 설정", "viewer"], ["거래처 연결", "viewer"]]],
  ["거래 흐름", [["청구·정산", "viewer"], ["팀·동료 업무", "viewer"], ["사입 요청", "viewer"], ["전달·수령", "viewer"], ["미송 재확인", "viewer"], ["문제·정정", "viewer"]]],
  ["소통", [["채팅 열람", "viewer"], ["푸시 전송 상태", "viewer"], ["알림·공지", "viewer"]]],
  ["앱 제어", [["원격 설정", "viewer"]]],
  ["웹사이트", [["랜딩 문의", "viewer"]]],
  ["관리", [["감사 로그", "operator"], ["운영 계정", "owner"]]],
];

function expectedNav(role: ConsoleRole): [string, string[]][] {
  return NAV.map(([group, items]): [string, string[]] => [group, items.filter(([, min]) => allows(role, min)).map(([label]) => label)]).filter(
    ([, items]) => items.length > 0,
  );
}

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

/** Console errors and uncaught page errors, collected until `take()`. */
function watchErrors(page: Page): { take: () => string[] } {
  let errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  return {
    take: () => {
      const out = errors;
      errors = [];
      return out;
    },
  };
}

for (const role of ["viewer", "operator", "owner"] as const) {
  test(`${role}: every console route renders its h1 with no console error, and the nav matches spec 9`, async ({ asRole }) => {
    test.setTimeout(240_000);
    const page = await asRole(role);
    const errors = watchErrors(page);

    for (const route of consoleRoutes()) {
      await test.step(route.path, async () => {
        const response = await page.goto(route.path);
        expect.soft(response?.status(), `${route.path} status`).toBe(200);
        await expect(page).toHaveURL((url) => url.pathname === route.path);

        const heading = page.getByRole("heading", { level: 1 });
        await expect(heading).toHaveCount(1);
        if (route.h1 === null) await expect(heading).toHaveText(/\S/);
        else await expect(heading).toHaveText(route.h1);

        if (!allows(role, route.min)) {
          await expect(page.getByText(FORBIDDEN[route.min as "operator" | "owner"], { exact: true })).toBeVisible();
        }
        await waitForHydration(page);
        expect.soft(errors.take(), `${route.path} console errors`).toEqual([]);
      });
    }

    await test.step("sidebar", async () => {
      await page.goto("/admin/account");
      expect(await sidebarNav(page)).toEqual(expectedNav(role));
      const sidebar = page.locator("[data-slot=sidebar]");
      await expect(sidebar.getByRole("link", { name: "내 계정" })).toBeVisible();
      await expect(sidebar.getByRole("button", { name: "로그아웃" })).toBeVisible();
    });
  });
}
