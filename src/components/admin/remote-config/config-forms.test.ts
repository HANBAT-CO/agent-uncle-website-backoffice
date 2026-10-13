import { describe, expect, it } from "vitest";

import {
  compareSemver,
  configDiff,
  configSubmissionSchema,
  configSummary,
  featureFlagsSchema,
  flagKeySchema,
  isoToKstInput,
  kstInputToIso,
  maintenanceNeedsConfirmation,
  maintenanceSchema,
  minimumRaised,
  minVersionSchema,
  normalizeMaintenance,
  normalizeMinVersion,
  supportSchema,
} from "./config-forms";

const MAINTENANCE_OFF = { enabled: false, blockWrites: false, title: "", message: "", startsAt: null, endsAt: null };
const VERSIONS = {
  ios: { minimum: "0.1.0", recommended: "0.1.0", storeUrl: "" },
  android: { minimum: "0.1.0", recommended: "0.1.0", storeUrl: "" },
  web: { minimum: "0.1.0", recommended: "0.1.0", storeUrl: "" },
  message: "",
};

function messages(result: { success: boolean; error?: { issues: { message: string }[] } }): string[] {
  return result.success ? [] : (result.error?.issues ?? []).map((issue) => issue.message);
}

describe("maintenanceSchema (validate_config maintenance)", () => {
  it("accepts the seeded value", () => {
    expect(maintenanceSchema.safeParse(MAINTENANCE_OFF).success).toBe(true);
  });

  it("refuses blockWrites without enabled", () => {
    const result = maintenanceSchema.safeParse({ ...MAINTENANCE_OFF, blockWrites: true });
    expect(messages(result)).toContain("쓰기 차단은 점검 모드와 함께만 켤 수 있어요.");
  });

  it("limits the title to 60 and the message to 500 characters", () => {
    expect(maintenanceSchema.safeParse({ ...MAINTENANCE_OFF, title: "가".repeat(60) }).success).toBe(true);
    expect(maintenanceSchema.safeParse({ ...MAINTENANCE_OFF, title: "가".repeat(61) }).success).toBe(false);
    expect(maintenanceSchema.safeParse({ ...MAINTENANCE_OFF, message: "가".repeat(501) }).success).toBe(false);
  });

  it("needs the end after the start", () => {
    const result = maintenanceSchema.safeParse({
      ...MAINTENANCE_OFF,
      enabled: true,
      startsAt: "2026-10-13T03:00:00.000Z",
      endsAt: "2026-10-13T02:00:00.000Z",
    });
    expect(messages(result)).toContain("점검 종료 시각은 시작 시각보다 늦어야 해요.");
  });
});

describe("minVersionSchema (validate_config min_app_version)", () => {
  it("accepts the seeded value", () => {
    expect(minVersionSchema.safeParse(VERSIONS).success).toBe(true);
  });

  it("refuses a minimum above the recommended version", () => {
    const result = minVersionSchema.safeParse({ ...VERSIONS, ios: { minimum: "0.3.0", recommended: "0.2.0", storeUrl: "" } });
    expect(messages(result)).toContain("최소 버전이 권장 버전보다 높아요.");
  });

  it("compares versions numerically, not as text", () => {
    expect(minVersionSchema.safeParse({ ...VERSIONS, web: { minimum: "0.9.0", recommended: "0.10.0", storeUrl: "" } }).success).toBe(true);
  });

  it("refuses a store address that is not https", () => {
    const result = minVersionSchema.safeParse({
      ...VERSIONS,
      android: { minimum: "0.1.0", recommended: "0.1.0", storeUrl: "http://play.google.com/store" },
    });
    expect(messages(result)).toContain("스토어 주소는 https 주소여야 해요.");
    expect(
      minVersionSchema.safeParse({ ...VERSIONS, android: { minimum: "0.1.0", recommended: "0.1.0", storeUrl: "https://play.google.com/store" } })
        .success,
    ).toBe(true);
  });

  it("needs 1.2.3 versions", () => {
    const result = minVersionSchema.safeParse({ ...VERSIONS, ios: { minimum: "1.2", recommended: "1.2.0", storeUrl: "" } });
    expect(messages(result)).toContain("버전은 1.2.3 형식으로 입력해 주세요.");
  });

  it("limits the message to 300 characters", () => {
    expect(minVersionSchema.safeParse({ ...VERSIONS, message: "가".repeat(301) }).success).toBe(false);
  });
});

