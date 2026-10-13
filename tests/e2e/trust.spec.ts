import { expect, test, type Locator, type Page } from "@playwright/test";

import { fill, trust } from "../../src/content/copy";
import { RECORDS } from "../../src/content/story";

import { jumpTo, openPage, settle } from "./chrome-helpers";

/**
 * S8 trust (WP-17, spec S8): the equation board refuses impossible numbers
 * with the app's own strings, the proposal block writes only the visitor's
 * own 기다리기 answer (once) and reaches 완료 only through the counterpart's
 * replay, the chat footage plays at 50% visibility, and the idempotency demo
 * ends with one saved request. Runs in desktop, mobile and reduced-motion.
 */

const VISITOR_KEY = "au:visitor";
const { equation, refusals, proposal, idempotency } = trust;

type Field = "received" | "delivered" | "secured";

const stepper = (page: Page, field: Field, dir: "up" | "down"): Locator =>
  page.getByRole("button", {
    name: fill(dir === "up" ? equation.increment : equation.decrement, { label: equation.steppers[field] }),
    exact: true,
  });

const slot = (page: Page, field: Field) => page.locator(`[data-refusal-slot="${field}"]`);

/** The board's numeral for a field, as the number on screen. */
async function numeral(page: Page, field: Field): Promise<number> {
  return Number(await page.locator(`[data-numeral="${field}"] [data-value]`).getAttribute("data-value"));
}

/** Put an element's centre at the viewport centre and wait for scroll to rest. */
async function reveal(page: Page, selector: string): Promise<void> {
  await page.locator(selector).first().waitFor({ state: "attached" });
  await page.evaluate((sel) => {
    const node = document.querySelector<HTMLElement>(sel);
    if (!node) throw new Error(`missing ${sel}`);
    const box = node.getBoundingClientRect();
    const top = box.top + window.scrollY + box.height / 2 - window.innerHeight / 2;
    window.scrollTo({ top: Math.max(0, top), behavior: "instant" });
  }, selector);
  await settle(page);
}

/** Board values (numerals and stepper values) reading 0 with any part inside the viewport. */
async function visibleZeros(page: Page): Promise<number> {
  return page.locator("[data-numeral] [data-value], [data-stepper-value] [data-value]").evaluateAll(
    (nodes) =>
      nodes.filter((node) => {
        const box = node.getBoundingClientRect();
        return node.getAttribute("data-value") === "0" && box.bottom > 0 && box.top < window.innerHeight;
      }).length,
  );
}

async function openBoard(page: Page): Promise<void> {
  await openPage(page);
  await reveal(page, "[data-trust-board]");
  // Entry roll: the numerals land on the 08:49 record.
  for (const field of ["received", "delivered", "secured"] as const) {
    await expect(page.locator(`[data-numeral="${field}"] [data-value]`)).toHaveAttribute("data-value", "2");
  }
}

async function openProposal(page: Page): Promise<void> {
  await openPage(page);
  await reveal(page, "[data-proposal]");
  await page.locator("[data-proposal-ready]").waitFor({ state: "attached" });
}

async function visitorRecords(page: Page): Promise<Array<{ kind: string; title: string; tag?: string; meta: string }>> {
  return JSON.parse((await page.evaluate((key) => sessionStorage.getItem(key), VISITOR_KEY)) ?? "[]");
}

/* ---------- equation board ---------- */

