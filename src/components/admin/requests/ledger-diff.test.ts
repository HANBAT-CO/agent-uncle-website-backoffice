import { describe, expect, it } from "vitest";

import { deliveryDiff, ledgerAfter, ledgerDiff } from "./ledger-diff";

describe("ledgerDiff (처리 이력 before → after, operator+)", () => {
  it("returns only the counters that changed, in 요청 확보 전달 수령 취소 보류 order", () => {
    expect(ledgerDiff({ quantity: 3, acquired: 1 }, { quantity: 3, acquired: 2 })).toEqual([{ key: "확보", from: 1, to: 2 }]);
  });

  it("returns nothing without a before snapshot", () => {
    expect(ledgerDiff(null, { quantity: 3, acquired: 2 })).toEqual([]);
    expect(ledgerDiff(undefined, { quantity: 3 })).toEqual([]);
  });

  it("treats the empty before of a new request as no diff", () => {
    expect(ledgerDiff({}, { quantity: 5, acquired: 0 })).toEqual([]);
  });

  it("reads a missing counter as 0 when the snapshot has others", () => {
    expect(ledgerDiff({ quantity: 5, acquired: 5 }, { quantity: 5, acquired: 5, held: 2 })).toEqual([{ key: "보류", from: 0, to: 2 }]);
  });

  it("maps every counter to its Korean key", () => {
    const before = { quantity: 1, acquired: 1, delivered: 1, received: 1, cancelled: 1, held: 1 };
    const after = { quantity: 2, acquired: 3, delivered: 4, received: 5, cancelled: 6, held: 0 };
    expect(ledgerDiff(before, after)).toEqual([
      { key: "요청", from: 1, to: 2 },
      { key: "확보", from: 1, to: 3 },
      { key: "전달", from: 1, to: 4 },
      { key: "수령", from: 1, to: 5 },
      { key: "취소", from: 1, to: 6 },
      { key: "보류", from: 1, to: 0 },
    ]);
  });

  it("ignores null counters and fields that are not counters", () => {
    expect(ledgerDiff({ quantity: 3, acquired: null, status: "pending" }, { quantity: 3, acquired: null, status: "accepted" })).toEqual([]);
  });
});

describe("deliveryDiff (a 전달 회차 event: the delivery snapshot, not the request)", () => {
  it("labels the round's quantity as 전달 and its confirmed count as 수령", () => {
    expect(deliveryDiff({ quantity: 6, received: 5 }, { quantity: 5, received: 5 })).toEqual([{ key: "전달", from: 6, to: 5 }]);
  });

  it("shows a corrected 실제 받은 수량 (the receipt's actual count) after 수령", () => {
    expect(deliveryDiff({ quantity: 5, received: 5, actual: 5 }, { quantity: 5, received: 5, actual: 4 })).toEqual([
      { key: "실제 받은 수량", from: 5, to: 4 },
    ]);
  });

  it("returns nothing without a before snapshot", () => {
    expect(deliveryDiff(null, { quantity: 5 })).toEqual([]);
    expect(deliveryDiff({}, { quantity: 5 })).toEqual([]);
  });
});

describe("ledgerAfter (viewers: the after-ledger only)", () => {
  it("lists the six counters in order, missing ones as 0", () => {
    expect(ledgerAfter({ quantity: 5, acquired: 2, delivered: 1, received: 1 })).toEqual([
      { key: "요청", value: 5 },
      { key: "확보", value: 2 },
      { key: "전달", value: 1 },
      { key: "수령", value: 1 },
      { key: "취소", value: 0 },
      { key: "보류", value: 0 },
    ]);
  });

  it("is empty without a ledger", () => {
    expect(ledgerAfter(null)).toEqual([]);
  });
});
