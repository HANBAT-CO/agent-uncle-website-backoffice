import { randomUUID } from "node:crypto";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { psql, REPO_ROOT, staffRpc } from "./helpers/rest";

test("앱 릴리스 공개 조건·플랫폼 재정의와 비공개 대상 보호", async ({ asRole }) => {
  const id = `e2e-release-${randomUUID()}`;
  try {
    psql(`insert into public.saip_records(collection,id,data,readers) values ('appReleases','${id}',
      '{"public":true,"published":false,"title":"릴리스 공개 조건 검증","targetUserIds":["private-release-recipient"],"notes":"private-release-note","versionName":"2.0.0","ios":{"versionName":"ignored-release"},"platforms":{"ios":{"buildNumber":21,"storeUrl":"https://apps.apple.com/app/id123456","internalNotes":"private-release-internal"},"android":[]}}','{}')`);
    const api = await staffRpc("viewer", "backoffice_list_app_releases");
    expect(api.error).toBeNull();
    expect(JSON.stringify(api.data)).not.toContain("private-release");
    expect(JSON.stringify(api.data)).not.toContain("ignored-release");
    const page = await asRole("viewer");
    await page.goto("/admin/remote-config");
    const section = page.getByRole("region", { name: "앱 릴리스 · 조회" });
    await expect(section).toContainText("최소 지원 버전을 변경해도 릴리스 기록은 바뀌지 않아요");
    const row = section.getByRole("article").filter({ hasText: id });
    await expect(row.getByRole("heading", { name: "릴리스 공개 조건 검증" })).toBeVisible();
    await expect(row).toContainText("대상 지정됨");
    await expect(row).toContainText("플랫폼 설정 형식 확인 필요: android");
    await expect(row.getByRole("heading", { name: "iOS 재정의" })).toBeVisible();
    await expect(row).toContainText("21");
    expect(await section.innerText()).not.toContain("private-release");
    await section.screenshot({ path: path.join(REPO_ROOT, ".context/releases-verified.png") });
  } finally {
    psql(`delete from public.saip_records where collection='appReleases' and id='${id}'`);
  }
});

// Exercise the app's real billing commands and the console's Server Actions
// together. The SQL helper refuses remote stacks; audit/replay records remain.
function billing(command: string, args: Record<string, unknown>, actor: string) {
  return psql(`select saip_private.billing_command('${command}', '${JSON.stringify(args).replaceAll("'", "''")}'::jsonb, '${actor}'::uuid)`);
}
function record(collection: string, id: string) {
  return JSON.parse(psql(`select data from public.saip_records where collection='${collection}' and id='${id}'`));
}
function paymentForm(page: Page, scope: Page | Locator, name: string) {
  return scope.locator("form").filter({ has: page.getByRole("heading", { name, exact: true }) });
}
async function submitPayment(form: Locator, name: string, reference: string) {
  await form.getByLabel("은행 거래 확인 번호").fill(reference);
  await form.getByLabel("처리 사유").fill("브라우저 검증 은행 거래 대조");
  await form.getByRole("button", { name, exact: true }).click();
}

