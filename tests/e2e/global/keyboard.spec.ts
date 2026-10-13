import { expect, test, type Page } from "@playwright/test";

import { openPage } from "../chrome-helpers";

/**
 * Keyboard-only path (spec 14): Tab from the skip link to the end of the page
 * reaches every interaction's keyboard control (hero building buttons, the
 * cart stepper, the receipt stub, the seam slider, the equation steppers,
 * the proposal buttons, the film controls and the form submit), never gets
 * stuck in a pinned section, keeps every focused element on screen, and
 * every focused element shows a visible focus indicator.
 *
 * A focused element passes the ring check when it draws an outline of at
 * least 2px itself, or when focusing it visibly changes the outline, border,
 * box-shadow or opacity of the element, its pseudo-elements, its two nearest
 * ancestors or its siblings (custom rings on radio cards, the seam knob, the
 * tear stub). That second case is measured by stepping back with Shift+Tab
 * and comparing.
 */

type Stop = {
  index: number;
  tag: string;
  name: string;
  section: string | null;
  role: string | null;
  inView: boolean;
  outline: boolean;
  signature: string;
};

const PROBE = "data-kb-probe";

async function focusedStop(page: Page, index: number): Promise<Stop | null> {
  return page.evaluate(
    ({ i, probe }) => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body || el === document.documentElement) return null;
      document.querySelectorAll(`[${probe}]`).forEach((node) => node.removeAttribute(probe));
      el.setAttribute(probe, "");
      const style = getComputedStyle(el);
      const width = Number.parseFloat(style.outlineWidth) || 0;
      const outline = style.outlineStyle !== "none" && width >= 2 && !/rgba\(\d+, \d+, \d+, 0\)/.test(style.outlineColor);
      const parts = [el, el.parentElement, el.parentElement?.parentElement, el.nextElementSibling, el.previousElementSibling].filter(
        (node): node is Element => node instanceof Element,
      );
      const look = (node: Element, pseudo?: string) => {
        const s = getComputedStyle(node, pseudo);
        return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderTopColor, s.borderTopWidth, s.opacity, s.backgroundColor].join("|");
      };
      const signature = [...parts.map((node) => look(node)), look(el, "::before"), look(el, "::after")].join("\n");
      const box = el.getBoundingClientRect();
      const inView = box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < window.innerHeight && box.right > 0 && box.left < window.innerWidth;
      const name = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("name") || "").replace(/\s+/g, " ").trim().slice(0, 60);
      return {
        index: i,
        tag: el.tagName.toLowerCase(),
        name,
        section: el.closest("[data-section]")?.getAttribute("data-section") ?? (el.closest("header") ? "nav" : el.closest("aside") ? "rail" : null),
        role: el.getAttribute("role"),
        inView,
        outline,
        signature,
      };
    },
    { i: index, probe: PROBE },
  );
}

async function unfocusedSignature(page: Page): Promise<string | null> {
  return page.evaluate((probe) => {
    const el = document.querySelector<HTMLElement>(`[${probe}]`);
    if (!el) return null;
    const parts = [el, el.parentElement, el.parentElement?.parentElement, el.nextElementSibling, el.previousElementSibling].filter(
      (node): node is Element => node instanceof Element,
    );
    const look = (node: Element, pseudo?: string) => {
      const s = getComputedStyle(node, pseudo);
      return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderTopColor, s.borderTopWidth, s.opacity, s.backgroundColor].join("|");
    };
    return [...parts.map((node) => look(node)), look(el, "::before"), look(el, "::after")].join("\n");
  }, PROBE);
}

