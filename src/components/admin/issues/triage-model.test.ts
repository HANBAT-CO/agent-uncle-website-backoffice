import { describe, expect, it } from "vitest";

import {
  ISSUE_VIEWS,
  PROPOSAL_VIEWS,
  issueView,
  issueViewCounts,
  ledgerLine,
  openSpan,
  proposalValueItems,
  proposalView,
  proposalViewCounts,
  triageTab,
} from "./triage-model";

describe("issue views (screens 10.12)", () => {
  it("are 열린 문제 / 조치 완료 · 해결 확인 대기 / 해결 확인", () => {
    expect(ISSUE_VIEWS.map((view) => view.label)).toEqual(["열린 문제", "조치 완료 · 해결 확인 대기", "해결 확인"]);
    expect([issueView("").filter, issueView("").status]).toEqual(["unresolved", undefined]);
    expect([issueView("action").filter, issueView("action").status]).toEqual([undefined, "actionTaken"]);
    expect([issueView("resolved").filter, issueView("resolved").status]).toEqual([undefined, "resolved"]);
    expect(issueView("zzz").key).toBe("");
  });

  it("count unresolved as every status except resolved", () => {
    expect(issueViewCounts({ open: 3, actionTaken: 2, resolved: 3 })).toEqual({ "": 5, action: 2, resolved: 3 });
    expect(issueViewCounts({})).toEqual({ "": 0, action: 0, resolved: 0 });
  });
});

describe("proposal views (screens 10.12)", () => {
  it("are 상대 확인 대기 / 확정 / 철회 / 거절", () => {
    expect(PROPOSAL_VIEWS.map((view) => view.label)).toEqual(["상대 확인 대기", "확정", "철회", "거절"]);
    expect(proposalView("").status).toBe("pending");
    expect(proposalView("approved").status).toBe("approved");
    expect(proposalView("withdrawn").status).toBe("withdrawn");
    expect(proposalView("rejected").status).toBe("rejected");
  });

  it("count from the status facet", () => {
    expect(proposalViewCounts({ pending: 5, approved: 6, rejected: 1, withdrawn: 1 })).toEqual({
      "": 5,
      approved: 6,
      withdrawn: 1,
      rejected: 1,
    });
  });
});

describe("triageTab", () => {
  it("is 문제 unless the URL asks for proposals", () => {
    expect(triageTab("proposals")).toBe("proposals");
    expect(triageTab("")).toBe("issues");
    expect(triageTab("x")).toBe("issues");
  });
});

describe("openSpan (열린 기간, 대기 시간)", () => {
  const now = new Date("2026-10-13T12:00:00Z");
  it("counts an open record up to now as '…째'", () => {
    expect(openSpan("2026-10-10T12:00:00Z", null, now)).toBe("3일째");
    expect(openSpan("2026-10-13T07:00:00Z", null, now)).toBe("5시간째");
  });

  it("reads a closed record's span without 째", () => {
    expect(openSpan("2026-10-04T02:40:00Z", "2026-10-05T01:30:00Z", now)).toBe("22시간");
    expect(openSpan("2026-09-29T06:40:00Z", "2026-10-02T06:40:00Z", now)).toBe("3일");
  });

  it("is '-' without a start", () => {
    expect(openSpan(null, null, now)).toBe("-");
  });
});

describe("ledgerLine", () => {
  it("reads '요청 {q} · 확보 {a} · 전달 {d} · 수령 {r} · 취소 {c}'", () => {
    expect(ledgerLine({ quantity: 4, acquired: 2, delivered: 1, received: 1, cancelled: 0 })).toBe("요청 4 · 확보 2 · 전달 1 · 수령 1 · 취소 0");
    expect(ledgerLine(null)).toBe("-");
  });
});

describe("proposalValueItems", () => {
  it("lists the proposed fields with the app's own names, in the app's order", () => {
    expect(
      proposalValueItems({ reason: "사유", quantity: 7, option: "블루 / L", photos: ["x"], acquiredCancelled: 0, uncleId: "u" }),
    ).toEqual([
      { term: "옵션", value: "블루 / L" },
      { term: "수량", value: "7장" },
      { term: "확보분 취소", value: "0장" },
    ]);
    expect(proposalValueItems(null)).toEqual([]);
  });
});
