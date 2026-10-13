import { randomUUID } from "node:crypto";

import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { DEMO_PASSWORD, psql, signIn, staffRpc } from "./helpers/rest";

/*
 * 계정·가입 and 거래처 연결 (screens 10.7, 10.8; tasks appendix WP-06):
 * masking per role, URL filters that survive a reload, Hangul-safe search,
 * the audited document review, suspension proven through the demo user's own
 * saip_command, and the connection views. Writes are restored in `finally`.
 */

/** A seeded demo account by its login email (ids come from the local seed). */
function demoAccount(slug: string): { id: string; email: string; documentId: string } {
  const email = `${slug}@demo.agentuncle.local`;
  const row = psql(
    `select u.id || '|' || coalesce(a.data->>'documentId', '') from auth.users u ` +
      `left join public.saip_records a on a.collection = 'accounts' and a.id = u.id::text where u.email = '${email}'`,
  );
  const [id, documentId] = row.split("|");
  if (!id) throw new Error(`demo account ${email} is missing: run supabase-local/scripts/reset.sh`);
  return { id, email, documentId };
}

const MANGWON = "mangwon.select";
const REVIEW_TARGET = "hapjeong.vintage";
const SUSPEND_TARGET = "yeonnam.daily";
const SUSPENDED_MESSAGE = "이용이 제한된 계정이에요. 고객센터로 문의해 주세요.";

const accountsTable = (page: Page) => page.getByRole("table", { name: "계정 목록" });
const searchBox = (page: Page) => page.getByRole("searchbox", { name: "계정 검색" });

