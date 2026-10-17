import { readFileSync } from "node:fs";

import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { psql, staffRpc } from "./helpers/rest";

/*
 * 사입 요청 (WP-07; screens appendix 10.9): tabs with counts, filters,
 * footer totals, the intercepted Sheet versus the full page, before/after
 * per role, the operator CSV and two notes in a row from one open Sheet
 * (Review Focus 1). Read-only against the seeded local stack, except the
 * two notes (backoffice notes are immutable, so each run adds two, marked
 * "WP-07 e2e") and the audited export.
 */

type Ledger = { quantity: number; acquired: number; delivered: number; received: number; backorder: number };
type ListResult = { total: number; rows: { id: string; label: string; product: string | null; requestType: string; ledger: Ledger; retailer: { id: string; name: string | null }; uncle: { id: string; name: string | null } }[] };

/**
 * A seeded request with an issue whose timeline has quantity changes. Looked
 * up per run: the demo seed creates new ids on every reset.sh.
 */
function richRequest(): string {
  const id = psql(
    "select data->>'requestId' from public.saip_records e where collection = 'events' and coalesce(data->>'deliveryId', '') = ''" +
      " and jsonb_typeof(data->'before') = 'object'" +
      " and (select bool_or(e.data->'before'->>k is distinct from e.data->'after'->>k) from unnest(array['quantity','acquired','delivered','received','cancelled','held']) k)" +
      " and exists (select 1 from public.saip_records i where i.collection = 'issues' and i.data->>'requestId' = e.data->>'requestId')" +
      " group by 1 order by count(*) desc, 1 limit 1",
  );
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("no seeded request with quantity changes (run supabase-local/scripts/reset.sh)");
  return id;
}

const n = (value: number) => value.toLocaleString("ko-KR");

function footerFor(total: number, rows: { ledger: Ledger; requestType: string }[]): string {
  const amount = (key: keyof Ledger) => ["product", "wholesaler"]
    .filter(type => rows.some(row => row.requestType === type))
    .map(type => `${n(rows.filter(row => row.requestType === type).reduce((sum, row) => sum + row.ledger[key], 0))}${type === "wholesaler" ? "건" : "장"}`)
    .join(" + ");
  return `${n(total)}건 · 요청 ${amount("quantity")} · 확보 ${amount("acquired")} · 전달 ${amount("delivered")} · 수령 ${amount("received")} · 남은 미송 ${amount("backorder")}`;
}

async function listAs(role: "owner" | "viewer", args: Record<string, unknown> = {}): Promise<ListResult> {
  const result = await staffRpc<ListResult>(role, "backoffice_list_requests", { p_limit: 200, ...args });
  if (!result.data) throw new Error(`list_requests failed: ${result.error?.message}`);
  return result.data;
}

async function tabs(page: Page): Promise<{ label: string; count: number; href: string; current: boolean }[]> {
  const nav = page.getByRole("navigation", { name: "요청 상태" });
  await expect(nav).toBeVisible();
  return nav.getByRole("link").evaluateAll((links) =>
    links.map((link) => {
      const badge = link.querySelector("span.num");
      const count = Number((badge?.textContent ?? "").replace(/,/g, ""));
      return {
        label: (link.textContent ?? "").replace(badge?.textContent ?? "", "").trim(),
        count,
        href: link.getAttribute("href") ?? "",
        current: link.getAttribute("aria-current") === "page",
      };
    }),
  );
}

/** The 상태 chip of every row on the page (column 3: checkbox, 요청 시각, 상태). */
async function rowLabels(page: Page): Promise<string[]> {
  return page.locator("tbody tr").evaluateAll((rows) => rows.map((row) => (row.querySelectorAll("td")[2]?.textContent ?? "").trim()));
}

async function footer(page: Page): Promise<string> {
  return (await page.getByTestId("requests-footer").textContent())?.trim() ?? "";
}

function scrollBox(page: Page): Locator {
  return page.locator("table").first().locator("xpath=..");
}

