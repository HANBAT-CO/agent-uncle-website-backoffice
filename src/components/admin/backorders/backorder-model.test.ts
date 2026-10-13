import { describe, expect, it } from "vitest";

import { AGING_BUCKETS, BACKORDER_VIEWS, agingBars, answerState, backorderView, eventLines, recheckNoticeLabel } from "./backorder-model";

describe("back-order views (screens 10.11)", () => {
  it("are 전체 미송 · 오늘 재확인 · 기한 지남 · 재확인 도래 · 답변 필요, in order", () => {
    expect(BACKORDER_VIEWS.map((view) => view.label)).toEqual(["전체 미송", "오늘 재확인", "기한 지남", "재확인 도래", "답변 필요"]);
  });

  it("map to list_requests attentions; 답변 필요 is the label inside the back orders", () => {
    expect(backorderView("")).toMatchObject({ attention: "backorder", labels: null });
    expect(backorderView("today").attention).toBe("recheck_today");
    expect(backorderView("overdue").attention).toBe("recheck_overdue");
    expect(backorderView("due").attention).toBe("recheck_due");
    expect(backorderView("reply")).toMatchObject({ attention: "backorder", labels: ["답변 필요"] });
    expect(backorderView("unknown").key).toBe("");
  });
});

describe("answerState (답변 상태)", () => {
  it("reads 취소 협의 중 while a proposal is open, then 답변 필요, else 기다리기로 함", () => {
    expect(answerState({ needsReply: true, proposalId: "p1" })).toBe("취소 협의 중");
    expect(answerState({ needsReply: true, proposalId: "" })).toBe("답변 필요");
    expect(answerState({ needsReply: false, proposalId: "" })).toBe("기다리기로 함");
  });
});

describe("eventLines (최근 처리)", () => {
  it("splits the event title into the bold line 1 and the reason on line 2", () => {
    expect(eventLines("확보 0개 · 미송 5개 결과를 공유했어요\n전 매장 품절이에요.")).toEqual({
      title: "확보 0개 · 미송 5개 결과를 공유했어요",
      reason: "전 매장 품절이에요.",
    });
    expect(eventLines("미송을 기다리기로 했어요")).toEqual({ title: "미송을 기다리기로 했어요", reason: null });
    expect(eventLines(null)).toEqual({ title: null, reason: null });
  });
});

describe("recheckNoticeLabel (재확인 알림)", () => {
  const now = new Date("2026-10-13T12:00:00Z");
  it("reads '보냄 · {KST}' or '아직 없음'", () => {
    expect(recheckNoticeLabel("2026-10-13T04:57:18.947908+00:00", now)).toBe("보냄 · 10월 13일 13:57");
    expect(recheckNoticeLabel(null, now)).toBe("아직 없음");
  });
});

describe("aging bars (미송 경과)", () => {
  it("keep the dashboard buckets in order with their labels", () => {
    expect(AGING_BUCKETS.map((bucket) => bucket.label)).toEqual(["0-1일", "2-3일", "4-7일", "8일 이상"]);
    expect(agingBars({ "0-1": 2, "2-3": 2, "4-7": 0, "8+": 1 })).toEqual([
      { key: "0-1", label: "0-1일", count: 2 },
      { key: "2-3", label: "2-3일", count: 2 },
      { key: "4-7", label: "4-7일", count: 0 },
      { key: "8+", label: "8일 이상", count: 1 },
    ]);
  });
});
