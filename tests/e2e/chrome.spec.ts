import { expect, test, type Page } from "@playwright/test";
import axe from "axe-core";

import { fill, plate } from "../../src/content/copy";
import { PLATE_TOOLTIPS } from "../../src/content/glossary";
import {
  BEAT_ORDER,
  BEATS,
  RECORDS,
  SECTION_CHROME,
  SECTION_DEFAULT_BEAT,
  SECTION_ORDER,
  type BeatId,
  type RecordId,
  type SectionId,
} from "../../src/content/story";

import { entriesAt, expectBeat, expectRail, jumpTo, liveEntries, openPage, settle, summaryAt } from "./chrome-helpers";

/**
 * Record chrome (WP-02, spec 3.3, 3.4, 5). Walks the page section by section
 * and checks what the chrome shows against the story table: the plate summary
 * and clock at each section's default beat, the single phase flip, the rail
 * entries, the modes per section, the mobile pill and sheet, the tooltips and
 * the live region. Texts are computed from src/content, never hard-coded.
 *
 * Projects: desktop (1440x900), mobile (WebKit 390x844), reduced-motion.
 */

/* ---------- helpers ---------- */

/** The beat among `candidates` whose summary, clock and phase the chrome shows (waits for the chrome to settle). */
async function shownBeat(page: Page, candidates: readonly BeatId[]): Promise<BeatId> {
  let found: BeatId | undefined;
  await expect
    .poll(async () => {
      const summary = await page.locator("[data-plate-summary]").first().textContent();
      const clock = await page.locator("[data-plate-clock]").first().getAttribute("data-value");
      const phase = await page.locator("html").getAttribute("data-phase");
      found = candidates.find(
        (beat) => summaryAt(beat) === summary && BEATS[beat].phase === phase && (BEATS[beat].clock === "now" ? /^\d\d:\d\d$/.test(clock ?? "") : BEATS[beat].clock === clock),
      );
      return found ?? null;
    })
    .not.toBeNull();
  return found as BeatId;
}

const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1280;

/** 업무 기록 the chrome counts at a beat: the 03:07 message is not a record. */
const recordsAt = (beat: BeatId) => entriesAt(beat).filter((id) => RECORDS[id as RecordId].kind !== "message").length;

/**
 * The mobile pill's line at a beat clock, from the story table: the latest
 * ledger stage that moved (확보, then 전달 from 05:53, then 수령 from 08:49),
 * then 남은 미송 (미확인 before 03:06).
 */
function pillLineAt(clock: string): string {
  const beat = BEAT_ORDER.find((id) => BEATS[id].clock === clock || (BEATS[id].clock === "now" && /^\d\d:\d\d$/.test(clock) && !BEAT_ORDER.some((other) => BEATS[other].clock === clock)));
  if (!beat) throw new Error(`no beat at ${clock}`);
  const ledger = BEATS[beat].ledger;
  const lead = ledger.received > 0 ? "received" : ledger.delivered > 0 ? "delivered" : "secured";
  const shared = ledger.backorder !== null;
  const rest = shared ? `${plate.labels.backorder} ${ledger.backorder}` : `${plate.labels.unconfirmed} ${ledger.unconfirmed}`;
  return `${plate.labels[lead]} ${ledger[lead]} · ${rest}`;
}

/** Scroll the viewport centre to a fraction of a section's height. */
async function scrollInto(page: Page, id: SectionId, fraction: number): Promise<void> {
  await page.evaluate(
    ({ sectionId, at }) => {
      const section = document.querySelector<HTMLElement>(`[data-section="${sectionId}"]`);
      if (!section) throw new Error(`no section ${sectionId}`);
      const box = section.getBoundingClientRect();
      window.scrollTo({ top: Math.round(box.top + window.scrollY + box.height * at - window.innerHeight / 2), behavior: "instant" });
    },
    { sectionId: id, at: fraction },
  );
  await settle(page);
}

/** The section's top in the viewport, and where a native fragment jump puts it (at its scroll margin). */
async function landing(page: Page, id: SectionId) {
  return page.evaluate((sectionId) => {
    const section = document.querySelector<HTMLElement>(`[data-section="${sectionId}"]`);
    if (!section) throw new Error(`no section ${sectionId}`);
    return { top: section.getBoundingClientRect().top, expected: Number.parseFloat(getComputedStyle(section).scrollMarginTop) || 0 };
  }, id);
}

/* ---------- suites ---------- */

