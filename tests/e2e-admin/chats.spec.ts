import { expect, test } from "./fixtures";
import { psql, staffRpc } from "./helpers/rest";

/*
 * 채팅 열람 (WP-09; screens 10.13, spec D7). The list is metadata only; an
 * operator reads a transcript after a reason, which is audited, comes back
 * into client state only, has phone numbers masked, and pages backwards.
 *
 * Fixture rows: one message with a phone number and 60 older filler messages
 * in the 망원 셀렉트샵 · 동대문 박삼촌 conversation, inserted with psql before
 * and deleted after (ids start with e2e-wp09-). The audit rows stay (immutable).
 */

/** A demo account id by email. Looked up per run: reset.sh creates new ids. */
function accountId(email: string): string {
  const id = psql(`select id from auth.users where email = '${email}'`);
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error(`no demo user ${email} (run supabase-local/scripts/reset.sh)`);
  return id;
}

let RETAILER = ""; // 망원 셀렉트샵
let UNCLE = ""; // 동대문 박삼촌
let PAIR_URL = "";
const PHONE_BODY = "제 연락처는 010-1234-5678 이에요. 급하면 전화 주세요.";
const FILLERS = 60;

function message(id: string, body: string, createdAt: string, sender = RETAILER, recipient = UNCLE): string {
  const data = { body, read: true, status: "sent", system: false, senderId: sender, recipientId: recipient, createdAt, requestId: "", attachments: [] };
  return `('messages', '${id}', '${JSON.stringify(data).replace(/'/g, "''")}'::jsonb, array['${sender}', '${recipient}']::uuid[])`;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  RETAILER = accountId("mangwon.select@demo.agentuncle.local");
  UNCLE = accountId("dm.park@demo.agentuncle.local");
  PAIR_URL = `/admin/chats?a=${RETAILER}&b=${UNCLE}`;
  psql("delete from public.saip_records where collection = 'messages' and id like 'e2e-wp09-%'");
  const rows = [message("e2e-wp09-phone", PHONE_BODY, "2026-10-01T03:00:00.000000+00:00", UNCLE, RETAILER)];
  for (let n = 1; n <= FILLERS; n += 1) {
    const minute = String(n).padStart(2, "0");
    rows.push(message(`e2e-wp09-fill-${minute}`, `테스트 메시지 ${minute}`, `2026-08-01T01:${minute === "60" ? "59:30" : `${minute}:00`}.000000+00:00`));
  }
  psql(`insert into public.saip_records (collection, id, data, readers) values ${rows.join(",\n")}`);
});

test.afterAll(() => {
  psql("delete from public.saip_records where collection = 'messages' and id like 'e2e-wp09-%'");
});

test("viewer sees metadata only and a disabled 사유와 함께 열람 with the tooltip", async ({ asRole }) => {
  const page = await asRole("viewer");
  await page.goto("/admin/chats");
  const table = page.getByRole("table", { name: /채팅 열람/ });
  await expect(table.getByRole("columnheader", { name: "거래처 쌍" })).toBeVisible();
  for (const header of ["연결 상태", "마지막 메시지 시각", "메시지", "업무 기록", "연결된 요청", "안 읽음", "사진 포함"]) {
    await expect(table.getByRole("columnheader", { name: header, exact: true })).toBeVisible();
  }
  await expect(page.getByText("테스트 메시지 01")).toHaveCount(0);

  await page.goto(PAIR_URL);
  const button = page.getByRole("button", { name: "사유와 함께 열람" });
  await expect(button).toBeDisabled();
  await button.locator("..").hover();
  await expect(page.getByRole("tooltip")).toHaveText("운영자 이상만 대화를 열람할 수 있어요.");
  await expect(page.getByTestId("chat-transcript")).toHaveCount(0);
});

test("operator reads with a reason: validation, masked phones, client state only, audit row, older pages", async ({ asRole }) => {
  const page = await asRole("operator");
  const visited: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) visited.push(frame.url());
  });
  page.on("request", (request) => visited.push(request.url()));

  await page.goto(PAIR_URL);
  await page.getByRole("button", { name: "사유와 함께 열람" }).click();
  const dialog = page.getByRole("alertdialog", { name: "대화를 열람할까요?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("열람 사유와 운영자 이름이 감사 로그에 남아요.")).toBeVisible();

  await dialog.getByLabel("사유").fill("분쟁확인");
  await dialog.getByRole("button", { name: "열람하기" }).click();
  await expect(dialog.getByText("사유를 5자 이상 입력해 주세요.")).toBeVisible();
  await expect(page.getByTestId("chat-transcript")).toHaveCount(0);

  const reason = `수량 분쟁 확인 e2e ${Date.now()}`;
  await dialog.getByLabel("사유").fill(reason);
  await dialog.getByRole("button", { name: "열람하기" }).click();
  const transcript = page.getByTestId("chat-transcript");
  await expect(transcript).toBeVisible();
  await expect(dialog).toBeHidden();

  // Phone numbers are masked server-side; bubbles and 업무 기록 cards render differently.
  await expect(transcript.getByText("제 연락처는 010-••••-5678 이에요. 급하면 전화 주세요.")).toBeVisible();
  await expect(page.getByText("010-1234-5678")).toHaveCount(0);
  await expect(transcript.locator("li[data-kind=system]").first()).toContainText("업무 기록 ·");
  await expect(transcript.locator("li[data-kind=message]").first()).toBeVisible();
  await expect(page.getByRole("complementary", { name: "속성" })).toContainText(reason);

  // The transcript never reaches a URL, and nothing navigated to /admin/chats/...
  await expect(page).toHaveURL(new RegExp(`/admin/chats\\?a=${RETAILER}&b=${UNCLE}$`));
  expect(visited.filter((url) => new URL(url).pathname.startsWith("/admin/chats/"))).toEqual([]);
  expect(visited.some((url) => url.includes(encodeURIComponent(reason)) || url.includes(reason))).toBe(false);

  // 이전 대화 더 보기 pages backwards (p_before) until the oldest message.
  await expect(transcript.getByText("테스트 메시지 01", { exact: true })).toHaveCount(0);
  await transcript.getByRole("button", { name: "이전 대화 더 보기" }).click();
  await expect(transcript.getByText("테스트 메시지 01", { exact: true })).toBeVisible();
  await expect(transcript.getByRole("button", { name: "이전 대화 더 보기" })).toHaveCount(0);
  await expect(transcript.locator("li[data-kind=message]").filter({ hasText: /테스트 메시지 \d\d/ })).toHaveCount(FILLERS);

  // The 대화 열람 audit row carries the reason (one row: paging is throttled into it).
  const audit = await staffRpc<{ rows: { action: string; reason: string; targetId: string }[] }>("operator", "backoffice_list_audit", {
    p_action: "conversation.view",
    p_limit: 20,
  });
  expect(audit.error).toBeNull();
  const ours = (audit.data?.rows ?? []).filter((row) => row.reason === reason);
  expect(ours).toHaveLength(1);
  expect(ours[0]).toMatchObject({ action: "conversation.view", targetId: RETAILER < UNCLE ? RETAILER : UNCLE });

  // A reload starts from nothing: the page payload never carried the transcript.
  await page.reload();
  await expect(page.getByRole("button", { name: "사유와 함께 열람" })).toBeVisible();
  await expect(page.getByTestId("chat-transcript")).toHaveCount(0);
  expect(await page.content()).not.toContain("010-••••-5678");
});
