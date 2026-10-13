import { chromium, expect, test, type Locator, type Page } from "@playwright/test";

import { words } from "../../src/content/copy";
import { VOCAB } from "../../src/content/glossary";
import { expectBeat, openPage, settle } from "./chrome-helpers";

/**
 * S2 words (WP-11): the 23:30 physics pit re-cut into the app's real buttons.
 *
 * all projects: the ledger is an ordered list of six rows with the exact
 *   token labels and a hidden connective that says whether each token is a
 *   button or a record; the falling phrase bubbles are aria-hidden
 *   duplicates; the vocabulary pills are toggletip buttons described by their
 *   glossary line; closed glossary lines leave the accessibility tree; the
 *   caption is exposed once.
 * desktop: the pit falls on entry inside its own box (12 bodies, grab
 *   enabled, the ceiling seals at the pit top); the heading is inked and the
 *   map at 25% by the pin; at any scroll speed the freeze records a resting
 *   pile (never pills in mid-air over the copy); a wheel flick and the nav
 *   anchor 흐름 leave every pill inside the pit; after the pin all six tokens
 *   and the closing line show and fit short laptop screens; a fast reverse
 *   strands nothing; scrolling above the section resets the pit and re-entry
 *   replays the fall, also after an instant jump (Home, scrollTo(0)) from
 *   deep in the pin; a flying bubble paints over the pile; the bin's rules
 *   are gone before the lower ledger rows land; the pin start shifts no
 *   layout, nor does a wheel pass from the hero into the next section at 4x
 *   CPU (page CLS under 0.1); scrubbed back under the freeze the pile is live
 *   again (pills take presses, a bubble can be grabbed, the next pass
 *   re-cuts); the runner stops off-screen and after a throw released outside
 *   the pit; a sleeping bubble can be grabbed; blocks dissolve before they
 *   reach the nav; keyboard focus lands on the pile at rest; the plate shows
 *   b2330.
 * mobile: 8 bodies, no grab; touch never captured (no cancelled touch events
 *   in WebKit; a real touch drag over the pit scrolls the page in Chromium);
 *   the pile rests close under the lede (no dead band); a tap toggles a
 *   glossary line; before the fall the heap waits unseen and the fall shifts
 *   no layout (Chromium, 4x CPU); arriving from below the pile is at rest.
 * every motion project: the pit (and matter-js) loads on the reader's first
 *   scroll toward the section, never at page load.
 * reduced-motion: the static heap and list, no physics engine, no canvas.
 *
 * Words hooks: .words-root[data-words-mode=desktop|mobile|reduced],
 * [data-words-pit][data-pit-mode=heap|live][data-pit-state=idle|falling|frozen]
 * [data-pit-heap=shown][data-pit-rest]
 * [data-pit-runner=running|stopped][data-pit-frames][data-pit-bodies]
 * [data-pit-engine=ready][data-pit-grab][data-pit-sealed][data-pit-asleep],
 * [data-body=b0..b5|v0..v5][data-landed], [data-skin-state],
 * [data-ledger-token], [data-ledger-arrow], [data-words-closing],
 * [data-words-caption], [data-words-caption-echo].
 */

/** Pin progress at which the pit freezes (src/components/sections/words/recut.ts RECUT.freezeAt). */
const FREEZE_AT = 0.18;

function onlyIn(project: string) {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== project, `${project} project only`);
  });
}

function section(page: Page): Locator {
  return page.locator('[data-section="words"]');
}

function pit(page: Page): Locator {
  return page.locator("[data-words-pit]");
}

/**
 * Jump to `y` and make it stick. While Lenis is still easing out a wheel or an
 * anchor scroll (html.lenis-smooth; its last pixel can take a second) it
 * writes its own position back over an instant scrollTo, so wait for that ease
 * to end first, then repeat the jump until it holds.
 */
async function scrollToY(page: Page, y: number, wait = true): Promise<void> {
  await page.waitForFunction(() => !document.documentElement.classList.contains("lenis-smooth"), undefined, { timeout: 15_000 });
  await page.waitForFunction(
    (top) =>
      new Promise<boolean>((resolve) => {
        const target = Math.min(Math.max(0, Math.round(top)), document.documentElement.scrollHeight - window.innerHeight);
        window.scrollTo({ top: target, behavior: "instant" });
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => resolve(Math.abs(window.scrollY - target) < 2), 120)));
      }),
    y,
    { timeout: 15_000, polling: 50 },
  );
  if (wait) await settle(page);
}

/** Put the words section's top edge at `fraction` of the viewport height (0 = top, 1 = bottom). */
async function placeSectionTop(page: Page, fraction: number, wait = true): Promise<void> {
  const y = await page.evaluate((f) => {
    const element = document.querySelector<HTMLElement>('[data-section="words"]');
    if (!element) throw new Error("no words section");
    return element.getBoundingClientRect().top + window.scrollY - window.innerHeight * f;
  }, fraction);
  await scrollToY(page, y, wait);
}

/** The desktop pin's scroll range. */
async function pinRange(page: Page): Promise<{ start: number; length: number }> {
  return page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>("[data-words-stage]");
    const spacer = stage?.parentElement;
    if (!spacer?.classList.contains("pin-spacer")) throw new Error("the words stage is not pinned");
    const start = spacer.getBoundingClientRect().top + window.scrollY;
    return { start, length: spacer.offsetHeight - window.innerHeight };
  });
}

/** Scroll the desktop pin to `progress` (0..1). */
async function toPin(page: Page, progress: number, wait = true): Promise<void> {
  const { start, length } = await pinRange(page);
  await scrollToY(page, start + progress * length, wait);
}

async function pitData(page: Page): Promise<Record<string, string | undefined>> {
  return pit(page).evaluate((element) => ({ ...(element as HTMLElement).dataset }));
}

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

/** Visible pills whose box leaves the pit box (beyond a small tolerance for rotated corners). */
async function pillsOutsidePit(page: Page, tolerance = 12): Promise<string[]> {
  return pit(page).evaluate((element, slack) => {
    const box = element.getBoundingClientRect();
    return Array.from(element.querySelectorAll<HTMLElement>("[data-body]"))
      .filter((body) => getComputedStyle(body).visibility !== "hidden" && getComputedStyle(body).display !== "none")
      .map((body) => ({ id: body.dataset.body ?? "", rect: body.querySelector("[data-skin]")?.getBoundingClientRect() }))
      .filter(
        ({ rect }) =>
          rect &&
          (rect.top < box.top - slack || rect.bottom > box.bottom + slack || rect.left < box.left - slack || rect.right > box.right + slack),
      )
      .map(({ id, rect }) => `${id}@${Math.round(rect?.top ?? 0)}`);
  }, tolerance);
}