test.describe("equation board", () => {
  test("each illegal press shows its exact refusal in its own field, and leaves the others", async ({ page }) => {
    await openBoard(page);

    const cases: Array<[Field, "up" | "down", string]> = [
      ["secured", "down", refusals.securedDown],
      ["delivered", "up", refusals.deliveredUp],
      ["delivered", "down", refusals.deliveredDown],
      ["received", "up", refusals.receivedUp],
      ["received", "down", refusals.receivedDown],
    ];

    // One refusal per field: a refused press replaces only its own field's refusal.
    const expected: Record<Field, string> = { received: "", delivered: "", secured: "" };
    for (const [field, dir, message] of cases) {
      await stepper(page, field, dir).click();
      expected[field] = message;
      await expect(slot(page, field)).toHaveAttribute("role", "alert");
      for (const each of ["received", "delivered", "secured"] as const) {
        await expect(slot(page, each)).toHaveText(expected[each]);
      }
      expect(await numeral(page, field)).toBe(2);
    }

    // The reset clears every refusal.
    await page.getByRole("button", { name: trust.reset }).click();
    for (const each of ["received", "delivered", "secured"] as const) {
      await expect(slot(page, each)).toHaveText("");
    }

    // 확보 + is allowed up to 요청 6, then refused.
    for (let i = 0; i < 4; i += 1) {
      await stepper(page, "secured", "up").click();
      await expect(slot(page, "secured")).toHaveText("");
    }
    await expect(page.locator('[data-numeral="secured"] [data-value]')).toHaveAttribute("data-value", "6");
    await stepper(page, "secured", "up").click();
    await expect(slot(page, "secured")).toHaveText(refusals.securedUp);
    expect(await numeral(page, "secured")).toBe(6);
  });

  test("refusals are ink with a deep-green rule, never red", async ({ page }) => {
    await openBoard(page);
    await stepper(page, "received", "up").click();
    const refusal = slot(page, "received").locator("p");
    await expect(refusal).toBeVisible();
    const style = await refusal.evaluate((node) => {
      const s = getComputedStyle(node);
      return { color: s.color, rule: s.borderLeftColor, width: s.borderLeftWidth };
    });
    expect(style).toEqual({ color: "rgb(16, 16, 16)", rule: "rgb(12, 72, 62)", width: "2px" });
  });

  test("allowed presses roll and keep 수령 ≤ 전달 ≤ 확보 ≤ 요청", async ({ page }) => {
    await openBoard(page);
    const context = page.locator("[data-board-context]");
    await expect(context).toHaveText(fill(trust.context, { backorder: 4 }));

    const steps: Array<[Field, number]> = [
      ["secured", 3],
      ["delivered", 3],
      ["received", 3],
      ["secured", 4],
      ["delivered", 4],
    ];
    for (const [field, expected] of steps) {
      await stepper(page, field, "up").click();
      await expect(page.locator(`[data-numeral="${field}"] [data-value]`)).toHaveAttribute("data-value", String(expected));
      await expect(page.locator(`[data-stepper-value="${field}"] [data-value]`)).toHaveAttribute("data-value", String(expected));
      const [received, delivered, secured] = await Promise.all([numeral(page, "received"), numeral(page, "delivered"), numeral(page, "secured")]);
      expect(received).toBeLessThanOrEqual(delivered);
      expect(delivered).toBeLessThanOrEqual(secured);
      expect(secured).toBeLessThanOrEqual(6);
    }
    await expect(context).toHaveText(fill(trust.context, { backorder: 2 }));

    // 수령 3 < 전달 4 = 확보 4: only the second ≤ marks a reached limit.
    const leqs = page.locator(".trust-eq-leq");
    await expect(leqs.nth(0)).not.toHaveAttribute("data-limit", "");
    await expect(leqs.nth(1)).toHaveAttribute("data-limit", "");

    await page.getByRole("button", { name: trust.reset }).click();
    for (const field of ["received", "delivered", "secured"] as const) {
      await expect(page.locator(`[data-numeral="${field}"] [data-value]`)).toHaveAttribute("data-value", "2");
    }
    await expect(context).toHaveText(fill(trust.context, { backorder: 4 }));
    await expect(leqs.nth(0)).toHaveAttribute("data-limit", "");
  });

  test("an allowed press clears only its own refusal, and is announced once", async ({ page }) => {
    await openBoard(page);
    await stepper(page, "delivered", "down").click();
    await expect(slot(page, "delivered")).toHaveText(refusals.deliveredDown);

    // 확보 + is allowed: the 전달 refusal above it stays, so nothing under the finger moves.
    await stepper(page, "secured", "up").click();
    await expect(page.locator('[data-numeral="secured"] [data-value]')).toHaveAttribute("data-value", "3");
    await expect(slot(page, "delivered")).toHaveText(refusals.deliveredDown);
    await expect(page.locator("[data-board-announce]")).toHaveText(fill(equation.announce, { label: equation.steppers.secured, count: 3 }));

    // An allowed press on 전달 itself clears its refusal.
    await stepper(page, "delivered", "up").click();
    await expect(slot(page, "delivered")).toHaveText("");

    // The stepper values are plain text: no live region announces the entry roll.
    for (const field of ["received", "delivered", "secured"] as const) {
      const value = page.locator(`[data-stepper-value="${field}"]`);
      await expect(value).not.toHaveAttribute("aria-live", /.+/);
      expect(await value.evaluate((node) => node.tagName)).toBe("SPAN");
    }

    await page.getByRole("button", { name: trust.reset }).click();
    await expect(page.locator("[data-board-announce]")).toHaveText(equation.announceReset);
  });

  test("no press moves the pressed control, and the reset stays where it was pressed", async ({ page }) => {
    await openBoard(page);
    const top = async (target: Locator) => {
      const box = await target.boundingBox();
      if (!box) throw new Error("control not rendered");
      return box.y;
    };

    // The reported sequence (stacked phones): a refusal above, then refused and allowed presses below it.
    const presses: Array<[Field, "up" | "down"]> = [
      ["received", "up"],
      ["delivered", "down"],
      ["secured", "down"],
      ["delivered", "up"],
      ["received", "down"],
      ["secured", "up"],
      ["delivered", "up"],
      ["received", "up"],
    ];
    for (const [field, dir] of presses) {
      const control = stepper(page, field, dir);
      await control.scrollIntoViewIfNeeded();
      await settle(page);
      const before = await top(control);
      await control.click();
      // Past the refusal's 300ms rise and any roll.
      await page.waitForTimeout(450);
      expect(Math.abs((await top(control)) - before), `${field} ${dir} moved under the finger`).toBeLessThan(1);
    }

    // Every field now shows a refusal (or showed one): the reset removes them above itself and stays put.
    await stepper(page, "secured", "down").click();
    await stepper(page, "delivered", "down").click();
    await stepper(page, "received", "down").click();
    const reset = page.getByRole("button", { name: trust.reset });
    await reset.scrollIntoViewIfNeeded();
    await settle(page);
    const before = await top(reset);
    await reset.click();
    for (const each of ["received", "delivered", "secured"] as const) {
      await expect(slot(page, each)).toHaveText("");
    }
    await settle(page);
    expect(Math.abs((await top(reset)) - before), "the reset moved under the finger").toBeLessThan(1);
  });

  test("from 768px every refusal fits its reserved row: nothing below the board moves", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "the stacked board reserves no refusal row");
    await openBoard(page);
    const reset = page.getByRole("button", { name: trust.reset });
    const resetTop = () => reset.evaluate((node) => node.getBoundingClientRect().top + window.scrollY);
    // 834: the narrow columns where the longest refusal takes three lines; 1440: two.
    for (const width of [834, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await reset.click();
      const before = await resetTop();
      for (const [field, dir] of [
        ["received", "down"],
        ["received", "up"],
        ["delivered", "down"],
        ["delivered", "up"],
        ["secured", "down"],
      ] as const) {
        await stepper(page, field, dir).click();
        await expect(slot(page, field)).not.toHaveText("");
        expect(Math.abs((await resetTop()) - before), `${width}px, ${field} ${dir}`).toBeLessThan(1);
      }
    }
  });

  test("확보 refused at 요청 6 marks 요청 6장 in the context line", async ({ page }) => {
    await openBoard(page);
    const request = page.locator("[data-context-request]");
    await expect(request).not.toHaveAttribute("data-limit", "");
    for (let i = 0; i < 5; i += 1) await stepper(page, "secured", "up").click();
    await expect(slot(page, "secured")).toHaveText(refusals.securedUp);
    await expect(request).toHaveAttribute("data-limit", "");
    await expect(page.locator("[data-board-context]")).toHaveText(fill(trust.context, { backorder: 0 }));
  });

  test("a #trust deep link keeps the recorded numbers: no flicker to 0", async ({ page }) => {
    await page.addInitScript(() => {
      const seen: string[] = [];
      (window as unknown as { __seen: string[] }).__seen = seen;
      const tick = () => {
        const value = document.querySelector<HTMLElement>('[data-numeral="secured"] [data-value]')?.dataset.value;
        if (value && seen.at(-1) !== value) seen.push(value);
        if (performance.now() < 8000) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.goto("/#trust");
    await page.locator("[data-chrome-root][data-hydrated]").waitFor({ state: "attached" });
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen)).toEqual(["2"]);
  });

  test("approaching from above, the context line reads 4장 and no armed 0 is ever on screen", async ({ page }, testInfo) => {
    await openPage(page);
    // Opened at the top, the board is out of view: with motion it arms its 0s, off screen.
    if (testInfo.project.name !== "reduced-motion") {
      await expect(page.locator('[data-numeral="secured"] [data-value]')).toHaveAttribute("data-value", "0");
    }
    const context = page.locator("[data-board-context]");
    const contextTop = await context.evaluate((node) => node.getBoundingClientRect().top + window.scrollY);
    // The context line's top from just below the fold up to mid-screen (0.9: the reported 90% case).
    for (const at of [1.02, 0.98, 0.94, 0.9, 0.86, 0.82, 0.78, 0.74, 0.7, 0.6, 0.5]) {
      await page.evaluate(([top, f]) => window.scrollTo({ top: top - window.innerHeight * f, behavior: "instant" }), [contextTop, at] as const);
      await page.waitForTimeout(150);
      await expect(context, `context line at ${Math.round(at * 100)}%`).toHaveText(fill(trust.context, { backorder: 4 }));
      expect(await visibleZeros(page), `armed 0s on screen with the context line at ${Math.round(at * 100)}%`).toBe(0);
    }
    for (const field of ["received", "delivered", "secured"] as const) {
      await expect(page.locator(`[data-numeral="${field}"] [data-value]`)).toHaveAttribute("data-value", "2");
      await expect(page.locator(`[data-stepper-value="${field}"] [data-value]`)).toHaveAttribute("data-value", "2");
    }
  });

  test("approaching from below, no armed 0 is ever on screen", async ({ page }) => {
    await openPage(page);
    const bottom = await page.locator(".trust-eq").evaluate((node) => node.getBoundingClientRect().bottom + window.scrollY);
    // Jump past the board without crossing it, then scroll back up over it.
    await page.evaluate((y) => window.scrollTo({ top: y + window.innerHeight, behavior: "instant" }), bottom);
    await page.waitForTimeout(300);
    for (const at of [-0.4, -0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.4, 0.6]) {
      await page.evaluate(([y, f]) => window.scrollTo({ top: y - window.innerHeight * f, behavior: "instant" }), [bottom, at] as const);
      await page.waitForTimeout(150);
      expect(await visibleZeros(page), `armed 0s on screen with the equation's bottom at ${Math.round(at * 100)}%`).toBe(0);
    }
  });

  test("the board never writes to the rail or the visitor log", async ({ page }) => {
    await openBoard(page);
    const before = await page.locator("[data-rail-entry]").count();
    await stepper(page, "secured", "up").click();
    await stepper(page, "received", "up").click();
    await page.getByRole("button", { name: trust.reset }).click();
    await expect(page.locator("[data-rail-entry]")).toHaveCount(before);
    expect(await visitorRecords(page)).toEqual([]);
  });
});

