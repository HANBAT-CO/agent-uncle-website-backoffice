import { z } from "zod";

import { formatKst, formatKstStamp } from "@/lib/admin/format";

/*
 * 원격 설정 editors (backoffice spec 11, screens appendix 10.15). The zod
 * schemas mirror backoffice_private.validate_config in
 * 20261013090000_backoffice_admin_layer.sql, so an operator sees the same
 * rule before saving that Postgres enforces on save. Postgres stays the
 * authority: it re-validates, checks the write role and the optimistic
 * version. Client-safe and pure (the editors and the Server Action share it).
 */

export const CONFIG_KEYS = ["maintenance", "min_app_version", "feature_flags", "support"] as const;
export type KnownConfigKey = (typeof CONFIG_KEYS)[number];

export function isKnownConfigKey(key: string): key is KnownConfigKey {
  return (CONFIG_KEYS as readonly string[]).includes(key);
}

export const PLATFORMS = ["ios", "android", "web"] as const;
export type Platform = (typeof PLATFORMS)[number];
export const PLATFORM_LABEL: Record<Platform, string> = { ios: "iOS", android: "Android", web: "Web" };

export const CONFIG_MESSAGES = {
  reasonShort: "사유를 5자 이상 입력해 주세요.",
  saved: "설정을 저장했어요. 앱은 다음 새로고침 때 반영해요.",
  blockWritesNeedsEnabled: "쓰기 차단은 점검 모드와 함께만 켤 수 있어요.",
  endBeforeStart: "점검 종료 시각은 시작 시각보다 늦어야 해요.",
  timeFormat: "점검 시작·종료 시각 형식을 확인해 주세요.",
  semver: "버전은 1.2.3 형식으로 입력해 주세요.",
  minAboveRecommended: "최소 버전이 권장 버전보다 높아요.",
  storeHttps: "스토어 주소는 https 주소여야 해요.",
  flagKey: "스위치 이름은 영문으로 시작하는 camelCase로 입력해 주세요. 예: newRequest",
  value: "설정 값을 확인해 주세요.",
} as const;

// ---------------------------------------------------------------------------
// Semver (backoffice_private.semver: major.minor.patch, an optional suffix)
// ---------------------------------------------------------------------------

const SEMVER = /^(\d{1,6})\.(\d{1,6})\.(\d{1,6})([+-][0-9A-Za-z.+-]*)?$/;

function semverParts(value: string): [number, number, number] | null {
  const match = SEMVER.exec(value);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** -1, 0 or 1 by major.minor.patch (suffixes ignored, as in SQL); null when either is not a version. */
export function compareSemver(a: string, b: string): -1 | 0 | 1 | null {
  const left = semverParts(a);
  const right = semverParts(b);
  if (!left || !right) return null;
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index] ? 1 : -1;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Schemas (validate_config mirrors)
// ---------------------------------------------------------------------------

const isoTime = z
  .string()
  .nullable()
  .refine((value) => value === null || !Number.isNaN(Date.parse(value)), CONFIG_MESSAGES.timeFormat);

export const maintenanceSchema = z
  .object({
    enabled: z.boolean(),
    blockWrites: z.boolean(),
    title: z.string().max(60, "점검 제목은 60자 이하로 입력해 주세요."),
    message: z.string().max(500, "점검 안내는 500자 이하로 입력해 주세요."),
    startsAt: isoTime,
    endsAt: isoTime,
  })
  .superRefine((value, ctx) => {
    if (value.blockWrites && !value.enabled) {
      ctx.addIssue({ code: "custom", path: ["blockWrites"], message: CONFIG_MESSAGES.blockWritesNeedsEnabled });
    }
    if (value.startsAt && value.endsAt && Date.parse(value.startsAt) >= Date.parse(value.endsAt)) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: CONFIG_MESSAGES.endBeforeStart });
    }
  });
export type MaintenanceValue = z.infer<typeof maintenanceSchema>;

