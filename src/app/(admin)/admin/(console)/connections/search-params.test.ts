import { describe, expect, it } from "vitest";

import { CONNECTION_VIEWS, connectionQueryFor, connectionViewCounts } from "./search-params";

const facets = {
  status: { pending: 4, accepted: 9, rejected: 2, withdrawn: 1 },
  awaitingReceipt: 0,
  awaitingReceipt48h: 0,
  mismatch: 0,
  corrected: 0,
  pending3d: 3,
  today: 1,
  unread: 0,
};

describe("거래처 연결 views (screens 10.8)", () => {
  it("keeps the appendix order and copy", () => {
    expect(CONNECTION_VIEWS.map((view) => view.label)).toEqual(["전체", "수락 대기", "수락 대기 3일 넘음", "오늘 연결", "연결 완료"]);
  });

  it("maps each view to a list_records filter or status", () => {
    expect(connectionQueryFor("")).toEqual({});
    expect(connectionQueryFor("pending")).toEqual({ filter: "pending" });
    expect(connectionQueryFor("stale")).toEqual({ filter: "pending_3d" });
    expect(connectionQueryFor("today")).toEqual({ filter: "today" });
    expect(connectionQueryFor("accepted")).toEqual({ status: "accepted" });
    expect(connectionQueryFor("nope")).toEqual({});
  });

  it("counts every view from the unfiltered facets", () => {
    expect(connectionViewCounts(facets)).toEqual({ "": 16, pending: 4, stale: 3, today: 1, accepted: 9 });
  });
});