/* ---------- proposal block ---------- */

test.describe("proposal block", () => {
  test("기다리기 writes exactly one visitor record, shown in the rail, the plate and the footer log", async ({ page }) => {
    await openProposal(page);
    const sheet = page.locator("[data-proposal]");

    await sheet.getByRole("button", { name: proposal.wait }).click();
    const outcome = sheet.locator("[data-wait-outcome]");
    await expect(outcome).toContainText(proposal.waitOutcome.badge);
    await expect(outcome).toContainText(proposal.waitOutcome.title);
    await expect(outcome).toContainText(proposal.waitOutcome.chip);
    await expect(outcome).toContainText(/업무 기록 · \d\d:\d\d/);

    // 처음으로 and a second answer never write again.
    await outcome.getByRole("button", { name: proposal.replay.restart }).click();
    await expect(sheet.getByText(proposal.question)).toBeVisible();
    await sheet.getByRole("button", { name: proposal.wait }).click();
    await expect(sheet.locator("[data-wait-outcome]")).toBeVisible();

    const records = await visitorRecords(page);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ kind: "answer-wait", title: proposal.waitOutcome.title, tag: proposal.waitOutcome.chip });
    expect(records[0]?.meta).toMatch(/^업무 기록 · \d\d:\d\d$/);
    await expect(page.locator('li[data-kind="answer-wait"][data-rail-entry]')).toHaveCount(1);

    // Later, in signup, the plate's status reads 미송 대기.
    await jumpTo(page, "signup");
    await expect(page.locator('[data-plate="full"]').first()).toContainText("미송 대기");

    // It survives a reload in the same tab and appears once in the footer visit log.
    await page.reload();
    await page.locator("[data-chrome-root][data-hydrated]").waitFor({ state: "attached" });
    expect(await visitorRecords(page)).toHaveLength(1);
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
    await settle(page);
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
    await expect(page.locator('[data-visit-record="answer-wait"]')).toHaveCount(1);
  });

  test("after a reload in the same tab, the sheet reopens on the recorded answer, not the question", async ({ page }, testInfo) => {
    await openProposal(page);
    const sheet = page.locator("[data-proposal]");
    await sheet.getByRole("button", { name: proposal.wait }).click();
    await expect(sheet.locator("[data-wait-outcome]")).toBeVisible();
    const [record] = await visitorRecords(page);
    expect(record).toBeDefined();

    await page.reload();
    await page.locator("[data-chrome-root][data-hydrated]").waitFor({ state: "attached" });
    await reveal(page, "[data-proposal]");
    await page.locator("[data-proposal-ready]").waitFor({ state: "attached" });

    const outcome = sheet.locator("[data-wait-outcome]");
    await expect(sheet).toHaveAttribute("data-proposal-phase", "waitConfirmed");
    await expect(outcome).toContainText(proposal.waitOutcome.badge);
    await expect(outcome).toContainText(proposal.waitOutcome.title);
    await expect(outcome).toContainText(record!.meta);
    await expect(sheet.getByText(proposal.question)).toHaveCount(0);
    if (testInfo.project.name !== "mobile") {
      // The counterpart pane agrees: no 답변 필요 beside an answered record.
      await expect(sheet.locator("[data-counterpart-idle]")).toHaveAttribute("data-counterpart-idle", "answered");
    }

    // 처음으로 still returns to the question, and a second answer writes nothing new.
    await outcome.getByRole("button", { name: proposal.replay.restart }).click();
    await expect(sheet.getByText(proposal.question)).toBeVisible();
    await sheet.getByRole("button", { name: proposal.wait }).click();
    await expect(sheet.locator("[data-wait-outcome]")).toContainText(record!.meta);
    expect(await visitorRecords(page)).toHaveLength(1);
  });

  test("a cancel is only a proposal; 완료 appears only through the counterpart's replay, never in the rail", async ({ page }, testInfo) => {
    await openProposal(page);
    const sheet = page.locator("[data-proposal]");
    const retailer = sheet.locator('[data-pane="retailer"]');
    const counterpart = sheet.locator('[data-pane="counterpart"]');
    const railBefore = await page.locator("[data-rail-entry]").count();

    await sheet.getByRole("button", { name: proposal.cancel }).click();
    await expect(retailer).toContainText(proposal.cancelOutcome.status);
    await expect(retailer.locator("[data-ledger-line]")).toHaveText(fill(proposal.cancelOutcome.ledger, { cancelled: 0 }));
    await expect(retailer).toContainText(proposal.cancelOutcome.quantity);
    await expect(retailer).toContainText(proposal.cancelOutcome.reason);
    await expect(retailer.getByRole("button", { name: proposal.replay.confirm })).toBeDisabled();
    await expect(retailer).toContainText(proposal.cancelOutcome.confirmDisabled);
    await expect(sheet.locator("[data-completion]")).toHaveCount(0);

    // The counterpart's screen is shown, never operated: no controls in it.
    await expect(counterpart).toBeVisible();
    await expect(counterpart.locator("button, a, input, select, textarea, [tabindex='0']")).toHaveCount(0);

    await sheet.getByRole("button", { name: proposal.cancelOutcome.showReplay }).click();

    if (testInfo.project.name !== "reduced-motion") {
      await expect(counterpart.locator('[data-counterpart="pressed"]')).toBeVisible();
      await expect(counterpart.locator("[data-confirm-sheet]")).toContainText(proposal.replay.sheetTitle);
      await expect(counterpart.locator("[data-confirm-sheet]")).toContainText(proposal.replay.sheetBody);
      await expect(counterpart.locator('[data-counterpart="done"]')).toBeVisible();
      await expect(counterpart).toContainText(proposal.replay.status);
    } else {
      await expect(counterpart.locator("[data-replay-steps] li")).toHaveText([
        proposal.replay.confirm,
        proposal.replay.sheetTitle,
        proposal.replay.status,
      ]);
    }

    const completion = sheet.locator("[data-completion]");
    await expect(completion).toContainText(proposal.replay.done);
    await expect(completion).toContainText(proposal.replay.doneLine);
    await expect(completion.locator("[data-log-line]")).toHaveText(proposal.replay.log);
    for (const pane of [retailer, counterpart]) {
      await expect(pane.locator("[data-ledger-line]")).toHaveText(fill(proposal.cancelOutcome.ledger, { cancelled: 4 }));
      await expect(pane).toContainText(proposal.replay.status);
    }

    // The replay wrote nothing: no rail entry, no visitor record.
    await expect(page.locator("[data-rail-entry]")).toHaveCount(railBefore);
    expect(await visitorRecords(page)).toEqual([]);

    await completion.getByRole("button", { name: proposal.replay.restart }).click();
    await expect(sheet.getByText(proposal.question)).toBeVisible();
    await expect(sheet.locator("[data-completion]")).toHaveCount(0);
  });

  test("before a cancel, the counterpart pane shows 박삼촌's 09:41 card for the denim", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "the counterpart pane is hidden below 768px until a cancel");
    await openProposal(page);
    const sheet = page.locator("[data-proposal]");
    const idle = sheet.locator('[data-pane="counterpart"][data-ghost] [data-counterpart-idle]');
    const { counterpartIdle } = proposal;
    await expect(idle).toHaveAttribute("data-counterpart-idle", "waiting");
    await expect(idle).toHaveText(`${counterpartIdle.status}${counterpartIdle.product}${counterpartIdle.option} · ${counterpartIdle.reply}`);

    // After 기다리기 only the product line stays: no unverified uncle-side status.
    await sheet.getByRole("button", { name: proposal.wait }).click();
    await expect(idle).toHaveAttribute("data-counterpart-idle", "answered");
    await expect(idle).toHaveText(`${counterpartIdle.product}${counterpartIdle.option}`);
  });

  test("제안 철회 returns to the question", async ({ page }) => {
    await openProposal(page);
    const sheet = page.locator("[data-proposal]");
    await sheet.getByRole("button", { name: proposal.cancel }).click();
    await sheet.getByRole("button", { name: proposal.cancelOutcome.withdraw }).click();
    await expect(sheet.getByText(proposal.question)).toBeVisible();
    await expect(sheet.locator('[data-pane="counterpart"][data-ghost]')).toHaveCount(1);
    expect(await visitorRecords(page)).toEqual([]);
  });
});

