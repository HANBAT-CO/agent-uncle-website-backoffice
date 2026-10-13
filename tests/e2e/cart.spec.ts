import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * S4 cart (WP-13, spec S4 and 8): the hairline 손수레, its read-out, the
 * stepper and the home card's last line. Exploring is not recording: the
 * record plate keeps 확보 2 · 남은 미송 4 throughout.
 *
 * Runs in all three projects (desktop 1440x900, mobile WebKit 390x844,
 * reduced motion). The figure's tour plays once, seen: it starts when the
 * read-out is fully on screen and the figure at least half on screen, and a
 * walk the figure leaves stops at rest and plays again when it is back. Tests
 * that need a known value set it with Home/End first, which also stops the
 * tour (so does focus on the stepper).
 */

const REST_LABEL = "손수레 위 봉투 2개는 확보, 걸린 봉투 4개는 미송";

/** `visible` is the share of the stage on screen, to 0.01. */
type Sample = { t: number; text: string; exploring: boolean; label: string; visible: number };

/**
 * Logs every change of the read-out, its exploring state and the stage's
 * accessible name, and every 0.05 step of the stage's visible share, sampled
 * on each frame. The tour holds each count for under a second, shorter than
 * Playwright's backed-off polling, so tour assertions read this log instead.
 */
