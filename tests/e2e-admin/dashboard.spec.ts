import path from "node:path";

import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { REPO_ROOT, psql, staffRpc } from "./helpers/rest";

/*
 * 대시보드 and 운영 점검 (WP-05; screens 10.5 and 10.6) against the seeded
 * local stack: KPI tiles with their filtered links, the range toggle in the
 * URL, the 지금 확인할 일 queue, the charts and side summary, the kind chips,
 * an injected ledger violation (restored afterwards), viewer access and axe.
 */

const TILES = [
  ["newRequests", "새 사입 요청", "건"],
  ["attention", "확인이 필요한 요청", "건"],
  ["overdueRechecks", "기한 지난 미송 재확인", "건"],
  ["deliveriesAwaitingReceipt", "수령 대기", "회차"],
  ["incompleteSignups", "가입 미완료", "명"],
  ["newLeads", "새 랜딩 문의", "건"],
] as const;

const ANOMALY_LABELS = [
  "수량 기록 불일치",
  "기한 지난 미송 재확인",
  "수령 확인 48시간 넘음",
  "3일 넘은 문제",
  "하루 넘은 확인 대기",
  "이틀 넘은 협의",
  "서류 확인 대기",
  "3일 넘은 연결 요청",
  "3일 멈춘 가입",
  "파일 없음",
  "등록되지 않은 파일",
  "앱 계정 없는 로그인",
  "하루 넘은 새 문의",
];

type Overview = {
  kpi: Record<(typeof TILES)[number][0], number>;
  requestLabels: Record<string, number>;
  queue: unknown[];
};

/** 'YYYY-MM-DD' of a date in KST. */
function kstDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

async function overview(days: number): Promise<Overview> {
  const result = await staffRpc<Overview>("owner", "backoffice_overview", { p_include_demo: false, p_days: days });
  expect(result.error).toBeNull();
  return result.data!;
}

async function tileValue(page: Page, key: string): Promise<number> {
  const text = await page.locator(`[data-kpi="${key}"] [data-kpi-value]`).innerText();
  return Number(text.replace(/[^\d]/g, ""));
}

async function expectNoSeriousAxe(page: Page, label: string) {
  await page.addScriptTag({ path: path.join(REPO_ROOT, "node_modules/axe-core/axe.min.js") });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (ctx: Document, opts: object) => Promise<{ violations: { id: string; impact: string; nodes: { target: string[] }[] }[] }> } }).axe;
    const result = await axe.run(document, { resultTypes: ["violations"] });
    return result.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => ({ id: v.id, impact: v.impact, targets: v.nodes.slice(0, 3).map((n) => n.target.join(" ")) }));
  });
  expect(violations, label).toEqual([]);
}