/* ---------- chat device ---------- */

test.describe("chat device", () => {
  test("plays the real chat footage once it is at least half in view", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "reduced-motion", "reduced motion never autoplays");
    // The low-power heuristic (spec 6.6) turns autoplay off on 4-core machines; pin a capable device.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
      Object.defineProperty(navigator, "deviceMemory", { get: () => 8 });
    });
    await openPage(page);
    await reveal(page, "[data-trust-device] .device-frame");
    const video = page.locator("[data-trust-device] video");
    await expect.poll(() => video.evaluate((node: HTMLVideoElement) => !node.paused && node.currentTime > 0), { timeout: 20_000 }).toBe(true);
    await expect(page.locator("[data-trust-device] figcaption")).toHaveText(trust.chatCaption);
  });

  test("frames the shirt records and says the footage is real", async ({ page }) => {
    await openPage(page);
    await expect(page.locator("[data-trust-device] [data-chat-context]")).toHaveText(trust.chatContext.join(" "));
  });

  test("reduced motion shows the poster with a play button and never autoplays", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "reduced-motion", "reduced-motion project only");
    await openPage(page);
    await reveal(page, "[data-trust-device] .device-frame");
    await page.waitForTimeout(1500);
    expect(await page.locator("[data-trust-device] video").evaluate((node: HTMLVideoElement) => node.paused)).toBe(true);
    await expect(page.locator("[data-trust-device] .device-controls button")).toBeVisible();
  });
});