/** Visible pills that reach above the lede's bottom edge (over the heading or the lede). */
async function pillsOverCopy(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const lede = document.querySelector<HTMLElement>("[data-words-lede]")?.getBoundingClientRect();
    const pitBox = document.querySelector<HTMLElement>("[data-words-pit]")?.getBoundingClientRect();
    if (!lede || !pitBox) throw new Error("no lede or pit");
    return Array.from(document.querySelectorAll<HTMLElement>("[data-words-pit] [data-body]"))
      .filter((body) => getComputedStyle(body).visibility !== "hidden" && getComputedStyle(body).display !== "none")
      .map((body) => ({ id: body.dataset.body ?? "", rect: body.querySelector("[data-skin]")?.getBoundingClientRect() }))
      .filter(({ rect }) => rect && rect.bottom > pitBox.top && Math.max(rect.top, pitBox.top) < lede.bottom - 1)
      .map(({ id, rect }) => `${id}@${Math.round(rect?.top ?? 0)}`);
  });
}

/** Scroll at a steady speed (scrollTo every 50ms) from the section's entry to pin `progress`. */
async function steadyScrollToPin(page: Page, pxPerSecond: number, progress: number): Promise<void> {
  const { start, length } = await pinRange(page);
  const height = await page.evaluate(() => window.innerHeight);
  const target = start + progress * length;
  let y = start - height;
  await scrollToY(page, y);
  const step = pxPerSecond / 20;
  while (y < target) {
    y = Math.min(target, y + step);
    await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), Math.round(y));
    await page.waitForTimeout(50);
  }
  // A visitor pauses; the scrub (0.8s) catches up.
  await page.waitForTimeout(1200);
}

test.describe("S2 words: semantics (every project)", () => {
  test("the ledger is an ordered list of six rows with the exact token labels and a connective per kind", async ({ page }) => {
    await openPage(page);
    const list = section(page).locator("ol[data-words-ledger]");
    await expect(list).toHaveCount(1);
    const items = list.locator(":scope > li");
    await expect(items).toHaveCount(6);
    await expect(list.locator("[data-ledger-token]")).toHaveText(words.ledger.map((row) => row.token));
    await expect(list.locator("[data-ledger-phrase]")).toHaveText(words.ledger.map((row) => row.phrase));
    // The hidden connective says what the token is: a button you press or a record the app keeps.
    for (const [index, row] of words.ledger.entries()) {
      await expect(items.nth(index).locator("[data-ledger-arrow]")).toHaveText(row.kind === "action" ? words.arrowAction : words.arrowRecord);
    }
    // '‘…’' is punctuation screen readers skip: it is hidden and read as words instead.
    const last = items.nth(5);
    await expect(last.locator("[data-ledger-phrase]")).toHaveAttribute("aria-hidden", "true");
    const silent = words.ledger[5];
    await expect(last).toContainText("srPhrase" in silent ? silent.srPhrase : "");
    await expect(last).toContainText("답이 없다고 동의한 게 아니에요.");
    await expect(section(page).locator("[data-words-closing]")).toHaveText(words.closing);
    // The caption is exposed once; the ledger's copy of it is an aria-hidden duplicate.
    await expect(section(page).locator("[data-words-caption]")).toHaveText(words.caption);
    await expect(section(page).locator("[data-words-caption-echo]")).toHaveAttribute("aria-hidden", "true");
    const exposed = await section(page).evaluate(
      (element, caption) =>
        Array.from(element.querySelectorAll("p")).filter((node) => node.textContent === caption && !node.closest('[aria-hidden="true"]')).length,
      words.caption,
    );
    expect(exposed).toBe(1);
  });

  test("the falling bubbles are aria-hidden duplicates and the vocabulary pills are described toggletip buttons", async ({ page }, testInfo) => {
    await openPage(page);
    const bubbles = pit(page).locator('[data-body][data-kind="bubble"]');
    await expect(bubbles).toHaveCount(6);
    for (let index = 0; index < 6; index += 1) {
      await expect(bubbles.nth(index)).toHaveAttribute("aria-hidden", "true");
    }
    const ledger = section(page).getByRole("list");
    await expect(ledger.getByRole("listitem")).toHaveCount(6);
    // Phones keep two pills (spec S2: 누적 확보, 재확인일); the other four are not rendered there.
    const mobileTerms: readonly string[] = words.vocabMobile;
    const shown = testInfo.project.name === "mobile" ? VOCAB.filter((entry) => mobileTerms.includes(entry.term)) : VOCAB;
    await expect(pit(page).getByRole("button")).toHaveCount(shown.length);
    for (const entry of shown) {
      const button = pit(page).getByRole("button", { name: entry.term, exact: true });
      await expect(button).toHaveCount(1);
      await expect(button).toHaveAccessibleDescription(entry.gloss);
      await expect(button).toHaveAttribute("aria-expanded", "false");
    }
    // Closed glossary lines are not standalone nodes in the accessibility tree.
    await expect(pit(page).getByRole("tooltip")).toHaveCount(0);
  });
});