async function startSampling(page: Page) {
  await page.locator("section#cart").evaluate((node) => {
    const line = node.querySelector("[data-cart-readout-value]");
    const readout = node.querySelector("[data-cart-readout]");
    const stage = node.querySelector('[data-hairline="cart"]');
    const log: Sample[] = [];
    (window as unknown as { __cartLog: Sample[] }).__cartLog = log;
    const sample = (now: number) => {
      const box = stage?.getBoundingClientRect();
      const shown = box && box.height > 0 ? Math.max(0, Math.min(box.bottom, window.innerHeight) - Math.max(box.top, 0)) / box.height : 0;
      const next = {
        t: Math.round(now),
        text: line?.textContent ?? "",
        exploring: readout?.hasAttribute("data-exploring") ?? false,
        label: stage?.getAttribute("aria-label") ?? "",
        visible: Math.round(shown * 100) / 100,
      };
      const last = log.at(-1);
      if (
        !last ||
        last.text !== next.text ||
        last.exploring !== next.exploring ||
        last.label !== next.label ||
        Math.abs(last.visible - next.visible) >= 0.05
      )
        log.push(next);
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

async function sampled(page: Page): Promise<Sample[]> {
  return page.evaluate(() => (window as unknown as { __cartLog: Sample[] }).__cartLog);
}

/** Waits until the tour has shown 5 · 1 and returned to rest, then returns the log. */
async function tourLog(page: Page): Promise<Sample[]> {
  await expect
    .poll(
      async () => {
        const log = await sampled(page);
        const five = log.findIndex((entry) => entry.text === "확보 5 · 미송 1");
        return five >= 0 && log.slice(five).some((entry) => !entry.exploring);
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  return sampled(page);
}

/** The tour's shape: 1, 3, then 5 secured in that order, never 0, over (back at rest) within WCAG 2.2.2's 5s. */
function expectTourShape(log: Sample[]) {
  const texts = log.map((entry) => entry.text);
  expect(texts).not.toContain("확보 0 · 미송 6");
  expect(texts).not.toContain("확보 6 · 미송 0");
  const one = texts.indexOf("확보 1 · 미송 5");
  const three = texts.indexOf("확보 3 · 미송 3");
  const five = texts.indexOf("확보 5 · 미송 1");
  expect(one).toBeGreaterThanOrEqual(0);
  expect(three).toBeGreaterThan(one);
  expect(five).toBeGreaterThan(three);
  const began = log.findIndex((entry) => entry.exploring);
  const ended = log.findIndex((entry, index) => index > began && !entry.exploring);
  expect(began).toBeGreaterThanOrEqual(0);
  expect(ended).toBeGreaterThan(began);
  // The read-out explores for the walk (3.6s); the bags' 700ms return follows. The kernel's own tour took about 6.3s.
  expect(log[ended]!.t - log[began]!.t).toBeLessThan(4_000);
  expect(log[ended]!.text).toBe(REST_TEXT);
}

const REST_TEXT = "확보 2 · 미송 4";
const INK = "rgb(237, 236, 227)"; // #EDECE3, night ink
const GREY = "rgb(182, 215, 194)"; // #B6D7C2, exploring numbers
const HOME_INK = "rgb(16, 16, 16)"; // #101010 on paper
const HOME_GREY = "rgb(99, 99, 99)"; // #636363 on paper

function cartParts(page: Page) {
  const section = page.locator("section#cart");
  return {
    section,
    stage: section.locator('[data-hairline="cart"]'),
    readout: section.locator("[data-cart-readout]"),
    value: section.locator("[data-cart-readout-value]"),
    live: section.locator("[data-cart-readout-live]"),
    note: section.locator("[data-cart-readout-note]"),
    home: section.locator("[data-cart-home-backorder]"),
    mint: section.locator("[data-cart-mint-card]"),
    homeCard: section.locator("[data-cart-home-card]"),
    spinbutton: section.getByRole("spinbutton", { name: "확보 수량 미리 보기" }),
    plus: section.getByRole("button", { name: "확보 수량 늘리기" }),
    minus: section.getByRole("button", { name: "확보 수량 줄이기" }),
  };
}

/**
 * Scrolls `target` to `place` and keeps doing so until the page stops moving
 * under it. Pins above the cart are built after load (and the figure asks for
 * a ScrollTrigger refresh when it mounts), which can push the cart thousands
 * of pixels down after an early scroll.
 */
async function scrollSettled(target: Locator, place: "center" | "readout") {
  await expect
    .poll(
      () =>
        target.evaluate(async (node, mode) => {
          const go = () => {
            if (mode === "center") node.scrollIntoView({ block: "center", behavior: "instant" });
            // The read-out's bottom at 85% of the viewport: fully on screen, above the mobile record pill.
            else window.scrollBy({ top: node.getBoundingClientRect().bottom - window.innerHeight * 0.85, behavior: "instant" });
          };
          go();
          const before = node.getBoundingClientRect().top + window.scrollY;
          await new Promise((resolve) => setTimeout(resolve, 500));
          const after = node.getBoundingClientRect().top + window.scrollY;
          go();
          return Math.abs(after - before) < 1;
        }, place),
      { timeout: 30_000, intervals: [100] },
    )
    .toBe(true);
}

/** Centres the figure, which also makes the cart the active section, and waits for the lazy figure. */
async function bringCartIntoView(page: Page) {
  const { stage } = cartParts(page);
  await page.waitForLoadState("load");
  await scrollSettled(stage, "center");
  await expect(stage).toHaveAttribute("data-mounted", "", { timeout: 30_000 });
  await expect(stage.locator("svg")).toHaveCount(1);
  await scrollSettled(stage, "center");
  await expect(stage).toBeInViewport({ ratio: 0.5 });
}

/** Puts the whole read-out on screen (where the tour starts), with the figure above it. */
async function bringReadoutIntoView(page: Page) {
  const { stage, readout } = cartParts(page);
  await bringCartIntoView(page);
  await scrollSettled(readout, "readout");
  await expect(readout).toBeInViewport({ ratio: 1 });
  await expect(stage).toBeInViewport({ ratio: 0.5 });
}

async function colorOf(locator: Locator): Promise<string> {
  return locator.evaluate((node) => getComputedStyle(node).color);
}

/**
 * Each text line of an [app] card against the card's own paper, as WCAG
 * contrast ratios, with the card's opacity composited over the plate #093A32.
 * Reads rgb() and color(srgb ...) (a color-mix() resolves to the latter).
 */
async function cardLineContrasts(card: Locator): Promise<{ text: string; ratio: number }[]> {
  return card.evaluate((node) => {
    const channels = (value: string) => {
      const numbers = (value.match(/[\d.]+/g) ?? []).map(Number).slice(0, 3);
      return value.startsWith("color(") ? numbers.map((channel) => channel * 255) : numbers;
    };
    const luminance = (rgb: number[]) => {
      const linear = (channel: number) => {
        const c = channel / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * linear(rgb[0]!) + 0.7152 * linear(rgb[1]!) + 0.0722 * linear(rgb[2]!);
    };
    const plate = [9, 58, 50];
    const style = getComputedStyle(node);
    const alpha = Number(style.opacity);
    const over = (rgb: number[]) => rgb.map((channel, index) => channel * alpha + plate[index]! * (1 - alpha));
    const paper = luminance(over(channels(style.backgroundColor)));
    return [...node.querySelectorAll("p")].map((line) => {
      const ink = luminance(over(channels(getComputedStyle(line).color)));
      const [light, dark] = paper > ink ? [paper, ink] : [ink, paper];
      return { text: line.textContent ?? "", ratio: Math.round(((light + 0.05) / (dark + 0.05)) * 100) / 100 };
    });
  });
}

/** The record plate (WP-02) at the cart's beat b0307: 확보 2, 남은 미송 4, whatever the visitor previews here. */
async function expectPlateUnchanged(page: Page) {
  const summaries = page.locator("[data-plate-summary]");
  await expect.poll(() => summaries.count(), { timeout: 15_000 }).toBeGreaterThan(0);
  await expect
    .poll(
      async () =>
        (await summaries.allTextContents()).every((text) => text.includes("확보 2장") && text.includes("남은 미송 4장")),
      {
        timeout: 15_000,
      },
    )
    .toBe(true);
}

async function expectRest(page: Page) {
  const { readout, value, home, note } = cartParts(page);
  await expect(value).toHaveText(REST_TEXT);
  await expect(readout).not.toHaveAttribute("data-exploring");
  await expect(note).not.toHaveAttribute("data-on");
  await expect(home).toHaveText("남은 미송 4장");
  // The whole line, words and numbers, is ink at rest and grey while exploring.
  await expect.poll(() => colorOf(value)).toBe(INK);
  await expect.poll(() => colorOf(value.locator("span").first())).toBe(INK);
  await expect.poll(() => colorOf(home)).toBe(HOME_INK);
}

test.describe("S4 cart", () => {
  test("the read-out shows the record at rest", async ({ page }) => {
    await page.goto("/");
    const { section, value, stage } = cartParts(page);
    await expect(section.getByRole("heading", { level: 2 })).toHaveAccessibleName("확보는 확보대로, 미송은 날짜와 함께.");
    await expect(value).toHaveText(REST_TEXT);
    await expect(section.getByText("요청 6장", { exact: true })).toBeVisible();
    await expect(section.getByText("2026-10-13 미송 재확인")).toBeVisible();
    await expect(section.getByText("손수레 위 봉투는 확보, 걸린 봉투는 아직 미송이에요.")).toBeVisible();
    await expect(stage).toHaveAttribute("role", "img");
    await expect(stage).toHaveAttribute("aria-label", REST_LABEL);
    await expectRest(page);
  });

  test("the stepper previews 5 in grey, the home card follows, and resetting returns to the ink record", async ({ page }) => {
    await page.goto("/");
    await bringCartIntoView(page);
    await expectPlateUnchanged(page);
    const { readout, value, live, note, home, mint, homeCard, spinbutton, minus, stage } = cartParts(page);

    await spinbutton.focus();
    await page.keyboard.press("End");
    await expect(value).toHaveText("확보 6 · 미송 0");
    // Nothing owed: the [app] cards that exist only while 미송 remains recede; their strings stay.
    await expect(mint).toHaveAttribute("data-moot", "");
    await expect(homeCard).toHaveAttribute("data-moot", "");
    await expect(home).toHaveText("남은 미송 0장");
    // They recede by colour, not opacity: once the change has landed the paper has sunk, and every line,
    // the live 남은 미송 0장 included, keeps AA on it.
    for (const [card, restPaper, lines] of [
      [mint, "rgb(242, 255, 232)", 2],
      [homeCard, "rgb(245, 244, 238)", 4],
    ] as const) {
      await expect.poll(() => card.evaluate((node) => node.getAnimations({ subtree: true }).length), { timeout: 3_000 }).toBe(0);
      await expect(card).toHaveCSS("opacity", "1");
      expect(await card.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe(restPaper);
      const contrasts = await cardLineContrasts(card);
      expect(contrasts).toHaveLength(lines);
      for (const line of contrasts) expect(line.ratio, line.text).toBeGreaterThanOrEqual(4.5);
    }
    await minus.click();

    await expect(value).toHaveText("확보 5 · 미송 1");
    await expect(mint).not.toHaveAttribute("data-moot");
    await expect(homeCard).not.toHaveAttribute("data-moot");
    await expect(readout).toHaveAttribute("data-exploring", "");
    await expect(spinbutton).toHaveAttribute("aria-valuenow", "5");
    await expect.poll(() => colorOf(value)).toBe(GREY);
    await expect.poll(() => colorOf(value.locator("span").first())).toBe(GREY);
    await expect(live).toHaveText("확보 5 · 미송 1. 미리 보기예요. 기록은 확보 2 · 미송 4 그대로예요.");
    await expect(note).toHaveAttribute("data-on", "");
    await expect(note).toHaveText("미리 보기예요. 기록은 확보 2 · 미송 4 그대로예요.");
    await expect(home).toHaveText("남은 미송 1장");
    await expect.poll(() => colorOf(home)).toBe(HOME_GREY);
    await expect(stage).toHaveAttribute("aria-label", "손수레 위 봉투 5개는 확보, 걸린 봉투 1개는 미송");
    await expectPlateUnchanged(page);

    await spinbutton.focus();
    for (const key of ["ArrowDown", "ArrowDown", "ArrowLeft"]) await page.keyboard.press(key);
    await expectRest(page);
    await expect(stage).toHaveAttribute("aria-label", REST_LABEL);
    await expect(live).toHaveText(REST_TEXT);
    await expectPlateUnchanged(page);
  });

  test("the stepper cannot go past 6 or below 0", async ({ page }) => {
    await page.goto("/");
    await bringCartIntoView(page);
    const { value, spinbutton, plus, minus } = cartParts(page);

    await spinbutton.focus();
    await page.keyboard.press("End");
    await expect(value).toHaveText("확보 6 · 미송 0");
    await expect(plus).toHaveAttribute("aria-disabled", "true");
    await plus.click({ force: true });
    // WebKit does not focus a tapped button, so a keyboard user is back on the spinbutton.
    await spinbutton.focus();
    await page.keyboard.press("ArrowUp");
    await expect(value).toHaveText("확보 6 · 미송 0");
    await expect(spinbutton).toHaveAttribute("aria-valuenow", "6");

    await spinbutton.focus();
    await page.keyboard.press("Home");
    await expect(value).toHaveText("확보 0 · 미송 6");
    await expect(minus).toHaveAttribute("aria-disabled", "true");
    await expect(plus).toHaveAttribute("aria-disabled", "false");
    await minus.click({ force: true });
    await spinbutton.focus();
    await page.keyboard.press("ArrowDown");
    await expect(value).toHaveText("확보 0 · 미송 6");
    await expect(spinbutton).toHaveAttribute("aria-valuenow", "0");

    // Page Up and Page Down step by two, and stop at the ends too.
    await spinbutton.focus();
    await page.keyboard.press("PageUp");
    await expect(spinbutton).toHaveAttribute("aria-valuenow", "2");
    await page.keyboard.press("PageUp");
    await expect(value).toHaveText("확보 4 · 미송 2");
    await page.keyboard.press("PageUp");
    await page.keyboard.press("PageUp");
    await expect(spinbutton).toHaveAttribute("aria-valuenow", "6");
    await page.keyboard.press("PageDown");
    await expect(value).toHaveText("확보 4 · 미송 2");
    await expectPlateUnchanged(page);
  });

  test("leaving the figure returns the read-out to the record", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "no hover on touch; the stepper path covers mobile");
    await page.goto("/");
    await bringCartIntoView(page);
    const { stage, value, readout } = cartParts(page);
    const box = await stage.boundingBox();
    if (!box) throw new Error("The cart stage has no box.");

    // The bands: n = clamp(round((288 - y) / 36), 0, 6) in viewBox units. Above the top band reads 6·0, below the bottom one 0·6.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * (40 / 320));
    await expect(value).toHaveText("확보 6 · 미송 0");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * (312 / 320));
    await expect(value).toHaveText("확보 0 · 미송 6");
    await expect(readout).toHaveAttribute("data-exploring", "");
    await expectPlateUnchanged(page);

    await page.mouse.move(2, 2);
    await expectRest(page);
  });

  test("a mouse leaving through the bottom band does not flash zero secured", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "mouse grace: desktop only");
    await page.goto("/");
    await bringCartIntoView(page);
    await startSampling(page);
    const { stage, value } = cartParts(page);
    const box = await stage.boundingBox();
    if (!box) throw new Error("The cart stage has no box.");

    await page.mouse.move(box.x + box.width / 2, box.y + box.height * (40 / 320));
    await expect(value).toHaveText("확보 6 · 미송 0");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * (312 / 320));
    await page.mouse.move(box.x + box.width / 2, box.y + box.height + 16);

    await expectRest(page);
    await page.waitForTimeout(200);
    expect((await sampled(page)).map((entry) => entry.text)).not.toContain("확보 0 · 미송 6");
  });

  test("the tour plays once when the read-out is on screen: 1, 3, 5, never 0, silent, over within 5s", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "reduced-motion", "no tour under reduced motion");
    await page.goto("/");
    await page.waitForLoadState("load");
    const { readout, live, spinbutton, stage } = cartParts(page);
    await startSampling(page);
    await bringReadoutIntoView(page);

    await expect(readout).toHaveAttribute("data-exploring", "", { timeout: 10_000 });
    // The tour moves what is seen, but the live region and the figure's name keep the record: only a person's changes are spoken.
    await expect(live).toHaveText(REST_TEXT);
    const log = await tourLog(page);
    expectTourShape(log);
    expect(log.every((entry) => entry.label === REST_LABEL)).toBe(true);
    await expectRest(page);
    await expect(spinbutton).toHaveAttribute("aria-valuenow", "2");
    await expect(stage).toHaveAttribute("aria-label", REST_LABEL);
    // It never loops: a further 4.5s (longer than the tour's start delay and its whole walk) stays at rest.
    await page.waitForTimeout(4_500);
    await expect(readout).not.toHaveAttribute("data-exploring");
    await expect(live).toHaveText(REST_TEXT);
    await expectPlateUnchanged(page);
  });

  test("a tour the figure leaves stops at rest and plays again, whole, when the figure is back", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "reduced-motion", "no tour under reduced motion");
    await page.goto("/");
    await page.waitForLoadState("load");
    const { stage, readout, value, home, live } = cartParts(page);
    await bringReadoutIntoView(page);
    await expect(readout).toHaveAttribute("data-exploring", "", { timeout: 10_000 });

    // Mid-walk, scroll the figure to about 30% on screen: the walk gives up at rest.
    await stage.evaluate((node) => window.scrollBy({ top: node.getBoundingClientRect().top + node.getBoundingClientRect().height * 0.7, behavior: "instant" }));
    await expect(readout).not.toHaveAttribute("data-exploring", { timeout: 1_500 });
    await expect(value).toHaveText(REST_TEXT);
    await expect(home).toHaveText("남은 미송 4장");
    await expect(live).toHaveText(REST_TEXT);
    // Nothing plays while the figure is away, for longer than the start delay and a whole walk.
    await startSampling(page);
    await page.waitForTimeout(4_500);
    expect((await sampled(page)).some((entry) => entry.exploring)).toBe(false);

    // Back in view, it was not spent: it plays from the start.
    await startSampling(page);
    await bringReadoutIntoView(page);
    const log = await tourLog(page);
    expectTourShape(log);
    expect(log.filter((entry) => entry.exploring).every((entry) => entry.visible >= 0.5)).toBe(true);
    await expectRest(page);
    await expectPlateUnchanged(page);
  });

  test("a steady wheel scroll through the cart never plays the tour unseen, and does not spend it", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "wheel: desktop only");
    await page.goto("/");
    await page.waitForLoadState("load");
    const { stage, readout } = cartParts(page);
    await bringCartIntoView(page);
    // The figure just below the fold, the cursor parked off the stage.
    await stage.evaluate((node) => window.scrollBy({ top: node.getBoundingClientRect().top - window.innerHeight, behavior: "instant" }));
    await page.mouse.move(8, 450);
    await startSampling(page);
    // About 400px/s, until the figure has gone off the top.
    for (let step = 0; step < 60; step++) {
      if (await stage.evaluate((node) => node.getBoundingClientRect().bottom < 0)) break;
      await page.mouse.wheel(0, 100);
      await page.waitForTimeout(250);
    }
    expect(await stage.evaluate((node) => node.getBoundingClientRect().bottom)).toBeLessThan(0);
    await page.waitForTimeout(1_500);
    const pass = await sampled(page);
    // A walk may start while the figure is half on screen; it is gone by the time less than 40% is left.
    expect(pass.filter((entry) => entry.exploring && entry.visible < 0.4)).toEqual([]);
    await expect(readout).not.toHaveAttribute("data-exploring");

    // The pass did not use the tour up: back at the figure, it plays whole.
    await startSampling(page);
    await bringReadoutIntoView(page);
    expectTourShape(await tourLog(page));
  });

  test("a cursor parked over the page while the wheel scrolls the cart in does not cancel the tour", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "a parked mouse cursor: desktop only");
    await page.goto("/");
    await page.waitForLoadState("load");
    const { stage, readout } = cartParts(page);
    await bringCartIntoView(page);
    await startSampling(page);
    // Back up so the read-out sits well below the fold, then park the cursor mid-screen and wheel down.
    await page.evaluate(() => window.scrollBy({ top: -window.innerHeight * 1.2, behavior: "instant" }));
    await page.mouse.move(720, 450);
    for (let step = 0; step < 80; step++) {
      const inView = await readout.evaluate((node) => node.getBoundingClientRect().bottom < window.innerHeight * 0.85);
      if (inView) break;
      await page.mouse.wheel(0, 80);
      await page.waitForTimeout(100);
    }
    // The stage has scrolled under the parked cursor (a pointerenter, no pointermove).
    const box = await stage.boundingBox();
    if (!box) throw new Error("The cart stage has no box.");
    expect(box.y).toBeLessThan(450);
    expect(box.y + box.height).toBeGreaterThan(450);
    expectTourShape(await tourLog(page));
    await expect(readout).not.toHaveAttribute("data-exploring");
  });

  test("focus on the stepper keeps the tour from moving the value under it", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "reduced-motion", "no tour under reduced motion");
    await page.goto("/");
    await bringCartIntoView(page);
    const { readout, spinbutton, minus } = cartParts(page);
    await minus.focus();
    await bringReadoutIntoView(page);
    await expect(minus).toBeFocused();
    // Longer than the tour's start delay and its first travel.
    await page.waitForTimeout(4_000);
    await expect(readout).not.toHaveAttribute("data-exploring");
    await expect(spinbutton).toHaveAttribute("aria-valuenow", "2");
    await expect(minus).toHaveAttribute("aria-disabled", "false");
  });

  test("touch: a tap on the figure holds its band, like the stepper", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "touch only");
    await page.goto("/");
    await bringCartIntoView(page);
    const { stage, value, readout, spinbutton, live } = cartParts(page);
    const box = await stage.boundingBox();
    if (!box) throw new Error("The cart stage has no box.");

    // Near the top: above the top band reads 6·0.
    await stage.tap({ position: { x: box.width / 2, y: box.height * 0.12 } });
    await expect(value).toHaveText("확보 6 · 미송 0");
    await expect(readout).toHaveAttribute("data-exploring", "");
    await expect(spinbutton).toHaveAttribute("aria-valuenow", "6");
    // The kernel would revert a touch 1.4s after the finger leaves; a tap holds.
    await page.waitForTimeout(2_500);
    await expect(value).toHaveText("확보 6 · 미송 0");
    await expect(live).toHaveText("확보 6 · 미송 0. 미리 보기예요. 기록은 확보 2 · 미송 4 그대로예요.");

    // The record's own band returns to rest.
    await stage.tap({ position: { x: box.width / 2, y: box.height * (216 / 320) } });
    await expectRest(page);
    await expectPlateUnchanged(page);
  });

  test("reduced motion: no tour, and the stepper lands at once", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "reduced-motion", "reduced-motion project only");
    await page.goto("/");
    await bringCartIntoView(page);
    const { readout, value, plus, stage } = cartParts(page);

    await page.waitForTimeout(4_500);
    await expect(readout).not.toHaveAttribute("data-exploring");
    await expect(value).toHaveText(REST_TEXT);

    await plus.click();
    await expect(value).toHaveText("확보 3 · 미송 3", { timeout: 500 });
    // The colour change has no transition under reduced motion: it lands on the next frame.
    await expect.poll(() => colorOf(value), { timeout: 500 }).toBe(GREY);
    await expect(stage).toHaveAttribute("aria-label", "손수레 위 봉투 3개는 확보, 걸린 봉투 3개는 미송", { timeout: 1_000 });
    await expectPlateUnchanged(page);
  });
});