/* ---------- 처리 이력 and proof index ---------- */

test.describe("history and proof", () => {
  test("the 처리 이력 strip lists the five verified records, oldest first", async ({ page }) => {
    await openPage(page);
    const items = page.locator("[data-history] li");
    await expect(items).toHaveCount(5);
    const expected = trust.history.records.map((id) => {
      const record = RECORDS[id];
      return `${record.day} ${record.time}${record.title}`;
    });
    await expect(items).toHaveText(expected);
    await expect(page.locator("#trust-history-caption")).toHaveText(trust.history.caption);
    await expect(page.getByRole("list", { name: trust.history.label })).toHaveCount(1);
    await expect(page.locator("#trust-history-label + p")).toHaveText(trust.history.item);
  });

  test("the idempotency demo ends with 저장된 요청 1건 after offline retries", async ({ page }) => {
    await openPage(page);
    await reveal(page, "[data-idempotency]");
    const demo = page.locator("[data-idempotency]");
    const saved = demo.locator('[data-counter="saved"]');
    const attempts = demo.locator('[data-counter="attempts"]');
    const error = demo.locator("[data-idempotency-error]");
    const offline = demo.getByRole("switch", { name: idempotency.switch });
    const send = demo.getByRole("button", { name: idempotency.send });

    await offline.check();
    await send.click();
    await send.click();
    await expect(error).toHaveText(idempotency.offline);
    await expect(attempts).toHaveText(fill(idempotency.attempts, { count: 2 }));
    await expect(saved).toHaveText(fill(idempotency.saved, { count: 0 }));

    await offline.uncheck();
    await send.click();
    await expect(saved).toHaveText(fill(idempotency.saved, { count: 1 }));
    await expect(error).toHaveText("");
    await send.click();
    await expect(attempts).toHaveText(fill(idempotency.attempts, { count: 4 }));
    await expect(saved).toHaveText(fill(idempotency.saved, { count: 1 }));
  });

  test("the proof index has its four claims, each app string in the refusal material", async ({ page }) => {
    await openPage(page);
    await expect(page.locator("[data-proof-index] h3")).toHaveText(trust.proof.map((item) => item.title));
    const quotes = page.locator("[data-proof-index] .trust-quote");
    await expect(quotes).toHaveText(trust.proof.flatMap((item) => ("quote" in item ? [item.quote] : [])));
    const style = await quotes.first().evaluate((node) => {
      const s = getComputedStyle(node);
      return { color: s.color, rule: s.borderLeftColor, width: s.borderLeftWidth };
    });
    expect(style).toEqual({ color: "rgb(16, 16, 16)", rule: "rgb(12, 72, 62)", width: "2px" });
  });

  test("the idempotency demo is labelled a sample and reads its counters together", async ({ page }) => {
    await openPage(page);
    const demo = page.locator("[data-idempotency]");
    await expect(demo).toContainText(trust.sample);
    const counters = demo.locator("[data-idempotency-counters]");
    await expect(counters).toHaveAttribute("role", "status");
    await expect(counters).toHaveAttribute("aria-atomic", "true");
  });

  test("from 768px the offline error never moves the proof index or the film below", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "below 768px the empty error slot collapses (no pins there)");
    await openPage(page);
    await reveal(page, "[data-idempotency]");
    const demo = page.locator("[data-idempotency]");
    const measure = () =>
      page.evaluate(() => ({
        proof: Math.round(document.querySelector("[data-proof-index]")!.getBoundingClientRect().height),
        trust: Math.round(document.getElementById("trust")!.getBoundingClientRect().height),
      }));
    const before = await measure();
    await demo.getByRole("switch", { name: idempotency.switch }).check();
    await demo.getByRole("button", { name: idempotency.send }).click();
    await expect(demo.locator("[data-idempotency-error]")).toHaveText(idempotency.offline);
    expect(await measure()).toEqual(before);
    await demo.getByRole("switch", { name: idempotency.switch }).uncheck();
    await demo.getByRole("button", { name: idempotency.send }).click();
    await expect(demo.locator("[data-idempotency-error]")).toHaveText("");
    expect(await measure()).toEqual(before);
  });
});

