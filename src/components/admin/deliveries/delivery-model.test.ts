import { describe, expect, it } from "vitest";

import { DELIVERY_VIEWS, deliveryParties, deliveryView, deliveryViewCounts, deliveryWait } from "./delivery-model";

const facets = {
  status: { "": 32 },
  awaitingReceipt: 7,
  awaitingReceipt48h: 1,
  mismatch: 2,
  corrected: 2,
  pending3d: 0,
  today: 6,
  unread: 0,
};

describe("delivery views (screens 10.10)", () => {
  it("are 전체 · 수령 대기 · 48시간 넘음 · 수량 차이 · 정정된 회차, in order", () => {
    expect(DELIVERY_VIEWS.map((view) => view.label)).toEqual(["전체", "수령 대기", "48시간 넘음", "수량 차이", "정정된 회차"]);
  });

  it("map the URL keys the dashboard and ⌘K use to list_records filters", () => {
    expect(deliveryView("awaiting").filter).toBe("awaiting_receipt");
    expect(deliveryView("awaiting_48h").filter).toBe("awaiting_receipt_48h");
    expect(deliveryView("mismatch").filter).toBe("mismatch");
    expect(deliveryView("corrected").filter).toBe("corrected");
    expect(deliveryView("").filter).toBeUndefined();
    expect(deliveryView("nope").key).toBe("");
  });

  it("count each view from the facets; 전체 is every delivery", () => {
    expect(deliveryViewCounts(facets)).toEqual({ "": 32, awaiting: 7, awaiting_48h: 1, mismatch: 2, corrected: 2 });
  });
});

describe("deliveryWait", () => {
  const now = new Date("2026-10-13T12:00:00Z");

  it("reads '{n}시간째' in whole hours until the receipt, even past a day", () => {
    expect(deliveryWait({ createdAt: "2026-10-13T07:30:00Z", receiptRecorded: false }, now)).toBe("4시간째");
    expect(deliveryWait({ createdAt: "2026-10-10T12:00:00Z", receiptRecorded: false }, now)).toBe("72시간째");
    expect(deliveryWait({ createdAt: "2026-10-13T11:50:00Z", receiptRecorded: false }, now)).toBe("1시간째");
  });

  it("is empty once received or without a time", () => {
    expect(deliveryWait({ createdAt: "2026-10-13T07:30:00Z", receiptRecorded: true }, now)).toBeNull();
    expect(deliveryWait({ createdAt: null, receiptRecorded: false }, now)).toBeNull();
  });
});

describe("deliveryParties", () => {
  it("finds the uncle and the retailer among the readers", () => {
    const uncle = { id: "u", name: "남대문 김삼촌", role: "uncle", complete: true, demo: false };
    const retailer = { id: "r", name: "연남 데일리룩", role: "retailer", complete: true, demo: false };
    expect(deliveryParties({ uncleId: "u", retailerId: "r", parties: [retailer, uncle] })).toEqual({ uncle, retailer });
    expect(deliveryParties({ uncleId: "x", retailerId: null, parties: [retailer] })).toEqual({ uncle: null, retailer: null });
  });
});