async function detailSnapshot(scope: Locator) {
  return {
    title: (await scope.getByRole("heading").first().textContent())?.trim(),
    tiles: await scope.getByTestId("ledger-tile").allTextContents(),
    events: await scope.getByTestId("event").count(),
  };
}

test.describe("list", () => {
  test("each tab count equals its rows, and 진행 중 includes 픽업 완료 and 미송 대기", async ({ asRole }) => {
    const page = await asRole("owner");
    await page.goto("/admin/requests");
    const all = await tabs(page);
    expect(all.map((tab) => tab.label)).toEqual(["전체", "확인 대기", "진행 중", "답변 필요", "미송 재확인", "수령 대기", "문제 확인 중", "변경·취소 협의 중", "수령(입금 전)", "입금 완료", "종료"]);
    expect(all[0].current).toBe(true);

    for (const tab of all) {
      await page.goto(tab.href);
      await expect(page.getByTestId("requests-footer")).toHaveText(new RegExp(`^${n(tab.count)}건 · `));
      if (tab.count === 0) continue;
      await expect(page.getByRole("navigation", { name: "페이지" })).toContainText(`/ ${n(tab.count)}건`);
    }

    await page.goto("/admin/requests?view=progress&size=200");
    const labels = new Set(await rowLabels(page));
    expect([...labels].every((label) => ["진행 중", "픽업 완료", "미송 대기"].includes(label))).toBe(true);
    expect(labels.has("픽업 완료")).toBe(true);
    expect(labels.has("미송 대기")).toBe(true);

    // The dashboard tile's view: 답변 필요 + 문제 확인 중, shown as its own tab while selected.
    await page.goto("/admin/requests?view=attention&size=200");
    const attention = (await tabs(page)).find((tab) => tab.current);
    expect(attention?.label).toBe("확인 필요");
    expect(new Set(await rowLabels(page))).toEqual(new Set(["답변 필요", "문제 확인 중"]));
    await expect(page.getByTestId("requests-footer")).toHaveText(new RegExp(`^${n(attention?.count ?? -1)}건 · `));
  });

  test("footer totals match the rows, with and without a tab", async ({ asRole }) => {
    const page = await asRole("owner");
    const everything = await listAs("owner");
    expect(everything.total).toBeLessThanOrEqual(200);
    await page.goto("/admin/requests");
    expect(await footer(page)).toBe(footerFor(everything.total, everything.rows));

    const receipt = await listAs("owner", { p_labels: ["수령 대기"] });
    await page.goto("/admin/requests?view=receipt");
    expect(await footer(page)).toBe(footerFor(receipt.total, receipt.rows));
  });

  test("search, 조건, 거래처 and 기간 filter the list and show as chips", async ({ asRole }) => {
    const page = await asRole("owner");
    await page.goto("/admin/requests");
    const total = (await tabs(page))[0].count;

    // Search a demo product (Hangul typed key by key; the input waits for the debounce).
    const search = page.getByRole("searchbox", { name: "상품명·옵션·도매처·요청 ID로 검색" });
    await search.pressSequentially("케이블 니트", { delay: 30 });
    await expect(page).toHaveURL(/q=%EC%BC%80%EC%9D%B4%EB%B8%94/);
    const expected = await listAs("owner", { p_search: "케이블 니트" });
    await expect(page.getByTestId("requests-footer")).toHaveText(new RegExp(`^${n(expected.total)}건 · `));
    expect(expected.total).toBeLessThan(total);
    const products = await page.locator("tbody tr").evaluateAll((rows) => rows.map((row) => row.querySelectorAll("td")[6]?.textContent ?? ""));
    expect(products.every((text) => text.includes("케이블 니트"))).toBe(true);
    await expect(page.getByRole("group", { name: "적용한 필터" })).toContainText('검색 "케이블 니트"');
    await page.getByRole("group", { name: "적용한 필터" }).getByRole("link", { name: "필터 초기화" }).click();
    await expect(page).toHaveURL(/\/admin\/requests$/);

    // 조건: 사진 있음 (p_attention has_photos).
    await page.getByRole("combobox", { name: "조건" }).click();
    await page.getByRole("option", { name: "사진 있음" }).click();
    await expect(page).toHaveURL(/cond=has_photos/);
    const photos = await listAs("owner", { p_attention: "has_photos" });
    await expect(page.getByTestId("requests-footer")).toHaveText(new RegExp(`^${n(photos.total)}건 · `));
    await expect(page.getByRole("group", { name: "적용한 필터" })).toContainText("사진 있음");

    // 거래처 combobox (backoffice_search), on top of the 조건.
    await page.getByRole("combobox", { name: "거래처" }).click();
    await page.getByRole("combobox", { name: "거래처 찾기" }).pressSequentially("망원", { delay: 30 });
    const option = page.getByRole("option", { name: /망원 셀렉트샵/ });
    await expect(option).toBeVisible();
    await option.click();
    await expect(page).toHaveURL(/account=[0-9a-f-]{36}/);
    const accountId = new URL(page.url()).searchParams.get("account");
    const scoped = await listAs("owner", { p_attention: "has_photos", p_account_id: accountId });
    await expect(page.getByTestId("requests-footer")).toHaveText(new RegExp(`^${n(scoped.total)}건 · `));
    await expect(page.getByRole("group", { name: "적용한 필터" })).toContainText("거래처 망원 셀렉트샵");
    expect(scoped.rows.every((row) => row.retailer.id === accountId || row.uncle.id === accountId)).toBe(true);

    // 기간 as KST days: 2026-10-13 is [10-12T15:00Z, 10-13T15:00Z).
    await page.goto("/admin/requests?from=2026-10-13&to=2026-10-13");
    const day = await listAs("owner", { p_from: "2026-10-12T15:00:00.000Z", p_to: "2026-10-13T15:00:00.000Z" });
    await expect(page.getByTestId("requests-footer")).toHaveText(new RegExp(`^${n(day.total)}건 · `));
    await expect(page.getByRole("group", { name: "적용한 필터" })).toContainText("10월 13일부터");
  });
});

