import { expect, test, type Locator, type Page } from "@playwright/test";

import { fill, nav, signup } from "../../src/content/copy";
import { LEAD_MESSAGES, LEAD_MIN_FILL_MS } from "../../src/lib/lead/constants";

/**
 * S10 signup (WP-19). Runs against a server started with LEAD_DRY_RUN=1, so a
 * valid submission is validated by the real server action and never inserted.
 *
 * Covers: exact field errors under their fields (ink, deep-green rule, no
 * red), Korean input (insertText and an IME composition), the sessionStorage
 * draft (restored on reload, consent never), pending (보내는 중, read-only),
 * success (status message, record in the rail or the live card, the record
 * count), offline and stale-action failures that keep every input, keyboard
 * focus that never hides under the nav or the mobile submit bar, and the
 * draft card in the rail from arrival (1280px and up). Also: the bot check's
 * fill clock runs from a restored draft's first edit (a quick send after a
 * reload is not dropped), the message box never traps page scrolling, a
 * server validation banner leaves with its last field error, on phones a
 * 사전 신청 is on screen from the role cards to past the consent row (the bar
 * hands over to the form's own button, never two at once; on short screens
 * there is no bar), and a reload comes back to the same place in the form.
 */

const DRAFT_KEY = "au:lead-draft";
const VISITOR_KEY = "au:visitor";
const INK = "rgb(16, 16, 16)";
const DEEP_GREEN = "rgb(12, 72, 62)";

let formShownAt = 0;

/**
 * The form is a lazy island: it mounts once the section is within a viewport.
 * Pins above add their spacers after hydration and move the section down, so
 * keep jumping to it until the form is there, then settle on it.
 */
async function scrollToSignup(page: Page) {
  await page.locator("#signup").waitFor();
  const jump = () =>
    page.evaluate(() => document.getElementById("signup")?.scrollIntoView({ behavior: "instant", block: "start" }));
  await expect
    .poll(
      async () => {
        await jump();
        return page.locator("#lead-form").count();
      },
      { timeout: 20_000, intervals: [250, 500, 1000] },
    )
    .toBeGreaterThan(0);
  await jump();
}

async function openSignup(page: Page) {
  await page.goto("/");
  await scrollToSignup(page);
  formShownAt = Date.now();
}

/** A role card (어떤 일을 하고 계신가요?) by its title. */
function roleCard(page: Page, title: string): Locator {
  return page.locator("#lead-role").getByRole("radio", { name: new RegExp(`^${title}`) });
}

/** A 사입 시장 chip by its label. */
function marketChip(page: Page, label: string): Locator {
  return page.locator("#lead-market").getByRole("radio", { name: label, exact: true });
}

/** A submit control: the form's own button under the consent row (first in the page), else the mobile bar's. */
function submitButton(page: Page): Locator {
  return page.locator('button[type="submit"][form="lead-form"]:visible').first();
}

/** Real visitors take longer than the bot check (2.5s since the form mounted). */
async function waitForFillTime(page: Page) {
  const remaining = LEAD_MIN_FILL_MS + 300 - (Date.now() - formShownAt);
  if (remaining > 0) await page.waitForTimeout(remaining);
}

/** A server action POST (the lead submission). */
function isActionPost(request: { method(): string; headers(): Record<string, string> }): boolean {
  return request.method() === "POST" && Boolean(request.headers()["next-action"]);
}

/** form_fill_ms from an action's multipart body (React prefixes FormData keys, e.g. _1_form_fill_ms). */
function fillMsOf(body: string): number {
  const match = body.match(/name="(?:_\d+_)?form_fill_ms"\r\n\r\n(\d+)/);
  return match ? Number(match[1]) : Number.NaN;
}

async function fillValidLead(page: Page) {
  await roleCard(page, "사입삼촌").click();
  await page.locator("#lead-name").fill("박상훈");
  await page.locator("#lead-business").fill("청평화 박삼촌");
  await page.locator("#lead-contact").fill("010-2847-1928");
  await marketChip(page, "동대문").click();
  await page.locator("#lead-message").fill("도입 시기가 궁금해요.");
  await page.locator("#lead-consent").click();
}