test.describe("S2 words: the physics loads on approach", () => {
  test("the pit (and matter-js) is not loaded at page load; the reader's scroll toward the section loads it", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "reduced-motion", "reduced motion never loads the physics");
    await openPage(page);
    await page.waitForTimeout(1500);
    // data-pit-engine is set by the lazy Pit once matter-js has been imported.
    expect(await pit(page).getAttribute("data-pit-engine")).toBeNull();
    await placeSectionTop(page, 0.95);
    await expect(pit(page)).toHaveAttribute("data-pit-engine", "ready", { timeout: 20_000 });
  });

  test("a physics chunk that fails to load leaves the section intact: the heap rests in the pit and the ledger still shows", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "reduced-motion", "reduced motion never loads the physics");
    const errors = collectPageErrors(page);
    let aborted = 0;
    // A flaky network, or old chunk hashes gone after a deploy.
    await page.route(/matter-js/, (route) => {
      aborted += 1;
      return route.abort();
    });
    await openPage(page);
    // The fall starts as the pit comes over the fold (desktop) or reaches 70% of the screen (phones).
    await placeSectionTop(page, testInfo.project.name === "desktop" ? 0.45 : 0.1);
    await expect(pit(page)).toHaveAttribute("data-pit-state", "falling");
    // No engine: the hand-composed heap comes back, at rest.
    await expect(pit(page)).toHaveAttribute("data-pit-heap", "shown", { timeout: 10_000 });
    expect(aborted).toBeGreaterThan(0);
    await expect(section(page).locator("[data-words-stage]")).toBeAttached();
    expect(await pit(page).getAttribute("data-pit-engine")).toBeNull();
    await expect(pit(page)).toHaveAttribute("data-pit-mode", "heap");
    await expect.poll(() => pit(page).locator('[data-body="v0"]').evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
    await placeSectionTop(page, 0.1);
    expect(await pillsOutsidePit(page)).toEqual([]);
    expect(await pillsOverCopy(page)).toEqual([]);

    const tokens = section(page).locator("[data-ledger-token]");
    if (testInfo.project.name === "desktop") {
      // The re-cut runs on the heap: every bubble lands on its ledger token.
      await toPin(page, 1);
      await expect(pit(page)).toHaveAttribute("data-pit-state", "frozen");
      await expect(pit(page).locator("[data-body][data-landed]")).toHaveCount(6);
      for (let index = 0; index < 6; index += 1) {
        await expect.poll(() => tokens.nth(index).evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
      }
      // Back at the pile: it rests in the pit, and its vocabulary pills still open their captions.
      await toPin(page, 0.05);
      await expect(pit(page)).toHaveAttribute("data-pit-rest", "");
      expect(await pillsOutsidePit(page)).toEqual([]);
      const pill = pit(page).locator('[data-body="v0"] [data-vocab]');
      await pill.click();
      await expect(pill).toHaveAttribute("aria-expanded", "true");
    } else {
      await tokens.last().scrollIntoViewIfNeeded();
      await expect(tokens.last()).toBeInViewport();
    }
    await expect(page.getByText("This page couldn’t load")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test.describe("S2 words: desktop", () => {
  onlyIn("desktop");

  test("the pit falls on entry inside its own box, runs at 12 bodies and stops off-screen", async ({ page }) => {
    const errors = collectPageErrors(page);
    await openPage(page);
    await expect(section(page).locator(".words-root")).toHaveAttribute("data-words-mode", "desktop");
    await placeSectionTop(page, 0.45);
    await expect(pit(page)).toHaveAttribute("data-pit-engine", "ready");
    await expect(pit(page)).toHaveAttribute("data-pit-state", "falling");
    await expect(pit(page)).toHaveAttribute("data-pit-mode", "live");
    await expect(pit(page)).toHaveAttribute("data-pit-bodies", "12");
    await expect(pit(page)).toHaveAttribute("data-pit-grab", "");
    await expect(pit(page)).toHaveAttribute("data-pit-runner", "running");
    // The pit clips both axes: nothing it holds can paint over the heading or the lede.
    expect(await pit(page).evaluate((element) => getComputedStyle(element).overflowY)).toBe("clip");
    expect(await pillsOverCopy(page)).toEqual([]);

    // Scroll so the pit is out of view while the section is still above the viewport bottom: the runner stops and the counter stands still.
    await placeSectionTop(page, 0.86);
    await expect(pit(page)).toHaveAttribute("data-pit-runner", "stopped");
    await expect(pit(page)).toHaveAttribute("data-pit-state", "falling");
    const before = (await pitData(page)).pitFrames;
    await page.waitForTimeout(600);
    expect((await pitData(page)).pitFrames).toBe(before);

    // Back in view it resumes, lands (the ceiling seals at the pit top), settles and sleeps.
    await placeSectionTop(page, 0.2);
    await expect(pit(page)).toHaveAttribute("data-pit-sealed", "", { timeout: 15_000 });
    await expect(pit(page)).toHaveAttribute("data-pit-asleep", "", { timeout: 15_000 });
    await expect(pit(page)).toHaveAttribute("data-pit-runner", "stopped");
    expect(await pillsOutsidePit(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("the heading is inked and the map at 25% by the time the stage pins; the map is absent while the hero leaves", async ({ page }) => {
    await openPage(page);
    const map = section(page).locator("[data-words-map]");
    await placeSectionTop(page, 0.6);
    expect(Number(await map.evaluate((element) => getComputedStyle(element).opacity))).toBeLessThan(0.05);
    // Mid approach the fill runs left to right: lit chars first, every char ahead of the front
    // still at 40% ink (never full ink ahead of the front, which would read lit, dim, lit).
    const chars = section(page).locator("#words-title .words-char");
    await expect.poll(() => chars.count()).toBeGreaterThan(0);
    const alphas = await chars.evaluateAll((elements) =>
      elements.map((element) => {
        const channels = getComputedStyle(element).color.match(/[\d.]+/g) ?? [];
        return channels.length > 3 ? Number(channels[3]) : 1;
      }),
    );
    expect(alphas[alphas.length - 1]).toBeCloseTo(0.4, 1);
    alphas.slice(1).forEach((alpha, index) => expect(alpha).toBeLessThanOrEqual(alphas[index] + 0.01));
    await toPin(page, 0.05);
    await expect.poll(async () => Number(await map.evaluate((element) => getComputedStyle(element).opacity))).toBeCloseTo(0.25, 2);
    await expect
      .poll(() =>
        section(page)
          .locator("#words-title .words-char")
          .evaluateAll((chars) => chars.every((char) => getComputedStyle(char).color === "rgb(237, 236, 227)")),
      )
      .toBe(true);
    await expect.poll(async () => Number(await section(page).locator("[data-words-lede]").evaluate((element) => getComputedStyle(element).opacity))).toBe(1);
  });

  for (const speed of [600, 900]) {
    test(`at a steady ${speed}px/s the freeze records a resting pile: no pill over the heading or the lede`, async ({ page }) => {
      const errors = collectPageErrors(page);
      await openPage(page);
      await steadyScrollToPin(page, speed, 0.42);
      await expect(pit(page)).toHaveAttribute("data-pit-state", "frozen");
      expect(await pillsOverCopy(page)).toEqual([]);
      // Back below the freeze: every pill sits in the pile, inside the pit.
      await toPin(page, 0.08);
      expect(await pillsOverCopy(page)).toEqual([]);
      expect(await pillsOutsidePit(page)).toEqual([]);
      expect(errors).toEqual([]);
    });
  }

  test("a wheel flick through the pin, then back, leaves every pill inside the pit", async ({ page }) => {
    await openPage(page);
    await placeSectionTop(page, 1.05);
    await page.mouse.move(720, 450);
    const { start, length } = await pinRange(page);
    for (let i = 0; i < 400 && (await page.evaluate(() => window.scrollY)) < start + length * 0.5; i += 1) {
      await page.mouse.wheel(0, 60);
      await page.waitForTimeout(16);
    }
    await settle(page);
    await expect(pit(page)).toHaveAttribute("data-pit-state", "frozen");
    await toPin(page, 0.08);
    await page.waitForTimeout(600);
    expect(await pillsOutsidePit(page)).toEqual([]);
    expect(await pillsOverCopy(page)).toEqual([]);
  });

  test("the nav anchor 흐름 runs through the pin; back in the pin every pill is inside the pit", async ({ page }) => {
    await openPage(page);
    await page.locator('a[href="#route"]').first().click();
    await settle(page);
    await expect(pit(page)).toHaveAttribute("data-pit-state", "frozen");
    await toPin(page, 0.08);
    await page.waitForTimeout(600);
    expect(await pillsOutsidePit(page)).toEqual([]);
    expect(await pillsOverCopy(page)).toEqual([]);
  });

  test("after the pin all six tokens and the closing line show; a fast reverse strands nothing; above the section the fall resets", async ({ page }) => {
    const errors = collectPageErrors(page);
    await openPage(page);
    await placeSectionTop(page, 0.45);
    await expect(pit(page)).toHaveAttribute("data-pit-state", "falling");
    await toPin(page, 0);
    await expectBeat(page, "b2330");
    await expect(pit(page)).toHaveAttribute("data-pit-asleep", "", { timeout: 15_000 });

    await toPin(page, 1);
    await expect(pit(page)).toHaveAttribute("data-pit-state", "frozen");
    const tokens = section(page).locator("[data-ledger-token]");
    for (let index = 0; index < 6; index += 1) {
      await expect.poll(() => tokens.nth(index).evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
      await expect(tokens.nth(index)).toBeInViewport();
    }
    await expect.poll(() => section(page).locator("[data-words-closing]").evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
    await expect(section(page).locator("[data-words-closing]")).toBeInViewport();
    await expect(pit(page).locator("[data-body][data-landed]")).toHaveCount(6);
    // The caption moved with the example chat: under the ledger, visible.
    await expect.poll(() => section(page).locator("[data-caption-echo-text]").evaluate((element) => getComputedStyle(element).opacity)).toBe("1");

    // Fast reverse: from the end straight back to the start of the pin.
    await toPin(page, 0);
    await expect(pit(page).locator("[data-body][data-landed]")).toHaveCount(0);
    const bubbles = pit(page).locator('[data-body][data-kind="bubble"]');
    for (let index = 0; index < 6; index += 1) {
      await expect(bubbles.nth(index).locator("[data-skin-text]")).toHaveText(words.bubbles[index]);
      await expect(bubbles.nth(index).locator("[data-skin]")).toHaveAttribute("data-skin-state", "bubble");
    }
    await expect.poll(() => tokens.first().evaluate((element) => getComputedStyle(element).opacity)).toBe("0");
    // Every pill is back on its recorded pose in the pile, inside the pit; the vocabulary pills are back up and tabbable.
    expect(await pillsOutsidePit(page)).toEqual([]);
    await expect(pit(page).locator("[data-vocab][tabindex]")).toHaveCount(0);

    // Above the section the pit resets; re-entry replays the fall.
    await placeSectionTop(page, 1.3);
    await expect(pit(page)).toHaveAttribute("data-pit-state", "idle");
    await placeSectionTop(page, 0.45);
    await expect(pit(page)).toHaveAttribute("data-pit-state", "falling");
    await expect(pit(page)).toHaveAttribute("data-pit-runner", "running");
    expect(errors).toEqual([]);
  });

  test("an instant jump above the section from deep in the pin resets the pit; re-entry replays the fall", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => {
      if (/words|pit|recut/i.test(`${error.message}\n${error.stack ?? ""}`)) errors.push(error.message);
    });
    await openPage(page);
    await placeSectionTop(page, 0.45);
    await expect(pit(page)).toHaveAttribute("data-pit-state", "falling");
    for (const [progress, jump] of [
      [0.6, "Home"],
      [1, "scrollTo"],
    ] as const) {
      await toPin(page, progress);
      await expect(pit(page)).toHaveAttribute("data-pit-state", "frozen");
      if (jump === "Home") await page.keyboard.press("Home");
      else await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await settle(page);
      // The pin's scrub (0.8s) runs on from deep in the pin after the jump: it must not freeze the reset pit.
      await page.waitForTimeout(1500);
      await expect(pit(page)).toHaveAttribute("data-pit-state", "idle");
      await placeSectionTop(page, 0.45);
      await expect(pit(page)).toHaveAttribute("data-pit-state", "falling");
      await expect(pit(page)).toHaveAttribute("data-pit-runner", "running");
    }
    expect(errors).toEqual([]);
  });

  test("a flying bubble paints over the pile, and the bin's rules are gone before the lower ledger rows land", async ({ page }) => {
    await openPage(page);
    await placeSectionTop(page, 0.3);
    const zIndex = (id: string) => pit(page).locator(`[data-body="${id}"]`).evaluate((element) => getComputedStyle(element).zIndex);
    // 0.58: b4 ('그거 바꾸기로 했잖아요') is in flight over b5 ('…'), which still rests in the pile (b5 comes later in the DOM).
    await toPin(page, 0.58);
    await expect(pit(page)).toHaveAttribute("data-pit-state", "frozen");
    await expect.poll(async () => Number(await zIndex("b4"))).toBeGreaterThanOrEqual(2);
    expect(await zIndex("b5")).toBe("auto");
    // 0.63: b5 has lifted off too; b4, further along, still paints over it.
    await toPin(page, 0.63);
    await expect.poll(async () => (await zIndex("b5")) !== "auto").toBe(true);
    expect(Number(await zIndex("b4"))).toBeGreaterThan(Number(await zIndex("b5")));
    // The floor and side rules are gone (rows 4-6 sit over the bin); the caption stays until the closing beat.
    const opacity = (selector: string) => section(page).locator(selector).evaluate((element) => Number(getComputedStyle(element).opacity));
    await expect.poll(() => opacity("[data-pit-floor]")).toBeLessThan(0.02);
    expect(await opacity("[data-words-caption]")).toBeGreaterThan(0.98);
    // Scrubbing back to the pile at rest brings the bin back and lowers every body.
    await toPin(page, 0.1);
    await expect.poll(() => opacity("[data-pit-floor]")).toBeGreaterThan(0.98);
    await expect(pit(page).locator("[data-body][data-flying]")).toHaveCount(0);
  });

  test("the pin start shifts no layout in the section (Layout Instability API)", async ({ page }) => {
    await page.addInitScript(() => {
      const store = window as unknown as { __wordsShifts: string[] };
      store.__wordsShifts = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: { node?: Node | null }[] })[]) {
          if (entry.hadRecentInput) continue;
          for (const source of entry.sources ?? []) {
            const node = source.node instanceof Element ? source.node : source.node?.parentElement;
            if (node?.closest('[data-section="words"]')) store.__wordsShifts.push(`${node.className} ${entry.value.toFixed(4)} @${Math.round(window.scrollY)}`);
          }
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    await openPage(page);
    await placeSectionTop(page, 0.6);
    const { start, length } = await pinRange(page);
    // Scroll frame by frame through the pin start, like a reader would.
    await page.evaluate(
      async ({ from, to }) => {
        for (let y = from; y <= to; y += 24) {
          window.scrollTo({ top: y, behavior: "instant" });
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }
      },
      { from: Math.round(start - 300), to: Math.round(start + length * 0.12) },
    );
    await settle(page);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as unknown as { __wordsShifts: string[] }).__wordsShifts)).toEqual([]);
  });

  test("a wheel pass from the hero through the pin into the next section at 4x CPU shifts no layout in the section (Layout Instability API)", async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => {
      const store = window as unknown as { __shifts: { value: number; words: string[] }[] };
      store.__shifts = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: { node?: Node | null }[] })[]) {
          if (entry.hadRecentInput) continue;
          const words = (entry.sources ?? [])
            .map((source) => (source.node instanceof Element ? source.node : source.node?.parentElement))
            .filter((node): node is Element => Boolean(node?.closest('[data-section="words"]')))
            .map((node) => `${node.className} ${entry.value.toFixed(4)} @${Math.round(window.scrollY)}`);
          store.__shifts.push({ value: entry.value, words });
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    await openPage(page);
    // A slow machine: wheel steps coalesce and matter-js arrives after the fall line has passed.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.mouse.move(720, 450);
    for (let step = 0; step < 200; step += 1) {
      const done = await page.evaluate(() => {
        const next = document.querySelector<HTMLElement>('[data-section="route"]');
        if (!next) throw new Error("no route section");
        return next.getBoundingClientRect().top < window.innerHeight * 0.5;
      });
      if (done) break;
      await page.mouse.wheel(0, 360);
      await page.waitForTimeout(90);
    }
    await settle(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    const shifts = await page.evaluate(() => (window as unknown as { __shifts: { value: number; words: string[] }[] }).__shifts);
    expect(shifts.flatMap((shift) => shift.words)).toEqual([]);
    expect(shifts.reduce((total, shift) => total + shift.value, 0)).toBeLessThan(0.1);
  });

  test("scrubbed back under the freeze the pile is live again: pills take presses, a bubble can be grabbed, and the next pass re-cuts", async ({ page }) => {
    await openPage(page);
    await placeSectionTop(page, 0.45);
    await toPin(page, 0.02);
    await expect(pit(page)).toHaveAttribute("data-pit-asleep", "", { timeout: 15_000 });
    await toPin(page, 0.5);
    await expect(pit(page)).toHaveAttribute("data-pit-state", "frozen");
    await toPin(page, 0.05);
    await expect(pit(page)).toHaveAttribute("data-pit-state", "falling");
    await expect(pit(page)).toHaveAttribute("data-pit-grab", "");
    // Nothing under the pile takes the pointer: at each vocabulary pill's centre the topmost element is a pill.
    const missed = await pit(page).evaluate((element) =>
      Array.from(element.querySelectorAll<HTMLElement>("[data-vocab]"))
        .filter((button) => {
          const rect = button.getBoundingClientRect();
          return !document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest("[data-body]");
        })
        .map((button) => button.textContent),
    );
    expect(missed).toEqual([]);

    // A press shows the caption, the click keeps it.
    const button = pit(page).locator('[data-body="v0"] [data-vocab]');
    const gloss = pit(page).locator('[data-body="v0"] [data-gloss]');
    const box = await button.boundingBox();
    if (!box) throw new Error("v0 has no box");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect.poll(() => gloss.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
    await page.mouse.up();
    await expect(button).toHaveAttribute("aria-expanded", "true");

    // A sleeping bubble can be grabbed again.
    const skin = pit(page).locator('[data-body="b0"] [data-skin]');
    const start = await skin.boundingBox();
    if (!start) throw new Error("b0 has no box");
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    for (let step = 1; step <= 10; step += 1) {
      await page.mouse.move(start.x + start.width / 2 + step * 8, start.y + start.height / 2 - step * 20);
      await page.waitForTimeout(16);
    }
    expect(((await skin.boundingBox())?.y ?? start.y) - start.y).toBeLessThan(-80);
    await page.mouse.up();
    await expect(pit(page)).toHaveAttribute("data-pit-asleep", "", { timeout: 15_000 });

    // The next pass freezes the pile afresh and re-cuts it into the ledger; back again, every pill is in the pit.
    await toPin(page, 1);
    await expect(pit(page)).toHaveAttribute("data-pit-state", "frozen");
    await expect(pit(page).locator("[data-body][data-landed]")).toHaveCount(6);
    await toPin(page, 0.08);
    await expect(pit(page)).toHaveAttribute("data-pit-state", "falling");
    expect(await pillsOutsidePit(page)).toEqual([]);
    expect(await pillsOverCopy(page)).toEqual([]);
  });

  for (const [width, height] of [
    [1366, 657],
    [1440, 760],
    [1536, 730],
  ] as const) {
    test(`the pinned end frame fits a ${width}x${height} screen: closing line on screen, caption clear of it`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openPage(page);
      await placeSectionTop(page, 0.3);
      await toPin(page, 1);
      await expect.poll(() => section(page).locator("[data-words-closing]").evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
      const rects = await page.evaluate(() => {
        const rect = (selector: string) => {
          const element = document.querySelector(selector);
          if (!element) throw new Error(`missing ${selector}`);
          return element.getBoundingClientRect().toJSON() as DOMRect;
        };
        const tokens = Array.from(document.querySelectorAll("[data-ledger-token]")).map((token) => token.getBoundingClientRect().toJSON() as DOMRect);
        return { closing: rect("[data-words-closing]"), echo: rect("[data-words-caption-echo]"), pit: rect("[data-words-pit]"), lastToken: tokens[tokens.length - 1], innerHeight: window.innerHeight };
      });
      expect(rects.closing.bottom).toBeLessThanOrEqual(rects.innerHeight);
      expect(rects.echo.bottom).toBeLessThanOrEqual(rects.closing.top);
      // The tokens land inside the pit box, which clips: none is cut off.
      expect(rects.lastToken.bottom).toBeLessThanOrEqual(rects.pit.bottom);
    });
  }

  test("after the pin, each block dissolves before it reaches the floating nav", async ({ page }) => {
    await openPage(page);
    await placeSectionTop(page, 0.3);
    const { start, length } = await pinRange(page);
    const height = await page.evaluate(() => window.innerHeight);
    for (const extra of [0.2, 0.35, 0.5]) {
      await scrollToY(page, start + length + height * extra);
      const underNav = await section(page).evaluate((element) =>
        Array.from(element.querySelectorAll<HTMLElement>("[data-words-copy], [data-ledger-row], [data-words-outro], [data-words-caption-echo]"))
          .filter((block) => block.getBoundingClientRect().top < 72 && block.getBoundingClientRect().bottom > 16)
          .filter((block) => Number(getComputedStyle(block).opacity) > 0.05)
          .map((block) => block.dataset.ledgerRow ?? block.className),
      );
      expect(underNav).toEqual([]);
    }
  });

  test("a vocabulary pill is a toggletip: press shows it, a click keeps it, a click hides it, a drag hides it on release; keyboard focus, Enter and Escape", async ({ page }) => {
    await openPage(page);
    await placeSectionTop(page, 0.45);
    await expect(pit(page)).toHaveAttribute("data-pit-state", "falling");
    await toPin(page, 0);
    await expect(pit(page)).toHaveAttribute("data-pit-asleep", "", { timeout: 15_000 });

    const body = pit(page).locator('[data-body="v0"]');
    const button = body.locator("[data-vocab]");
    const gloss = body.locator("[data-gloss]");
    const opacity = (locator: Locator) => locator.evaluate((element) => getComputedStyle(element).opacity);
    const box = await button.boundingBox();
    if (!box) throw new Error("v0 has no box");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect.poll(() => opacity(gloss)).toBe("1");
    await page.mouse.up();
    await page.waitForTimeout(700);
    expect(await opacity(gloss)).toBe("1");
    await expect(button).toHaveAttribute("aria-expanded", "true");
    const again = await button.boundingBox();
    if (!again) throw new Error("v0 has no box");
    await page.mouse.click(again.x + again.width / 2, again.y + again.height / 2);
    await expect.poll(() => opacity(gloss)).toBe("0");
    await expect(button).toHaveAttribute("aria-expanded", "false");

    // A drag is not a tap: the caption shows while held and hides after release.
    const drag = await button.boundingBox();
    if (!drag) throw new Error("v0 has no box");
    await page.mouse.move(drag.x + drag.width / 2, drag.y + drag.height / 2);
    await page.mouse.down();
    await page.mouse.move(drag.x + drag.width / 2 + 40, drag.y + drag.height / 2 - 60, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => opacity(gloss)).toBe("0");

    const keyboardButton = pit(page).locator('[data-body="v3"] [data-vocab]');
    await keyboardButton.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(keyboardButton).toBeFocused();
    const focusGloss = pit(page).locator('[data-body="v3"] [data-gloss]');
    await expect.poll(() => opacity(focusGloss)).toBe("1");
    await page.keyboard.press("Escape");
    await expect.poll(() => opacity(focusGloss)).toBe("0");
    await page.keyboard.press("Enter");
    await expect.poll(() => opacity(focusGloss)).toBe("1");
    await expect(keyboardButton).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Enter");
    await expect.poll(() => opacity(focusGloss)).toBe("0");
  });

  test("a sleeping bubble can be grabbed, and a throw released outside the pit still lets the runner sleep", async ({ page }) => {
    await openPage(page);
    await placeSectionTop(page, 0.45);
    await toPin(page, 0.05);
    await expect(pit(page)).toHaveAttribute("data-pit-asleep", "", { timeout: 15_000 });
    await expect(pit(page)).toHaveAttribute("data-pit-runner", "stopped");

    const skin = pit(page).locator('[data-body="b0"] [data-skin]');
    const box = await skin.boundingBox();
    if (!box) throw new Error("b0 has no box");
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let step = 1; step <= 10; step += 1) {
      await page.mouse.move(x + step * 10, y - step * 25);
      await page.waitForTimeout(16);
    }
    const moved = await skin.boundingBox();
    expect((moved?.y ?? box.y) - box.y).toBeLessThan(-80);
    await expect(pit(page)).toHaveAttribute("data-pit-runner", "running");
    // Release over the heading, outside the pit element.
    const heading = await section(page).locator("#words-title").boundingBox();
    if (!heading) throw new Error("no heading box");
    await page.mouse.move(heading.x + 40, heading.y + heading.height / 2, { steps: 4 });
    await page.mouse.up();
    await expect(pit(page)).toHaveAttribute("data-pit-asleep", "", { timeout: 15_000 });
    await expect(pit(page)).toHaveAttribute("data-pit-runner", "stopped");
    expect(await pillsOutsidePit(page)).toEqual([]);
  });

  test("keyboard focus from the hero lands on the pile at rest, clear of the nav", async ({ page }) => {
    await openPage(page);
    await page.evaluate(() => {
      const wordsSection = document.getElementById("words");
      if (!wordsSection) throw new Error("no words section");
      const focusables = Array.from(document.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea")).filter(
        (element) =>
          element.compareDocumentPosition(wordsSection) & Node.DOCUMENT_POSITION_FOLLOWING &&
          element.offsetParent !== null &&
          !element.closest("header, aside, [data-chrome-root]"),
      );
      focusables[focusables.length - 1]?.focus();
    });
    await page.keyboard.press("Tab");
    const focused = page.locator(":focus");
    await expect(focused).toHaveAttribute("data-vocab");
    await page.waitForTimeout(800);
    await expect(pit(page)).not.toHaveAttribute("data-pit-state", "frozen");
    const { start, length } = await pinRange(page);
    expect(((await page.evaluate(() => window.scrollY)) - start) / length).toBeLessThan(FREEZE_AT);
    const rect = await focused.boundingBox();
    if (!rect) throw new Error("focused pill has no box");
    expect(rect.y).toBeGreaterThan(72);
    expect(rect.y + rect.height).toBeLessThanOrEqual(await page.evaluate(() => window.innerHeight));
    await expect.poll(() => focused.locator("xpath=ancestor::*[@data-body][1]//*[@data-gloss]").evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
  });

  test("after the pin and a scroll back above the section, Tab from the hero still reaches the vocabulary pills", async ({ page }) => {
    await openPage(page);
    await placeSectionTop(page, 0.45);
    await expect(pit(page)).toHaveAttribute("data-pit-state", "falling");
    await toPin(page, 1);
    await expect(pit(page)).toHaveAttribute("data-pit-state", "frozen");
    await scrollToY(page, 0);
    await page.waitForTimeout(1200);
    // The reset is the fresh-load state: the heap waits unseen (opacity), its pills still in the tab order.
    await expect(pit(page)).toHaveAttribute("data-pit-state", "idle");
    await expect(pit(page)).toHaveAttribute("data-pit-mode", "heap");
    await expect(pit(page).locator("[data-body][data-pit-hidden]")).toHaveCount(0);
    const vocabVisibility = await pit(page)
      .locator("[data-vocab]")
      .evaluateAll((elements) => elements.map((element) => getComputedStyle(element).visibility));
    expect(vocabVisibility).toEqual(words.vocab.map(() => "visible"));

    // The last focusable before the section (the hero's last control), then Tab.
    await page.evaluate(() => {
      const wordsSection = document.getElementById("words");
      if (!wordsSection) throw new Error("no words section");
      const focusables = Array.from(document.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea")).filter(
        (element) =>
          element.compareDocumentPosition(wordsSection) & Node.DOCUMENT_POSITION_FOLLOWING &&
          element.offsetParent !== null &&
          !element.closest("header, aside, [data-chrome-root]"),
      );
      focusables[focusables.length - 1]?.focus();
    });
    await page.keyboard.press("Tab");
    const first = pit(page).locator('[data-body="v0"] [data-vocab]');
    await expect(first).toBeFocused();
    await expect(first).toHaveText(words.vocab[0]);
    await expect(first).toHaveAttribute("aria-expanded", "true");
    await expect.poll(() => pit(page).locator('[data-body="v0"] [data-gloss]').evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
    const { start, length } = await pinRange(page);
    expect(((await page.evaluate(() => window.scrollY)) - start) / length).toBeLessThan(FREEZE_AT);
    const rect = await first.boundingBox();
    if (!rect) throw new Error("focused pill has no box");
    expect(rect.y).toBeGreaterThan(72);
    expect(rect.y + rect.height).toBeLessThanOrEqual(await page.evaluate(() => window.innerHeight));
    // The replay's pile is a different one: a pill tilted 45 degrees against a wall puts its box
    // corner about 0.41 of its end radius (13px) past its rounded end, so allow 16px here.
    expect(await pillsOutsidePit(page, 16)).toEqual([]);
    expect(await pillsOverCopy(page)).toEqual([]);
  });

  test("Shift+Tab back from the next section lands on a vocabulary pill in the pile at rest, with its caption", async ({ page }) => {
    await openPage(page);
    await placeSectionTop(page, 0.3);
    await toPin(page, 0.6);
    await expect(pit(page)).toHaveAttribute("data-pit-state", "frozen");
    const { start, length } = await pinRange(page);
    const height = await page.evaluate(() => window.innerHeight);
    await scrollToY(page, start + length + height * 0.8);
    // The first focusable after the words section, in document order (the next section's first control).
    await page.evaluate(() => {
      const wordsSection = document.getElementById("words");
      if (!wordsSection) throw new Error("no words section");
      const next = Array.from(document.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea")).find(
        (element) =>
          wordsSection.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING &&
          !wordsSection.contains(element) &&
          element.offsetParent !== null &&
          !element.closest("header, aside, [data-chrome-root]"),
      );
      if (!next) throw new Error("no focusable after the words section");
      next.focus();
    });
    await page.keyboard.press("Shift+Tab");
    const focused = page.locator(":focus");
    await expect(focused).toHaveAttribute("data-vocab");
    await expect(focused).toHaveText(words.vocab[words.vocab.length - 1]);
    // The stage is back before the freeze point: the pile at rest, not the dropped pills.
    expect(((await page.evaluate(() => window.scrollY)) - start) / length).toBeLessThan(FREEZE_AT);
    const rect = await focused.boundingBox();
    if (!rect) throw new Error("focused pill has no box");
    expect(rect.y).toBeGreaterThan(72);
    expect(rect.y + rect.height).toBeLessThanOrEqual(height);
    expect(await pillsOutsidePit(page)).toEqual([]);
    await expect.poll(() => focused.locator("xpath=ancestor::*[@data-body][1]//*[@data-gloss]").evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
  });

  test("the wheel over the pit still scrolls the page", async ({ page }) => {
    await openPage(page);
    await placeSectionTop(page, 0.45);
    await expect(pit(page)).toHaveAttribute("data-pit-grab", "");
    await toPin(page, 0.05);
    const box = await pit(page).boundingBox();
    if (!box) throw new Error("no pit box");
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.8);
    const before = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 300);
    await settle(page);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(before + 100);
  });
});

test.describe("S2 words: mobile", () => {
  onlyIn("mobile");

  test("the pit runs once with 8 bodies and never captures touch", async ({ page }) => {
    await openPage(page);
    await expect(section(page).locator(".words-root")).toHaveAttribute("data-words-mode", "mobile");
    await pit(page).scrollIntoViewIfNeeded();
    await placeSectionTop(page, 0.1);
    await expect(pit(page)).toHaveAttribute("data-pit-engine", "ready");
    await expect(pit(page)).toHaveAttribute("data-pit-bodies", "8");
    await expect(pit(page)).not.toHaveAttribute("data-pit-grab");
    await expect(pit(page).locator('[data-body="v1"]')).toBeHidden();

    // Nothing over the pit may cancel touch events (that is the only way script can block scrolling).
    // WebKit has no Touch constructor: send cancelable touch-typed events that carry touch lists, which
    // is what a capturing handler (matter-js Mouse included) checks before calling preventDefault.
    const touch = await pit(page).evaluate((element) => {
      const target = element.querySelector<HTMLElement>('[data-body="b0"] [data-skin]') ?? element;
      const rect = target.getBoundingClientRect();
      const send = (type: string, y: number) => {
        const point = { identifier: 1, target, clientX: rect.left + rect.width / 2, clientY: y, pageX: rect.left + rect.width / 2, pageY: y + window.scrollY };
        const event = new Event(type, { cancelable: true, bubbles: true });
        Object.defineProperty(event, "touches", { value: [point] });
        Object.defineProperty(event, "changedTouches", { value: [point] });
        target.dispatchEvent(event);
        return event.defaultPrevented;
      };
      return {
        start: send("touchstart", rect.top + 10),
        move: send("touchmove", rect.top - 120),
        touchAction: getComputedStyle(target).touchAction,
      };
    });
    expect(touch).toEqual({ start: false, move: false, touchAction: "auto" });
  });

  test("the pills fall inside the pit, never over the heading or the lede, and rest inside it", async ({ page }) => {
    await openPage(page);
    await placeSectionTop(page, 0.05, false);
    await page.waitForTimeout(400);
    expect(await pillsOverCopy(page)).toEqual([]);
    await page.waitForTimeout(400);
    expect(await pillsOverCopy(page)).toEqual([]);
    await expect(pit(page)).toHaveAttribute("data-pit-asleep", "", { timeout: 15_000 });
    expect(await pillsOutsidePit(page)).toEqual([]);
  });

  test("the pile rests close under the lede: no dead band of empty pit", async ({ page }) => {
    await openPage(page);
    await placeSectionTop(page, 0.05);
    await expect(pit(page)).toHaveAttribute("data-pit-asleep", "", { timeout: 15_000 });
    const { gap, belowEdge } = await page.evaluate(() => {
      const lede = document.querySelector<HTMLElement>("[data-words-lede]")?.getBoundingClientRect();
      const pitBox = document.querySelector<HTMLElement>("[data-words-pit]")?.getBoundingClientRect();
      if (!lede || !pitBox) throw new Error("no lede or pit");
      const tops = Array.from(document.querySelectorAll<HTMLElement>("[data-words-pit] [data-body]"))
        .filter((body) => getComputedStyle(body).visibility !== "hidden" && getComputedStyle(body).display !== "none")
        .map((body) => body.querySelector("[data-skin]")?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY);
      const pileTop = Math.min(...tops);
      return { gap: pileTop - lede.bottom, belowEdge: pileTop - pitBox.top };
    });
    // About a third of the old 52svh pit was bare ground above the pile (a 250-315px band).
    expect(gap).toBeLessThan(200);
    // The pile stays clear of the pit's soft top edge (a 2.5rem fade while the pit is live).
    expect(belowEdge).toBeGreaterThanOrEqual(40);
  });

  test("a tap on a vocabulary pill toggles its glossary line", async ({ page }) => {
    await openPage(page);
    await placeSectionTop(page, -0.2);
    await expect(pit(page)).toHaveAttribute("data-pit-asleep", "", { timeout: 15_000 });
    const button = pit(page).locator('[data-body="v3"] [data-vocab]');
    const gloss = pit(page).locator('[data-body="v3"] [data-gloss]');
    await button.scrollIntoViewIfNeeded();
    await button.tap();
    await page.waitForTimeout(700);
    expect(await gloss.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await button.tap();
    await expect.poll(() => gloss.evaluate((element) => getComputedStyle(element).opacity)).toBe("0");
  });

  test("a real touch drag over the falling pit scrolls the page (Chromium touch emulation)", async ({ baseURL }) => {
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "ko-KR" });
      const page = await context.newPage();
      await page.goto(baseURL ?? "/");
      await page.locator("[data-chrome-root][data-hydrated]").waitFor({ state: "attached" });
      await placeSectionTop(page, -0.15);
      await expect(pit(page)).toHaveAttribute("data-pit-engine", "ready");
      await expect(pit(page)).toHaveAttribute("data-pit-state", "falling");
      const box = await pit(page).boundingBox();
      if (!box) throw new Error("no pit box");
      const x = box.x + box.width / 2;
      const y = Math.min(box.y + box.height * 0.75, 780);
      const before = await page.evaluate(() => window.scrollY);
      const cdp = await context.newCDPSession(page);
      await cdp.send("Input.synthesizeScrollGesture", { x, y, yDistance: -320, gestureSourceType: "touch", speed: 800 });
      await settle(page);
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(before + 200);
    } finally {
      await browser.close();
    }
  });

  test("before the fall the heap waits unseen, and the fall shifts no layout (Chromium phone emulation, 4x CPU)", async ({ baseURL }) => {
    test.setTimeout(120_000);
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "ko-KR" });
      const page = await context.newPage();
      await page.addInitScript(() => {
        const store = window as unknown as { __wordsShifts: string[] };
        store.__wordsShifts = [];
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: { node?: Node | null }[] })[]) {
            if (entry.hadRecentInput) continue;
            for (const source of entry.sources ?? []) {
              const node = source.node instanceof Element ? source.node : source.node?.parentElement;
              if (node?.closest('[data-section="words"]')) store.__wordsShifts.push(`${node.className} ${entry.value.toFixed(4)} @${Math.round(window.scrollY)}`);
            }
          }
        }).observe({ type: "layout-shift", buffered: true });
      });
      await page.goto(baseURL ?? "/");
      await page.locator("[data-chrome-root][data-hydrated]").waitFor({ state: "attached" });
      await expect(section(page).locator(".words-root")).toHaveAttribute("data-words-mode", "mobile");
      // The pit's top a little under the fall line (70%): the top of the heap frame is on screen, but no pill shows.
      const pitTopAt = async (fraction: number) => {
        await page.evaluate((f) => {
          const element = document.querySelector<HTMLElement>("[data-words-pit]");
          if (!element) throw new Error("no pit");
          window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - window.innerHeight * f, behavior: "instant" });
        }, fraction);
        await settle(page);
      };
      await pitTopAt(0.78);
      await expect(pit(page)).toHaveAttribute("data-pit-state", "idle");
      const shown = await pit(page).evaluate((element) =>
        Array.from(element.querySelectorAll<HTMLElement>("[data-body]")).filter((body) => {
          const rect = body.getBoundingClientRect();
          return getComputedStyle(body).display !== "none" && Number(getComputedStyle(body).opacity) > 0 && rect.top < window.innerHeight;
        }).length,
      );
      expect(shown).toBe(0);
      // A real touch scroll over the fall line, on a slow phone.
      const cdp = await context.newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await cdp.send("Input.synthesizeScrollGesture", { x: 195, y: 600, yDistance: -260, gestureSourceType: "touch", speed: 1200 });
      await expect(pit(page)).toHaveAttribute("data-pit-mode", "live", { timeout: 20_000 });
      await expect(pit(page)).toHaveAttribute("data-pit-asleep", "", { timeout: 30_000 });
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      expect(await page.evaluate(() => (window as unknown as { __wordsShifts: string[] }).__wordsShifts)).toEqual([]);
    } finally {
      await browser.close();
    }
  });

  test("arriving from below, the pile is already at rest in the pit", async ({ page }) => {
    await openPage(page);
    await page.evaluate(() => {
      const next = document.querySelector<HTMLElement>('[data-section="route"]');
      if (!next) throw new Error("no route section");
      window.scrollTo({ top: next.getBoundingClientRect().top + window.scrollY + 200, behavior: "instant" });
    });
    await settle(page);
    await expect(pit(page)).toHaveAttribute("data-pit-engine", "ready", { timeout: 20_000 });
    await expect(pit(page)).toHaveAttribute("data-pit-mode", "live");
    await placeSectionTop(page, -0.1);
    await expect(pit(page)).toHaveAttribute("data-pit-asleep", "", { timeout: 15_000 });
    expect(await pillsOutsidePit(page)).toEqual([]);
    expect(await pillsOverCopy(page)).toEqual([]);
    await expect(pit(page).locator('[data-body="v0"]')).toHaveCSS("opacity", "1");
  });

  test("the ledger list reveals on view", async ({ page }) => {
    await openPage(page);
    const tokens = section(page).locator("[data-ledger-token]");
    await tokens.last().scrollIntoViewIfNeeded();
    await settle(page);
    await page.waitForTimeout(900);
    for (let index = 0; index < 6; index += 1) {
      await tokens.nth(index).scrollIntoViewIfNeeded();
      await expect(tokens.nth(index)).toBeVisible();
    }
    await expect(section(page).locator("[data-words-closing]")).toBeVisible();
  });
});

