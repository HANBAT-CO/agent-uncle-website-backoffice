import { expect, test, type ConsoleMessage } from "@playwright/test";

/**
 * Page shell smoke test (WP-00): the eleven sections render with one h1 and
 * one h2 per other section, the page opens at night, nothing logs an error,
 * and the LCP heading is set in the preloaded Paperlogy 800 display subset.
 */

test.describe("home page shell", () => {
  test("renders one h1, ten h2s and the night phase without console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message: ConsoleMessage) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    const response = await page.goto("/");
    expect(response?.ok()).toBe(true);

    await expect(page.locator("html")).toHaveAttribute("data-phase", "night");
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h2")).toHaveCount(10);
    await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("사입 요청부터 상품 수령까지 함께 기록해요.");

    const order = await page.locator("[data-section]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-section")));
    expect(order).toEqual(["hero", "words", "route", "cart", "dawn", "receipt", "roles", "trust", "film", "signup", "footer"]);
    await expect(page.locator("main#main > section")).toHaveCount(10);
    await expect(page.locator("body > footer#footer, footer#footer")).toHaveCount(1);

    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
  });

  test("ships the WebSite JSON-LD and a canonical", async ({ page }) => {
    await page.goto("/");
    const jsonLd = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
    expect(jsonLd).toMatchObject({ "@type": "WebSite", name: "사입삼춘", alternateName: "Agent Uncle", inLanguage: "ko-KR" });
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
  });

  test("sets the h1 in the preloaded Paperlogy 800 display subset", async ({ page, request }) => {
    await page.goto("/");
    const preloads = await page
      .locator('head link[rel="preload"][as="font"]')
      .evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href));
    expect(preloads).toHaveLength(2);
    const sizes = await Promise.all(preloads.map(async (href) => (await (await request.get(href)).body()).byteLength));
    // 400 is the page subset (about 25 KB, npm run fonts:page); 800 is the display subset (a few KB).
    expect(sizes.filter((size) => size < 20_000)).toHaveLength(1);

    const h1 = page.locator("h1");
    await expect(h1).toHaveCSS("font-weight", "800");
    expect(await h1.evaluate((node) => getComputedStyle(node).fontFamily)).toMatch(/Paperlogy/i);
    const loaded = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].some((face) => face.family.replace(/["']/g, "") === "Paperlogy" && face.weight === "800" && face.status === "loaded");
    });
    expect(loaded).toBe(true);
  });
});