test("입금 확인·반려·재신고·삼촌 지급과 계좌 열람 권한", async ({ asRole }) => {
  test.setTimeout(120_000);
  const retailer = randomUUID();
  const uncle = randomUUID();
  const request = randomUUID();
  const connection = randomUUID();
  const readers = `array['${retailer}','${uncle}']::uuid[]`;
  let invoice = "";
  try {
    psql(`begin;
      insert into auth.users(id,email,created_at) values ('${retailer}','${retailer}@example.test',now()),('${uncle}','${uncle}@example.test',now());
      insert into public.saip_records(collection,id,data,readers) values
      ('accounts','${retailer}','{"role":"retailer","complete":true,"createdAt":"2026-10-17T00:00:00Z","name":"정산 검증 상점","bankName":"테스트은행","bankAccount":"111122223333","bankHolder":"상점"}',${readers}),
      ('accounts','${uncle}','{"role":"uncle","complete":true,"createdAt":"2026-10-17T00:00:00Z","name":"정산 검증 삼촌","bankName":"테스트은행","bankAccount":"444455556666","bankHolder":"삼촌"}',${readers}),
      ('connections','${connection}','{"from":"${retailer}","to":"${uncle}","status":"accepted"}',${readers}),
      ('requests','${request}','{"retailerId":"${retailer}","uncleId":"${uncle}","status":"accepted","quantity":2,"version":0,"wholesaler":"정산 검증 도매처","product":"정산 검증 상품"}',${readers}); commit;`);
    const payment = billing("billing.recordFieldPayment", { requestId: request, actualPaidAmount: 10000, cashAllocatedAmount: 10000, customerChargeAmount: 10000, directPaidAmount: 0, supplierFeeAmount: 0, settlementKind: "advance" }, uncle);
    invoice = billing("billing.createInvoiceDraft", { paymentIds: [payment] }, uncle);
    billing("billing.sendInvoice", { invoiceId: invoice }, uncle);
    psql(`update public.saip_records set data=data||'{"status":"completed","acquired":2,"delivered":2,"received":2}' where collection='requests' and id='${request}'`);
    const first = billing("billing.reportReceipt", { invoiceId: invoice, amount: 6000 }, retailer);
    const second = billing("billing.reportReceipt", { invoiceId: invoice, amount: 4000 }, retailer);

    expect(record("invoices", invoice).payeeId).toBe(uncle);
    const api = await staffRpc("viewer", "backoffice_get_invoice", { p_invoice_id: invoice });
    expect(api.error).toBeNull();
    const viewer = await asRole("viewer");
    await viewer.goto(`/admin/billing/${encodeURIComponent(invoice)}`);
    await expect(viewer.getByText("정산 검증 상품", { exact: true })).toBeVisible();
    await expect(viewer.getByRole("button", { name: "정산 계좌 열람" })).toHaveCount(0);
    await expect(viewer.getByRole("button", { name: "입금 확인", exact: true })).toHaveCount(0);
    expect(await viewer.locator("body").innerText()).not.toContain("444455556666");

    const page = await asRole("operator");
    await page.goto(`/admin/billing/${encodeURIComponent(invoice)}`);
    const bank = page.locator("form").filter({ has: page.getByRole("button", { name: "정산 계좌 열람" }) });
    await bank.getByLabel("열람 사유").fill("정산 수취 계좌 확인");
    await bank.getByRole("button", { name: "정산 계좌 열람" }).click();
    await expect(page.getByText("444455556666", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "내용 가리기", exact: true }).click();
    await expect(page.getByText("444455556666", { exact: true })).toHaveCount(0);
    expect(Number(psql(`select count(*) from public.backoffice_audit_log where target_id='${uncle}' and action='bank.view'`))).toBe(1);

    const receipt = (id: string) => page.locator("article").filter({ has: page.getByText(id, { exact: true }) });
    await submitPayment(paymentForm(page, receipt(first), "입금 확인"), "입금 확인", `test-in-${randomUUID()}`);
    await expect.poll(() => record("invoiceReceipts", first).status).toBe("confirmed");
    await page.reload();
    await submitPayment(paymentForm(page, receipt(second), "입금 반려"), "입금 반려", `test-reject-${randomUUID()}`);
    await expect.poll(() => record("invoiceReceipts", second).status).toBe("rejected");
    await page.reload();
    await expect(page.getByRole("button", { name: "삼촌 지급 완료 기록", exact: true })).toHaveCount(0);

    const third = billing("billing.reportReceipt", { invoiceId: invoice, amount: 4000 }, retailer);
    await page.reload();
    await submitPayment(paymentForm(page, receipt(third), "입금 확인"), "입금 확인", `test-in-${randomUUID()}`);
    await expect.poll(() => record("invoiceReceipts", third).status).toBe("confirmed");
    await page.reload();
    const payout = paymentForm(page, page, "삼촌 지급 완료 기록");
    await expect(payout).toBeVisible();
    await expect(page.getByText("운영 계좌 확인 입금액: 10,000원")).toBeVisible();
    await page.screenshot({ path: path.join(REPO_ROOT, ".context/billing-verified.png"), fullPage: true });
    await submitPayment(payout, "삼촌 지급 완료 기록", `test-out-${randomUUID()}`);
    await expect.poll(() => record("invoices", invoice).platformPayoutComplete).toBe(true);
    expect(Number(psql(`select count(*) from public.backoffice_audit_log where target_id='${invoice}' and action='payment.pay_uncle'`))).toBe(1);
    await page.goto(`/admin/requests/${request}`);
    await expect(page.getByText("입금 완료", { exact: true }).first()).toBeVisible();
  } finally {
    psql(`begin; delete from public.saip_records where readers && ${readers}; delete from auth.users where id in ('${retailer}','${uncle}'); commit;`);
  }
});

test("팀 대화는 운영자 사유 기록 후 마스킹하며 삭제 내용은 숨긴다", async ({ asRole }) => {
  const team = randomUUID();
  const message = randomUUID();
  const deleted = randomUUID();
  try {
    psql(`insert into public.saip_records(collection,id,data,readers) values
      ('teams','${team}','{"name":"브라우저 검증 팀","status":"active"}','{}'),
      ('teamChats','${message}','{"teamId":"${team}","body":"010-1234-5678로 문의"}','{}'),
      ('teamChats','${deleted}','{"teamId":"${team}","body":"deleted-secret","deleted":true,"attachments":["private-file"]}','{}')`);
    const url = `/admin/team-work?collection=teams&q=${team}`;
    const viewer = await asRole("viewer");
    await viewer.goto(url);
    await expect(viewer.getByRole("heading", { name: "브라우저 검증 팀" })).toBeVisible();
    await expect(viewer.getByText("내용 열람 · 사유 기록")).toHaveCount(0);
    const page = await asRole("operator");
    await page.goto(url);
    await page.getByText("내용 열람 · 사유 기록", { exact: true }).click();
    await page.getByLabel("열람 사유").fill("팀 대화 고객 문의 확인");
    await page.getByRole("button", { name: "대화 내용 열람" }).click();
    await expect(page.getByRole("status").filter({ hasText: "감사 로그" })).toBeVisible();
    await expect(page.getByText(/로 문의/)).toBeVisible();
    const body = await page.locator("body").innerText();
    for (const secret of ["010-1234-5678", "deleted-secret", "private-file"]) expect(body).not.toContain(secret);
    expect(Number(psql(`select count(*) from public.backoffice_audit_log where target_id='${team}' and action='team_chat.view'`))).toBe(1);
    await page.screenshot({ path: path.join(REPO_ROOT, ".context/team-work-verified.png"), fullPage: true });
  } finally {
    psql(`delete from public.saip_records where id in ('${team}','${message}','${deleted}')`);
  }
});
