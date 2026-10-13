import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { demoUserRpc, psql, staffRpc } from "./helpers/rest";

/*
 * 알림·공지 (WP-09; screens 10.14, spec 11). An operator drafts and publishes
 * a retailer notice, which app_bootstrap_config then returns to a demo
 * retailer but not to a demo 사입삼촌; critical notices are owner-only; a
 * stale version shows the conflict message and keeps the input.
 * The notices this spec creates (title prefix "E2E WP-09") are deleted after.
 */

const PREFIX = "E2E WP-09 공지";
const TITLE = `${PREFIX} ${Date.now()}`;
const BODY = "연휴 기간에는 픽업과 전달이 하루 정도 늦어질 수 있어요.";

type Bootstrap = { notices: { id: string; title: string }[] };
type StoredNotice = { id: string; title: string; body: string; audience: string; severity: string; version: number; active: boolean };

test.describe.configure({ mode: "serial" });

test.afterAll(() => {
  psql(`delete from public.app_notices where title like '${PREFIX}%'`);
});

async function openNewNotice(page: Page) {
  await page.goto("/admin/notices?tab=notices");
  await page.getByRole("link", { name: "새 공지" }).click();
  const sheet = page.getByRole("dialog", { name: "새 공지" });
  await expect(sheet).toBeVisible();
  return sheet;
}

async function storedNotice(): Promise<StoredNotice> {
  const list = await staffRpc<StoredNotice[]>("owner", "backoffice_list_notices", { p_include_inactive: true });
  const notice = (list.data ?? []).find((row) => row.title === TITLE);
  if (!notice) throw new Error(`notice ${TITLE} not found`);
  return notice;
}

test("operator drafts, then publishes with the dialog; only the demo retailer gets it", async ({ asRole }) => {
  const page = await asRole("operator");
  await expect(async () => {
    await page.goto("/admin/notices");
    await expect(page.getByRole("note")).toHaveText(
      "원격 푸시는 아직 연결하지 않았어요. 공지는 앱이 이 기능을 지원하도록 업데이트된 뒤부터, 앱을 열 때 보여요.",
    );
  }).toPass();

  const sheet = await openNewNotice(page);
  await sheet.getByLabel("제목").fill(TITLE);
  await sheet.getByLabel("내용").fill(BODY);
  await sheet.getByLabel("대상").selectOption({ label: "소매업자" });
  await expect(sheet.getByRole("figure", { name: "앱 미리보기" })).toContainText(TITLE);
  await sheet.getByRole("button", { name: "초안 저장" }).click();
  // The toast outlives the editor, which remounts on the saved notice.
  await expect(page.getByText("초안을 저장했어요").first()).toBeVisible();
  await expect(page).toHaveURL(/notice=[0-9a-f-]{36}/);

  const editor = page.getByRole("dialog", { name: "공지 편집" });
  await expect(editor.getByText("초안", { exact: true })).toBeVisible();
  await editor.getByRole("button", { name: "공지 게시" }).click();
  const confirm = page.getByRole("alertdialog", { name: "공지를 게시할까요?" });
  await expect(confirm.getByText("소매업자에게 앱을 열 때 보여요.")).toBeVisible();
  await confirm.getByRole("button", { name: "공지 게시" }).click();
  await expect(page.getByText("공지를 게시했어요").first()).toBeVisible();
  await expect(editor.getByText("게시 중", { exact: true })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/admin\/notices\?tab=notices$/);
  const row = page.getByRole("row").filter({ hasText: TITLE });
  await expect(row).toContainText("게시 중");
  await expect(row).toContainText("소매업자");

  const retailer = await demoUserRpc<Bootstrap>("mangwon.select", "app_bootstrap_config", { p_platform: "ios", p_app_version: "0.1.0" });
  expect(retailer.error).toBeNull();
  expect(retailer.data?.notices.map((notice) => notice.title)).toContain(TITLE);
  const uncle = await demoUserRpc<Bootstrap>("dm.park", "app_bootstrap_config", { p_platform: "ios", p_app_version: "0.1.0" });
  expect(uncle.error).toBeNull();
  expect(uncle.data?.notices.map((notice) => notice.title)).not.toContain(TITLE);
});

test("operator choosing 긴급 gets the owner-only message", async ({ asRole }) => {
  const page = await asRole("operator");
  const sheet = await openNewNotice(page);
  await sheet.getByLabel("중요도").selectOption({ label: "긴급" });
  await expect(sheet.getByText("긴급 공지는 관리자만 게시할 수 있어요.")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "초안 저장" })).toBeDisabled();
  await expect(sheet.getByRole("button", { name: "공지 게시" })).toBeDisabled();
});

test("a version bumped by another staff member shows the conflict and keeps the input", async ({ asRole }) => {
  const page = await asRole("operator");
  const before = await storedNotice();
  await page.goto(`/admin/notices?tab=notices&notice=${before.id}`);
  const editor = page.getByRole("dialog", { name: "공지 편집" });
  await expect(editor.getByText(`버전 ${before.version}`)).toBeVisible();

  // Another session (the owner) saves first.
  const bump = await staffRpc("owner", "backoffice_save_notice", {
    p_notice_id: before.id,
    p_version: before.version,
    p_title: before.title,
    p_body: `${before.body} (관리자 수정)`,
    p_audience: before.audience,
    p_severity: before.severity,
    p_active: before.active,
    p_dismissible: true,
    p_operation_id: crypto.randomUUID(),
  });
  expect(bump.error).toBeNull();

  const edited = `${BODY} 운영자 수정본`;
  await editor.getByLabel("내용").fill(edited);
  await editor.getByRole("button", { name: "공지 게시" }).click();
  await page.getByRole("alertdialog", { name: "공지를 게시할까요?" }).getByRole("button", { name: "공지 게시" }).click();
  await expect(editor.getByText("다른 운영자가 공지를 변경했어요. 최신 내용을 확인해 주세요.")).toBeVisible();
  await expect(editor.getByLabel("내용")).toHaveValue(edited);
  await expect(editor.getByRole("button", { name: "최신 내용 불러오기" })).toBeVisible();

  const after = await storedNotice();
  expect(after.version).toBe(before.version + 1);
  expect(after.body).toBe(`${before.body} (관리자 수정)`);
});