const versionField = z.string().trim().regex(SEMVER, CONFIG_MESSAGES.semver);

const platformSchema = z
  .object({
    minimum: versionField,
    recommended: versionField,
    storeUrl: z
      .string()
      .trim()
      .max(500, "스토어 주소는 500자 이하로 입력해 주세요.")
      .refine((value) => value === "" || /^https:\/\//.test(value), CONFIG_MESSAGES.storeHttps),
  })
  .superRefine((value, ctx) => {
    if (compareSemver(value.minimum, value.recommended) === 1) {
      ctx.addIssue({ code: "custom", path: ["recommended"], message: CONFIG_MESSAGES.minAboveRecommended });
    }
  });
export type PlatformVersion = z.infer<typeof platformSchema>;

export const minVersionSchema = z.object({
  ios: platformSchema,
  android: platformSchema,
  web: platformSchema,
  message: z.string().max(300, "업데이트 안내 문구는 300자 이하로 입력해 주세요."),
});
export type MinVersionValue = z.infer<typeof minVersionSchema>;

/** Same rule as SQL: a letter, then letters, digits or _ (64 at most). */
export const FLAG_KEY = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
export const flagKeySchema = z.string().regex(FLAG_KEY, CONFIG_MESSAGES.flagKey);
export const featureFlagsSchema = z.record(flagKeySchema, z.boolean({ error: "기능 스위치는 켜짐 또는 꺼짐이어야 해요." }));
export type FeatureFlagsValue = z.infer<typeof featureFlagsSchema>;

const supportField = z.string().max(200, "고객센터 안내는 항목마다 200자 이하로 입력해 주세요.");
export const supportSchema = z.object({
  kakaoChannel: supportField,
  email: supportField,
  phone: supportField,
  hours: supportField,
});
export type SupportValue = z.infer<typeof supportSchema>;

export const CONFIG_SCHEMAS: Record<KnownConfigKey, z.ZodType> = {
  maintenance: maintenanceSchema,
  min_app_version: minVersionSchema,
  feature_flags: featureFlagsSchema,
  support: supportSchema,
};

/**
 * The setConfigAction form: key, the optimistic version, a 사유 and the value
 * as JSON (the editors keep a typed draft and serialize it into one field).
 */
export const configSubmissionSchema = z
  .object({
    key: z.enum(CONFIG_KEYS, { error: "이 설정은 화면에서 바꿀 수 없어요." }),
    version: z.coerce.number({ error: "버전을 확인할 수 없어요. 화면을 새로고침해 주세요." }).int().min(0),
    reason: z.string().trim().min(5, CONFIG_MESSAGES.reasonShort).max(2000, "사유는 2,000자 이하로 입력해 주세요."),
    value: z.string().max(20_000, "설정 값은 16KB 이하여야 해요."),
  })
  .transform((input, ctx) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input.value);
    } catch {
      ctx.addIssue({ code: "custom", path: ["value"], message: CONFIG_MESSAGES.value });
      return z.NEVER;
    }
    const checked = CONFIG_SCHEMAS[input.key].safeParse(parsed);
    if (!checked.success) {
      for (const issue of checked.error.issues) {
        ctx.addIssue({ code: "custom", path: ["value", ...issue.path.map(String)], message: issue.message });
      }
      return z.NEVER;
    }
    return { key: input.key, version: input.version, reason: input.reason, value: checked.data as unknown };
  });
export type ConfigSubmission = z.output<typeof configSubmissionSchema>;

// ---------------------------------------------------------------------------
// Tolerant reads: the stored JSON as a full editor draft
// ---------------------------------------------------------------------------

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

const textOf = (value: unknown): string => (typeof value === "string" ? value : "");
const timeOf = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

