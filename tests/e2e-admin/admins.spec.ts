import { randomUUID } from "node:crypto";

import { expect, loginThroughUi, test } from "./fixtures";
import { STAFF, staffRpc } from "./helpers/rest";

/*
 * 운영 계정 (WP-10; spec 5, 6; screens appendix 10.18): the staff lifecycle
 * with spare@agentuncle.local. The owner grants 열람자 (2단계 인증 off, since
 * local TOTP enrolment is disabled), spare@ sees the console, the owner
 * revokes, spare@ gets 권한 없음. spare@ ends revoked, which reads as
 * "not staff" like the seed.
 */

const SPARE_NAME = "예비 담당";

type Lookup = { userId: string; staff: { role: string; revokedAt: string | null } | null };

/** Revokes spare@ when an earlier, interrupted run left it active. */
async function ensureSpareIsNotStaff(): Promise<void> {
  const lookup = await staffRpc<Lookup>("owner", "backoffice_lookup_user", { p_email: STAFF.spare.email });
  if (!lookup.data) throw new Error(`lookup failed: ${lookup.error?.message}`);
  if (lookup.data.staff && !lookup.data.staff.revokedAt) {
    const revoke = await staffRpc("owner", "backoffice_revoke_admin", {
      p_user_id: lookup.data.userId,
      p_reason: "e2e 시작 전 정리",
      p_operation_id: randomUUID(),
    });
    expect(revoke.error).toBeNull();
  }
}

test.describe.serial("운영 계정", () => {
  test.beforeAll(ensureSpareIsNotStaff);
  test.afterAll(ensureSpareIsNotStaff);

  test("an operator gets the forbidden state", async ({ asRole }) => {
    const page = await asRole("operator");
    await page.goto("/admin/admins");
    await expect(page.getByText("이 화면은 관리자 이상만 볼 수 있어요.")).toBeVisible();
    await expect(page.getByRole("button", { name: "운영 계정 추가" })).toHaveCount(0);
  });

  test("the owner's own row has no actions", async ({ asRole }) => {
    const page = await asRole("owner");
    await page.goto("/admin/admins");
    const own = page.getByRole("row").filter({ hasText: STAFF.owner.email });
    await expect(own).toContainText("본인 권한은 다른 관리자가 변경해야 해요.");
    await expect(own.getByRole("button")).toHaveCount(0);
    const operator = page.getByRole("row").filter({ hasText: STAFF.operator.email });
    await expect(operator.getByRole("button", { name: /역할 변경$/ })).toBeVisible();
    await expect(operator.getByRole("button", { name: /해제$/ })).toBeVisible();
  });

  test("grant 열람자 to spare@, spare@ sees the console, revoke, then spare@ gets no-access", async ({ asRole, browser, baseURL }) => {
    const owner = await asRole("owner");
    await owner.goto("/admin/admins");
    await owner.getByRole("button", { name: "운영 계정 추가" }).click();
    const sheet = owner.getByRole("dialog", { name: "운영 계정 추가" });
    await sheet.getByRole("search", { name: "운영 계정 조회" }).getByLabel("이메일").fill(STAFF.spare.email);
    await sheet.getByRole("button", { name: "조회" }).click();
    const lookup = sheet.getByTestId("lookup-result");
    await expect(lookup).toContainText(STAFF.spare.email);
    await expect(lookup).toContainText("로그인 수단이메일");
    await expect(lookup).toContainText("이메일 인증확인함");
    await expect(lookup).toContainText("앱 계정없음");

    const grant = sheet.getByRole("form", { name: "권한 부여" });
    await expect(grant.getByLabel("역할")).toHaveValue("viewer");
    await grant.getByLabel("이름").fill(SPARE_NAME);
    const mfa = grant.getByRole("switch", { name: "2단계 인증 필수" });
    await expect(mfa).toBeChecked(); // on by default
    await mfa.click(); // local stack: TOTP enrolment is disabled
    await grant.getByRole("button", { name: "권한 부여" }).click();
    await expect(owner.getByText("열람자 권한을 부여했어요").first()).toBeVisible();
    const row = owner.getByRole("row").filter({ hasText: STAFF.spare.email });
    await expect(row).toContainText(SPARE_NAME);
    await expect(row).toContainText("열람자");
    await expect(row).toContainText("활성");

    const spareContext = await browser.newContext({ baseURL, locale: "ko-KR", timezoneId: "Asia/Seoul" });
    try {
      const spare = await spareContext.newPage();
      await loginThroughUi(spare, "spare", "/admin/account");
      await expect(spare).toHaveURL(/\/admin\/account$/);
      await expect(spare.getByTestId("admin-nav")).toBeVisible();
      await expect(spare.getByRole("main")).toContainText("열람자");
      await expect(spare.getByRole("main")).toContainText(SPARE_NAME);

      await row.getByRole("button", { name: `${SPARE_NAME} 해제` }).click();
      const dialog = owner.getByRole("alertdialog", { name: "이 운영 계정을 해제할까요?" });
      await expect(dialog).toContainText("로그인은 되지만 모든 운영 화면과 작업이 바로 막혀요.");
      await dialog.getByLabel("사유").fill("e2e 예비 계정 회수");
      await dialog.getByRole("button", { name: "해제" }).click();
      await expect(owner.getByText("운영 계정을 해제했어요").first()).toBeVisible();
      await expect(row).toContainText("해제됨");

      await spare.goto("/admin/account");
      await expect(spare).toHaveURL(/\/admin\/no-access/);
      await expect(spare.getByText("운영 권한이 없는 계정이에요")).toBeVisible();
    } finally {
      await spareContext.close();
    }
  });
});
