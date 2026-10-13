import { describe, expect, it } from "vitest";

import {
  conditionAttention,
  footerText,
  issueParts,
  proposalSummary,
  recheckDays,
  requestTabs,
  splitTitle,
  REQUEST_CONDITIONS,
} from "./request-model";

const LABELS = {
  거절: 4,
  완료: 11,
  "진행 중": 5,
  "답변 필요": 5,
  "미송 대기": 3,
  "수령 대기": 6,
  "취소 종료": 4,
  "픽업 완료": 3,
  "확인 대기": 6,
  "미송 재확인": 4,
  "문제 확인 중": 5,
  "변경·취소 협의 중": 5,
};

describe("requestTabs (screens 10.9 tabs with counts from the labels facet)", () => {
  it("sums each tab's labels; 진행 중 includes 픽업 완료 and 미송 대기, 종료 is 거절 + 취소 종료", () => {
    const tabs = requestTabs(LABELS, "");
    expect(tabs.map((tab) => [tab.label, tab.count])).toEqual([
      ["전체", 61],
      ["확인 대기", 6],
      ["진행 중", 11],
      ["답변 필요", 5],
      ["미송 재확인", 4],
      ["수령 대기", 6],
      ["문제 확인 중", 5],
      ["변경·취소 협의 중", 5],
      ["완료", 11],
      ["종료", 8],
    ]);
  });

  it("counts a missing label as 0", () => {
    expect(requestTabs({ 완료: 2 }, "").find((tab) => tab.key === "pending")?.count).toBe(0);
  });

  it("adds the 확인 필요 view (답변 필요 + 문제 확인 중) only while it is selected", () => {
    expect(requestTabs(LABELS, "").some((tab) => tab.key === "attention")).toBe(false);
    expect(requestTabs(LABELS, "attention").at(-1)).toEqual({ key: "attention", label: "확인 필요", count: 10 });
  });
});

describe("조건 (single select) → p_attention", () => {
  it("has the seven conditions in spec order", () => {
    expect(REQUEST_CONDITIONS.map((condition) => condition.label)).toEqual([
      "열린 문제 있음",
      "협의 진행 중",
      "수령 대기",
      "재확인일 지남",
      "하루 넘은 확인 대기",
      "사진 있음",
      "수량 기록 불일치",
    ]);
  });

  it("maps a known key to its RPC attention and anything else to undefined", () => {
    expect(conditionAttention("recheck_overdue")).toBe("recheck_overdue");
    expect(conditionAttention("violation")).toBe("violation");
    expect(conditionAttention("backorder")).toBeUndefined();
    expect(conditionAttention(null)).toBeUndefined();
  });
});

describe("splitTitle (event title: line 1 bold, the rest muted)", () => {
  it("splits at the first newline", () => {
    expect(splitTitle("요청을 거절했어요\n해당 상품이 단종됐어요.\n다시 요청해 주세요.")).toEqual({
      head: "요청을 거절했어요",
      rest: "해당 상품이 단종됐어요.\n다시 요청해 주세요.",
    });
  });

  it("keeps a one-line title whole", () => {
    expect(splitTitle("요청을 수락했어요")).toEqual({ head: "요청을 수락했어요", rest: "" });
  });

  it("reads an empty title as '-'", () => {
    expect(splitTitle(null)).toEqual({ head: "-", rest: "" });
  });
});

describe("issueParts (문제 유형 from the first line of reason)", () => {
  it("takes a known first line as the kind and the rest as the description", () => {
    expect(issueParts("수량이 부족해요\n2장 모자람", null)).toEqual({ kind: "수량이 부족해요", detail: "2장 모자람" });
  });

  it("accepts 'kind: description' on one line", () => {
    expect(issueParts("오염·파손이 있어요: 2장 단추가 깨져 있어요.", null)).toEqual({ kind: "오염·파손이 있어요", detail: "2장 단추가 깨져 있어요." });
  });

  it("reads a reason with an actual count as 수령 수량 차이", () => {
    expect(issueParts("8장 중 7장 받았어요.", 7)).toEqual({ kind: "수령 수량 차이", detail: "8장 중 7장 받았어요." });
  });

  it("falls back to 기타", () => {
    expect(issueParts("확인 부탁드려요", null)).toEqual({ kind: "기타", detail: "확인 부탁드려요" });
    expect(issueParts(null, null)).toEqual({ kind: "기타", detail: "" });
  });
});

describe("proposalSummary (변경·취소·정정 values)", () => {
  it("lists the proposed counters that are present, number first", () => {
    expect(proposalSummary({ quantity: 4, acquired: 0, received: 0, acquiredCancelled: 0, reason: "품절" })).toBe("요청 4장 · 확보 0장 · 수령 0장 · 확보 취소 0장");
  });

  it("adds changed product and option text", () => {
    expect(proposalSummary({ product: "니트", option: "블랙 / M", quantity: 2 })).toBe("상품 니트 · 옵션 블랙 / M · 요청 2장");
  });

  it("is '-' without values", () => {
    expect(proposalSummary(null)).toBe("-");
  });
});

describe("footerText (screens 10.9 footer totals)", () => {
  it("reads the totals with units", () => {
    expect(footerText(61, { quantity: 570, acquired: 328, delivered: 248, received: 212, backorder: 65 })).toBe(
      "61건 · 요청 570장 · 확보 328장 · 전달 248장 · 수령 212장 · 남은 미송 65장",
    );
  });

  it("groups thousands", () => {
    expect(footerText(1200, { quantity: 12345, acquired: 0, delivered: 0, received: 0, backorder: 0 })).toBe(
      "1,200건 · 요청 12,345장 · 확보 0장 · 전달 0장 · 수령 0장 · 남은 미송 0장",
    );
  });
});

describe("recheckDays (D-day of a 'YYYY-MM-DD' recheck date against today in KST)", () => {
  it("is the day difference, negative when overdue", () => {
    expect(recheckDays("2026-10-13", "2026-10-13")).toBe(0);
    expect(recheckDays("2026-10-10", "2026-10-13")).toBe(-3);
    expect(recheckDays("2026-11-01", "2026-10-30")).toBe(2);
  });

  it("is null without a valid date", () => {
    expect(recheckDays("", "2026-10-13")).toBeNull();
    expect(recheckDays(null, "2026-10-13")).toBeNull();
    expect(recheckDays("2026-02-30", "2026-10-13")).toBeNull();
  });
});
