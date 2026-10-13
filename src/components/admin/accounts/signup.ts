import { missingFieldLabel, REQUIRED_FIELD_TOTAL } from "@/lib/admin/labels";

/*
 * 가입 단계 (screens 10.7): 역할 선택 / 정보 입력 {done}/{total} / 가입 완료.
 * Totals are the required fields of backoffice_private.missing_signup_fields:
 * retailer 9 fields + 2 consents = 11, uncle 5 + 2 = 7. Format problems
 * (phone:format, ...) count as missing, like the app's own check. Client-safe.
 */

export type SignupProgress = { label: string; done: number; total: number };

export function signupProgress(role: string | null | undefined, missing: readonly string[], complete?: boolean): SignupProgress {
  if (missing.includes("bootstrap")) return { label: missingFieldLabel("bootstrap"), done: 0, total: 0 };
  if (role !== "retailer" && role !== "uncle") return { label: "역할 선택", done: 0, total: 0 };

  const total = REQUIRED_FIELD_TOTAL[role];
  if (complete ?? missing.length === 0) return { label: "가입 완료", done: total, total };
  const done = Math.max(total - missing.length, 0);
  return { label: `정보 입력 ${done}/${total}`, done, total };
}

/** "입력이 남은 항목: {labels}" (프로필 tab). */
export function missingLabels(missing: readonly string[]): string {
  return missing.map(missingFieldLabel).join(", ");
}
