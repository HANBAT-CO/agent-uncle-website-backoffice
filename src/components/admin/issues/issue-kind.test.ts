import { describe, expect, it } from "vitest";

import { issueDescription, issueKind, ISSUE_KINDS } from "./issue-kind";

describe("issueKind", () => {
  it("reads the kind from the first line the app writes ('{kind}\\n{text}')", () => {
    expect(issueKind("수량이 부족해요\n2장 모자람", false)).toBe("수량이 부족해요");
    expect(issueKind("상품·옵션이 달라요\n사진과 컬러가 달라요.", false)).toBe("상품·옵션이 달라요");
    expect(issueKind("오염·파손이 있어요\n단추가 깨져 있어요.", false)).toBe("오염·파손이 있어요");
  });

  it("also reads a '{kind}: {text}' first line (demo seed)", () => {
    expect(issueKind("오염·파손이 있어요: 2장 단추가 깨져 있어요.", false)).toBe("오염·파손이 있어요");
  });

  it("is a receipt difference whenever `actual` is present", () => {
    expect(issueKind("10장 중 8장만 왔어요. 2장이 부족해요.", true)).toBe("수령 수량 차이");
    expect(issueKind("수량이 부족해요\n2장 모자람", true)).toBe("수령 수량 차이");
  });

  it("falls back to 기타 for anything else", () => {
    expect(issueKind("포장이 이상해요", false)).toBe("기타");
    expect(issueKind("", false)).toBe("기타");
    expect(issueKind(null, false)).toBe("기타");
    expect(issueKind("수량이 부족해요가 아니라 다른 문제", false)).toBe("기타");
  });

  it("lists the four kinds the appendix names", () => {
    expect(ISSUE_KINDS).toEqual(["상품·옵션이 달라요", "수량이 부족해요", "오염·파손이 있어요", "수령 수량 차이"]);
  });
});

describe("issueDescription", () => {
  it("drops the kind line and keeps the reporter's words", () => {
    expect(issueDescription("수량이 부족해요\n2장 모자람")).toBe("2장 모자람");
    expect(issueDescription("상품·옵션이 달라요: 사진과 컬러가 달라요.")).toBe("사진과 컬러가 달라요.");
  });

  it("keeps a reason without a kind as it is", () => {
    expect(issueDescription("10장 중 8장만 왔어요.")).toBe("10장 중 8장만 왔어요.");
    expect(issueDescription(null)).toBe("");
  });
});