test.describe("대시보드", () => {
  test("six KPI tiles with spec copy link to their filtered lists", async ({ asRole }) => {
    const page = await asRole("owner");
    await page.goto("/admin");
    await expect(page.getByRole("heading", { level: 1, name: "대시보드" })).toBeVisible();
    await expect(page.getByTestId("dashboard-stamp")).toHaveText(/^\d{2}:\d{2} 기준$/);

    const data = await overview(1);
    const today = kstDay(new Date());
    const hrefs: Record<string, string> = {
      newRequests: `/admin/requests?from=${today}`,
      attention: "/admin/requests?view=attention",
      overdueRechecks: "/admin/backorders?view=due",
      deliveriesAwaitingReceipt: "/admin/deliveries?view=awaiting",
      incompleteSignups: "/admin/accounts?view=signup",
      newLeads: "/admin/leads?status=new",
    };

    const tiles = page.locator("[data-kpi]");
    await expect(tiles).toHaveCount(6);
    for (const [index, [key, label, unit]] of TILES.entries()) {
      const tile = tiles.nth(index);
      await expect(tile).toHaveAttribute("data-kpi", key);
      await expect(tile).toHaveAttribute("href", hrefs[key]);
      await expect(tile).toContainText(label);
      await expect(tile).toContainText(`${data.kpi[key].toLocaleString("ko-KR")}${unit}`);
    }
  });

  test("the attention tile count equals the filtered request total and opens view=attention", async ({ asRole }) => {
    const page = await asRole("owner");
    await page.goto("/admin");
    const shown = await tileValue(page, "attention");
    const list = await staffRpc<{ total: number }>("owner", "backoffice_list_requests", {
      p_labels: ["답변 필요", "문제 확인 중"],
      p_include_demo: false,
      p_limit: 1,
      p_offset: 0,
    });
    expect(list.error).toBeNull();
    expect(shown).toBe(list.data!.total);
    expect(shown).toBeGreaterThan(0);

    await page.locator('[data-kpi="attention"]').click();
    await page.waitForURL((url) => url.pathname === "/admin/requests" && url.searchParams.get("view") === "attention");
  });

  test("the range toggle writes ?range= and re-scopes 새 사입 요청", async ({ asRole }) => {
    const page = await asRole("owner");
    await page.goto("/admin");
    const toggle = page.getByTestId("range-toggle");
    await expect(toggle.getByRole("radio", { name: "오늘" })).toHaveAttribute("aria-checked", "true");

    await toggle.getByRole("radio", { name: "7일" }).click();
    await page.waitForURL((url) => url.searchParams.get("range") === "7");
    await expect(toggle.getByRole("radio", { name: "7일" })).toHaveAttribute("aria-checked", "true");
    const weekStart = kstDay(new Date(Date.now() - 6 * 86_400_000));
    await expect(page.locator('[data-kpi="newRequests"]')).toHaveAttribute("href", `/admin/requests?from=${weekStart}`);
    expect(await tileValue(page, "newRequests")).toBe((await overview(7)).kpi.newRequests);

    await toggle.getByRole("radio", { name: "30일" }).click();
    await page.waitForURL((url) => url.searchParams.get("range") === "30");
    await toggle.getByRole("radio", { name: "오늘" }).click();
    await page.waitForURL((url) => url.pathname === "/admin" && !url.searchParams.has("range"));
  });

  test("지금 확인할 일 lists queue items with reason chips and 열기 links", async ({ asRole }) => {
    const page = await asRole("owner");
    await page.goto("/admin");
    const queue = page.getByTestId("attention-queue");
    await expect(queue.getByRole("heading", { name: "지금 확인할 일" })).toBeVisible();

    const data = await overview(1);
    const rows = queue.locator("[data-queue-kind]");
    await expect(rows).toHaveCount(Math.min(data.queue.length, 10));
    expect(await rows.count()).toBeGreaterThan(0);
    for (const row of await rows.all()) {
      const chip = (await row.locator("[data-tone]").innerText()).trim();
      expect(ANOMALY_LABELS).toContain(chip);
      await expect(row.getByRole("link", { name: /^열기/ })).toHaveAttribute("href", /^\/admin\//);
      await expect(row.locator("time")).toHaveText(/(방금|전)$/);
    }
  });

  test("charts and the side summary follow the spec copy", async ({ asRole }) => {
    const page = await asRole("owner");
    await page.goto("/admin");
    const data = await overview(1);

    await expect(page.getByTestId("chart-new-requests").getByRole("heading", { name: "새 사입 요청 · 14일" })).toBeVisible();
    // 14 days in the data table; recharts draws no rectangle for a zero day (e.g. today just after midnight KST).
    await expect(page.getByTestId("chart-new-requests").locator("table tbody tr")).toHaveCount(14);
    const counts = await page.getByTestId("chart-new-requests").locator("table tbody td").allTextContents();
    const zeroDays = counts.filter((count) => /^0\D*$/.test(count.trim())).length;
    await expect(page.getByTestId("chart-new-requests").locator(".recharts-bar-rectangle")).toHaveCount(14 - zeroDays);
    await expect(page.getByTestId("chart-backorder-aging").getByRole("heading", { name: "미송 경과" })).toBeVisible();
    await expect(page.getByTestId("chart-backorder-aging").getByRole("table")).toContainText("8일 이상");

    const stages = page.getByTestId("chart-stages");
    await expect(stages.getByRole("heading", { name: "요청 단계" })).toBeVisible();
    for (const stage of ["확인 대기", "진행 중", "수령 대기", "완료"]) {
      await expect(stages.locator(`[data-stage-legend="${stage}"]`)).toBeVisible();
    }
    const ended = (data.requestLabels["거절"] ?? 0) + (data.requestLabels["취소 종료"] ?? 0);
    await expect(page.getByTestId("stages-ended")).toHaveText(`종료 ${ended}건`);

    const summary = page.getByTestId("side-summary");
    await expect(summary).toContainText(/소매업자 \d+명 · 사입삼촌 \d+명 · 업무 중 \d+명/);
    await expect(summary).toContainText(/연결 완료 \d+곳 · 수락 대기 \d+건/);
    await expect(summary).toContainText(/채팅 24시간 \d+건/);
    await expect(summary).toContainText(/첨부 \d+개 · [\d.]+(B|KB|MB|GB)/);
    await expect(summary).toContainText(/열린 케이스 \d+건/);
    await expect(summary).toContainText(/게시 중 공지 \d+건/);
    await expect(summary).toContainText(/점검 모드 (꺼짐|켜짐)/);
  });

  test("axe finds no serious or critical violations", async ({ asRole }) => {
    const page = await asRole("owner");
    await page.goto("/admin");
    await expect(page.getByTestId("attention-queue")).toBeVisible();
    await expectNoSeriousAxe(page, "/admin");
  });
});

test.describe("운영 점검", () => {
  test("kind chips with counts filter the anomaly list", async ({ asRole }) => {
    const page = await asRole("owner");
    await page.goto("/admin/checks");
    await expect(page.getByRole("heading", { level: 1, name: "운영 점검" })).toBeVisible();

    const result = await staffRpc<{ items: { kind: string }[]; counts: Record<string, number> }>("owner", "backoffice_ledger_anomalies", {
      p_include_demo: false,
    });
    const total = result.data!.items.length;
    const chips = page.getByTestId("kind-chips");
    await expect(chips.locator('[data-kind="all"]')).toContainText(`전체${total}`);
    await expect(page.getByRole("table", { name: "운영 점검 목록" }).locator("tbody tr")).toHaveCount(Math.min(total, 50));

    const chip = chips.locator('[data-kind="document_review_pending"]');
    const count = result.data!.counts.document_review_pending;
    await expect(chip).toContainText(`서류 확인 대기${count}`);
    await chip.click();
    await page.waitForURL((url) => url.searchParams.get("kind") === "document_review_pending");
    await expect(chip).toHaveAttribute("aria-current", "page");
    const rows = page.getByRole("table", { name: "운영 점검 목록" }).locator("tbody tr");
    await expect(rows).toHaveCount(Math.min(count, 50));
    for (const row of await rows.all()) await expect(row.locator("td").nth(1)).toHaveText("서류 확인 대기");
    await expect(rows.first().getByRole("link")).toHaveAttribute("href", /^\/admin\/accounts\//);

    await chips.locator('[data-kind="all"]').click();
    await page.waitForURL((url) => url.pathname === "/admin/checks" && !url.searchParams.has("kind"));
  });

  test("a request corrupted outside the app shows up as 수량 기록 불일치 (restored afterwards)", async ({ asRole }) => {
    const id = psql(`
      select r.id from public.saip_records r
      where r.collection = 'requests' and r.data ->> 'status' = 'completed' and not (r.data ? 'demoBatch')
        and jsonb_array_length(backoffice_private.request_checks(r.id, r.data) -> 'violations') = 0
      order by r.id limit 1`);
    expect(id).not.toBe("");
    const original = psql(`select data::text from public.saip_records where collection = 'requests' and id = '${id}'`);
    const updatedAt = psql(`select updated_at::text from public.saip_records where collection = 'requests' and id = '${id}'`);
    const restore = () =>
      psql(
        `update public.saip_records set data = $json$${original}$json$::jsonb, updated_at = '${updatedAt}'::timestamptz
         where collection = 'requests' and id = '${id}'`,
      );

    try {
      // received > delivered: the label stays 완료, so no other list moves.
      psql(`update public.saip_records
            set data = jsonb_set(data, '{received}', to_jsonb(coalesce((data ->> 'delivered')::int, 0) + 1))
            where collection = 'requests' and id = '${id}'`);

      const page = await asRole("owner");
      await page.goto("/admin/checks?kind=ledger_violation");
      const chip = page.getByTestId("kind-chips").locator('[data-kind="ledger_violation"]');
      await expect(chip).toContainText("수량 기록 불일치");
      const row = page.getByRole("table", { name: "운영 점검 목록" }).locator("tbody tr").filter({ has: page.locator(`a[href="/admin/requests/${id}"]`) });
      await expect(row).toHaveCount(1);
      await expect(row).toContainText("긴급");
      await expect(row).toContainText("수량 기록 불일치");
      await expect(row).toContainText("수령이 전달보다 많아요");
      await expect(row).toContainText("앱 밖에서 기록이 바뀌었을 수 있어요. 개발팀에 공유해 주세요.");

      // Critical comes first on the unfiltered list too.
      await page.goto("/admin/checks");
      await expect(page.getByRole("table", { name: "운영 점검 목록" }).locator("tbody tr").first()).toContainText("수량 기록 불일치");
    } finally {
      restore();
    }
    expect(psql(`select data::text from public.saip_records where collection = 'requests' and id = '${id}'`)).toBe(original);
  });

  test("axe finds no serious or critical violations", async ({ asRole }) => {
    const page = await asRole("owner");
    await page.goto("/admin/checks");
    await expect(page.getByTestId("kind-chips")).toBeVisible();
    await expectNoSeriousAxe(page, "/admin/checks");
  });
});

test.describe("viewer", () => {
  test("a viewer lands on the dashboard and can read 운영 점검", async ({ asRole }) => {
    const page = await asRole("viewer");
    await page.goto("/admin");
    await expect(page.getByRole("heading", { level: 1, name: "대시보드" })).toBeVisible();
    await expect(page.locator("[data-kpi]")).toHaveCount(6);
    await expect(page.getByTestId("attention-queue")).toBeVisible();

    await page.goto("/admin/checks");
    await expect(page.getByRole("heading", { level: 1, name: "운영 점검" })).toBeVisible();
    await expect(page.getByRole("table", { name: "운영 점검 목록" })).toBeVisible();
  });
});
