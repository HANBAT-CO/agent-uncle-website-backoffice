import { describe, expect, it } from "vitest";

import {
  ANOMALY_LABEL,
  AUDIT_ACTION_LABEL,
  MISSING_FIELD_LABEL,
  REQUEST_LABELS,
  REQUEST_TABS,
  REQUIRED_FIELD_TOTAL,
  VERIFICATION_LABEL,
  auditActionLabel,
  deliveryState,
  missingFieldLabel,
  requestLabelsForView,
  statusTone,
  violationLabel,
} from "./labels";

describe("request labels", () => {
  it("are the 12 RequestRecord.statusLabel values", () => {
    expect(REQUEST_LABELS).toHaveLength(12);
    expect(new Set(REQUEST_LABELS).size).toBe(12);
  });

  it("every request label has a tone and icon", () => {
    for (const label of REQUEST_LABELS) {
      const tone = statusTone(label);
      expect(["attention", "normal", "done", "ended"]).toContain(tone.tone);
      expect(["WarningCircle", "Clock", "CheckCircle", "XCircle"]).toContain(tone.icon);
    }
  });

  it("uses the spec tones for request labels", () => {
    expect(statusTone("답변 필요")).toEqual({ tone: "attention", icon: "WarningCircle" });
    expect(statusTone("문제 확인 중")).toEqual({ tone: "attention", icon: "WarningCircle" });
    expect(statusTone("미송 재확인")).toEqual({ tone: "normal", icon: "Clock" });
    expect(statusTone("완료")).toEqual({ tone: "ended", icon: "CheckCircle" });
    expect(statusTone("거절")).toEqual({ tone: "ended", icon: "XCircle" });
    expect(statusTone("취소 종료")).toEqual({ tone: "ended", icon: "XCircle" });
  });

  it("uses the spec tones for other chips", () => {
    expect(statusTone("이용 제한")).toEqual({ tone: "attention", icon: "WarningCircle" });
    expect(statusTone("정보 변경 · 다시 확인 필요")).toEqual({ tone: "attention", icon: "WarningCircle" });
    expect(statusTone("확인함")).toEqual({ tone: "done", icon: "CheckCircle" });
    expect(statusTone("이용 중")).toEqual({ tone: "done", icon: "CheckCircle" });
    expect(statusTone("해결 확인")).toEqual({ tone: "ended", icon: "CheckCircle" });
    expect(statusTone("미등록")).toEqual({ tone: "ended", icon: "XCircle" });
    expect(statusTone("제출됨 · 검증 전")).toEqual({ tone: "normal", icon: "Clock" });
  });

  it("REQUEST_TABS cover all 12 labels exactly once besides 전체", () => {
    expect(REQUEST_TABS[0]).toMatchObject({ label: "전체", labels: null });
    const covered = REQUEST_TABS.slice(1).flatMap((tab) => tab.labels ?? []);
    expect(covered).toHaveLength(12);
    expect(new Set(covered)).toEqual(new Set(REQUEST_LABELS));
  });

  it("REQUEST_TABS follow the spec order and grouping", () => {
    expect(REQUEST_TABS.map((tab) => tab.label)).toEqual([
      "전체",
      "확인 대기",
      "진행 중",
      "답변 필요",
      "미송 재확인",
      "수령 대기",
      "문제 확인 중",
      "변경·취소 협의 중",
      "완료",
      "종료",
    ]);
    expect(REQUEST_TABS.find((tab) => tab.label === "진행 중")?.labels).toEqual(["진행 중", "픽업 완료", "미송 대기"]);
    expect(REQUEST_TABS.find((tab) => tab.label === "종료")?.labels).toEqual(["거절", "취소 종료"]);
  });

  it("view=attention means 답변 필요 and 문제 확인 중", () => {
    expect(requestLabelsForView("attention")).toEqual(["답변 필요", "문제 확인 중"]);
    expect(requestLabelsForView("all")).toBeNull();
    expect(requestLabelsForView("unknown-view")).toBeNull();
    expect(requestLabelsForView("progress")).toEqual(["진행 중", "픽업 완료", "미송 대기"]);
  });
});

describe("violation labels", () => {
  it("maps known codes", () => {
    expect(violationLabel("received_gt_delivered")).toBe("수령이 전달보다 많아요");
    expect(violationLabel("proposal_pointer_mismatch")).toBe("협의 기록이 맞지 않아요");
    expect(violationLabel("multiple_pending_proposals")).toBe("협의 기록이 맞지 않아요");
    expect(violationLabel("finished_but_not_closed")).toBe("완료 상태가 맞지 않아요");
  });

  it("maps an unknown code to the generic rule label", () => {
    expect(violationLabel("acquired_gt_open_quantity")).toBe("수량 규칙을 벗어났어요");
    expect(violationLabel("something_new")).toBe("수량 규칙을 벗어났어요");
  });
});

describe("other maps", () => {
  it("has all 13 anomaly kinds", () => {
    expect(Object.keys(ANOMALY_LABEL)).toHaveLength(13);
    expect(ANOMALY_LABEL.ledger_violation).toBe("수량 기록 불일치");
    expect(ANOMALY_LABEL.lead_unhandled).toBe("하루 넘은 새 문의");
  });

  it("has every missing-field label", () => {
    expect(Object.keys(MISSING_FIELD_LABEL)).toHaveLength(19);
    expect(missingFieldLabel("documentId")).toBe("사업자등록증");
    expect(missingFieldLabel("phone:format")).toBe("연락처 형식");
    expect(missingFieldLabel("brandNew")).toBe("brandNew");
  });

  it("required field totals", () => {
    expect(REQUIRED_FIELD_TOTAL).toEqual({ retailer: 11, uncle: 7 });
  });

  it("audit action labels", () => {
    expect(Object.keys(AUDIT_ACTION_LABEL).length).toBeGreaterThanOrEqual(17);
    expect(auditActionLabel("conversation.view")).toBe("대화 열람");
    expect(auditActionLabel("export.requests")).toBe("CSV 내보내기");
    expect(auditActionLabel("export.leads")).toBe("CSV 내보내기");
    expect(auditActionLabel("weird.action")).toBe("weird.action");
  });

  it("verification labels", () => {
    expect(VERIFICATION_LABEL.stale).toBe("정보 변경 · 다시 확인 필요");
    expect(VERIFICATION_LABEL.unverified).toBe("제출됨 · 검증 전");
  });

  it("delivery state", () => {
    expect(deliveryState({ receiptRecorded: false, quantity: 3, actual: 0 })).toBe("수령 대기");
    expect(deliveryState({ receiptRecorded: true, quantity: 3, actual: 3 })).toBe("수령 확인");
    expect(deliveryState({ receiptRecorded: true, quantity: 3, actual: 2 })).toBe("수량 차이");
  });
});
