import { describe, expect, it } from "vitest";

import anomaliesFixture from "@/lib/admin/rpc/__fixtures__/ledger_anomalies.owner.json";
import { ANOMALY_LABEL, VIOLATION_NOTE } from "@/lib/admin/labels";
import { anomaliesSchema, type AnomalyItem } from "@/lib/admin/rpc/schemas";

import { anomalyHref, anomalyRow, kindFilters, parseKind, severityChip } from "./anomaly-model";

const fixture = anomaliesSchema.parse(anomaliesFixture);

function item(partial: Partial<AnomalyItem> & Pick<AnomalyItem, "kind" | "targetType">): AnomalyItem {
  return { severity: "normal", targetId: "00000000-0000-4000-8000-000000000001", detail: {}, since: "2026-10-12T00:00:00Z", ...partial };
}

const NAMES = new Map([
  ["31551437-640f-4452-86af-575b1202c1dd", "망원 셀렉트샵"],
  ["b4a3be7c-eca0-405b-9744-537eb9c0bb80", "동대문 삼촌"],
]);

describe("severityChip", () => {
  it("labels 중요도 긴급/높음/보통/낮음 with a tone and an icon", () => {
    expect(severityChip("critical")).toEqual({ label: "긴급", tone: "attention", icon: "WarningCircle" });
    expect(severityChip("high")).toEqual({ label: "높음", tone: "attention", icon: "WarningCircle" });
    expect(severityChip("normal")).toEqual({ label: "보통", tone: "normal", icon: "Clock" });
    expect(severityChip("low")).toEqual({ label: "낮음", tone: "ended", icon: "Clock" });
  });
});

describe("anomalyHref", () => {
  it("opens requests, accounts and leads directly", () => {
    expect(anomalyHref(item({ kind: "recheck_overdue", targetType: "request", targetId: "r1" }))).toBe("/admin/requests/r1");
    expect(anomalyHref(item({ kind: "document_review_pending", targetType: "account", targetId: "a1" }))).toBe("/admin/accounts/a1");
    expect(anomalyHref(item({ kind: "lead_unhandled", targetType: "lead", targetId: "l1" }))).toBe("/admin/leads?view=all&lead=l1");
  });

  it("opens the request that holds an issue, a delivery or a proposal", () => {
    for (const targetType of ["issue", "delivery", "proposal"]) {
      expect(anomalyHref(item({ kind: "x", targetType, targetId: "t1", detail: { requestId: "r9" } }))).toBe("/admin/requests/r9");
    }
    expect(anomalyHref(item({ kind: "x", targetType: "issue", targetId: "t1" }))).toBeNull();
  });

  it("opens the owner account of a file and the connection list for a connection", () => {
    expect(anomalyHref(item({ kind: "attachment_object_missing", targetType: "attachment", detail: { ownerId: "o1" } }))).toBe("/admin/accounts/o1");
    expect(anomalyHref(item({ kind: "storage_object_unregistered", targetType: "storage_object", targetId: "o2/att/photo.jpg" }))).toBe(
      "/admin/accounts/o2",
    );
    expect(anomalyHref(item({ kind: "connection_pending_stale", targetType: "connection" }))).toBe("/admin/connections");
  });

  it("encodes ids so a stored path cannot break out of the route", () => {
    expect(anomalyHref(item({ kind: "x", targetType: "request", targetId: "a/b?c" }))).toBe("/admin/requests/a%2Fb%3Fc");
  });
});

