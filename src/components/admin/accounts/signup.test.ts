import { describe, expect, it } from "vitest";

import { missingLabels, signupProgress } from "./signup";

describe("signupProgress (screens 10.7 가입 단계)", () => {
  it("counts a retailer's filled fields out of 14", () => {
    expect(signupProgress("retailer", ["documentId", "terms"])).toEqual({ label: "정보 입력 12/14", done: 12, total: 14 });
  });

  it("counts an uncle's filled fields out of 10", () => {
    expect(signupProgress("uncle", ["deadline", "privacy", "phone"])).toEqual({ label: "정보 입력 7/10", done: 7, total: 10 });
  });

  it("reads 가입 완료 for a complete account", () => {
    expect(signupProgress("uncle", [], true)).toEqual({ label: "가입 완료", done: 10, total: 10 });
    expect(signupProgress("retailer", [], true)).toEqual({ label: "가입 완료", done: 14, total: 14 });
  });

  it("treats a valid role with nothing missing as complete when the flag is not given", () => {
    expect(signupProgress("uncle", []).label).toBe("가입 완료");
  });

  it("keeps an incomplete account in 정보 입력 even when nothing is listed as missing", () => {
    expect(signupProgress("retailer", [], false)).toEqual({ label: "정보 입력 14/14", done: 14, total: 14 });
  });

  it("reads 역할 선택 before a role is chosen", () => {
    expect(signupProgress(null, ["role"])).toEqual({ label: "역할 선택", done: 0, total: 0 });
    expect(signupProgress("", ["role"]).label).toBe("역할 선택");
  });

  it("reads 앱 첫 실행 전 for an auth user without an app account", () => {
    expect(signupProgress(null, ["bootstrap"])).toEqual({ label: "앱 첫 실행 전", done: 0, total: 0 });
  });

  it("counts format problems as missing and never goes below zero", () => {
    expect(signupProgress("retailer", ["phone:format", "businessNumber:format"]).label).toBe("정보 입력 12/14");
    const many = Array.from({ length: 14 }, (_, index) => `field${index}`);
    expect(signupProgress("uncle", many)).toEqual({ label: "정보 입력 0/10", done: 0, total: 10 });
  });
});

describe("missingLabels", () => {
  it("maps keys to the appendix labels, joined for 입력이 남은 항목", () => {
    expect(missingLabels(["businessName", "documentId", "phone:format", "terms"])).toBe("사업자명, 사업자등록증, 연락처 형식, 이용약관 동의");
  });

  it("is empty for nothing missing", () => {
    expect(missingLabels([])).toBe("");
  });
});