test.describe("S2 words: reduced motion", () => {
  onlyIn("reduced-motion");

  test("shows the static heap and list with no physics engine, runner or canvas", async ({ page }) => {
    await openPage(page);
    await expect(section(page).locator(".words-root")).toHaveAttribute("data-words-mode", "reduced");
    await placeSectionTop(page, 0);
    await page.waitForTimeout(1200);
    const data = await pitData(page);
    expect(data.pitMode).toBe("heap");
    expect(data.pitRunner).toBe("stopped");
    expect(data.pitEngine).toBeUndefined();
    await expect(section(page).locator("canvas")).toHaveCount(0);
    await expect(section(page).locator(".pin-spacer")).toHaveCount(0);

    // All twelve pills rest in the heap, inside the pit.
    const bodies = pit(page).locator("[data-body]");
    await expect(bodies).toHaveCount(12);
    for (let index = 0; index < 12; index += 1) await expect(bodies.nth(index)).toBeVisible();

    // The heading is fully inked and the list and closing line are static and visible.
    const heading = section(page).locator("#words-title");
    await expect(heading).toHaveCSS("color", "rgb(237, 236, 227)");
    await expect(section(page).locator("[data-words-lede]")).toHaveCSS("opacity", "1");
    const tokens = section(page).locator("[data-ledger-token]");
    for (let index = 0; index < 6; index += 1) {
      await expect(tokens.nth(index)).toHaveCSS("opacity", "1");
    }
    await expect(section(page).locator("[data-words-closing]")).toHaveCSS("opacity", "1");
    await expect(section(page).locator("[data-words-caption]")).toBeVisible();
    await expect(section(page).locator("[data-words-caption-echo]")).toBeHidden();
    await expectBeat(page, "b2330");
  });

  test("keyboard focus on a vocabulary pill shows its glossary, Escape dismisses it and Enter brings it back", async ({ page }) => {
    await openPage(page);
    await placeSectionTop(page, 0);
    const button = pit(page).locator('[data-body="v4"] [data-vocab]');
    await button.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(button).toBeFocused();
    const gloss = pit(page).locator('[data-body="v4"] [data-gloss]');
    await expect(gloss).toHaveText(VOCAB[4].gloss);
    await expect.poll(() => gloss.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
    await page.keyboard.press("Escape");
    await expect.poll(() => gloss.evaluate((element) => getComputedStyle(element).opacity)).toBe("0");
    await page.keyboard.press("Enter");
    await expect.poll(() => gloss.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
    await expect(button).toHaveAttribute("aria-expanded", "true");
  });
});