describe("featureFlagsSchema (validate_config feature_flags)", () => {
  it("refuses a dashed key and accepts camelCase", () => {
    expect(flagKeySchema.safeParse("new-request").success).toBe(false);
    expect(flagKeySchema.safeParse("newRequest").success).toBe(true);
    expect(featureFlagsSchema.safeParse({ "new-request": true }).success).toBe(false);
    expect(featureFlagsSchema.safeParse({ newRequest: true }).success).toBe(true);
  });

  it("only takes booleans", () => {
    expect(featureFlagsSchema.safeParse({ newRequest: "true" }).success).toBe(false);
  });
});

describe("supportSchema (validate_config support)", () => {
  it("limits each field to 200 characters", () => {
    const value = { kakaoChannel: "", email: "help@agentuncle.kr", phone: "02-000-0000", hours: "평일 10:00-18:00" };
    expect(supportSchema.safeParse(value).success).toBe(true);
    expect(supportSchema.safeParse({ ...value, hours: "가".repeat(201) }).success).toBe(false);
  });
});

describe("configSubmissionSchema (setConfigAction input)", () => {
  const base = { key: "feature_flags", version: "1", reason: "새 요청 화면 끄기", value: JSON.stringify({ newRequest: false }) };

  it("parses the JSON value, the version and the reason", () => {
    const result = configSubmissionSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ key: "feature_flags", version: 1, reason: "새 요청 화면 끄기", value: { newRequest: false } });
  });

  it("needs a reason of at least 5 characters", () => {
    expect(messages(configSubmissionSchema.safeParse({ ...base, reason: " 짧음 " }))).toContain("사유를 5자 이상 입력해 주세요.");
  });

  it("validates the value with the key's schema", () => {
    const result = configSubmissionSchema.safeParse({
      ...base,
      key: "maintenance",
      value: JSON.stringify({ ...MAINTENANCE_OFF, blockWrites: true }),
    });
    expect(messages(result)).toContain("쓰기 차단은 점검 모드와 함께만 켤 수 있어요.");
  });

  it("refuses keys without an editor and broken JSON", () => {
    expect(configSubmissionSchema.safeParse({ ...base, key: "unknown_key" }).success).toBe(false);
    expect(configSubmissionSchema.safeParse({ ...base, value: "{" }).success).toBe(false);
  });
});

describe("normalize (tolerant reads of the stored value)", () => {
  it("fills missing maintenance fields", () => {
    expect(normalizeMaintenance({ enabled: true })).toEqual({ ...MAINTENANCE_OFF, enabled: true });
    expect(normalizeMaintenance(null)).toEqual(MAINTENANCE_OFF);
  });

  it("fills missing platforms", () => {
    expect(normalizeMinVersion({ ios: { minimum: "0.2.0" } }).ios).toEqual({ minimum: "0.2.0", recommended: "0.2.0", storeUrl: "" });
    expect(normalizeMinVersion({}).web).toEqual({ minimum: "", recommended: "", storeUrl: "" });
  });
});

describe("typed confirmations", () => {
  it("asks for 점검 시작 when maintenance or the write freeze turns on", () => {
    expect(maintenanceNeedsConfirmation(MAINTENANCE_OFF, { ...MAINTENANCE_OFF, enabled: true })).toBe(true);
    const on = { ...MAINTENANCE_OFF, enabled: true };
    expect(maintenanceNeedsConfirmation(on, { ...on, blockWrites: true })).toBe(true);
    expect(maintenanceNeedsConfirmation(on, { ...on, title: "점검" })).toBe(false);
    expect(maintenanceNeedsConfirmation(on, MAINTENANCE_OFF)).toBe(false);
  });

  it("asks for 업데이트 강제 only when a minimum rises", () => {
    expect(minimumRaised(VERSIONS, { ...VERSIONS, ios: { minimum: "0.2.0", recommended: "0.2.0", storeUrl: "" } })).toBe(true);
    expect(minimumRaised(VERSIONS, { ...VERSIONS, ios: { minimum: "0.1.0", recommended: "0.3.0", storeUrl: "" } })).toBe(false);
    expect(minimumRaised({ ...VERSIONS, web: { minimum: "0.5.0", recommended: "0.5.0", storeUrl: "" } }, VERSIONS)).toBe(false);
  });

  it("compares semver numerically", () => {
    expect(compareSemver("0.10.0", "0.9.9")).toBe(1);
    expect(compareSemver("1.0.0", "1.0.0+2")).toBe(0);
    expect(compareSemver("1.0.0", "x")).toBeNull();
  });
});