test.describe("S10 signup form", () => {
  test("required errors appear under their fields with the exact messages, in ink", async ({ page }) => {
    await openSignup(page);
    await submitButton(page).click();

    await expect(page.locator("#lead-role-error")).toHaveText(LEAD_MESSAGES.role);
    await expect(page.locator("#lead-name-error")).toHaveText(LEAD_MESSAGES.nameRequired);
    await expect(page.locator("#lead-contact-error")).toHaveText(LEAD_MESSAGES.contact);
    await expect(page.locator("#lead-consent-error")).toHaveText(LEAD_MESSAGES.consent);
    // Optional fields stay quiet.
    await expect(page.locator("#lead-business-error, #lead-market-error, #lead-message-error")).toHaveCount(0);

    // Linked for assistive tech, and focus moves to the first problem.
    await expect(page.locator("#lead-name")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#lead-name")).toHaveAttribute("aria-describedby", /lead-name-error/);
    await expect(roleCard(page, "소매업자")).toBeFocused();
    // The focused radio carries the error itself (a group's description is not read on focus).
    await expect(roleCard(page, "소매업자")).toHaveAccessibleName("소매업자");
    await expect(roleCard(page, "소매업자")).toHaveAccessibleDescription(new RegExp(LEAD_MESSAGES.role));
    // The question comes back into view with it, clear of the nav.
    await expect(page.locator("#lead-role-heading")).toBeInViewport();

    // Each message sits below its own field (both read in one frame: the reveal may still be scrolling).
    const errorBelowField = await page.evaluate(() => {
      const field = document.getElementById("lead-name")?.getBoundingClientRect();
      const error = document.getElementById("lead-name-error")?.getBoundingClientRect();
      return Boolean(field && error && error.top >= field.bottom);
    });
    expect(errorBelowField).toBe(true);

    // Ink text with a 2px deep-green rule; never red.
    const style = await page.locator("#lead-name-error").evaluate((node) => {
      const computed = getComputedStyle(node);
      return { color: computed.color, rule: computed.borderLeftColor, width: computed.borderLeftWidth };
    });
    expect(style).toEqual({ color: INK, rule: DEEP_GREEN, width: "2px" });

    // Fixing a field clears its message while typing.
    await page.locator("#lead-name").fill("김하늘");
    await expect(page.locator("#lead-name-error")).toHaveCount(0);
    await roleCard(page, "기타").click();
    await expect(page.locator("#lead-role-error")).toHaveCount(0);
  });

  test("labels sit above 16px inputs and nothing uses a placeholder as its label", async ({ page }) => {
    await openSignup(page);
    for (const id of ["lead-name", "lead-business", "lead-contact", "lead-message"]) {
      const field = page.locator(`#${id}`);
      await expect(field).toHaveCSS("font-size", "16px");
      await expect(field).not.toHaveAttribute("placeholder", /.+/);
      const label = page.locator(`label[for="${id}"]`);
      const [labelBox, fieldBox] = [await label.boundingBox(), await field.boundingBox()];
      expect(labelBox && fieldBox && labelBox.y + labelBox.height <= fieldBox.y).toBe(true);
    }
    await expect(page.locator("#lead-name")).toHaveCSS("height", "56px");
    await expect(page.locator("#lead-name")).toHaveCSS("border-top-color", "rgb(128, 128, 128)");
  });

  test("the business label follows the chosen role", async ({ page }) => {
    await openSignup(page);
    const label = page.locator('label[for="lead-business"]');
    await expect(label).toHaveText(signup.fields.business.retailer.label);
    await roleCard(page, "사입삼촌").click();
    await expect(page.locator("#lead-business")).toHaveAccessibleName(signup.fields.business.uncle.label);
    await roleCard(page, "기타").click();
    await expect(page.locator("#lead-business")).toHaveAccessibleName(signup.fields.business.other.label);

    // The length error names the label on screen.
    await page.locator("#lead-business").fill("가".repeat(81));
    await page.locator("#lead-name").focus();
    await expect(page.locator("#lead-business-error")).toHaveText(
      fill(signup.businessTooLong, { label: signup.fields.business.other.short }),
    );
  });

  test("the consent disclosure turns its chevron when open", async ({ page }) => {
    await openSignup(page);
    const summary = page.locator(".lead-disclosure summary");
    const rotate = () => summary.locator("svg").evaluate((node) => getComputedStyle(node).rotate);
    expect(await rotate()).toBe("none");
    await summary.click();
    await expect.poll(rotate).toBe("90deg");
  });

  test("keyboard focus never lands under the nav or the mobile submit bar", async ({ page }) => {
    await openSignup(page);
    const navBox = await page.getByRole("navigation", { name: nav.label }).boundingBox();
    const navBottom = (navBox?.y ?? 0) + (navBox?.height ?? 0);

    /** The focused control and its label sit between the nav and the bar (or the viewport bottom). */
    const inBand = () =>
      page.evaluate((navBottom) => {
        const active = document.activeElement as HTMLElement;
        const box = active.getBoundingClientRect();
        const label = active.id ? document.querySelector(`label[for="${active.id}"]`) : null;
        const top = Math.min(box.top, label?.getBoundingClientRect().top ?? box.top);
        // The bar's resting top (it may still be sliding in); 0 tall from 768px, where it is hidden.
        const bar = document.querySelector<HTMLElement>("[data-lead-sticky][data-visible]");
        const bottom = window.innerHeight - (bar?.offsetHeight ?? 0);
        return top >= navBottom && box.bottom <= bottom + 0.5;
      }, navBottom);
    const focusedId = () => page.evaluate(() => document.activeElement?.id ?? "");

    // Forward from the role cards, with every later field starting below the fold.
    await page.evaluate(() => {
      const heading = document.getElementById("lead-role-heading");
      if (heading) window.scrollTo(0, heading.getBoundingClientRect().top + window.scrollY - 120);
    });
    await roleCard(page, "소매업자").focus();
    for (let step = 0; step < 8 && (await focusedId()) !== "lead-message"; step += 1) {
      await page.keyboard.press("Tab");
      await expect.poll(inBand).toBe(true);
    }
    await expect(page.locator("#lead-message")).toBeFocused();

    // Back up from the message with the fields above the nav.
    await page.evaluate(() => {
      const message = document.getElementById("lead-message");
      if (message) window.scrollTo(0, message.getBoundingClientRect().top + window.scrollY - 140);
    });
    for (let step = 0; step < 8 && (await focusedId()) !== "lead-name"; step += 1) {
      await page.keyboard.press("Shift+Tab");
      await expect.poll(inBand).toBe(true);
    }
    await expect(page.locator("#lead-name")).toBeFocused();
  });

  test("on a short phone screen no bar covers the form: its own button sits under the consent row", async ({ page }) => {
    // A landscape phone (or 400% zoom): a fixed 77px bar would take a third of the view.
    await page.setViewportSize({ width: 667, height: 375 });
    await openSignup(page);
    const bar = page.locator("[data-lead-sticky]");
    await expect(bar).toBeHidden();
    await expect(bar).not.toHaveAttribute("data-visible", "");

    // Right under the consent row, inside the form, and it sends the form.
    await fillValidLead(page);
    const own = page.locator("#lead-form [data-lead-submit-dock] button[type=\"submit\"]");
    await own.scrollIntoViewIfNeeded();
    const consent = await page.locator("#lead-consent").boundingBox();
    const button = await own.boundingBox();
    expect(consent && button && button.y > consent.y + consent.height).toBe(true);
    await expect(bar).toBeHidden();
    await waitForFillTime(page);
    await own.click();
    await expect(page.getByRole("status").filter({ hasText: LEAD_MESSAGES.success })).toHaveCount(1);
    await expect(bar).toBeHidden();
  });

  test("the draft card is in the record from arrival, 역할: 선택 전 until a role is chosen", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "Below 1024px the draft card shows only after a send.");
    await openSignup(page);
    const draftEntry = page.locator('[data-record-column] [data-rail-entry][data-kind="draft"]');
    await expect(draftEntry).toContainText(signup.draft.title);
    await expect(draftEntry).toContainText(fill(signup.draft.line, { label: signup.draft.labels.role, value: signup.draft.empty }));
    await roleCard(page, "사입삼촌").click();
    await expect(draftEntry).toContainText(fill(signup.draft.line, { label: signup.draft.labels.role, value: "사입삼촌" }));
  });

  test("Korean typing keeps every syllable (insertText and IME composition)", async ({ page, browserName }) => {
    await openSignup(page);
    const name = page.locator("#lead-name");
    await name.click();
    await page.keyboard.insertText("박상훈");
    await expect(name).toHaveValue("박상훈");

    // A composition-like sequence: each step replaces the composing syllable.
    const business = page.locator("#lead-business");
    await business.click();
    await business.dispatchEvent("compositionstart", { data: "" });
    for (const step of ["ㅊ", "처", "청"]) {
      if (step !== "ㅊ") await page.keyboard.press("Shift+ArrowLeft");
      await page.keyboard.insertText(step);
    }
    await business.dispatchEvent("compositionend", { data: "청" });
    await page.keyboard.insertText("평화");
    await expect(business).toHaveValue("청평화");

    if (browserName === "chromium") {
      // A real IME composition through the DevTools protocol.
      const cdp = await page.context().newCDPSession(page);
      const message = page.locator("#lead-message");
      await message.click();
      await cdp.send("Input.imeSetComposition", { text: "ㄷ", selectionStart: 1, selectionEnd: 1 });
      await cdp.send("Input.imeSetComposition", { text: "도", selectionStart: 1, selectionEnd: 1 });
      await cdp.send("Input.imeSetComposition", { text: "돕", selectionStart: 1, selectionEnd: 1 });
      await cdp.send("Input.imeSetComposition", { text: "도", selectionStart: 1, selectionEnd: 1 });
      await cdp.send("Input.insertText", { text: "도" });
      await cdp.send("Input.imeSetComposition", { text: "이", selectionStart: 1, selectionEnd: 1 });
      await cdp.send("Input.imeSetComposition", { text: "입", selectionStart: 1, selectionEnd: 1 });
      await cdp.send("Input.insertText", { text: "입" });
      await expect(message).toHaveValue("도입");
    }

    // The draft keeps the same text (saved after the 400ms debounce).
    await expect
      .poll(async () => JSON.parse((await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY)) ?? "{}"))
      .toMatchObject({ name: "박상훈", business_name: "청평화" });
  });

  test("reload restores the draft, but never consent", async ({ page }) => {
    await openSignup(page);
    await fillValidLead(page);
    await page.getByRole("button", { name: signup.fields.contact.toEmail }).click();
    await expect(page.locator("#lead-consent")).toHaveAttribute("data-state", "checked");
    await expect
      .poll(async () => page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY))
      .toContain("도입 시기가 궁금해요.");
    expect(await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY)).not.toContain("consent");

    await page.reload();
    await scrollToSignup(page);
    await expect(page.locator("#lead-name")).toHaveValue("박상훈");
    await expect(page.locator("#lead-business")).toHaveValue("청평화 박삼촌");
    await expect(page.locator("#lead-contact")).toHaveValue("010-2847-1928");
    await expect(page.locator("#lead-contact")).toHaveAttribute("inputmode", "email");
    await expect(page.locator("#lead-message")).toHaveValue("도입 시기가 궁금해요.");
    await expect(roleCard(page, "사입삼촌")).toHaveAttribute("aria-checked", "true");
    await expect(marketChip(page, "동대문")).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("#lead-consent")).toHaveAttribute("data-state", "unchecked");
  });

  test("a restored draft sent right after a reload is not taken for a bot", async ({ page }) => {
    // The visitor fills the form, leaves it longer than the bot check, reloads,
    // ticks consent and sends at once: the fill clock runs from the first edit
    // (saved with the draft), not from the reloaded form's mount.
    await openSignup(page);
    const firstEdit = Date.now();
    await roleCard(page, "사입삼촌").click();
    await page.locator("#lead-name").fill("박상훈");
    await page.locator("#lead-contact").fill("010-2847-1928");
    await expect
      .poll(async () => page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY))
      .toContain("010-2847-1928");
    const away = LEAD_MIN_FILL_MS + 1000 - (Date.now() - firstEdit);
    if (away > 0) await page.waitForTimeout(away);

    await page.reload();
    await scrollToSignup(page);
    await expect(page.locator("#lead-name")).toHaveValue("박상훈");
    const sent = page.waitForRequest(isActionPost);
    await page.locator("#lead-consent").click();
    await submitButton(page).click();
    const request = await sent;
    const sentAt = Date.now();

    // Counted from the first edit (one clock, the visitor's device); the
    // reloaded form's mount clock would report well under the first edit's age.
    expect(fillMsOf(request.postData() ?? "")).toBeGreaterThanOrEqual(sentAt - firstEdit - 1500);
    expect(fillMsOf(request.postData() ?? "")).toBeGreaterThanOrEqual(LEAD_MIN_FILL_MS);
    await expect(page.getByRole("status").filter({ hasText: LEAD_MESSAGES.success })).toHaveCount(1);
  });

  test("a swipe or wheel that starts on the message box still scrolls the page", async ({ page, browserName }) => {
    await openSignup(page);
    const message = page.locator("#lead-message");
    await message.scrollIntoViewIfNeeded();
    // While it has nothing to scroll, the box passes scrolling on to the page.
    await expect(message).toHaveCSS("overscroll-behavior-y", "auto");
    await expect(message).not.toHaveAttribute("data-lenis-prevent");

    // Gesture synthesis needs the DevTools protocol (Chromium only).
    if (browserName === "chromium") {
      const box = await message.boundingBox();
      const before = await page.evaluate(() => window.scrollY);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Input.synthesizeScrollGesture", {
        x: Math.round((box?.x ?? 0) + (box?.width ?? 0) / 2),
        y: Math.round((box?.y ?? 0) + (box?.height ?? 0) / 2),
        yDistance: -400,
        gestureSourceType: "mouse",
        speed: 1600,
      });
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before + 100);
    }

    // Once it holds more than it shows, the box scrolls itself first.
    await message.fill("도입 시기가 궁금해요.\n".repeat(30));
    await expect(message).toHaveCSS("overscroll-behavior-y", "contain");
    await expect(message).toHaveAttribute("data-lenis-prevent", "");
  });

  test("pending shows 보내는 중, holds the button width and makes inputs read-only", async ({ page }) => {
    await openSignup(page);
    await fillValidLead(page);
    await waitForFillTime(page);

    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let posts = 0;
    await page.route("**/*", async (route) => {
      if (route.request().method() === "POST" && route.request().headers()["next-action"]) {
        posts += 1;
        await held;
      }
      await route.continue();
    });

    const button = submitButton(page);
    const before = await button.boundingBox();
    await button.click();
    await expect(button).toHaveText(signup.pending);
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute("aria-disabled", "true");
    await expect(page.locator("#lead-name")).toHaveAttribute("readonly", "");
    const during = await button.boundingBox();
    expect(Math.abs((during?.width ?? 0) - (before?.width ?? 0))).toBeLessThanOrEqual(1);

    // A second press while pending sends nothing more.
    await button.click({ force: true });
    release();
    await expect(page.getByRole("status").filter({ hasText: LEAD_MESSAGES.success })).toHaveCount(1);
    expect(posts).toBe(1);
  });

  test("a timing-only suspect still reaches the action and succeeds", async ({ page }) => {
    await openSignup(page);
    await fillValidLead(page);

    let fillMs = Number.NaN;
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (!isActionPost(request)) return route.continue();
      const body = request.postDataBuffer()?.toString("utf8") ?? "";
      const postData = body.replace(/(name="(?:_\d+_)?form_fill_ms"\r\n\r\n)\d+/, (_match, prefix: string) => {
        fillMs = 1;
        return `${prefix}${fillMs}`;
      });
      return route.continue({ postData });
    });

    await submitButton(page).click();
    expect(fillMs).toBeLessThan(LEAD_MIN_FILL_MS);
    await expect(page.getByRole("status").filter({ hasText: LEAD_MESSAGES.success })).toHaveCount(1);
  });

  test("a honeypot submission gets the fake success state", async ({ page }) => {
    await openSignup(page);
    await fillValidLead(page);
    await waitForFillTime(page);
    await page.locator('input[name="homepage_url"]').evaluate((input: HTMLInputElement) => {
      input.value = "https://spam.invalid";
    });

    await submitButton(page).click();
    await expect(page.getByRole("status").filter({ hasText: LEAD_MESSAGES.success })).toHaveCount(1);
  });

  test("a successful send shows 사전 신청을 보냈어요 and joins the record log", async ({ page }, testInfo) => {
    await openSignup(page);
    const pillCount = async () =>
      Number(((await page.locator("[data-record-pill]").textContent()) ?? "").match(/기록 (\d+)/)?.[1] ?? NaN);
    const isMobile = testInfo.project.name === "mobile";
    const countBefore = isMobile ? await pillCount() : 0;

    await fillValidLead(page);
    await waitForFillTime(page);
    await submitButton(page).click();

    await expect(page.getByRole("status").filter({ hasText: LEAD_MESSAGES.success })).toHaveCount(1);
    await expect(page.getByRole("button", { name: signup.again })).toBeVisible();
    await expect(page.getByRole("button", { name: signup.again })).toBeFocused();
    // The form collapsed under a send from its bottom; the result is brought into view (WebKit too).
    await expect(page.locator("[data-lead-sent]")).toBeInViewport();
    await expect(page.getByRole("button", { name: signup.again })).toBeInViewport();

    if (isMobile) {
      // The live card appears after success; the record pill counts the new record.
      const card = page.locator("[data-live-record]");
      await expect(card).toBeVisible();
      await expect(card).toContainText(signup.success.title);
      await expect(card).toContainText(signup.success.line);
      await expect.poll(pillCount).toBe(countBefore + 1);
      await expect(page.locator("[data-lead-sticky]")).not.toHaveAttribute("data-visible", "");
    } else {
      // From 1280px the record rail holds the record (WP-02's column).
      const railRecord = page.locator('[data-record-column] [data-rail-entry][data-kind="signup"]');
      await expect(railRecord).toContainText(signup.success.title);
    }

    const visitor = JSON.parse((await page.evaluate((key) => sessionStorage.getItem(key), VISITOR_KEY)) ?? "[]");
    expect(visitor).toEqual([
      expect.objectContaining({ kind: "signup", title: signup.success.title, meta: expect.stringMatching(/^신청 기록 · \d{2}:\d{2}$/) }),
    ]);
    expect(await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY)).toBeNull();

    // 다시 신청하기 brings back an empty form.
    await page.getByRole("button", { name: signup.again }).click();
    await expect(page.locator("#lead-name")).toHaveValue("");
    await expect(roleCard(page, "소매업자")).toBeFocused();
  });

  test("a send lands on the result at once: the footer never shows, the rail stays open, no draft ghost", async ({ page }, testInfo) => {
    const isMobile = testInfo.project.name === "mobile";
    await openSignup(page);
    await fillValidLead(page);
    await waitForFillTime(page);

    // Every frame from the click until the result has settled.
    await page.evaluate((draftTitle) => {
      type Frame = { footerTop: number; rail: string | null; draftShown: boolean; sent: boolean };
      const frames: Frame[] = [];
      (window as unknown as { __signupFrames: Frame[] }).__signupFrames = frames;
      const started = performance.now();
      const tick = () => {
        const footer = document.querySelector<HTMLElement>("footer#footer");
        const draft = document.querySelector<HTMLElement>(`[data-live-record] article[aria-label="${draftTitle}"]`);
        const box = draft?.getBoundingClientRect();
        frames.push({
          footerTop: footer ? footer.getBoundingClientRect().top / window.innerHeight : 2,
          rail: document.querySelector<HTMLElement>("[data-record-column]")?.dataset.railMode ?? null,
          draftShown: Boolean(box && box.width > 0 && box.height > 0),
          sent: document.querySelector("[data-lead-sent]") !== null,
        });
        if (performance.now() - started < 2200) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, signup.draft.title);
    await submitButton(page).click();
    await expect(page.locator("[data-lead-sent]")).toBeInViewport();
    await page.waitForTimeout(2400);

    const frames = await page.evaluate(
      () => (window as unknown as { __signupFrames: Array<{ footerTop: number; rail: string | null; draftShown: boolean; sent: boolean }> }).__signupFrames,
    );
    const afterSend = frames.filter((frame) => frame.sent);
    expect(afterSend.length).toBeGreaterThan(10);
    // The collapse never clamps the page into the footer, not even for a frame
    // (from 75% down the footer would turn the rail into its 업무 기록 pill).
    expect(Math.min(...afterSend.map((frame) => frame.footerTop))).toBeGreaterThan(0.75);
    if (!isMobile) expect(afterSend.filter((frame) => frame.rail !== "open")).toEqual([]);
    // Below 1024px the live card appears only as the success card.
    if (isMobile) expect(afterSend.filter((frame) => frame.draftShown)).toEqual([]);
  });

  test("the mobile submit bar is centred, full width and waits for the role cards", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "The fixed submit bar exists below 768px only.");
    await openSignup(page);
    const bar = page.locator("[data-lead-sticky]");
    const islandTop = await page.evaluate(
      () => (document.querySelector("[data-lead-island]")?.getBoundingClientRect().top ?? 0) + window.scrollY,
    );
    const placeIsland = (fromBottom: number) =>
      page.evaluate(({ islandTop, fromBottom }) => {
        const top = islandTop - window.innerHeight + fromBottom;
        const hook = (window as Window & { __auScrollTo?: (top: number) => void }).__auScrollTo;
        if (typeof hook === "function") hook(top);
        else window.scrollTo({ top, behavior: "instant" });
      }, { islandTop, fromBottom });

    // Only the sheet's top edge is in view: no send to offer yet, and no grey nav twin either.
    await placeIsland(90);
    await expect(bar).not.toHaveAttribute("data-visible", "");
    const navTwinHidden = () =>
      page.evaluate(() => {
        const twin = document.querySelector("[data-nav-cta-disabled]");
        return twin === null || getComputedStyle(twin).visibility === "hidden";
      });
    expect(await navTwinHidden()).toBe(true);

    // The first role card stands whole above the bar.
    await placeIsland(320);
    await expect(bar).toHaveAttribute("data-visible", "");
    await expect(page.locator("[data-nav-cta-disabled]")).toHaveCSS("visibility", "hidden");
    const button = bar.locator("button");
    await expect.poll(async () => (await button.boundingBox())?.y ?? 0).toBeLessThan(844 - 52);
    const [box, card, width] = await Promise.all([
      button.boundingBox(),
      roleCard(page, "소매업자").boundingBox(),
      page.evaluate(() => document.documentElement.clientWidth),
    ]);
    expect(box && card).toBeTruthy();
    if (!box || !card) return;
    // Same gutter on both sides: the primary action is not pushed off centre.
    expect(Math.abs(box.x - (width - box.x - box.width))).toBeLessThanOrEqual(1);
    expect(box.width).toBeGreaterThan(width * 0.8);
    const barTop = await bar.evaluate((node) => window.innerHeight - (node as HTMLElement).offsetHeight);
    expect(card.y + card.height).toBeLessThanOrEqual(barTop);
  });

  test("on phones a 사전 신청 is on screen past the consent row, never two at once", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "The fixed submit bar exists below 768px only.");
    await openSignup(page);
    await fillValidLead(page);
    const consentTop = await page.evaluate(
      () => (document.getElementById("lead-consent")?.getBoundingClientRect().top ?? 0) + window.scrollY,
    );
    /** Submit buttons a reader can see: not inert, below the nav, and not under the fixed bar. */
    const onScreen = () =>
      page.evaluate(() => {
        const bar = document.querySelector<HTMLElement>("[data-lead-sticky][data-visible]");
        const barTop = bar ? window.innerHeight - bar.offsetHeight : window.innerHeight;
        const seen = [...document.querySelectorAll<HTMLElement>('button[type="submit"][form="lead-form"]')].filter((button) => {
          if (button.closest("[inert]") || getComputedStyle(button).visibility === "hidden") return false;
          const box = button.getBoundingClientRect();
          if (box.width === 0 || box.top < 72 || box.top >= window.innerHeight) return false;
          return button.closest("[data-lead-sticky]") !== null || box.bottom <= barTop + 1;
        });
        return seen.map((button) => (button.closest("[data-lead-sticky]") ? "bar" : "form")).join("+");
      });
    const placeConsent = (fromTop: number) =>
      page.evaluate((y) => {
        const hook = (window as Window & { __auScrollTo?: (top: number) => void }).__auScrollTo;
        if (typeof hook === "function") hook(y);
        else window.scrollTo({ top: y, behavior: "instant" });
      }, Math.round(consentTop - fromTop));

    // The consent row from the bottom of the screen to under the nav: one submit throughout.
    for (const fromTop of [1100, 900, 760, 700, 640, 520, 400, 300, 200, 140, 90, 30]) {
      await placeConsent(fromTop);
      await expect.poll(onScreen, { message: `consent row at ${fromTop}px` }).toMatch(/^(bar|form)$/);
      // The nav's 사전 신청 (the grey pill, or the jump link once the footer is active) never stands beside it.
      await expect(page.locator('.au-nav :is([data-nav-cta-disabled], a[href="#signup"])')).toHaveCSS("visibility", "hidden");
    }

    // Back up: the bar takes over again while the form's own button is below the fold, and it sends the form.
    await placeConsent(1000);
    await expect.poll(onScreen).toBe("bar");
    await waitForFillTime(page);
    await page.locator("[data-lead-sticky] button").click();
    await expect(page.getByRole("status").filter({ hasText: LEAD_MESSAGES.success })).toHaveCount(1);
    await expect(page.locator("[data-lead-sticky]")).not.toHaveAttribute("data-visible", "");
  });

  test("a reload in the middle of the form comes back to the same place", async ({ page }) => {
    await openSignup(page);
    await roleCard(page, "사입삼촌").click();
    await page.locator("#lead-name").fill("박상훈");
    /** How far the section top sits from 600px above the viewport (0 on the saved place). */
    const offPlace = () =>
      page.evaluate(() => Math.abs((document.getElementById("signup")?.getBoundingClientRect().top ?? Number.NaN) + 600));
    // Partway down the form, with every pin above in place.
    await page.evaluate(() => {
      const section = document.getElementById("signup");
      if (!section) return;
      const top = section.getBoundingClientRect().top + window.scrollY + 600;
      const hook = (window as Window & { __auScrollTo?: (top: number) => void }).__auScrollTo;
      if (typeof hook === "function") hook(top);
      else window.scrollTo({ top, behavior: "instant" });
    });
    await expect.poll(offPlace).toBeLessThanOrEqual(2);
    await expect
      .poll(async () => page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY))
      .toContain("박상훈");

    await page.reload();
    // Back on the same line of the form (not in a section above it), and held there.
    // Within 2px: the section top sits on a fraction of a pixel and scrollY does not.
    await expect.poll(offPlace, { timeout: 15_000 }).toBeLessThanOrEqual(2);
    await expect(page.locator("#lead-name")).toHaveValue("박상훈");
    await page.waitForTimeout(1500);
    expect(await offPlace()).toBeLessThanOrEqual(2);
  });

  test("from 1280px the sheet reaches the rail and the role cards stand side by side", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "A 1280px and up layout.");
    await openSignup(page);
    const [sheet, rail, cards] = await Promise.all([
      page.locator("[data-lead-island]").boundingBox(),
      page.locator("[data-record-column]").boundingBox(),
      Promise.all(["소매업자", "사입삼촌", "기타"].map((title) => roleCard(page, title).boundingBox())),
    ]);
    expect(sheet && rail).toBeTruthy();
    if (!sheet || !rail) return;
    // The sheet's tray and padding sit between the island and the rail's gutter: no empty band.
    expect(rail.x - (sheet.x + sheet.width)).toBeLessThan(96);
    const tops = cards.map((card) => Math.round(card?.y ?? -1));
    expect(new Set(tops).size).toBe(1);
  });

  test("offline: the network string shows and every input stays", async ({ page, context }) => {
    await openSignup(page);
    await fillValidLead(page);
    await waitForFillTime(page);

    await context.setOffline(true);
    await submitButton(page).click();
    await expect(page.locator("[data-lead-banner]")).toHaveText(signup.networkError);
    await expect(page.locator("#lead-name")).toHaveValue("박상훈");
    await expect(page.locator("#lead-contact")).toHaveValue("010-2847-1928");
    await expect(page.locator("#lead-message")).toHaveValue("도입 시기가 궁금해요.");
    await expect(page.locator("#lead-consent")).toHaveAttribute("data-state", "checked");
    await expect(submitButton(page)).toHaveText(signup.submit);

    await context.setOffline(false);
    // While the retry is pending the old failure banner steps aside.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/*", async (route) => {
      if (route.request().method() === "POST" && route.request().headers()["next-action"]) await held;
      await route.continue();
    });
    await submitButton(page).click();
    await expect(submitButton(page)).toHaveText(signup.pending);
    await expect(page.locator("[data-lead-banner]")).toHaveCount(0);
    release();
    await expect(page.getByRole("status").filter({ hasText: LEAD_MESSAGES.success })).toHaveCount(1);
  });

  test("a server validation banner leaves once the flagged fields are fixed", async ({ page }) => {
    await openSignup(page);
    await fillValidLead(page);
    await waitForFillTime(page);

    // The server sees a contact that fails its check (the client check passed).
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (!isActionPost(request)) return route.continue();
      const body = request.postDataBuffer()?.toString("utf8") ?? "";
      const postData = body.replace(/(name="(?:_\d+_)?contact"\r\n\r\n)[^\r]*/, "$1ab");
      return route.continue({ postData });
    });
    await submitButton(page).click();
    // The rewritten request goes through the route handler: allow a slow round trip.
    await expect(page.locator("[data-lead-banner]")).toHaveText(LEAD_MESSAGES.invalid, { timeout: 30_000 });
    await expect(page.locator("#lead-contact-error")).toHaveText(LEAD_MESSAGES.contact);
    await page.unroute("**/*");

    // Correcting the field clears its error, and with the last one the banner goes too.
    await page.locator("#lead-contact").fill("010-2847-1929");
    await expect(page.locator("#lead-contact-error")).toHaveCount(0);
    await expect(page.locator("[data-lead-banner]")).toHaveCount(0);
  });

  test("a stale action id is retried once, then reported with the network string", async ({ page }) => {
    await openSignup(page);
    await fillValidLead(page);
    await waitForFillTime(page);

    // Every action POST answers as a server that no longer knows the action id.
    let attempts = 0;
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (request.method() === "POST" && request.headers()["next-action"]) {
        attempts += 1;
        await route.fulfill({ status: 404, headers: { "x-nextjs-action-not-found": "1" }, body: "" });
        return;
      }
      await route.continue();
    });
    await submitButton(page).click();
    await expect(page.locator("[data-lead-banner]")).toHaveText(signup.networkError);
    expect(attempts).toBe(2);
    await expect(page.locator("#lead-name")).toHaveValue("박상훈");

    // When the retry reaches the server, the send succeeds without a visible error.
    await page.unroute("**/*");
    attempts = 0;
    let first = true;
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (request.method() === "POST" && request.headers()["next-action"] && first) {
        first = false;
        attempts += 1;
        await route.fulfill({ status: 404, headers: { "x-nextjs-action-not-found": "1" }, body: "" });
        return;
      }
      await route.continue();
    });
    await submitButton(page).click();
    await expect(page.getByRole("status").filter({ hasText: LEAD_MESSAGES.success })).toHaveCount(1);
    expect(attempts).toBe(1);
  });
});

test.describe("S10 signup loading", () => {
  test("the form is a lazy island: a skeleton in the sheet until the section is near", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("[data-lead-skeleton]")).toHaveCount(1);
    await expect(page.locator("#lead-form")).toHaveCount(0);
    await scrollToSignup(page);
    await expect(page.locator("[data-lead-skeleton]")).toHaveCount(0);
  });
});