test.describe("계정·가입 list", () => {
  test("viewer: emails are masked and a phone tail finds nothing; operator finds it", async ({ asRole }) => {
    const viewer = await asRole("viewer");
    await viewer.goto("/admin/accounts");
    await expect(accountsTable(viewer)).toContainText("•••@demo.agentuncle.local");
    await expect(accountsTable(viewer)).not.toContainText(`${MANGWON}@demo.agentuncle.local`);
    await expect(searchBox(viewer)).toHaveAttribute("placeholder", "이름·매장명으로 검색");

    await searchBox(viewer).fill("3307");
    await searchBox(viewer).press("Enter");
    await expect(viewer).toHaveURL(/[?&]q=3307/);
    await expect(viewer.getByText("조건에 맞는 계정이 없어요")).toBeVisible();
    await expect(viewer.getByText("검색어나 필터를 바꿔 보세요.")).toBeVisible();

    const operator = await asRole("operator");
    await operator.goto("/admin/accounts?q=3307");
    await expect(searchBox(operator)).toHaveAttribute("placeholder", "이름·매장명·이메일·연락처 뒷자리로 검색");
    await expect(accountsTable(operator)).toContainText("망원 셀렉트샵");
    await expect(accountsTable(operator)).toContainText(`${MANGWON}@demo.agentuncle.local`);
  });

  test("facet filters live in the URL and survive a reload", async ({ asRole }) => {
    const page = await asRole("viewer");
    await page.goto("/admin/accounts");
    const rail = page.getByRole("complementary", { name: "계정 필터" });

    await rail.getByRole("button", { name: /^소매업자/ }).click();
    await expect(page).toHaveURL(/[?&]role=retailer/);
    await rail.getByRole("button", { name: /^서류 확인 대기/ }).click();
    await expect(page).toHaveURL(/[?&]view=review/);
    await expect(page).toHaveURL(/[?&]role=retailer/);

    await page.reload();
    await expect(rail.getByRole("button", { name: /^소매업자/ })).toHaveAttribute("aria-pressed", "true");
    await expect(rail.getByRole("button", { name: /^서류 확인 대기/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("navigation", { name: "계정 보기" }).getByRole("link", { name: /서류 확인 대기/ })).toHaveAttribute(
      "aria-current",
      "page",
    );

    const expected = await staffRpc<{ total: number }>("viewer", "backoffice_list_accounts", {
      p_role: "retailer",
      p_state: "awaiting_review",
      p_limit: 1,
    });
    const total = expected.data?.total ?? 0;
    expect(total).toBeGreaterThan(0);
    await expect(page.getByRole("navigation", { name: "페이지" })).toContainText(`/ ${total.toLocaleString("ko-KR")}건`);
    const rows = accountsTable(page).locator("tbody tr");
    await expect(rows).toHaveCount(Math.min(total, 50));
    for (const text of await rows.allInnerTexts()) expect(text).toContain("소매업자");

    await rail.getByRole("link", { name: "필터 초기화" }).click();
    await expect(page).not.toHaveURL(/role=|view=/);
  });

  test("Hangul search: the URL changes once, after compositionend, with the whole word", async ({ asRole }) => {
    const page = await asRole("viewer");
    await page.goto("/admin/accounts");
    // Sample location.search every few ms: every q the URL ever held is recorded.
    await page.evaluate(() => {
      const w = window as unknown as { __qs: string[] };
      w.__qs = [];
      window.setInterval(() => {
        const q = new URLSearchParams(window.location.search).get("q");
        if (q !== null && w.__qs[w.__qs.length - 1] !== q) w.__qs.push(q);
      }, 5);
    });
    const seen = () => page.evaluate(() => (window as unknown as { __qs: string[] }).__qs);

    const input = searchBox(page);
    await input.click();
    await input.dispatchEvent("compositionstart", { data: "" });
    for (const syllable of ["망", "원"]) {
      await page.keyboard.insertText(syllable);
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(700);
    expect(await seen(), "nothing reaches the URL while the IME composition is open").toEqual([]);

    await input.dispatchEvent("compositionend", { data: "원" });
    await expect(page).toHaveURL(/[?&]q=%EB%A7%9D%EC%9B%90/);
    await expect(accountsTable(page)).toContainText("망원 셀렉트샵");
    await page.waitForTimeout(400);
    expect(await seen(), "one URL update, never a partial syllable").toEqual(["망원"]);
  });
});

test.describe("account dossier", () => {
  test("viewer: masked profile with the note, no file access and no actions", async ({ asRole }) => {
    const { id } = demoAccount(MANGWON);
    const page = await asRole("viewer");
    await page.goto(`/admin/accounts/${id}`);
    await expect(page.getByRole("heading", { level: 1, name: "망원 셀렉트샵" })).toBeVisible();
    await expect(page.getByText("열람자 권한에서는 연락처가 가려져요.")).toBeVisible();
    await expect(page.getByText("010-4821-3307")).toHaveCount(0);
    await expect(page.getByText("역할 변경과 탈퇴 처리는 제공하지 않아요.")).toBeVisible();
    await expect(page.getByRole("group", { name: "계정 작업" })).toHaveCount(0);

    await page.getByRole("tab", { name: "서류" }).click();
    await expect(page).toHaveURL(/[?&]tab=documents/);
    const docs = page.getByRole("tabpanel", { name: "서류" });
    await expect(docs.getByRole("button", { name: "사유와 함께 열람" })).toBeDisabled();
    await expect(docs.getByText("국세청 사업자 상태 조회는 아직 연결되지 않았어요. 서류 이미지를 확인한 결과만 기록돼요.")).toBeVisible();
    await expect(page.getByRole("form", { name: "서류 검토" })).toHaveCount(0);
  });

  test("operator: open the document with a reason, review it as 확인함, see the audit row", async ({ asRole }) => {
    const target = demoAccount(REVIEW_TARGET);
    expect(target.documentId).not.toBe("");
    const page = await asRole("operator");
    try {
      await page.goto(`/admin/accounts/${target.id}?tab=documents`);
      const docs = page.getByRole("tabpanel", { name: "서류" });
      const form = page.getByRole("form", { name: "서류 검토" });
      await expect(form.getByRole("radio", { name: "확인함" })).toBeDisabled();
      await expect(form.getByText("먼저 서류 원본을 열람해 주세요")).toBeVisible();

      await docs.getByRole("button", { name: "사유와 함께 열람" }).click();
      const dialog = page.getByRole("alertdialog", { name: "서류를 열람할까요?" });
      await expect(dialog).toContainText("열람 사유와 운영자 이름이 감사 로그에 남아요.");
      await dialog.getByLabel("사유", { exact: true }).fill("사업자등록증 검토");
      await dialog.getByRole("button", { name: "열람하기" }).click();
      await expect(dialog).toBeHidden();
      const preview = docs.locator('img[referrerpolicy="no-referrer"], iframe[referrerpolicy="no-referrer"]');
      await expect(preview).toBeVisible();
      await expect(docs.getByText("링크는 60초 동안만 열려요")).toBeVisible();
      await expect(docs.getByRole("button", { name: "다시 열기" })).toBeVisible();

      await form.getByRole("radio", { name: "확인함" }).check();
      await form.getByRole("checkbox", { name: "상호가 일치해요" }).check();
      await form.getByRole("checkbox", { name: "사업자등록번호가 일치해요" }).check();
      await form.getByRole("checkbox", { name: "이미지가 선명해요" }).check();
      await form.getByLabel("내부 메모").fill("e2e 서류 검토");
      await form.getByRole("button", { name: "검토 결과 저장" }).click();
      await expect(form.getByText("검토 결과를 저장했어요")).toBeVisible();
      await expect(page.getByTestId("account-chips")).toContainText("확인함");
      await expect(docs.getByRole("region", { name: "검토 기록" })).toContainText("확인함");

      await page.getByRole("tab", { name: "처리 이력" }).click();
      await expect(page.getByRole("tabpanel", { name: "처리 이력" }).getByText("서류 검토").first()).toBeVisible();
      const audit = psql(
        `select l.action || '|' || b.role from public.backoffice_audit_log l join public.backoffice_admins b on b.user_id = l.actor_id ` +
          `where l.target_type = 'account' and l.target_id = '${target.id}' order by l.id desc limit 1`,
      );
      expect(audit).toBe("account.review_document|operator");
    } finally {
      await staffRpc("operator", "backoffice_review_document", {
        p_account_id: target.id,
        p_document_id: target.documentId,
        p_decision: "reset",
        p_operation_id: randomUUID(),
      });
    }
  });

  test("staff accounts: only the owner is offered suspension", async ({ asRole }) => {
    const staffId = psql("select id from auth.users where email = 'viewer@agentuncle.local'");
    const operator = await asRole("operator");
    await operator.goto(`/admin/accounts/${staffId}`);
    const actions = operator.getByRole("group", { name: "계정 작업" });
    await expect(actions.getByRole("button", { name: "메모 남기기" })).toBeVisible();
    await expect(actions.getByRole("button", { name: "이용 제한" })).toHaveCount(0);
    await expect(operator.getByText("운영 계정은 관리자만 처리할 수 있어요.")).toBeVisible();

    const owner = await asRole("owner");
    await owner.goto(`/admin/accounts/${staffId}`);
    await expect(owner.getByRole("group", { name: "계정 작업" }).getByRole("button", { name: "이용 제한" })).toBeVisible();
  });

  test("suspension blocks the demo user's saip_command; restoring lets it write again", async ({ asRole }) => {
    const target = demoAccount(SUSPEND_TARGET);
    // Signed in before the suspension: the issued access token stays valid,
    // so the refusal below comes from the server-side write guard.
    const app = await signIn(target.email, DEMO_PASSWORD);
    const renewCode = () => app.rpc("saip_command", { command: "renewCode", args: {}, operation_id: randomUUID() });
    let suspended = false;
    try {
      expect((await renewCode()).error).toBeNull();

      const page = await asRole("operator");
      await page.goto(`/admin/accounts/${target.id}`);
      await page.getByRole("group", { name: "계정 작업" }).getByRole("button", { name: "이용 제한" }).click();
      const dialog = page.getByRole("alertdialog", { name: "이 계정의 이용을 제한할까요?" });
      await expect(dialog).toContainText("요청과 채팅 기록은 그대로 남고, 이 계정은 앱에서 새 기록을 남길 수 없어요.");
      await expect(dialog.getByLabel("앱에 보일 안내")).toHaveValue(SUSPENDED_MESSAGE);
      await expect(dialog.getByRole("checkbox", { name: "로그인도 막기" })).toBeChecked();
      await dialog.getByLabel("사유 (내부용)").fill("e2e 이용 제한 확인");
      await dialog.getByRole("button", { name: "이용 제한" }).click();
      await expect(dialog).toBeHidden();
      suspended = true;
      await expect(page.getByTestId("account-chips")).toContainText("이용 제한");

      const blocked = await renewCode();
      expect(blocked.error?.message).toBe(SUSPENDED_MESSAGE);
      await expect(signIn(target.email, DEMO_PASSWORD)).rejects.toThrow();

      await page.getByRole("group", { name: "계정 작업" }).getByRole("button", { name: "이용 재개" }).click();
      const restore = page.getByRole("alertdialog", { name: "이용을 다시 허용할까요?" });
      await expect(restore).toContainText("제한하면서 막은 로그인도 함께 풀려요.");
      await restore.getByLabel("사유", { exact: true }).fill("e2e 이용 재개 확인");
      await restore.getByRole("button", { name: "이용 재개" }).click();
      await expect(restore).toBeHidden();
      suspended = false;
      await expect(page.getByTestId("account-chips")).toContainText("이용 중");

      const again = await signIn(target.email, DEMO_PASSWORD);
      const ok = await again.rpc("saip_command", { command: "renewCode", args: {}, operation_id: randomUUID() });
      expect(ok.error).toBeNull();
      await again.auth.signOut({ scope: "local" });
    } finally {
      if (suspended) {
        await staffRpc("operator", "backoffice_set_account_status", {
          p_account_id: target.id,
          p_status: "active",
          p_reason: "e2e 정리: 이용 재개",
          p_operation_id: randomUUID(),
        });
      }
    }
  });
});

test.describe("거래처 연결", () => {
  test("views render their counts and filter the list", async ({ asRole }) => {
    const page = await asRole("viewer");
    await page.goto("/admin/connections");
    await expect(page.getByText("연결 수락과 해제는 두 거래처만 할 수 있어요.")).toBeVisible();

    const result = await staffRpc<{ facets: { status: Record<string, number>; pending3d: number; today: number } }>(
      "viewer",
      "backoffice_list_records",
      { p_collection: "connections", p_limit: 1 },
    );
    const facets = result.data!.facets;
    const all = Object.values(facets.status).reduce((sum, n) => sum + n, 0);
    const expected: [string, number][] = [
      ["전체", all],
      ["수락 대기", facets.status.pending ?? 0],
      ["수락 대기 3일 넘음", facets.pending3d],
      ["오늘 연결", facets.today],
      ["연결 완료", facets.status.accepted ?? 0],
    ];
    const tabs = page.getByRole("navigation", { name: "연결 보기" }).getByRole("listitem");
    await expect(tabs).toHaveCount(expected.length);
    for (const [index, [label, count]] of expected.entries()) {
      await expect(tabs.nth(index)).toHaveText(new RegExp(`^${label}\\s*${count}$`));
    }

    await tabs.nth(1).getByRole("link").click();
    await expect(page).toHaveURL(/[?&]view=pending/);
    const table = page.getByRole("table", { name: "거래처 연결 목록" });
    await expect(table.locator("tbody tr")).toHaveCount(expected[1][1]);
    for (const text of await table.locator("tbody tr").allInnerTexts()) expect(text).toContain("수락 대기");
  });
});
