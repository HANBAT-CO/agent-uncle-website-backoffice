import path from "node:path";

import type { Page } from "@playwright/test";

import { consoleRoutes, waitForHydration } from "./console-routes";
import { expect, test } from "./fixtures";
import { REPO_ROOT } from "./helpers/rest";

/*
 * Accessibility (WP-11; spec 12; tasks WP-11 step 3). axe-core (the existing
 * devDependency) on every console route as operator, including the
 * ForbiddenState of 운영 계정 and the request Sheet over its list, plus the
 * signed-out login page. No serious or critical violation is allowed, and
 * every console page has one h1 and the skip link.
 */

type Violation = { id: string; impact: string; help: string; targets: string[] };

async function seriousViolations(page: Page): Promise<Violation[]> {
  await page.addScriptTag({ path: path.join(REPO_ROOT, "node_modules/axe-core/axe.min.js") });
  return page.evaluate(async () => {
    type AxeResult = { violations: { id: string; impact: string; help: string; nodes: { target: string[] }[] }[] };
    const axe = (window as unknown as { axe: { run: (context: Document, options: object) => Promise<AxeResult> } }).axe;
    const result = await axe.run(document, { resultTypes: ["violations"] });
    return result.violations
      .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
      .map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        targets: violation.nodes.slice(0, 5).map((node) => node.target.join(" ")),
      }));
  });
}

test("operator: axe finds no serious or critical issue on any console route", async ({ asRole }) => {
  test.setTimeout(240_000);
  const page = await asRole("operator");

  for (const route of consoleRoutes()) {
    await test.step(route.path, async () => {
      await page.goto(route.path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await waitForHydration(page);
      await expect(page.getByRole("link", { name: "본문으로 건너뛰기" })).toHaveCount(1);
      expect.soft(await seriousViolations(page), route.path).toEqual([]);
    });
  }
});

test("operator: the request Sheet over the list passes axe", async ({ asRole }) => {
  const page = await asRole("operator");
  await page.goto("/admin/requests");
  await waitForHydration(page);
  await page.locator("tbody tr").first().locator("a").first().click();
  const sheet = page.getByTestId("request-sheet");
  await expect(sheet).toBeVisible();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(sheet.getByRole("tablist").first()).toBeVisible();
  // The Sheet slides and fades in: contrast is only meaningful once it is fully opaque.
  await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined))).then(() => undefined));
  expect(await seriousViolations(page)).toEqual([]);
});

test("signed out: the login page passes axe", async ({ page }) => {
  await page.goto("/admin/login");
  await expect(page.getByRole("heading", { level: 1, name: "사입삼춘 운영" })).toBeVisible();
  await waitForHydration(page);
  expect(await seriousViolations(page)).toEqual([]);
});