describe("configSummary (현재 값 column)", () => {
  it("summarizes each key in Korean", () => {
    expect(configSummary("maintenance", MAINTENANCE_OFF)).toBe("꺼짐");
    expect(configSummary("maintenance", { ...MAINTENANCE_OFF, enabled: true, blockWrites: true })).toBe("켜짐 · 쓰기 차단");
    expect(configSummary("min_app_version", VERSIONS)).toBe("iOS 0.1.0 · Android 0.1.0 · Web 0.1.0");
    expect(configSummary("feature_flags", {})).toBe("스위치 없음");
    expect(configSummary("feature_flags", { newRequest: true, chat: false })).toBe("newRequest 켜짐 · chat 꺼짐");
    expect(configSummary("support", { kakaoChannel: "", email: "", phone: "", hours: "" })).toBe("비어 있음");
    expect(configSummary("support", { kakaoChannel: "@saip", email: "a@b.kr", phone: "", hours: "" })).toBe("카카오톡 채널 · 이메일");
  });
});

describe("configDiff (before and after)", () => {
  it("lists only what changes, with Korean labels", () => {
    expect(configDiff("maintenance", MAINTENANCE_OFF, { ...MAINTENANCE_OFF, enabled: true, title: "정기 점검" })).toEqual([
      { path: "enabled", label: "점검 모드", before: "꺼짐", after: "켜짐" },
      { path: "title", label: "제목", before: "비어 있음", after: "정기 점검" },
    ]);
  });

  it("shows flags that appear or disappear", () => {
    expect(configDiff("feature_flags", { newRequest: true }, { newRequest: false, chat: true })).toEqual([
      { path: "newRequest", label: "newRequest", before: "켜짐", after: "꺼짐" },
      { path: "chat", label: "chat", before: "없음", after: "켜짐" },
    ]);
    expect(configDiff("feature_flags", { newRequest: true }, {})).toEqual([
      { path: "newRequest", label: "newRequest", before: "켜짐", after: "없음" },
    ]);
  });

  it("labels platform fields", () => {
    const after = { ...VERSIONS, android: { minimum: "0.2.0", recommended: "0.2.0", storeUrl: "" } };
    expect(configDiff("min_app_version", VERSIONS, after).map((entry) => entry.label)).toEqual(["Android 최소 버전", "Android 권장 버전"]);
  });

  it("writes times in KST", () => {
    const diff = configDiff("maintenance", MAINTENANCE_OFF, { ...MAINTENANCE_OFF, startsAt: "2026-10-12T17:05:00.000Z" });
    expect(diff).toEqual([{ path: "startsAt", label: "시작", before: "없음", after: "10월 13일 02:05" }]);
  });

  it("is empty when nothing changes", () => {
    expect(configDiff("support", { email: "a@b.kr" }, { email: "a@b.kr" })).toEqual([]);
  });
});

describe("KST datetime inputs", () => {
  it("round-trips a KST wall time", () => {
    expect(kstInputToIso("2026-10-13T09:00")).toBe("2026-10-13T00:00:00.000Z");
    expect(isoToKstInput("2026-10-13T00:00:00.000Z")).toBe("2026-10-13T09:00");
    expect(kstInputToIso("")).toBeNull();
    expect(isoToKstInput(null)).toBe("");
  });

  it("refuses malformed input", () => {
    expect(kstInputToIso("2026-13-40T99:00")).toBeNull();
  });
});