/* ---------- lines by meaning, and the pins below ---------- */

/** Boxes of an element's direct span children, page coordinates rounded. */
const spanBoxes = (locator: Locator) =>
  locator.evaluate((node) =>
    [...node.querySelectorAll(":scope > span")].map((span) => {
      const box = span.getBoundingClientRect();
      return { top: Math.round(box.top), bottom: Math.round(box.bottom), lines: span.getClientRects().length };
    }),
  );

test.describe("lines by meaning", () => {
  test("the lead is one sentence per line and wraps only at its comma", async ({ page }) => {
    await openPage(page);
    const lead = page.locator("[data-trust-lead]");
    await expect(lead).toHaveText(trust.lead.join(" "));
    const sentences = await spanBoxes(lead);
    expect(sentences).toHaveLength(trust.lead.length);
    expect(sentences[1].top).toBeGreaterThanOrEqual(sentences[0].bottom - 1);
    // Each comma clause stays on one line: 받은 수량이 전달보다, / 전달이 확보보다 많아질 수 없어요.
    const clauses = await lead.evaluate((node) =>
      [...node.querySelectorAll(":scope > span > span")].map((span) => {
        const box = span.getBoundingClientRect();
        return { height: box.height, line: parseFloat(getComputedStyle(span).lineHeight) };
      }),
    );
    expect(clauses.length).toBeGreaterThan(trust.lead.length);
    for (const clause of clauses) expect(clause.height).toBeLessThan(clause.line * 1.5);
  });

  test("an app string in the proof index breaks between its sentences", async ({ page }) => {
    await openPage(page);
    const quote = page.locator("[data-proof-index] .trust-quote").first();
    const sentences = await spanBoxes(quote);
    expect(sentences).toHaveLength(2);
    expect(sentences[1].top).toBeGreaterThanOrEqual(sentences[0].bottom - 1);
  });
});

