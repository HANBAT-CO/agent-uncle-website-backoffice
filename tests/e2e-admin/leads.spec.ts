import { readFileSync } from "node:fs";

import { expect, test } from "./fixtures";
import { staffRpc } from "./helpers/rest";

/*
 * 랜딩 문의 (WP-09; screens 10.16, spec 6). Viewers see masked contacts and
 * no 남긴 말; an operator changes a lead's status with a note in the Sheet;
 * 의심 제외 hides the e2e and timing-suspect leads; the owner exports CSV.
 * The status change uses the seeded e2e test lead and is restored after;
 * the note stays (notes are immutable by design).
 */

type Lead = { id: string; source: string | null; status: string; notes: number; contact: string | null };

let testLead: Lead;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const list = await staffRpc<{ rows: Lead[] }>("operator", "backoffice_list_leads", { p_search: "e2e", p_limit: 20 });
  const lead = (list.data?.rows ?? []).find((row) => row.source === "e2e");
  if (!lead) throw new Error("the seeded e2e lead is missing: run supabase-local/scripts/reset.sh");
  testLead = lead;
});

test.afterAll(async () => {
  await staffRpc("operator", "backoffice_set_lead_status", {
    p_lead_id: testLead.id,
    p_status: "new",
    p_operation_id: crypto.randomUUID(),
  });
});

test("viewer sees masked contacts and no 남긴 말; CSV is owner-only", async ({ asRole }) => {
  const page = await asRole("viewer");
  await page.goto("/admin/leads?view=all");
  const table = page.getByRole("table", { name: "랜딩 문의" });
  await expect(table.getByRole("columnheader", { name: "연락처" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "남긴 말" })).toHaveCount(0);
  const contacts = await table.getByTestId("lead-contact").allTextContents();
  expect(contacts.length).toBeGreaterThan(3);
  for (const contact of contacts) expect(contact).toMatch(/^(-|•*\d{0,4})$/);
  expect(contacts.some((contact) => contact.startsWith("•"))).toBe(true);

  const csv = page.getByRole("button", { name: "CSV 내보내기" });
  await expect(csv).toBeDisabled();
  await csv.locator("..").hover();
  await expect(page.getByRole("tooltip")).toHaveText("관리자 이상만 내려받을 수 있어요.");

  const operator = await asRole("operator");
  await operator.goto("/admin/leads?view=all");
  const operatorTable = operator.getByRole("table", { name: "랜딩 문의" });
  await expect(operatorTable.getByRole("columnheader", { name: "남긴 말" })).toBeVisible();
  const full = await operatorTable.getByTestId("lead-contact").allTextContents();
  expect(full.some((contact) => /\d{3}-?\d{3,4}-?\d{4}|@/.test(contact))).toBe(true);
});

test("operator sets 연락함 with a note in the Sheet and the row updates", async ({ asRole }) => {
  const page = await asRole("operator");
  await page.goto("/admin/leads?view=all");
  const row = page.getByRole("row").filter({ has: page.getByText("테스트", { exact: true }) }).first();
  await row.click();
  await expect(page).toHaveURL(new RegExp(`lead=${testLead.id}`));

  const sheet = page.getByRole("dialog");
  await expect(sheet.getByTestId("lead-sheet-contact")).toHaveText(testLead.contact ?? "");
  await sheet.getByLabel("처리 상태", { exact: true }).selectOption({ label: "연락함" });
  await sheet.getByLabel(/메모 남기기/).fill(`e2e 연락 확인 메모 ${Date.now()}`);
  await sheet.getByRole("button", { name: "저장하기" }).click();
  await expect(page.getByText("처리 상태와 메모를 저장했어요").first()).toBeVisible();

  await expect(sheet.getByLabel("처리 상태", { exact: true })).toHaveValue("contacted");
  await expect(sheet.getByLabel(/메모 남기기/)).toHaveValue("");
  await expect(sheet.getByRole("region", { name: "처리 이력" })).toContainText("문의 상태 변경");

  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/lead=/);
  const updated = page.getByRole("row").filter({ has: page.getByText("테스트", { exact: true }) }).first();
  await expect(updated).toContainText("연락함");
  await expect(updated).toContainText(`${testLead.notes + 1}건`);
});

test("의심 제외 hides the e2e and timing-suspect leads", async ({ asRole }) => {
  const page = await asRole("operator");
  await page.goto("/admin/leads?view=all");
  const table = page.getByRole("table", { name: "랜딩 문의" });
  await expect(table.getByText("테스트", { exact: true }).first()).toBeVisible();
  await expect(table.getByText("빠른 제출", { exact: true }).first()).toBeVisible();

  await page.getByRole("navigation", { name: "보기" }).getByRole("link", { name: /의심 제외/ }).click();
  await expect(page).toHaveURL(/view=clean/);
  await expect(page.getByRole("link", { name: /의심 제외/ })).toHaveAttribute("aria-current", "page");
  await expect(table.getByRole("row")).not.toHaveCount(0);
  await expect(table.getByText("테스트", { exact: true })).toHaveCount(0);
  await expect(table.getByText("빠른 제출", { exact: true })).toHaveCount(0);
});

test("owner exports the leads CSV with a reason", async ({ asRole }) => {
  const page = await asRole("owner");
  await page.goto("/admin/leads?view=all");
  await page.getByRole("button", { name: "CSV 내보내기" }).click();
  const dialog = page.getByRole("dialog", { name: "랜딩 문의 CSV 내보내기" });
  await expect(dialog.getByText("개인정보가 담긴 파일이에요. 사유를 남기고 내려받아요.")).toBeVisible();
  await dialog.getByLabel("사유").fill("월간 문의 정리 e2e 확인");
  const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "내려받기" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^saip-leads-\d{8}\.csv$/);
  const text = readFileSync(await download.path(), "utf8");
  expect(text.startsWith("﻿문의 ID,접수 시각,역할,이름,매장,연락처,사입 시장,남긴 말,유입,개인정보 동의")).toBe(true);
  expect(text.split("\n").length).toBeGreaterThan(5);
});
