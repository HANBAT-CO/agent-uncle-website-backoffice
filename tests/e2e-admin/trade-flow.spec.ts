import { existsSync } from "node:fs";
import path from "node:path";

import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { REPO_ROOT } from "./helpers/rest";

/*
 * 거래 흐름 screens (WP-08; screens appendix 10.10 to 10.12): 전달·수령,
 * 미송 재확인 and 문제·정정. Read-only against the seeded local stack: no
 * test here writes anything.
 */

const SHEET_ROUTE = path.join(REPO_ROOT, "src/app/(admin)/admin/(console)/@sheet/(.)requests/[id]/page.tsx");

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The view tab link whose label starts with `label` (screens 9 data table kit). */
function viewTab(page: Page, label: string): Locator {
  return page.getByRole("navigation", { name: "보기" }).getByRole("link", { name: new RegExp(`^${escape(label)}`) });
}

async function viewCount(tab: Locator): Promise<number> {
  const text = (await tab.locator("span").last().textContent()) ?? "";
  return Number(text.replace(/,/g, ""));
}

/** Data rows of the screen's list table (virtualizer spacer rows excluded). */
function listRows(page: Page): Locator {
  return page.locator("main table tbody tr:not([aria-hidden])");
}

/** Opens a view and checks its count badge equals the rows it lists (all fit on one 50-row page here). */
async function expectCountMatchesRows(page: Page, label: string, emptyTitle: string): Promise<number> {
  const tab = viewTab(page, label);
  await tab.click();
  await expect(tab).toHaveAttribute("aria-current", "page");
  const count = await viewCount(tab);
  expect(count, `${label} count`).toBeLessThanOrEqual(50);
  if (count === 0) await expect(page.getByText(emptyTitle)).toBeVisible();
  else await expect(listRows(page)).toHaveCount(count);
  return count;
}