test("a height change inside the section re-measures the pin below it", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "pins exist only with motion from 1024px");
  await openPage(page);
  // Visit the film first, so its own lazy islands have mounted (and refreshed) before the
  // growth: only trust's height watch can re-measure the pin afterwards.
  await reveal(page, "#film");
  await page.waitForTimeout(1500);
  await reveal(page, "[data-proposal]");
  await page.locator("[data-proposal-ready]").waitFor({ state: "attached" });
  await page.waitForTimeout(500);
  // Stand-in for any growth (a proposal phase taller than the device column): 150px more section.
  await page.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.style.height = "150px";
    document.querySelector("#trust [data-proof-index]")!.after(spacer);
  });
  await page.waitForTimeout(800);
  const pinTop = () =>
    page.evaluate(() => {
      const end = document.getElementById("trust")!.getBoundingClientRect().bottom + window.scrollY;
      const spacer = [...document.querySelectorAll<HTMLElement>(".pin-spacer")].find(
        (node) => node.getBoundingClientRect().top + window.scrollY >= end - 1,
      );
      return spacer ? Math.round(spacer.getBoundingClientRect().top + window.scrollY) : null;
    });
  const top = await pinTop();
  expect(top).not.toBeNull();
  const pinnedAt = async (y: number) => {
    await page.evaluate((target) => window.scrollTo({ top: target, behavior: "instant" }), y);
    await settle(page);
    return page.evaluate((spacerTop) => {
      const spacer = [...document.querySelectorAll<HTMLElement>(".pin-spacer")].find(
        (node) => Math.abs(node.getBoundingClientRect().top + window.scrollY - spacerTop) < 2,
      );
      return spacer?.firstElementChild ? getComputedStyle(spacer.firstElementChild).position : null;
    }, top!);
  };
  // Not pinned before its own top (a stale start would pin it 150px early), pinned after it.
  expect(await pinnedAt(top! - 40)).not.toBe("fixed");
  expect(await pinnedAt(top! + 40)).toBe("fixed");
});

