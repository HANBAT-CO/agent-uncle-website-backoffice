import { randomUUID } from "node:crypto";

import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { demoUserRpc, staffRpc } from "./helpers/rest";

/*
 * 원격 설정 (WP-10; spec 6, 11; screens appendix 10.15). Mutates
 * feature_flags, maintenance and support on the LOCAL stack and restores the
 * values it found in afterAll (also when a test fails), so a write freeze
 * never outlives this file.
 */

const SAVED = "설정을 저장했어요. 앱은 다음 새로고침 때 반영해요.";
const CONFLICT = "다른 운영자가 설정을 변경했어요. 최신 값을 확인해 주세요.";
const DEMO_USER = "mangwon.select";
const MAINTENANCE_MESSAGE = "e2e 점검 중이에요. 잠시 후 다시 시도해 주세요.";

type ConfigRowRaw = { key: string; value: unknown; version: number };

async function configRow(key: string): Promise<ConfigRowRaw> {
  const result = await staffRpc<ConfigRowRaw[]>("owner", "backoffice_list_config");
  const row = result.data?.find((item) => item.key === key);
  if (!row) throw new Error(`config key ${key} missing: ${result.error?.message ?? "no rows"}`);
  return row;
}

/** Key-order independent JSON, for comparing jsonb values. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function setConfig(role: "owner" | "operator", key: string, value: unknown, reason: string) {
  const row = await configRow(key);
  return staffRpc(role, "backoffice_set_config", {
    p_key: key,
    p_value: value,
    p_reason: reason,
    p_version: row.version,
    p_operation_id: randomUUID(),
  });
}

const originals = new Map<string, unknown>();

test.describe.serial("원격 설정", () => {
  test.beforeAll(async () => {
    for (const key of ["feature_flags", "maintenance", "support"]) originals.set(key, (await configRow(key)).value);
    // Start from the seeded flag, so the operator's toggle has a known direction.
    const flags = (originals.get("feature_flags") ?? {}) as Record<string, unknown>;
    if (flags.newRequest !== true) {
      const result = await setConfig("owner", "feature_flags", { ...flags, newRequest: true }, "e2e 시작 값 맞추기");
      expect(result.error).toBeNull();
    }
  });

  test.afterAll(async () => {
    for (const [key, value] of originals) {
      const current = await configRow(key);
      if (stable(current.value) !== stable(value)) {
        const result = await setConfig("owner", key, value, "e2e 원래 값으로 되돌리기");
        if (result.error) console.error(`restoring ${key} failed: ${result.error.message}`);
      }
    }
  });

  test("an operator cannot edit 점검 모드, and the database agrees", async ({ asRole }) => {
    const page = await asRole("operator");
    await page.goto("/admin/remote-config");
    await expect(page.getByRole("heading", { name: "원격 설정", level: 1 })).toBeVisible();
    await expect(page.getByText("원격 설정은 앱이 해당 항목을 읽을 때 반영돼요. 쓰기 차단과 이용 제한은 서버에서 바로 적용되며, 업데이트 안내는 아래 앱 릴리스에서 별도로 확인해요.")).toBeVisible();

    await expect(page.getByTestId("config-locked-maintenance")).toHaveText("관리자만 변경할 수 있어요");
    await expect(page.getByTestId("config-locked-min_app_version")).toHaveText("관리자만 변경할 수 있어요");
    await expect(page.getByRole("button", { name: "점검 모드 수정" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "기능 스위치 수정" })).toBeVisible();

    const direct = await setConfig("operator", "maintenance", originals.get("maintenance"), "운영자가 직접 바꿔 보기");
    expect(direct.status).toBe(403);
    expect(direct.error?.message).toBe("이 설정은 관리자만 변경할 수 있어요.");
  });

  test("an operator toggles a feature flag with a reason, and the app config follows", async ({ asRole }) => {
    const page = await asRole("operator");
    await page.goto("/admin/remote-config");
    await page.getByRole("button", { name: "기능 스위치 수정" }).click();
    const sheet = page.getByRole("dialog", { name: "기능 스위치" });
    await expect(sheet).toBeVisible();

    const save = sheet.getByRole("button", { name: "설정 저장" });
    await expect(save).toBeDisabled(); // nothing changed yet
    await sheet.getByRole("switch", { name: "newRequest" }).click();
    await expect(sheet.getByTestId("config-diff").getByTestId("diff-newRequest")).toContainText("켜짐");
    await expect(sheet.getByTestId("config-diff").getByTestId("diff-newRequest")).toContainText("꺼짐");

    // An invalid key never reaches the draft.
    await sheet.getByLabel("새 스위치 이름").fill("new-request");
    await sheet.getByRole("button", { name: "스위치 추가" }).click();
    await expect(sheet.getByText("스위치 이름은 영문으로 시작하는 camelCase로 입력해 주세요. 예: newRequest")).toBeVisible();
    await sheet.getByLabel("새 스위치 이름").fill("");

    await sheet.getByLabel("사유").fill("e2e 새 요청 화면 잠시 끄기");
    await save.click();
    await expect(page.getByText(SAVED).first()).toBeVisible();
    await expect(sheet).toBeHidden();
    await expect(page.getByTestId("config-value-feature_flags")).toContainText("newRequest 꺼짐");

    const boot = await demoUserRpc<{ config: { feature_flags?: Record<string, boolean> } }>(DEMO_USER, "app_bootstrap_config", {});
    expect(boot.data?.config.feature_flags?.newRequest).toBe(false);
  });

  test("변경 기록 shows before → after, and 되돌리기 only prefills the editor", async ({ asRole }) => {
    const page = await asRole("operator");
    await page.goto("/admin/remote-config");
    const history = page.getByRole("region", { name: "변경 기록", exact: true });
    const latest = history.getByTestId("config-history-entry").first();
    await expect(latest).toContainText("기능 스위치");
    await expect(latest).toContainText("사유: e2e 새 요청 화면 잠시 끄기");
    await expect(latest.getByTestId("diff-newRequest")).toContainText("켜짐");
    await expect(latest.getByTestId("diff-newRequest")).toContainText("꺼짐");

    const before = await configRow("feature_flags");
    await latest.getByRole("button", { name: "되돌리기" }).click();
    const sheet = page.getByRole("dialog", { name: "기능 스위치" });
    await expect(sheet.getByText(/변경 전 값을 불러왔어요/)).toBeVisible();
    await expect(sheet.getByRole("switch", { name: "newRequest" })).toBeChecked();
    // The diff now reads 꺼짐 (stored) → 켜짐 (prefilled); nothing is saved yet.
    await expect(sheet.getByTestId("config-diff").getByTestId("diff-newRequest").locator("td").last()).toHaveText("켜짐");
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();

    const after = await configRow("feature_flags");
    expect(after.version).toBe(before.version);
    expect(stable(after.value)).toBe(stable(before.value));
  });

  test("the owner turns maintenance on with the write freeze after typing 점검 시작, and turns it off", async ({ asRole }) => {
    const page = await asRole("owner");
    await page.goto("/admin/remote-config");
    await openEditor(page, "점검 모드");
    const sheet = page.getByRole("dialog", { name: "점검 모드" });

    const block = sheet.getByRole("switch", { name: "쓰기 차단 (점검 중 모든 앱 쓰기 거부)" });
    await expect(block).toBeDisabled(); // needs 점검 모드 first
    await sheet.getByRole("switch", { name: "점검 모드", exact: true }).click();
    await block.click();
    await sheet.getByLabel("제목").fill("e2e 정기 점검");
    await sheet.getByLabel("안내").fill(MAINTENANCE_MESSAGE);
    await sheet.getByLabel("사유").fill("e2e 점검 모드와 쓰기 차단 확인");
    await sheet.getByRole("button", { name: "설정 저장" }).click();

    const confirm = page.getByRole("alertdialog", { name: "점검 모드를 켤까요?" });
    await expect(confirm).toContainText("켜면 모든 사용자가 점검 안내만 보게 돼요. 쓰기 차단을 켜면 앱의 모든 저장이 거부돼요.");
    const go = confirm.getByRole("button", { name: "점검 시작" });
    await expect(go).toBeDisabled();
    await confirm.getByRole("textbox").fill("점검 시작");
    await go.click();
    await expect(page.getByText(SAVED).first()).toBeVisible();
    await expect(page.getByTestId("config-value-maintenance")).toHaveText("켜짐 · 쓰기 차단");

    try {
      // The freeze is enforced by Postgres for every app write, right away.
      const write = await demoUserRpc(DEMO_USER, "saip_command", { command: "renewCode", args: {}, operation_id: `e2e-freeze-${randomUUID()}` });
      expect(write.error?.message).toBe(MAINTENANCE_MESSAGE);
      const boot = await demoUserRpc<{ maintenance: { active: boolean; blockWrites: boolean; title: string } }>(DEMO_USER, "app_bootstrap_config", {});
      expect(boot.data?.maintenance).toMatchObject({ active: true, blockWrites: true, title: "e2e 정기 점검" });
    } finally {
      await openEditor(page, "점검 모드");
      await sheet.getByRole("switch", { name: "점검 모드", exact: true }).click();
      await expect(block).not.toBeChecked(); // turning maintenance off also lifts the freeze
      await sheet.getByLabel("사유").fill("e2e 점검 끝내기");
      await sheet.getByRole("button", { name: "설정 저장" }).click(); // turning off needs no typed confirmation
      await expect(page.getByText(SAVED).first()).toBeVisible();
    }
    await expect(page.getByTestId("config-value-maintenance")).toHaveText("꺼짐");
    const blocked = await demoUserRpc<boolean>(DEMO_USER, "app_write_blocked", {});
    expect(blocked.data).toBe(false);
  });

  test("a version conflict shows the database message and keeps the input", async ({ asRole }) => {
    const page = await asRole("owner");
    await page.goto("/admin/remote-config");
    await openEditor(page, "고객센터 안내");
    const sheet = page.getByRole("dialog", { name: "고객센터 안내" });
    const version = await sheet.getByTestId("config-version").innerText();

    await sheet.getByLabel("전화").fill("02-1234-5678");
    await sheet.getByLabel("사유").fill("e2e 전화번호 바꾸기");

    // Another staff member saves first.
    const support = (originals.get("support") ?? {}) as Record<string, unknown>;
    const other = await setConfig("operator", "support", { ...support, hours: "e2e 다른 운영자" }, "e2e 먼저 저장하기");
    expect(other.error).toBeNull();

    await sheet.getByRole("button", { name: "설정 저장" }).click();
    await expect(sheet.getByRole("alert")).toContainText(CONFLICT);
    await expect(sheet.getByLabel("전화")).toHaveValue("02-1234-5678");
    await expect(sheet.getByLabel("사유")).toHaveValue("e2e 전화번호 바꾸기");

    await sheet.getByRole("button", { name: "최신 내용 불러오기" }).click();
    await expect(sheet.getByTestId("config-version")).not.toHaveText(version);
    await expect(sheet.getByLabel("전화")).toHaveValue("02-1234-5678");
  });
});

async function openEditor(page: Page, label: string) {
  await page.getByRole("button", { name: `${label} 수정` }).click();
  await expect(page.getByRole("dialog", { name: label })).toBeVisible();
}
