import { describe, expect, it } from "vitest";

import {
  AUDIT_GROUPS,
  auditActionsFor,
  browserLabel,
  changeSummary,
  chainMessage,
  mergeAuditPages,
  shortId,
  targetTypeLabel,
} from "./audit-format";

const row = (id: number) => ({ id });

describe("AUDIT_GROUPS (screens 10.17 작업 filter)", () => {
  it("has the six groups in order", () => {
    expect(AUDIT_GROUPS.map((group) => group.label)).toEqual(["열람", "내보내기", "설정 변경", "메모·케이스", "계정 조치", "권한 변경"]);
  });

  it("maps a group to list_audit action filters (exact actions or a prefix)", () => {
    expect(auditActionsFor("view")).toEqual(["account.view", "conversation.view", "attachment.view", "lead.view_list", "admin.lookup"]);
    expect(auditActionsFor("export")).toEqual(["export"]);
    expect(auditActionsFor("note_case")).toEqual(["note", "case"]);
    expect(auditActionsFor("account")).toEqual(["account.review_document", "account.suspend", "account.restore"]);
    expect(auditActionsFor("admin")).toEqual(["admin.grant", "admin.revoke"]);
    expect(auditActionsFor("nope")).toBeNull();
    expect(auditActionsFor("")).toBeNull();
  });
});

describe("mergeAuditPages", () => {
  it("merges per-action pages newest first and slices the requested page", () => {
    const pages = [
      { total: 3, rows: [row(9), row(5), row(1)] },
      { total: 2, rows: [row(8), row(2)] },
    ];
    expect(mergeAuditPages(pages, 0, 2)).toEqual({ total: 5, rows: [row(9), row(8)] });
    expect(mergeAuditPages(pages, 2, 2)).toEqual({ total: 5, rows: [row(5), row(2)] });
    expect(mergeAuditPages(pages, 4, 2)).toEqual({ total: 5, rows: [row(1)] });
  });

  it("drops duplicate ids", () => {
    expect(mergeAuditPages([{ total: 1, rows: [row(3)] }, { total: 1, rows: [row(3)] }], 0, 10).rows).toEqual([row(3)]);
  });
});

describe("shortId", () => {
  it("keeps the first 8 characters of a UUID and leaves other ids alone", () => {
    expect(shortId("66e41cba-6923-43b5-94f3-d0696de035b3")).toBe("66e41cba…");
    expect(shortId("requests")).toBe("requests");
  });
});

describe("labels", () => {
  it("names target types in Korean and keeps unknown ones", () => {
    expect(targetTypeLabel("config")).toBe("원격 설정");
    expect(targetTypeLabel("admin")).toBe("운영 계정");
    expect(targetTypeLabel("something")).toBe("something");
  });

  it("shortens user agents to a browser name", () => {
    expect(browserLabel("Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36")).toBe("Chrome");
    expect(browserLabel("Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15")).toBe("Safari");
    expect(browserLabel("Mozilla/5.0 ... Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0")).toBe("Edge");
    expect(browserLabel("Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0")).toBe("Firefox");
    expect(browserLabel("Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/140.0.0.0 Safari/537.36")).toBe("Chrome");
    expect(browserLabel("node")).toBe("서버");
    expect(browserLabel(null)).toBe("");
  });
});

describe("changeSummary (변경 전 → 후)", () => {
  it("uses the config diff for config.set", () => {
    expect(
      changeSummary("config.set", "feature_flags", { value: { newRequest: true }, version: 1 }, { value: { newRequest: false }, version: 2 }),
    ).toEqual(["버전 v1 → v2", "newRequest: 켜짐 → 꺼짐"]);
  });

  it("names roles and switches for staff changes", () => {
    expect(changeSummary("admin.grant", "x", { role: "viewer", requireMfa: true, revokedAt: null }, { role: "operator", requireMfa: true })).toEqual([
      "역할: 열람자 → 운영자",
    ]);
    expect(changeSummary("admin.grant", "x", null, { role: "viewer", requireMfa: false })).toEqual(["역할 열람자", "2단계 인증 필수 아니요"]);
  });

  it("lists after-only values for reads and exports", () => {
    expect(changeSummary("export.requests", "requests", null, { rows: 61, from: null, to: null, includeDemo: true })).toEqual([
      "행 수 61",
      "데모 포함 예",
    ]);
  });

  it("orders known fields first, writes times in KST and shortens ids", () => {
    expect(
      changeSummary("export.requests", "requests", null, {
        to: "2026-10-13T15:00:00+00:00",
        from: "2026-09-30T15:00:00+00:00",
        rows: 61,
        includeDemo: false,
      }),
    ).toEqual(["행 수 61", "데모 포함 아니요", "시작 10월 1일 00:00", "종료 10월 14일 00:00"]);
    expect(changeSummary("attachment.view", "x", null, { mime: "image/png", ownerId: "175ec3af-2d36-4075-b81c-ae0ce66b0000" })).toEqual([
      "파일 형식 image/png",
      "소유 계정 175ec3af…",
    ]);
  });

  it("is empty without before and after", () => {
    expect(changeSummary("account.view", "x", null, null)).toEqual([]);
  });
});

describe("chainMessage (무결성 확인)", () => {
  it("reads the success copy with the first 12 hash characters", () => {
    expect(chainMessage({ ok: true, checked: 1234, headHash: "69fe822433207aaaf4b6aa8b", verifiedAt: "x" })).toBe(
      "감사 기록 1,234건이 모두 이어져 있어요. 마지막 해시 69fe82243320…",
    );
  });

  it("reads the broken copy", () => {
    expect(chainMessage({ ok: false, brokenAtId: 42, checked: 41 })).toBe("42번 기록부터 체인이 맞지 않아요. 개발팀에 바로 알려 주세요.");
  });
});