test.describe("record chrome", () => {
  test("the plate, clock, phase and rail follow each section's default beat", async ({ page, reducedMotion }) => {
    await openPage(page);
    for (const [index, id] of SECTION_ORDER.entries()) {
      if (id === "hero") await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      else await jumpTo(page, id);
      const from = SECTION_DEFAULT_BEAT[id];
      // Under reduced motion a section reports its final beat when it becomes active (spec 6.5):
      // anything from its own default up to the next section's default.
      const next = SECTION_ORDER[index + 1];
      const until = reducedMotion === "reduce" && next ? SECTION_DEFAULT_BEAT[next] : from;
      const candidates = BEAT_ORDER.slice(BEAT_ORDER.indexOf(from), BEAT_ORDER.indexOf(until) + 1);
      const beat = await shownBeat(page, candidates);
      await test.step(`${id} at ${beat}`, async () => {
        await expectBeat(page, beat);
        await expectRail(page, beat);
        const column = page.locator("[data-record-column]");
        await expect(column).toHaveAttribute("data-rail-mode", SECTION_CHROME[id].rail);
        await expect(column).toHaveAttribute("data-plate-mode", SECTION_CHROME[id].plate);
      });
    }
  });

  test("the page switches theme once, at the receipt, and back on reverse", async ({ page }) => {
    await openPage(page);
    const html = page.locator("html");
    const themeColor = page.locator('meta[name="theme-color"]');
    // The cart reports nothing of its own: night at 03:07 in every project.
    await jumpTo(page, "cart");
    await expect(html).toHaveAttribute("data-phase", "night");
    await expect(themeColor).toHaveAttribute("content", "#07231C");
    await jumpTo(page, "receipt");
    await expect(html).toHaveAttribute("data-phase", "day");
    await expect(themeColor).toHaveAttribute("content", "#EDECE3");
    await jumpTo(page, "cart");
    await expect(html).toHaveAttribute("data-phase", "night");
    await expect(themeColor).toHaveAttribute("content", "#07231C");
  });

  test("plate pixels do not change with the phase, only the changed digits do", async ({ page }) => {
    test.skip(!isDesktop(page), "the full plate shows from 1280px");
    await openPage(page);
    const full = page.locator('[data-plate="full"]');
    // Night 03:07 (cart: 6/2/0/0) and day 05:53 (receipt: 6/2/2/0) differ only in the clock and 전달.
    const shoot = async () => {
      await page.waitForTimeout(1_400);
      const box = await full.boundingBox();
      if (!box) throw new Error("no plate");
      const inset = 10;
      return page.screenshot({
        clip: { x: box.x + inset, y: box.y + inset, width: box.width - 2 * inset, height: box.height - 2 * inset },
        mask: [full.locator("[data-plate-clock]"), full.locator("button", { hasText: plate.labels.delivered }).locator("[data-digit-cell]")],
        maskColor: "#101010",
        animations: "disabled",
      });
    };
    await jumpTo(page, "cart");
    await expect(page.locator("html")).toHaveAttribute("data-phase", "night");
    const night = await shoot();
    await jumpTo(page, "receipt");
    await expect(page.locator("html")).toHaveAttribute("data-phase", "day");
    const day = await shoot();
    expect(night.equals(day)).toBe(true);
  });

  test("the rail hides at the film and becomes the 업무 기록 pill at the footer", async ({ page }) => {
    test.skip(!isDesktop(page), "the rail exists from 1280px");
    await openPage(page);
    const column = page.locator("[data-record-column]");
    await jumpTo(page, "cart");
    await expect(page.locator(".au-rail-panel")).toBeVisible();
    await jumpTo(page, "film");
    await expect(column).toHaveAttribute("data-rail-mode", "hidden");
    await expect(page.locator(".au-rail-panel")).toBeHidden();
    await expect(page.locator('[data-plate="full"]')).toBeHidden();
    await jumpTo(page, "footer");
    const pill = page.locator("[data-rail-pill]");
    await expect(pill).toBeVisible();
    // 업무 기록 only: seven records, the 03:07 message is not counted.
    await expect(pill).toHaveText(fill(plate.pill.open, { count: recordsAt("bnow") }));
  });

  test("on the night and dawn grounds a rail card the top edge cuts fades out whole; on paper it fades under the mask", async ({ page }) => {
    test.skip(!isDesktop(page), "the rail exists from 1280px");
    await openPage(page);
    const column = page.locator("[data-record-column]");
    const rail = () =>
      page.locator(".au-rail-list").evaluate((list) => ({
        mask: getComputedStyle(list).maskImage,
        entries: [...list.querySelectorAll<HTMLElement>(":scope > li[data-key]")].map((li) => ({
          key: li.dataset.key,
          cut: li.offsetTop < list.scrollTop - 0.5,
          flagged: li.hasAttribute("data-rail-clipped"),
          opacity: getComputedStyle(li.firstElementChild as HTMLElement).opacity,
        })),
      }));
    // Seven entries at 05:53 overflow the rail at 1440x900: the oldest is cut by the top edge.
    let state = await rail();
    for (const at of [0.42, 0.46, 0.5, 0.54]) {
      await scrollInto(page, "dawn", at);
      await expect.poll(async () => (await liveEntries(page)).length).toBeGreaterThanOrEqual(entriesAt("b0553").length);
      state = await rail();
      if (state.entries.some((entry) => entry.cut)) break;
    }
    await expect(column).toHaveAttribute("data-rail-ground", "dark");
    expect(state.entries.some((entry) => entry.cut)).toBe(true);
    // A solid mask: no transparent stop, so nothing fades into the ground.
    await expect.poll(async () => (await rail()).mask).not.toContain("rgba(0, 0, 0, 0)");
    await expect
      .poll(async () => (await rail()).entries.every((entry) => entry.flagged === entry.cut && (entry.cut ? entry.opacity === "0" : entry.opacity === "1")))
      .toBe(true);
    // On paper ground (roles, by day) the cut card stays and fades under the 48px mask.
    await jumpTo(page, "roles");
    await page.locator("[data-spine-dots]").hover();
    await expect(column).toHaveAttribute("data-rail-ground", "light");
    await expect.poll(async () => (await rail()).mask).toContain("rgba(0, 0, 0, 0)");
    await expect.poll(async () => (await rail()).entries.every((entry) => entry.flagged === entry.cut && entry.opacity === "1")).toBe(true);
  });

  test("while film green sits under the nav, the ㅅㅊ symbol keeps its paper plate", async ({ page, reducedMotion }) => {
    test.skip(!isDesktop(page) || reducedMotion === "reduce", "film green reaches the nav in desktop motion only");
    await openPage(page);
    const film = await page.evaluate(() => {
      const section = document.getElementById("film");
      if (!section) throw new Error("no film");
      return { top: section.getBoundingClientRect().top + window.scrollY, height: section.offsetHeight };
    });
    let under = false;
    for (let y = film.top - 200; y < film.top + film.height && !under; y += 80) {
      await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
      await page.waitForTimeout(120);
      under = await page.evaluate(() => document.querySelector("[data-film-under-nav]") !== null);
    }
    expect(under).toBe(true);
    // Past the 700ms phase transition: the plate is paper and the pill carries the night fill.
    await expect.poll(() => page.locator(".au-logo-plate").evaluate((node) => getComputedStyle(node).backgroundColor)).toBe("rgb(245, 244, 238)");
    await expect.poll(() => page.locator(".au-nav-pill").evaluate((node) => getComputedStyle(node).backgroundColor)).toBe("rgba(9, 58, 50, 0.88)");
  });

  test("roles shows the spine and the compact plate; hovering the spine peeks the rail", async ({ page }) => {
    test.skip(!isDesktop(page), "the spine exists from 1280px");
    await openPage(page);
    await jumpTo(page, "roles");
    const column = page.locator("[data-record-column]");
    await expect(column).toHaveAttribute("data-rail-mode", "spine");
    await expect(page.locator('[data-plate="compact"]')).toBeVisible();
    await expect(page.locator(".au-rail-panel")).toBeHidden();
    const spine = page.locator(".au-spine");
    await expect(spine).toBeVisible();
    // Brushing the strip on the way to the scrollbar does not slide the rail over the section.
    const strip = await spine.boundingBox();
    if (!strip) throw new Error("no spine");
    await page.mouse.move(strip.x + strip.width / 2, strip.y + 40);
    await page.waitForTimeout(400);
    await expect(column).not.toHaveAttribute("data-peek", "");
    // Resting on the dots peeks it.
    await page.locator("[data-spine-dots]").hover();
    await expect(column).toHaveAttribute("data-peek", "");
    await expect(page.locator(".au-rail-panel")).toBeVisible();
    await page.mouse.move(200, 400);
    await expect(column).not.toHaveAttribute("data-peek", "", { timeout: 4_000 });
  });

  test("plate labels carry glossary tooltips on keyboard focus, Escape dismisses", async ({ page }) => {
    test.skip(!isDesktop(page), "the full plate shows from 1280px");
    await openPage(page);
    await jumpTo(page, "cart");
    await page.keyboard.press("Tab");
    const label = page.locator('[data-plate="full"] button', { hasText: plate.labels.secured });
    await label.focus();
    const tipId = await label.getAttribute("aria-describedby");
    expect(tipId).toBeTruthy();
    const tip = page.locator(`[id="${tipId}"]`);
    await expect(tip).toBeVisible();
    await expect(tip).toHaveAttribute("role", "tooltip");
    await expect(tip).toContainText(PLATE_TOOLTIPS.secured);
    await page.keyboard.press("Escape");
    await expect(tip).toBeHidden();
  });

  test("the live region announces additions only", async ({ page }) => {
    await openPage(page);
    const live = page.locator("[data-rail-live]");
    await expect(live).toHaveAttribute("aria-live", "polite");
    await jumpTo(page, "words");
    await jumpTo(page, "cart");
    // The newest record added on the way to the cart: the 03:07 bubble.
    await expect(live).toHaveText(RECORDS.m0307.title);
    // Scrolling back removes three entries and says nothing new.
    await jumpTo(page, "words");
    await page.waitForTimeout(1_200);
    await expect(live).toHaveText(RECORDS.m0307.title);
  });

  test("rail cards jump to where the record happened, and the record is still there", async ({ page }) => {
    test.skip(!isDesktop(page), "the rail exists from 1280px");
    await openPage(page);
    await jumpTo(page, "receipt");
    // 03:06 happens part way through the route: landing on its start would rewind to 23:30 and erase the card.
    await page.locator('[data-rail-entry="r0306"] button').click();
    await settle(page);
    await expect(page.locator('[data-section="route"]')).toBeFocused();
    await expect(page.locator('[data-rail-entry="r0306"]')).toBeAttached();
    await expect(page.locator("[data-plate-clock]").first()).toHaveAttribute("data-value", "03:07");
    await expect(page.locator("[data-record-column]")).toHaveAttribute("data-rail-mode", "open");
    // 20:05 happened in the hero, which opens on 22:00: its start holds it.
    await page.locator('[data-rail-entry="r2005"] button').click();
    await settle(page);
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBeLessThan(4);
  });

  test("the hero hand-off never empties the top of the rail below the hero", async ({ page, reducedMotion }) => {
    test.skip(!isDesktop(page) || reducedMotion === "reduce", "the proxies fly in desktop motion from 1280px");
    await openPage(page);
    // Wheel like a reader from the top to the cart (pins, lazy islands and refreshes on the way).
    await page.mouse.move(600, 450);
    const cartTop = await page.evaluate(() => document.querySelector<HTMLElement>('[data-section="cart"]')!.getBoundingClientRect().top + window.scrollY);
    for (let i = 0; i < 400 && (await page.evaluate(() => window.scrollY)) < cartTop; i += 1) {
      await page.mouse.wheel(0, 160);
      await page.waitForTimeout(16);
    }
    await settle(page);
    await expect(page.locator("[data-record-column]")).not.toHaveAttribute("data-hero-handoff", "");
    await expect(page.locator('[data-rail-entry="r2005"]')).toBeVisible();
    await expect(page.locator('[data-rail-entry="r2031"]')).toBeVisible();
    // A refresh far below the hero (as when a lazy island mounts) changes nothing.
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await page.waitForTimeout(800);
    await expect(page.locator('[data-rail-entry="r2005"]')).toBeVisible();
  });

  test("the nav lands where a fragment jump would: the section's own landing point", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 768, "the nav links show from 768px");
    await openPage(page);
    for (const id of ["roles", "trust", "route"] as const satisfies readonly SectionId[]) {
      await page.locator(`header nav a[href="#${id}"]`).click();
      await settle(page);
      await expect.poll(async () => {
        const { top, expected } = await landing(page, id);
        return Math.abs(top - expected) <= 4;
      }).toBe(true);
      await expect(page).toHaveURL(new RegExp(`#${id}$`));
      await expect(page.locator(`[data-section="${id}"]`)).toBeFocused();
      // Unpinned sections open on their heading, clear of the nav band (route reaches into its pin).
      if (id !== "route") expect((await page.locator(`#${id}-title`).boundingBox())?.y ?? 0).toBeGreaterThanOrEqual(88);
    }
  });

  test("a second skip link takes the keyboard to the record on screen", async ({ page }) => {
    await openPage(page);
    await jumpTo(page, "cart");
    const skip = page.getByRole("button", { name: `${plate.label}으로 건너뛰기` });
    await skip.focus();
    await expect(skip).toBeInViewport();
    await page.keyboard.press("Enter");
    if (isDesktop(page)) {
      // The newest rail control at 03:07 is the 03:06 card (the bubble is not a control).
      await expect(page.locator('[data-rail-entry="r0306"] button')).toBeFocused();
    } else if ((page.viewportSize()?.width ?? 0) < 1024) {
      const sheet = page.locator("dialog[data-record-sheet]");
      await expect(sheet).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
    }
  });
});