test.describe("전달·수령", () => {
  test("each view's count equals its rows, and rounds read '{n}차'", async ({ asRole }) => {
    const page = await asRole("owner");
    await page.goto("/admin/deliveries");
    await expect(page.getByRole("heading", { level: 1, name: "전달·수령" })).toBeVisible();

    const all = await expectCountMatchesRows(page, "전체", "조건에 맞는 전달 회차가 없어요");
    expect(all).toBeGreaterThan(0);
    const rounds = await listRows(page).locator("td:first-child").allTextContents();
    expect(rounds.length).toBe(all);
    for (const round of rounds) expect(round.trim()).toMatch(/^\d+차$/);

    for (const label of ["수령 대기", "48시간 넘음", "수량 차이", "정정된 회차"]) {
      await expectCountMatchesRows(page, label, "조건에 맞는 전달 회차가 없어요");
    }

    // 정정된 회차 rows carry the 정정됨 mark; 수량 차이 rows the attention chip.
    await viewTab(page, "정정된 회차").click();
    await expect(viewTab(page, "정정된 회차")).toHaveAttribute("aria-current", "page");
    await expect(listRows(page).first()).toContainText("정정됨");
    await viewTab(page, "수량 차이").click();
    await expect(viewTab(page, "수량 차이")).toHaveAttribute("aria-current", "page");
    await expect(listRows(page).first().locator('[data-tone="attention"]')).toHaveText("수량 차이");
  });

  test("a row opens the request sheet", async ({ asRole }) => {
    const page = await asRole("owner");
    await page.goto("/admin/deliveries?view=awaiting");
    const first = listRows(page).first();
    const product = (await first.locator("td").nth(3).locator("span span").first().textContent())?.trim() ?? "";
    await first.locator("td").first().getByRole("link").click();
    await expect(page).toHaveURL(/\/admin\/requests\/[^/?#]+$/);

    if (existsSync(SHEET_ROUTE)) {
      const sheet = page.getByRole("dialog");
      await expect(sheet).toBeVisible();
      await expect(sheet).toContainText(product);
      // The list stays underneath the intercepted Sheet (aria-hidden while the modal is open).
      await expect(page.locator("main h1", { hasText: "전달·수령" })).toBeAttached();
    } else {
      test.info().annotations.push({ type: "note", description: "request Sheet route (WP-07) not present: URL checked only" });
    }
  });

  test("viewers see the 수령지 masked", async ({ asRole }) => {
    const page = await asRole("viewer");
    await page.goto("/admin/deliveries");
    const addresses = await page.getByTestId("delivery-address").allTextContents();
    expect(addresses.length).toBeGreaterThan(0);
    for (const address of addresses) expect(address.trim()).toMatch(/…$/);
  });
});

test.describe("미송 재확인", () => {
  test("views, D-day chips, 재확인 알림 and the honest reminder copy", async ({ asRole }) => {
    const page = await asRole("owner");
    await page.goto("/admin/backorders");
    await expect(page.getByRole("heading", { level: 1, name: "미송 재확인" })).toBeVisible();
    await expect(page.getByText("재확인 알림은 사입삼촌 앱이 열려 있을 때만 만들어져요.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "미송 경과" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "재확인 알림" })).toBeVisible();

    for (const label of ["전체 미송", "오늘 재확인", "기한 지남", "재확인 도래", "답변 필요"]) {
      await expectCountMatchesRows(page, label, "기다리는 미송이 없어요");
    }

    // 오늘 재확인: every D-day chip reads 오늘.
    const todayCount = await expectCountMatchesRows(page, "오늘 재확인", "기다리는 미송이 없어요");
    expect(todayCount).toBeGreaterThan(0);
    for (const chip of await listRows(page).locator("td:first-child [data-tone]").all()) await expect(chip).toHaveText("오늘");

    // 기한 지남: '{n}일 지남' in the attention tone (#B3192A text on the red tint).
    const overdueCount = await expectCountMatchesRows(page, "기한 지남", "기다리는 미송이 없어요");
    expect(overdueCount).toBeGreaterThan(0);
    for (const chip of await listRows(page).locator("td:first-child [data-tone]").all()) {
      await expect(chip).toHaveText(/^\d+일 지남$/);
      await expect(chip).toHaveAttribute("data-tone", "attention");
      await expect(chip).toHaveCSS("color", "rgb(179, 25, 42)");
    }

    // 재확인 알림 reads '보냄 · {KST}' or '아직 없음' on every row of every back order.
    await viewTab(page, "전체 미송").click();
    await expect(viewTab(page, "전체 미송")).toHaveAttribute("aria-current", "page");
    const notices = await page.getByTestId("recheck-notice").allTextContents();
    expect(notices.length).toBeGreaterThan(0);
    for (const notice of notices) expect(notice.trim()).toMatch(/^(보냄 · \d{1,2}월 \d{1,2}일 \d{2}:\d{2}|아직 없음)$/);
    expect(notices.some((notice) => notice.startsWith("보냄 · "))).toBe(true);
  });

  test("the dashboard and ⌘K links land on their views", async ({ asRole }) => {
    const page = await asRole("viewer");
    await page.goto("/admin/backorders?view=due");
    await expect(viewTab(page, "재확인 도래")).toHaveAttribute("aria-current", "page");
    await page.goto("/admin/backorders?view=overdue");
    await expect(viewTab(page, "기한 지남")).toHaveAttribute("aria-current", "page");
    await page.goto("/admin/deliveries?view=awaiting_48h");
    await expect(viewTab(page, "48시간 넘음")).toHaveAttribute("aria-current", "page");
  });
});

test.describe("문제·정정", () => {
  test("3-pane triage: selecting an issue fills the 속성 panel", async ({ asRole }) => {
    const page = await asRole("owner");
    await page.goto("/admin/issues");
    await expect(page.getByRole("heading", { level: 1, name: "문제·정정" })).toBeVisible();
    await expect(
      page.getByText("문제 해결 확인은 소매업자만, 정정 확정은 상대 거래처만 할 수 있어요. 운영자는 메모와 케이스로 도와요."),
    ).toBeVisible();

    const triage = page.getByTestId("triage");
    const properties = page.getByRole("complementary", { name: "속성" });
    await expect(triage.locator("table")).toBeVisible();
    await expect(triage.getByRole("region", { name: /./ }).first()).toBeVisible();
    await expect(properties).toBeVisible();

    for (const label of ["열린 문제", "조치 완료 · 해결 확인 대기", "해결 확인"]) {
      await expectCountMatchesRows(page, label, "조건에 맞는 문제가 없어요");
    }
    await viewTab(page, "열린 문제").click();
    await expect(viewTab(page, "열린 문제")).toHaveAttribute("aria-current", "page");
    const rows = listRows(page);
    expect(await rows.count()).toBeGreaterThan(1);

    // The first row is selected by default; pick the second one.
    await expect(rows.first().getByRole("link")).toHaveAttribute("aria-current", "true");
    const second = rows.nth(1);
    const product = ((await second.locator("td").first().locator("span span").nth(1).textContent()) ?? "").trim();
    const held = ((await second.locator("td").nth(3).textContent()) ?? "").trim();
    await second.locator("td").first().getByRole("link").click();
    await expect(page).toHaveURL(/[?&]item=/);
    await expect(second.getByRole("link").first()).toHaveAttribute("aria-current", "true");

    await expect(properties.getByTestId("prop-request")).toContainText(product);
    await expect(properties.getByTestId("prop-held")).toHaveText(held);
    await expect(properties.getByTestId("prop-status")).toHaveText(/문제 확인 중|조치 완료 · 해결 확인 대기/);
    await expect(properties.getByTestId("prop-span")).toHaveText(/^\d+(시간|일)째$/);
    await expect(properties.getByTestId("prop-round")).toHaveText(/^(\d+차|-)$/);

    // Owners can leave notes and open cases on the related request.
    await expect(triage.getByRole("button", { name: "메모 남기기" })).toBeVisible();
  });

  test("the proposal views render with counts, request counters and 속성", async ({ asRole }) => {
    const page = await asRole("owner");
    await page.goto("/admin/issues");
    await page.getByRole("navigation", { name: "문제·정정 종류" }).getByRole("link", { name: "변경·취소·정정" }).click();
    await expect(page).toHaveURL(/tab=proposals/);

    let seen = 0;
    for (const label of ["상대 확인 대기", "확정", "철회", "거절"]) {
      const count = await expectCountMatchesRows(page, label, "조건에 맞는 협의가 없어요");
      seen += count;
      if (count === 0) continue;
      await expect(page.getByRole("complementary", { name: "속성" }).getByTestId("prop-status")).toHaveText(label);
      for (const ledger of await page.getByTestId("proposal-ledger").allTextContents()) {
        expect(ledger.replace(/\s+/g, " ").trim()).toMatch(/^요청 \d+ · 확보 \d+ · 전달 \d+ · 수령 \d+ · 취소 \d+$/);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  test("viewers read the triage but get no note or case forms", async ({ asRole }) => {
    const page = await asRole("viewer");
    await page.goto("/admin/issues");
    await expect(page.getByRole("complementary", { name: "속성" })).toBeVisible();
    await expect(page.getByRole("region", { name: "운영 메모", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "메모 남기기" })).toHaveCount(0);
    await expect(page.getByRole("form", { name: "케이스 열기" })).toHaveCount(0);
  });
});