export function normalizeMaintenance(value: unknown): MaintenanceValue {
  const v = record(value);
  return {
    enabled: v.enabled === true,
    blockWrites: v.blockWrites === true,
    title: textOf(v.title),
    message: textOf(v.message),
    startsAt: timeOf(v.startsAt),
    endsAt: timeOf(v.endsAt),
  };
}

export function normalizeMinVersion(value: unknown): MinVersionValue {
  const v = record(value);
  const platform = (raw: unknown): PlatformVersion => {
    const p = record(raw);
    const minimum = textOf(p.minimum);
    // SQL reads a missing recommended version as the minimum.
    return { minimum, recommended: typeof p.recommended === "string" ? p.recommended : minimum, storeUrl: textOf(p.storeUrl) };
  };
  return { ios: platform(v.ios), android: platform(v.android), web: platform(v.web), message: textOf(v.message) };
}

export function normalizeFeatureFlags(value: unknown): FeatureFlagsValue {
  return Object.fromEntries(Object.entries(record(value)).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"));
}

export function normalizeSupport(value: unknown): SupportValue {
  const v = record(value);
  return { kakaoChannel: textOf(v.kakaoChannel), email: textOf(v.email), phone: textOf(v.phone), hours: textOf(v.hours) };
}

// ---------------------------------------------------------------------------
// Typed confirmations (screens 10.15)
// ---------------------------------------------------------------------------

/** "점검 시작" is typed whenever maintenance or the write freeze turns on. */
export function maintenanceNeedsConfirmation(before: unknown, after: MaintenanceValue): boolean {
  const prior = normalizeMaintenance(before);
  return (after.enabled && !prior.enabled) || (after.blockWrites && !prior.blockWrites);
}

/** "업데이트 강제" is typed when any platform's minimum rises (or a minimum appears). */
export function minimumRaised(before: unknown, after: MinVersionValue): boolean {
  const prior = normalizeMinVersion(before);
  return PLATFORMS.some((platform) => {
    const next = after[platform].minimum;
    const previous = prior[platform].minimum;
    if (!semverParts(next)) return false;
    if (!semverParts(previous)) return true;
    return compareSemver(next, previous) === 1;
  });
}

// ---------------------------------------------------------------------------
// Human summaries and diffs
// ---------------------------------------------------------------------------

const onOff = (value: boolean) => (value ? "켜짐" : "꺼짐");
const textOrEmpty = (value: string) => (value.trim() === "" ? "비어 있음" : value);
const timeOrNone = (value: string | null) => (value ? formatKst(value) : "없음");

export const SUPPORT_FIELDS = [
  { key: "kakaoChannel", label: "카카오톡 채널" },
  { key: "email", label: "이메일" },
  { key: "phone", label: "전화" },
  { key: "hours", label: "운영 시간" },
] as const satisfies readonly { key: keyof SupportValue; label: string }[];

/** 현재 값 column (screens 10.15: a human summary, not JSON). */
export function configSummary(key: string, value: unknown): string {
  if (key === "maintenance") {
    const m = normalizeMaintenance(value);
    if (!m.enabled) return "꺼짐";
    return m.blockWrites ? "켜짐 · 쓰기 차단" : "켜짐";
  }
  if (key === "min_app_version") {
    const v = normalizeMinVersion(value);
    return PLATFORMS.map((platform) => `${PLATFORM_LABEL[platform]} ${v[platform].minimum || "-"}`).join(" · ");
  }
  if (key === "feature_flags") {
    const entries = Object.entries(normalizeFeatureFlags(value));
    if (entries.length === 0) return "스위치 없음";
    const shown = entries.slice(0, 3).map(([name, on]) => `${name} ${onOff(on)}`);
    return entries.length > 3 ? `${shown.join(" · ")} 외 ${entries.length - 3}개` : shown.join(" · ");
  }
  if (key === "support") {
    const s = normalizeSupport(value);
    const filled = SUPPORT_FIELDS.filter((field) => s[field.key].trim() !== "").map((field) => field.label);
    return filled.length === 0 ? "비어 있음" : filled.join(" · ");
  }
  const json = JSON.stringify(value ?? null);
  return json.length > 60 ? `${json.slice(0, 60)}…` : json;
}

export type DiffEntry = { path: string; label: string; before: string; after: string };

/** Ordered [path, label, display value] for one config value. */
function flatten(key: string, value: unknown): [string, string, string][] {
  if (key === "maintenance") {
    const m = normalizeMaintenance(value);
    return [
      ["enabled", "점검 모드", onOff(m.enabled)],
      ["blockWrites", "쓰기 차단", onOff(m.blockWrites)],
      ["title", "제목", textOrEmpty(m.title)],
      ["message", "안내", textOrEmpty(m.message)],
      ["startsAt", "시작", timeOrNone(m.startsAt)],
      ["endsAt", "종료", timeOrNone(m.endsAt)],
    ];
  }
  if (key === "min_app_version") {
    const v = normalizeMinVersion(value);
    return [
      ...PLATFORMS.flatMap((platform): [string, string, string][] => [
        [`${platform}.minimum`, `${PLATFORM_LABEL[platform]} 최소 버전`, v[platform].minimum || "없음"],
        [`${platform}.recommended`, `${PLATFORM_LABEL[platform]} 권장 버전`, v[platform].recommended || "없음"],
        [`${platform}.storeUrl`, `${PLATFORM_LABEL[platform]} 스토어 주소`, textOrEmpty(v[platform].storeUrl)],
      ]),
      ["message", "안내 문구", textOrEmpty(v.message)],
    ];
  }
  if (key === "feature_flags") {
    return Object.entries(normalizeFeatureFlags(value)).map(([name, on]) => [name, name, onOff(on)]);
  }
  if (key === "support") {
    const s = normalizeSupport(value);
    return SUPPORT_FIELDS.map((field) => [field.key, field.label, textOrEmpty(s[field.key])]);
  }
  return Object.entries(record(value)).map(([name, item]) => [name, name, JSON.stringify(item ?? null)]);
}

/**
 * What a save changes, as Korean before/after pairs (the editors' diff and
 * the 변경 기록). Keys that appear or disappear read "없음" on the other side.
 */
export function configDiff(key: string, before: unknown, after: unknown): DiffEntry[] {
  const left = new Map(flatten(key, before).map(([path, label, display]) => [path, { label, display }]));
  const right = new Map(flatten(key, after).map(([path, label, display]) => [path, { label, display }]));
  const paths = [...left.keys(), ...[...right.keys()].filter((path) => !left.has(path))];
  const out: DiffEntry[] = [];
  for (const path of paths) {
    const b = left.get(path);
    const a = right.get(path);
    const beforeText = b?.display ?? "없음";
    const afterText = a?.display ?? "없음";
    if (beforeText !== afterText) out.push({ path, label: (a ?? b)?.label ?? path, before: beforeText, after: afterText });
  }
  return out;
}

// ---------------------------------------------------------------------------
// KST <input type="datetime-local"> values
// ---------------------------------------------------------------------------

const LOCAL_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** 'YYYY-MM-DDTHH:mm' as KST wall time for an ISO timestamp; '' when empty. */
export function isoToKstInput(iso: string | null | undefined): string {
  const stamp = formatKstStamp(iso);
  return stamp ? stamp.replace(" ", "T") : "";
}

/** The ISO instant of a KST wall time 'YYYY-MM-DDTHH:mm'; null when empty or invalid. */
export function kstInputToIso(local: string): string | null {
  const match = LOCAL_INPUT.exec(local.trim());
  if (!match) return null;
  const date = new Date(`${match[0]}:00+09:00`);
  if (Number.isNaN(date.getTime())) return null;
  // Reject out-of-range parts and rollovers such as 02-31 becoming 03-03.
  return isoToKstInput(date.toISOString()) === match[0] ? date.toISOString() : null;
}