test.describe("mobile record pill and sheet", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 1024, "below 1024px only");

  test("the pill waits for the hero CTAs, shows through the night and hides at trust", async ({ page }) => {
    await openPage(page);
    const pill = page.locator("[data-record-pill]");
    const landmark = page.locator("aside", { has: pill });
    await expect(pill).not.toHaveAttribute("data-visible", "");
    // Hidden, the pill's landmark leaves the accessibility tree too, and its button the tab order (inert).
    await expect(landmark).toHaveAttribute("aria-hidden", "true");
    await expect(landmark).toHaveJSProperty("inert", true);
    // Words holds the centre line while the hero CTAs are still on screen: still no pill.
    await jumpTo(page, "words");
    await expect(page.locator("[data-hero-ctas]")).toBeInViewport();
    await expect(pill).not.toHaveAttribute("data-visible", "");
    await page.evaluate(() => window.scrollBy({ top: 600, behavior: "instant" }));
    await settle(page);
    await expect(pill).toHaveAttribute("data-visible", "");
    await expect(landmark).not.toHaveAttribute("aria-hidden", "true");
    await expect(landmark).toHaveJSProperty("inert", false);
    await expect(pill.locator("button")).toBeVisible();
    await expect(pill).toContainText("23:30");
    await expect(pill).toContainText(fill(plate.pill.count, { count: recordsAt("b2330") }));
    // Its name reads in parts, not run together.
    await expect(pill.locator("button")).toHaveAccessibleName(new RegExp(`^${plate.label}, 23:30, `));
    await jumpTo(page, "trust");
    await expect(pill).not.toHaveAttribute("data-visible", "");
    await expect(pill.locator("button")).toBeHidden();
    await expect(landmark).toHaveJSProperty("inert", true);
  });

  test("the pill's name holds its visible text in order, and nothing focusable hides inside it (axe)", async ({ page }) => {
    await openPage(page);
    await page.addScriptTag({ content: axe.source });
    const pill = page.locator("[data-record-pill]");
    const audit = () =>
      page.evaluate(async () => {
        const landmark = document.querySelector("[data-record-pill]")?.closest("aside");
        if (!landmark) throw new Error("no pill landmark");
        const run = await (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: { id: string }[] }> } }).axe.run(landmark, {
          runOnly: ["aria-hidden-focus", "label-content-name-mismatch", "button-name"],
          resultTypes: ["violations"],
        });
        return run.violations.map((violation) => violation.id);
      });
    // Hidden before the hero CTAs leave, shown through the night, hidden again at trust.
    expect(await audit()).toEqual([]);
    await jumpTo(page, "cart");
    await expect(pill).toHaveAttribute("data-visible", "");
    expect(await audit()).toEqual([]);
    // The visible parts are separate words (03:07 확보 2, not 03:07확보 2), all inside the name.
    const words = (text: string) => text.replace(/[,·]/g, " ").replace(/\s+/g, " ").trim();
    const visible = words((await pill.locator("button").textContent()) ?? "");
    expect(visible).toMatch(/^\d\d:\d\d \S+ \d+ /);
    const name = words((await pill.locator("button").getAttribute("aria-label")) ?? "");
    expect(name).toContain(visible);
    await jumpTo(page, "trust");
    await expect(pill).not.toHaveAttribute("data-visible", "");
    expect(await audit()).toEqual([]);
  });

  test("the pill's line follows the latest ledger change, in a slot that never reflows", async ({ page }) => {
    await openPage(page);
    const pill = page.locator("[data-record-pill]");
    const rows: { clock: string; line: string; width: number }[] = [];
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < height; y += 400) {
      await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
      await page.waitForTimeout(150);
      if ((await pill.getAttribute("data-visible")) === null) {
        if (rows.length > 0) break;
        continue;
      }
      const row = await pill.evaluate((node) => ({
        clock: node.querySelector("button > span")?.textContent ?? "",
        line: node.querySelector("[data-pill-summary]")?.textContent ?? "",
        width: Math.round((node.querySelector("button")?.getBoundingClientRect().width ?? 0) * 10) / 10,
      }));
      rows.push(row);
    }
    for (const row of rows) expect(row.line, row.clock).toBe(pillLineAt(row.clock));
    const lines = new Set(rows.map((row) => row.line));
    expect(lines).toContain(pillLineAt(BEATS.b0553.clock));
    expect(lines).toContain(pillLineAt(BEATS.b0849.clock));
    // From 03:06 the line keeps its shape: 확보 2, 전달 2 and 수령 2 take the same width.
    const shared = rows.filter((row) => BEAT_ORDER.indexOf(BEAT_ORDER.find((id) => BEATS[id].clock === row.clock) ?? "b2200") >= BEAT_ORDER.indexOf("b0306"));
    expect(new Set(shared.map((row) => row.width)).size).toBe(1);
  });

  test("the pill opens the sheet by touch; Esc and the close button close it", async ({ page }) => {
    await openPage(page);
    await jumpTo(page, "cart");
    const sheet = page.locator("dialog[data-record-sheet]");
    await page.locator("[data-record-pill] button").tap();
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('[data-plate="sheet"] [data-plate-summary]')).toHaveText(summaryAt("b0307"));
    await expect(sheet.locator("[data-sheet-entry]")).toHaveCount(entriesAt("b0307").length);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await page.locator("[data-record-pill] button").tap();
    await expect(sheet).toBeVisible();
    // Reading starts at the sheet's name, not at the whole sheet as one string.
    await expect(sheet.getByText(plate.label, { exact: true }).first()).toBeFocused();
    await sheet.getByRole("button", { name: plate.sheet.close }).tap();
    await expect(sheet).toBeHidden();
    // WebKit drops focus to <body> after a tap close: it comes back to the pill.
    await expect(page.locator("[data-record-pill] button")).toBeFocused();
  });

  test("a sheet entry lands where the record happened, with the record still there", async ({ page }) => {
    await openPage(page);
    await jumpTo(page, "receipt", { inset: 200 });
    const sheet = page.locator("dialog[data-record-sheet]");
    await page.locator("[data-record-pill] button").tap();
    await expect(sheet).toBeVisible();
    await sheet.locator('[data-sheet-entry="r0216"] button').tap();
    await expect(sheet).toBeHidden();
    await settle(page);
    const pill = page.locator("[data-record-pill]");
    await expect(pill).toHaveAttribute("data-visible", "");
    await expect(pill).toContainText("03:07");
    await expect(pill).toContainText(fill(plate.pill.count, { count: recordsAt("b0307") }));
  });

  test("the sheet works from the keyboard and closes on an 80px swipe down", async ({ page }) => {
    await openPage(page);
    await jumpTo(page, "receipt");
    const sheet = page.locator("dialog[data-record-sheet]");
    await page.locator("[data-record-pill] button").focus();
    await page.keyboard.press("Enter");
    await expect(sheet).toBeVisible();
    // Focus starts inside the sheet (the browser keeps it there while the modal is open).
    await expect.poll(() => page.evaluate(() => document.querySelector("dialog[data-record-sheet]")?.contains(document.activeElement))).toBe(true);
    const close = sheet.getByRole("button", { name: plate.sheet.close });
    await close.focus();
    await page.keyboard.press("Enter");
    await expect(sheet).toBeHidden();
    await expect(page.locator("[data-record-pill] button")).toBeFocused();
    await page.locator("[data-record-pill] button").press("Enter");
    await expect(sheet).toBeVisible();
    await page.evaluate(async () => {
      const handle = document.querySelector<HTMLElement>(".au-sheet-panel > div");
      if (!handle) throw new Error("no handle");
      const box = handle.getBoundingClientRect();
      const at = (dy: number) => ({ pointerId: 9, pointerType: "touch", isPrimary: true, bubbles: true, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 + dy });
      handle.dispatchEvent(new PointerEvent("pointerdown", at(0)));
      for (let dy = 10; dy <= 100; dy += 10) handle.dispatchEvent(new PointerEvent("pointermove", at(dy)));
      handle.dispatchEvent(new PointerEvent("pointerup", at(100)));
    });
    await expect(sheet).toBeHidden();
  });
});