describe("anomalyRow", () => {
  it("labels every kind of the fixture through ANOMALY_LABEL", () => {
    for (const anomaly of fixture.items) {
      expect(anomalyRow(anomaly, NAMES).kindLabel).toBe(ANOMALY_LABEL[anomaly.kind]);
    }
  });

  it("shows ledger violations in Korean with the note (screens 10.6)", () => {
    const row = anomalyRow(
      item({
        kind: "ledger_violation",
        severity: "critical",
        targetType: "request",
        targetId: "r1",
        detail: { violations: ["received_gt_delivered", "completed_but_open", "finished_but_not_closed", "weird_code"] },
      }),
      NAMES,
    );
    expect(row.kindLabel).toBe("수량 기록 불일치");
    expect(row.violations).toEqual(["수령이 전달보다 많아요", "완료 상태가 맞지 않아요", "수량 규칙을 벗어났어요"]);
    expect(row.summary).toBe("수령이 전달보다 많아요 · 완료 상태가 맞지 않아요 · 수량 규칙을 벗어났어요");
    expect(row.note).toBe(VIOLATION_NOTE);
    expect(row.severity).toEqual({ label: "긴급", tone: "attention", icon: "WarningCircle" });
  });

  it("summarises a request target with its product and recheck day", () => {
    const row = anomalyRow(fixture.items[0], NAMES, new Date("2026-10-13T12:00:00Z"));
    expect(row.target).toBe("요청 · 스트라이프 니트 티");
    expect(row.summary).toBe("재확인일 10월 10일 지남");
    expect(row.href).toBe("/admin/requests/62b7f913-cb8d-43ad-a8d8-056da62ded00");
    expect(row.note).toBeNull();
  });

  it("uses account names when known and a short id otherwise", () => {
    const known = anomalyRow(item({ kind: "document_review_pending", targetType: "account", targetId: "31551437-640f-4452-86af-575b1202c1dd", detail: { state: "unverified" } }), NAMES);
    expect(known.target).toBe("계정 · 망원 셀렉트샵");
    expect(known.summary).toBe("제출됨 · 검증 전");
    const unknown = anomalyRow(item({ kind: "document_review_pending", targetType: "account", targetId: "ab462a8d-9351-47e4-9421-ff257c416b2a", detail: { state: "stale" } }), NAMES);
    expect(unknown.target).toBe("계정 · ab462a8d");
    expect(unknown.summary).toBe("정보 변경 · 다시 확인 필요");
  });

  it("names both sides of a stale connection", () => {
    const row = anomalyRow(
      item({ kind: "connection_pending_stale", targetType: "connection", targetId: "c1", detail: { from: "31551437-640f-4452-86af-575b1202c1dd", to: "b4a3be7c-eca0-405b-9744-537eb9c0bb80" } }),
      NAMES,
    );
    expect(row.target).toBe("연결 · 망원 셀렉트샵 → 동대문 삼촌");
    expect(row.summary).toBe("수락 대기");
  });

  it("writes the remaining kinds with app nouns and units", () => {
    const summary = (partial: Parameters<typeof item>[0]) => anomalyRow(item(partial), NAMES).summary;
    expect(summary({ kind: "receipt_unconfirmed", targetType: "delivery", detail: { quantity: 4, requestId: "r" } })).toBe("이번 전달 4장 · 수령 대기");
    expect(summary({ kind: "issue_unresolved", targetType: "issue", detail: { status: "open", held: 2, requestId: "r" } })).toBe("문제 확인 중 · 보류 2개");
    expect(summary({ kind: "issue_unresolved", targetType: "issue", detail: { status: "actionTaken", held: 0 } })).toBe("조치 완료 · 해결 확인 대기 · 보류 0개");
    expect(summary({ kind: "pending_request_stale", targetType: "request", detail: { product: "레더 미니 숄더백" } })).toBe("확인 대기");
    expect(summary({ kind: "proposal_stale", targetType: "proposal", detail: { kind: "correction" } })).toBe("정정 · 상대 확인 대기");
    expect(summary({ kind: "signup_stalled", targetType: "account", detail: { stage: "profile" } })).toBe("정보 입력 단계");
    expect(summary({ kind: "attachment_object_missing", targetType: "attachment" })).toBe("저장소에 파일이 없어요");
    expect(summary({ kind: "storage_object_unregistered", targetType: "storage_object", detail: { size: 2048 } })).toBe("2KB · 첨부 기록 없음");
    expect(summary({ kind: "auth_user_without_account", targetType: "account" })).toBe("앱 계정을 만들기 전이에요");
    expect(summary({ kind: "lead_unhandled", targetType: "lead", detail: { role: "retailer", source: "landing-signup" } })).toBe("소매업자 · landing-signup");
  });

  it("keeps a stable unique id per kind and target", () => {
    const ids = fixture.items.map((anomaly) => anomalyRow(anomaly, NAMES).id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("falls back to the raw kind for a kind the console does not know yet", () => {
    expect(anomalyRow(item({ kind: "new_kind", targetType: "thing", targetId: "abcdef1234" }), NAMES)).toMatchObject({
      kindLabel: "new_kind",
      target: "abcdef12",
      href: null,
    });
  });
});

describe("kindFilters", () => {
  it("lists kinds with items in the screens 10.6 order", () => {
    const filters = kindFilters(fixture.counts);
    expect(filters.map((filter) => filter.kind)).toEqual([
      "recheck_overdue",
      "receipt_unconfirmed",
      "issue_unresolved",
      "pending_request_stale",
      "proposal_stale",
      "document_review_pending",
      "connection_pending_stale",
      "auth_user_without_account",
      "lead_unhandled",
    ]);
    expect(filters[0]).toEqual({ kind: "recheck_overdue", label: "기한 지난 미송 재확인", count: 4 });
  });

  it("keeps a selected kind even with no items, so its chip can be cleared", () => {
    expect(kindFilters({}, "ledger_violation")).toEqual([{ kind: "ledger_violation", label: "수량 기록 불일치", count: 0 }]);
  });
});

describe("parseKind", () => {
  it("accepts the known kinds only", () => {
    expect(parseKind("ledger_violation")).toBe("ledger_violation");
    expect(parseKind(["lead_unhandled"])).toBe("lead_unhandled");
    expect(parseKind("nope")).toBeNull();
    expect(parseKind(undefined)).toBeNull();
  });
});