/* ---------- reduced motion and colour ---------- */

test.describe("reduced motion", () => {
  test("shows final states at once: recorded numerals, instant refusals", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "reduced-motion", "reduced-motion project only");
    await openPage(page);
    await reveal(page, "[data-trust-board]");
    for (const field of ["received", "delivered", "secured"] as const) {
      expect(await numeral(page, field)).toBe(2);
    }
    await stepper(page, "delivered", "up").click();
    await expect(slot(page, "delivered")).toHaveText(refusals.deliveredUp, { timeout: 500 });
    const transform = await page.locator('[data-field="delivered"] [data-pill]').evaluate((node) => getComputedStyle(node).transform);
    expect(["none", "matrix(1, 0, 0, 1, 0, 0)"]).toContain(transform);
  });
});

test("no red, orange, lime or purple anywhere in the section's own styles", async ({ page }) => {
  await openProposal(page);
  // Walk every state of the block so each colour is on screen once.
  const sheet = page.locator("[data-proposal]");
  await sheet.getByRole("button", { name: proposal.cancel }).click();
  await stepper(page, "received", "up").click();

  const offenders = await page.evaluate(() => {
    const parse = (value: string): [number, number, number, number] | null => {
      const match = value.match(/rgba?\(([^)]+)\)/);
      if (!match) return null;
      const parts = match[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return [parts[0], parts[1], parts[2], parts[3] ?? 1];
    };
    const banned = ([r, g, b, a]: [number, number, number, number]) => {
      if (a === 0) return false;
      const max = Math.max(r, g, b) / 255;
      const min = Math.min(r, g, b) / 255;
      const s = max === 0 ? 0 : (max - min) / max;
      if (s <= 0.45 || max <= 0.35) return false;
      const d = max - min;
      let h = 0;
      if (max === r / 255) h = ((g - b) / 255 / d) % 6;
      else if (max === g / 255) h = (b - r) / 255 / d + 2;
      else h = (r - g) / 255 / d + 4;
      h = (h * 60 + 360) % 360;
      // Allowed saturated hues: the greens and teals of the brand (100-260deg).
      return h < 100 || h > 260;
    };
    const section = document.getElementById("trust");
    const found: string[] = [];
    for (const node of section?.querySelectorAll<HTMLElement>("*") ?? []) {
      if (node.closest(".device-screen")) continue;
      const s = getComputedStyle(node);
      for (const prop of ["color", "backgroundColor", "borderTopColor", "borderLeftColor", "outlineColor", "fill", "stroke"] as const) {
        const value = s[prop];
        const rgb = parse(value);
        if (rgb && banned(rgb)) found.push(`${node.tagName}.${node.className}: ${prop} ${value}`);
      }
    }
    return found;
  });
  expect(offenders).toEqual([]);
});