test.describe("global: keyboard path", () => {
  test.setTimeout(300_000);

  test("Tab from the skip link reaches every control with a visible ring and no trap", async ({ page, browserName }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "touch project: no hardware keyboard on a phone (manual pass with a keyboard is in docs/qa)");
    await openPage(page);
    // Let lazy islands mount as they would for a reader: walk the page once, then start from the top.
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < height; y += 800) {
      await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
      await page.waitForTimeout(120);
    }
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForTimeout(800);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    const stops: Stop[] = [];
    const noRing: string[] = [];
    const offScreen: string[] = [];
    let repeats = 0;
    let previousKey = "";
    const modifier = browserName === "webkit" ? "Alt+Tab" : "Tab";

    for (let i = 0; i < 400; i += 1) {
      await page.keyboard.press(modifier);
      await page.waitForTimeout(60);
      const stop = await focusedStop(page, i);
      // The Next dev tools button (next dev only): off screen, not the page's.
      if (stop?.tag === "nextjs-portal") continue;
      if (!stop) {
        // Focus left the document (past the last control): the walk is complete.
        if (stops.length > 20) break;
        continue;
      }
      const key = `${stop.section}|${stop.tag}|${stop.name}|${stop.role}`;
      repeats = key === previousKey ? repeats + 1 : 0;
      previousKey = key;
      expect(repeats, `focus is stuck on ${key}`).toBeLessThan(3);
      stops.push(stop);

      if (!stop.inView) {
        // Smooth scroll or a pin may still be moving it into view.
        await page.waitForTimeout(400);
        const again = await focusedStop(page, i);
        if (again && !again.inView) offScreen.push(key);
      }
      if (!stop.outline) {
        await page.keyboard.press(browserName === "webkit" ? "Alt+Shift+Tab" : "Shift+Tab");
        await page.waitForTimeout(60);
        const resting = await unfocusedSignature(page);
        await page.keyboard.press(modifier);
        await page.waitForTimeout(60);
        if (resting === null || resting === stop.signature) noRing.push(key);
      }
    }

    const visited = (section: string, pattern: RegExp, role?: string) =>
      stops.some((stop) => stop.section === section && pattern.test(stop.name) && (role === undefined || stop.role === role));

    expect(stops[0]?.name, "the first Tab lands on the skip link").toBe("본문으로 건너뛰기");
    const desktop = (page.viewportSize()?.width ?? 0) >= 768;
    if (desktop) expect(visited("hero", /^(디오트|청평화|남평화|APM)$/), "hero building buttons").toBe(true);
    else expect(visited("hero", /^(디오트|청평화|남평화|APM)$/, "radio"), "hero building chips").toBe(true);
    expect(visited("cart", /./), "cart stepper").toBe(true);
    expect(visited("receipt", /2장 수령 확인/), "receipt stub").toBe(true);
    expect(stops.some((stop) => stop.section === "roles" && (stop.role === "slider" || stop.role === "radio")), "seam slider or role toggle").toBe(true);
    expect(visited("trust", /(늘리기|줄이기)/), "equation steppers").toBe(true);
    expect(visited("trust", /(기다리기 확정|취소 요청)/), "proposal buttons").toBe(true);
    expect(visited("film", /영상 보기/), "film play").toBe(true);
    expect(visited("signup", /^사전 신청$/), "form submit").toBe(true);
    expect(offScreen, "focused elements left off screen").toEqual([]);
    expect(noRing, "focused elements without a visible focus indicator").toEqual([]);
    testInfo.annotations.push({ type: "tab stops", description: String(stops.length) });
    await testInfo.attach("tab-stops.json", {
      body: JSON.stringify(
        stops.map((stop) => ({ ...stop, signature: undefined })),
        null,
        1,
      ),
      contentType: "application/json",
    });
  });

  test("focus inside a pin survives a ScrollTrigger refresh", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "pins exist only on desktop motion");
    await openPage(page);
    const targets = [
      { section: "words", locator: page.locator('[data-section="words"] button[data-vocab]').first() },
      { section: "film", locator: page.locator('[data-section="film"] button', { hasText: "영상 보기" }).first() },
    ];
    for (const target of targets) {
      await page.evaluate((id) => document.querySelector(`[data-section="${id}"]`)?.scrollIntoView(), target.section);
      await page.waitForTimeout(1200);
      await target.locator.focus();
      await expect(target.locator).toBeFocused();
      // A real resize makes ScrollTrigger revert and re-apply every pin (the same refresh a lazy island triggers).
      await page.setViewportSize({ width: 1440, height: 860 });
      await page.waitForTimeout(700);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForTimeout(900);
      await expect(target.locator, `${target.section}: focus after a refresh`).toBeFocused();
    }
  });
});
