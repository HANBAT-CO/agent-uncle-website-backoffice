import { expect, test } from "./fixtures";

/*
 * 감사 로그 (WP-10; spec 6, 7; screens appendix 10.17). Read-only: it reads
 * the rows the staff seed and earlier specs left (config.set by 대표, notes
 * by 운영 담당) and runs the owner's chain verification.
 */

/** Text of one column for every visible row of the first table on the page. */
async function columnTexts(page: import("@playwright/test").Page, header: string): Promise<string[]> {
  const table = page.getByRole("table").first();
  const headers = await table.locator("thead th").allInnerTexts();
  const index = headers.findIndex((text) => text.trim() === header);
  expect(index, `column ${header}`).toBeGreaterThanOrEqual(0);
  return table.locator(`tbody tr:not([aria-hidden]) td:nth-child(${index + 1})`).allInnerTexts();
}

test.describe("감사 로그", () => {
  test("an operator filters by 작업 and 운영자 and opens 앱 작업 기록 with command names only", async ({ asRole }) => {
    const page = await asRole("operator");
    await page.goto("/admin/audit");
    await expect(page.getByRole("heading", { name: "감사 로그", level: 1 })).toBeVisible();
    await expect(page.getByText("감사 기록은 수정하거나 지울 수 없어요.")).toBeVisible();
    await expect(page.getByRole("button", { name: "무결성 확인" })).toHaveCount(0); // owner only
    expect((await columnTexts(page, "작업")).length).toBeGreaterThan(0);

    await page.getByRole("group", { name: "작업" }).getByRole("button", { name: "설정 변경" }).click();
    await expect(page).toHaveURL(/[?&]action=config\b/);
    await expect(page.getByRole("group", { name: "적용한 필터" })).toContainText("작업: 설정 변경");
    const actions = await columnTexts(page, "작업");
    expect(actions.length).toBeGreaterThan(0);
    for (const text of actions) expect(text).toContain("설정 변경");

    // A multi-action group (열람) is the union of its actions.
    await page.getByRole("group", { name: "작업" }).getByRole("button", { name: "열람" }).click();
    await expect(page).toHaveURL(/[?&]action=view\b/);
    await expect(page.getByRole("group", { name: "적용한 필터" })).toContainText("작업: 열람");
    for (const text of await columnTexts(page, "작업")) expect(text).toMatch(/계정 열람|대화 열람|파일 열람|문의 목록 열람|운영 계정 조회/);

    await page.getByRole("link", { name: "필터 초기화" }).click();
    await expect(page).not.toHaveURL(/action=/);
    await page.getByRole("combobox", { name: "운영자" }).click();
    await page.getByRole("option", { name: "운영 담당" }).click();
    await expect(page).toHaveURL(/[?&]actor=[0-9a-f-]{36}/);
    await expect(page.getByRole("group", { name: "적용한 필터" })).toContainText("운영자: 운영 담당");
    const actors = await columnTexts(page, "운영자");
    expect(actors.length).toBeGreaterThan(0);
    for (const text of actors) expect(text).toContain("운영 담당");

    await page.getByRole("navigation", { name: "기록 종류" }).getByRole("link", { name: "앱 작업 기록" }).click();
    await expect(page).toHaveURL(/[?&]tab=operations\b/);
    await expect(page.getByText("앱이 보낸 명령 이름과 결과만 보여요. 내용은 보이지 않아요.")).toBeVisible();
    const headers = (await page.getByRole("table").locator("thead th").allInnerTexts()).map((text) => text.trim());
    expect(headers).toEqual(["시각", "계정", "명령", "결과", "작업 번호"]);
    const commands = await page.getByTestId("operation-command").allInnerTexts();
    expect(commands.length).toBeGreaterThan(0);
    for (const command of commands) expect(command).toMatch(/^[a-zA-Z]+$/);

    await page.getByRole("combobox", { name: "명령" }).click();
    await page.getByRole("option", { name: /^saveDraft \(/ }).click();
    await expect(page).toHaveURL(/[?&]command=saveDraft\b/);
    await expect(page.getByRole("group", { name: "적용한 필터" })).toContainText("명령: saveDraft"); // the server rendered the filtered list
    for (const command of await page.getByTestId("operation-command").allInnerTexts()) expect(command).toBe("saveDraft");
  });

  test("the owner verifies the chain and sees the head hash", async ({ asRole }) => {
    const page = await asRole("owner");
    await page.goto("/admin/audit");
    await page.getByRole("button", { name: "무결성 확인" }).click();
    const result = page.getByTestId("chain-result");
    await expect(result).toHaveAttribute("data-tone", "ok");
    await expect(result).toHaveText(/^감사 기록 [\d,]+건이 모두 이어져 있어요\. 마지막 해시 [0-9a-f]{12}…$/);
  });

  test("a viewer gets the forbidden state", async ({ asRole }) => {
    const page = await asRole("viewer");
    await page.goto("/admin/audit");
    await expect(page.getByText("이 화면은 운영자 이상만 볼 수 있어요.")).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
  });
});
