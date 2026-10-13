import { expect, test, type Page } from "@playwright/test";
import axe from "axe-core";

import { openPage, settle } from "../chrome-helpers";

/**
 * Automated WCAG 2.2 AA scan (spec 14) with axe-core, in every project
 * (desktop, mobile WebKit, reduced motion), after every lazy island has
 * mounted: once at the top of the page (night) and once at the bottom (day),
 * so both phases and every section's settled state are covered. Lighthouse
 * only audits the first viewport; this scans the whole document.
 *
 * One documented exception (docs/qa/2026-10-landing.md, accepted deviations):
 * in the pinned S3 film on desktop motion, the previous caption stays above
 * the current one at 20% opacity (spec S3, "the old caption goes to 20%"). It
 * is a fading trace of text that was just shown at full contrast, and every
 * caption is also in the DOM in reading order, so it is excluded from the
 * contrast rule only. Phones and reduced motion stack every caption at full
 * opacity, so nothing is excluded there.
 */

/** The axe-core script, injected into the page. */
const AXE_SOURCE = axe.source;

type AxeViolation = { id: string; impact: string | null; help: string; nodes: Array<{ target: string[]; failureSummary?: string }> };

async function mountEverything(page: Page): Promise<void> {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 500) {
    await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
    await page.waitForTimeout(120);
  }
  await page.locator("#lead-form").waitFor({ state: "attached", timeout: 20_000 });
}

async function scan(page: Page, where: "top" | "bottom"): Promise<AxeViolation[]> {
  await page.evaluate((to) => window.scrollTo({ top: to === "top" ? 0 : document.documentElement.scrollHeight, behavior: "instant" }), where);
  await settle(page);
  await page.waitForTimeout(1_200);
  if (!(await page.evaluate(() => "axe" in window))) await page.addScriptTag({ content: AXE_SOURCE });
  return page.evaluate(async () => {
    type AxeRun = (
      context: unknown,
      options: unknown,
    ) => Promise<{ violations: Array<{ id: string; impact: string | null; help: string; nodes: Array<{ target: string[]; failureSummary?: string }> }> }>;
    const axe = (window as unknown as { axe: { run: AxeRun } }).axe;
    const pinnedRoute = window.matchMedia("(min-width: 1024px) and (prefers-reduced-motion: no-preference)").matches;
    const ghost = pinnedRoute ? '[data-section="route"] .route-stop:not([data-current])' : null;
    const result = await axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
      resultTypes: ["violations"],
    });
    // The ghost caption is excluded from the contrast rule only, not from the whole scan.
    const isGhost = (target: string) => ghost !== null && document.querySelector(target)?.closest(ghost) != null;
    return result.violations
      .map((violation) => ({
        ...violation,
        nodes: violation.nodes.filter((node) => violation.id !== "color-contrast" || !node.target.some(isGhost)),
      }))
      .filter((violation) => violation.nodes.length > 0)
      .map(({ id, impact, help, nodes }) => ({ id, impact, help, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) }));
  });
}

test.describe("global: axe-core WCAG 2.2 AA scan", () => {
  test.setTimeout(180_000);

  test("no violations at the top (night) or the bottom (day) of the page", async ({ page }) => {
    await openPage(page);
    await mountEverything(page);
    for (const where of ["bottom", "top"] as const) {
      const violations = await scan(page, where);
      const report = violations.map(
        (violation) =>
          `[${violation.impact}] ${violation.id}: ${violation.help}\n  ${violation.nodes
            .slice(0, 5)
            .map((node) => `${node.target.join(" ")} :: ${(node.failureSummary ?? "").split("\n").slice(0, 2).join(" ")}`)
            .join("\n  ")}`,
      );
      expect(report, `axe violations at the ${where}`).toEqual([]);
    }
  });
});