test.describe("contrast through the motion", () => {
  test.skip(({ reducedMotion, viewport }) => reducedMotion === "reduce" || (viewport?.width ?? 0) < 1280, "desktop motion only");

  /** WCAG relative-luminance contrast of two sRGB colours. */
  const contrast = (a: number[], b: number[]) => {
    const lum = ([r, g, bl]: number[]) => {
      const lin = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(bl);
    };
    const [x, y] = [lum(a), lum(b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const channels = (css: string) => (css.match(/[\d.]+/g) ?? []).map(Number);

  test("every frame of the phase switch keeps the nav text and the CTA label at AA, both ways", async ({ page }) => {
    await openPage(page);
    for (const [from, to] of [
      ["cart", "receipt"],
      ["receipt", "cart"],
    ] as const) {
      await jumpTo(page, from);
      await page.waitForTimeout(900);
      // Sample every frame for 1.2s: the link colour, the pill's fill, the CTA's fill and label.
      await page.evaluate(() => {
        const probe = window as unknown as { __frames: string[][] };
        probe.__frames = [];
        const start = performance.now();
        const frame = () => {
          const link = getComputedStyle(document.querySelector('header nav a[href="#route"]')!);
          const pill = getComputedStyle(document.querySelector(".au-nav-pill")!);
          const cta = document.querySelector("header [data-cta-circle]")?.closest("a");
          const ctaStyle = cta ? getComputedStyle(cta) : null;
          probe.__frames.push([link.color, pill.backgroundColor, ctaStyle?.backgroundColor ?? "", ctaStyle?.color ?? ""]);
          if (performance.now() - start < 1200) requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      await jumpTo(page, to, { wait: false });
      await page.waitForTimeout(1400);
      const frames = await page.evaluate(() => (window as unknown as { __frames: string[][] }).__frames);
      expect(new Set(frames.map(([, fill]) => fill)).size, `${from} to ${to}: the switch was sampled`).toBeGreaterThan(3);
      for (const [color, fill, ctaFill, ctaColor] of frames) {
        const [r, g, b, alpha = 1] = channels(fill);
        // The pill is translucent: judge it over a night, a mid and a paper ground.
        for (const ground of [
          [7, 35, 28],
          [120, 140, 130],
          [245, 244, 238],
        ]) {
          const over = [r, g, b].map((value, i) => value * alpha + ground[i] * (1 - alpha));
          expect(contrast(channels(color), over), `${from} to ${to}: ${color} on ${fill}`).toBeGreaterThanOrEqual(4.5);
        }
        if (ctaFill) expect(contrast(channels(ctaColor), channels(ctaFill)), `${from} to ${to}: CTA ${ctaColor} on ${ctaFill}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  /*
   * While signup is active the nav shows 사전 신청 as a plain "you are here"
   * span. It stays on screen while the film's green leaves the nav (the night
   * pill handing over to day) and comes back under it on the way up, so it
   * lives through that switch: every frame, at 1280 and 1440, both ways, with
   * its own opacity and fill folded in.
   */
  test("every frame of the film to signup hand-off keeps the nav's 사전 신청 (you are here) at AA, both ways", async ({ page }) => {
    test.setTimeout(120_000);
    type Frame = { film: boolean; fill: string; link: string; span: [string, string, string] | null };
    const mix = (a: number[], b: number[], t: number) => a.map((value, i) => value * t + b[i] * (1 - t));
    // color-mix() computes to color(srgb r g b / a) with 0..1 channels; rgb() to 0..255.
    const rgba = (css: string) => {
      const values = channels(css);
      return css.startsWith("color(") ? [...values.slice(0, 3).map((value) => value * 255), ...values.slice(3)] : values;
    };
    for (const size of [
      { width: 1280, height: 800 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(size);
      await openPage(page);
      const signupTop = await page.evaluate(() => document.querySelector<HTMLElement>('[data-section="signup"]')!.getBoundingClientRect().top + window.scrollY);
      const above = Math.round(signupTop - size.height * 0.8);
      const below = Math.round(signupTop + 40);
      for (const [from, to, label] of [
        [above, below, "film to signup"],
        [below, above, "signup to film"],
      ] as const) {
        await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), from);
        await settle(page);
        await page.waitForTimeout(900);
        await page.evaluate(() => {
          const probe = window as unknown as { __frames: Frame[]; __stop: boolean };
          probe.__frames = [];
          probe.__stop = false;
          const frame = () => {
            const span = document.querySelector("[data-nav-cta-disabled]");
            const spanStyle = span ? getComputedStyle(span) : null;
            probe.__frames.push({
              film: document.querySelector("[data-film-under-nav]") !== null,
              fill: getComputedStyle(document.querySelector(".au-nav-pill")!).backgroundColor,
              link: getComputedStyle(document.querySelector('header nav a[href="#route"]')!).color,
              span: spanStyle ? [spanStyle.color, spanStyle.backgroundColor, spanStyle.opacity] : null,
            });
            if (!probe.__stop) requestAnimationFrame(frame);
          };
          requestAnimationFrame(frame);
        });
        // A slow wheel across the boundary: 60 small steps.
        for (let step = 1; step <= 60; step += 1) {
          await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), Math.round(from + ((to - from) * step) / 60));
          await page.waitForTimeout(40);
        }
        await page.waitForTimeout(1400);
        const frames = await page.evaluate(() => {
          const probe = window as unknown as { __frames: Frame[]; __stop: boolean };
          probe.__stop = true;
          return probe.__frames;
        });
        const shown = frames.filter((frame) => frame.span !== null);
        const where = `${size.width}px ${label}`;
        // The switch really ran while the span was up: film green and day both under it, and the fill in motion.
        expect(new Set(shown.map((frame) => frame.film)).size, `${where}: film green left or reached the nav while signup was active`).toBe(2);
        expect(new Set(shown.map((frame) => frame.fill)).size, `${where}: the switch was sampled`).toBeGreaterThan(3);
        for (const { fill, link, span } of shown) {
          const [r, g, b, alpha = 1] = rgba(fill);
          const [ink, tintCss, opacityCss] = span!;
          const [tr, tg, tb, tintAlpha = 1] = rgba(tintCss);
          const opacity = Number(opacityCss);
          // The pill is translucent: judge it over the night, the film green, a mid and the paper ground.
          for (const ground of [
            [7, 35, 28],
            [9, 58, 50],
            [120, 140, 130],
            [245, 244, 238],
          ]) {
            const pill = mix([r, g, b], ground, alpha);
            const under = mix([tr, tg, tb], pill, tintAlpha);
            const text = mix(rgba(ink).slice(0, 3), pill, opacity);
            const back = mix(under, pill, opacity);
            expect(contrast(text, back), `${where}: 사전 신청 ${ink} (opacity ${opacity}, fill ${tintCss}) on ${fill}`).toBeGreaterThanOrEqual(4.5);
            expect(contrast(rgba(link), pill), `${where}: link ${link} on ${fill}`).toBeGreaterThanOrEqual(4.5);
          }
        }
      }
    }
  });

  test("an entering record shows its text only once its paper is all but opaque", async ({ page }) => {
    await openPage(page);
    await jumpTo(page, "cart");
    await page.evaluate(() => {
      const probe = window as unknown as { __faint: string[] };
      probe.__faint = [];
      const start = performance.now();
      const frame = () => {
        for (const li of document.querySelectorAll<HTMLElement>(".au-rail-list > li[data-rail-entry]")) {
          const opacity = Number(getComputedStyle(li).opacity);
          if (opacity === 0 || opacity >= 0.92) continue;
          const inked = [...li.querySelectorAll("[data-entry-ink]")].some((ink) => getComputedStyle(ink).opacity !== "0");
          if (inked) probe.__faint.push(`${li.dataset.railEntry} at ${opacity.toFixed(2)}`);
        }
        if (performance.now() - start < 2500) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    // 03:07 to 05:53: r0553a and r0553b enter together while the older cards shift up.
    await scrollInto(page, "dawn", 0.54);
    await page.waitForTimeout(2600);
    expect(await page.evaluate(() => (window as unknown as { __faint: string[] }).__faint)).toEqual([]);
    // Nothing left veiled once the entries have landed.
    await expect(page.locator("[data-entry-veiled]")).toHaveCount(0);
    await expect.poll(() => liveEntries(page)).toEqual(expect.arrayContaining(["r0553a", "r0553b"]));
  });
});

test.describe("reduced motion", () => {
  test.skip(({ reducedMotion }) => reducedMotion !== "reduce", "reduced-motion project only");

  test("no flaps, rolls or slides: values swap at once", async ({ page }) => {
    await openPage(page);
    await expect(page.locator(".au-flap")).toHaveCount(0);
    await jumpTo(page, "cart");
    await expect(page.locator("[data-plate-clock]").first()).toHaveText(/03:07/);
    await expect(page.locator("[data-rail-exiting]")).toHaveCount(0);
    await jumpTo(page, "words");
    // Removed entries leave at once (no exit fade kept in the DOM).
    await expect(page.locator("[data-rail-exiting]")).toHaveCount(0);
    expect(await liveEntries(page)).toEqual(entriesAt("b2330"));
  });
});