test.describe("detail", () => {
  test("a row opens the Sheet over the list, which keeps its scroll and selection; Escape closes it", async ({ asRole }) => {
    const page = await asRole("owner");
    await page.goto("/admin/requests?size=100");
    await expect(page.locator("tbody tr")).toHaveCount(Math.min((await tabs(page))[0].count, 100));

    await page.locator("tbody tr").nth(1).getByRole("checkbox", { name: "이 행 선택" }).click();
    await expect(page.getByRole("region", { name: "선택한 행" })).toContainText("1건 선택");
    await scrollBox(page).evaluate((box) => box.scrollTo({ top: 360 }));
    const scrolled = await scrollBox(page).evaluate((box) => box.scrollTop);
    expect(scrolled).toBeGreaterThan(100);

    const row = page.locator("tbody tr").nth(8);
    const id = (await row.locator("a").first().getAttribute("href"))?.split("/").pop() ?? "";
    await row.locator("a").first().click();
    const sheet = page.getByTestId("request-sheet");
    await expect(sheet).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/admin/requests/${id}$`));
    await expect(sheet.getByTestId("request-detail")).toHaveAttribute("data-variant", "sheet");
    // The list is still rendered under the Sheet, scrolled where it was.
    await expect(page.locator("table caption", { hasText: "사입 요청 목록" })).toHaveCount(1);
    expect(await scrollBox(page).evaluate((box) => box.scrollTop)).toBe(scrolled);

    const inSheet = await detailSnapshot(sheet);
    expect(inSheet.tiles).toHaveLength(8);
    for (const tile of inSheet.tiles) expect(tile).toMatch(/\d+장$/);
    await expect(sheet.getByTestId("two-party-note")).toHaveText("기록을 고치려면 두 거래처가 앱에서 정정을 제안하고 확정해야 해요.");

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/\/admin\/requests\?size=100$/);
    expect(await scrollBox(page).evaluate((box) => box.scrollTop)).toBe(scrolled);
    await expect(page.getByRole("region", { name: "선택한 행" })).toContainText("1건 선택");

    // A direct URL renders the full page with the same content.
    await page.goto(`/admin/requests/${id}`);
    await expect(page.getByTestId("request-sheet")).toHaveCount(0);
    const full = page.getByTestId("request-detail");
    await expect(full).toHaveAttribute("data-variant", "page");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(inSheet.title ?? "");
    expect(await detailSnapshot(full)).toEqual(inSheet);
  });

  test("before → after shows for operators only; viewers get the after-ledger and no write controls", async ({ asRole }) => {
    const RICH_REQUEST = richRequest();
    const operator = await asRole("operator");
    await operator.goto(`/admin/requests/${RICH_REQUEST}`);
    const diffs = operator.getByTestId("ledger-diff");
    await expect(diffs.first()).toBeVisible();
    await expect(diffs.first()).toContainText(/\d+ → \d+/);
    await expect(operator.getByTestId("ledger-after")).toHaveCount(0);
    await expect(operator.getByRole("toolbar", { name: "요청 작업" }).getByRole("button", { name: "메모 남기기" })).toBeVisible();

    const viewer = await asRole("viewer");
    await viewer.goto(`/admin/requests/${RICH_REQUEST}`);
    const timeline = viewer.getByTestId("event-timeline");
    await expect(timeline).toBeVisible();
    await expect(viewer.getByTestId("ledger-diff")).toHaveCount(0);
    await expect(viewer.getByTestId("ledger-after").first()).toContainText("이후 수량");
    expect(await timeline.textContent()).not.toContain("→");
    await expect(viewer.getByRole("toolbar", { name: "요청 작업" }).getByRole("button", { name: "메모 남기기" })).toHaveCount(0);
    await viewer.getByRole("tab", { name: /운영 메모 · 케이스/ }).click();
    await expect(viewer.getByRole("form", { name: "메모 남기기" })).toHaveCount(0);
    await viewer.goto("/admin/requests");
    await expect(viewer.getByRole("button", { name: "CSV 내보내기" })).toBeDisabled();
  });

  test("an operator adds two different notes in a row from the same open Sheet", async ({ asRole }) => {
    const page = await asRole("operator");
    await page.goto("/admin/requests?view=received");
    await page.locator("tbody tr").first().locator("a").first().click();
    const sheet = page.getByTestId("request-sheet");
    await expect(sheet).toBeVisible();
    const url = page.url();

    await sheet.getByRole("toolbar", { name: "요청 작업" }).getByRole("button", { name: "메모 남기기" }).click();
    const form = sheet.getByRole("form", { name: "메모 남기기" });
    const body = form.getByRole("textbox", { name: "메모" });
    await expect(body).toBeFocused();

    const stamp = Date.now();
    const notes = [`WP-07 e2e 메모 A ${stamp}`, `WP-07 e2e 메모 B ${stamp}`];
    for (const note of notes) {
      await body.fill(note);
      await form.getByRole("button", { name: "메모 남기기" }).click();
      await expect(sheet.getByText(note, { exact: true })).toBeVisible();
      await expect(form.getByText("메모를 남겼어요")).toBeVisible();
      await expect(form.getByRole("alert")).toHaveCount(0);
      await expect(body).toHaveValue("");
    }
    // Still the Sheet over the list, both notes listed, no replay refusal.
    await expect(page).toHaveURL(url);
    await expect(sheet).toBeVisible();
    for (const note of notes) await expect(sheet.getByText(note, { exact: true })).toBeVisible();
    await expect(sheet.getByText("이미 처리된 작업이에요", { exact: false })).toHaveCount(0);
  });

  test("the operator CSV starts with a BOM and the 요청 ID header", async ({ asRole }) => {
    const page = await asRole("operator");
    await page.goto("/admin/requests");
    await page.getByRole("button", { name: "CSV 내보내기" }).click();
    const dialog = page.getByRole("dialog", { name: "사입 요청 CSV 내보내기" });
    await dialog.getByRole("textbox", { name: "사유" }).fill("WP-07 e2e 내보내기 확인");
    const downloading = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "내려받기" }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(/^saip-requests-\d{8}\.csv$/);
    const text = readFileSync(await download.path(), "utf8");
    expect(text.startsWith("﻿요청 ID,")).toBe(true);
  });
});
