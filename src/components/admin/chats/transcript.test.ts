import { describe, expect, it } from "vitest";

import type { AccountBrief, ChatMessage } from "@/lib/admin/rpc/schemas";

import { CHAT_COPY, buildTimeline, isPairId, mergeOlder, olderCursor, pairKey, pairSides, relatedRequestIds, samePair } from "./transcript";

const RETAILER: AccountBrief = { id: "2a336ccd-257f-4525-be92-4f3c68888364", name: "수원 행궁 니트하우스", role: "retailer", complete: true, demo: false };
const UNCLE: AccountBrief = { id: "c8bc5f8d-4021-495d-9660-64b09131c33a", name: "APM 최삼촌", role: "uncle", complete: true, demo: false };

function message(id: string, createdAt: string | null, extra: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id,
    body: `메시지 ${id}`,
    senderId: RETAILER.id,
    recipientId: UNCLE.id,
    requestId: "",
    system: false,
    read: true,
    status: "sent",
    attachments: [],
    createdAt,
    ...extra,
  };
}

describe("olderCursor (이전 대화 더 보기 pages with p_before)", () => {
  it("returns the oldest time plus one microsecond, so ties at the boundary are not lost", () => {
    const messages = [message("b", "2026-09-30T12:31:12.858415+00:00"), message("a", "2026-09-09T11:44:02.957316+00:00")];
    expect(olderCursor(messages)).toBe("2026-09-09T11:44:02.957317Z");
  });

  it("reads offsets and times without a fraction", () => {
    expect(olderCursor([message("a", "2026-09-09T20:44:02.957316+09:00")])).toBe("2026-09-09T11:44:02.957317Z");
    expect(olderCursor([message("a", "2026-09-09T11:44:02Z")])).toBe("2026-09-09T11:44:02.000001Z");
    expect(olderCursor([message("a", "2026-09-09T11:44:02.999999Z")])).toBe("2026-09-09T11:44:03.000000Z");
  });

  it("skips messages without a time and returns null when there is none", () => {
    expect(olderCursor([message("a", null), message("b", "2026-10-01T00:00:00.5Z")])).toBe("2026-10-01T00:00:00.500001Z");
    expect(olderCursor([message("a", null)])).toBeNull();
    expect(olderCursor([])).toBeNull();
  });
});

describe("mergeOlder", () => {
  it("prepends older messages, drops duplicates and keeps time order", () => {
    const current = [message("c", "2026-10-02T00:00:00Z"), message("d", "2026-10-03T00:00:00Z")];
    const older = [message("a", "2026-09-01T00:00:00Z"), message("c", "2026-10-02T00:00:00Z"), message("b", "2026-09-15T00:00:00Z")];
    expect(mergeOlder(current, older).map((m) => m.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("orders ties by id like the SQL", () => {
    const at = "2026-10-02T00:00:00Z";
    expect(mergeOlder([message("y", at)], [message("x", at)]).map((m) => m.id)).toEqual(["x", "y"]);
  });
});

describe("pairs", () => {
  it("shows the retailer on the left and the 사입삼촌 on the right", () => {
    expect(pairSides(UNCLE, RETAILER)).toEqual({ left: RETAILER, right: UNCLE });
    expect(pairSides(RETAILER, UNCLE)).toEqual({ left: RETAILER, right: UNCLE });
  });

  it("matches a pair in either order and keys it stably", () => {
    expect(samePair({ a: RETAILER.id, b: UNCLE.id }, { a: UNCLE.id, b: RETAILER.id })).toBe(true);
    expect(samePair({ a: RETAILER.id, b: UNCLE.id }, { a: RETAILER.id, b: RETAILER.id })).toBe(false);
    expect(pairKey(UNCLE.id, RETAILER.id)).toBe(pairKey(RETAILER.id, UNCLE.id));
  });

  it("accepts only two different account uuids in ?a=&b=", () => {
    expect(isPairId(RETAILER.id)).toBe(true);
    expect(isPairId("../admin")).toBe(false);
    expect(isPairId(null)).toBe(false);
  });
});

describe("buildTimeline", () => {
  it("adds a KST day line when the day changes and marks 업무 기록 cards", () => {
    const items = buildTimeline(
      [
        message("1", "2026-10-12T14:59:00Z"),
        message("2", "2026-10-12T15:01:00Z", { senderId: UNCLE.id, recipientId: RETAILER.id }),
        message("3", "2026-10-12T15:02:00Z", { system: true, requestId: "req-1" }),
      ],
      { left: RETAILER, right: UNCLE },
      new Date("2026-10-13T03:00:00Z"),
    );
    expect(items.map((item) => (item.type === "day" ? `day:${item.label}` : `${item.side}:${item.message.id}`))).toEqual([
      "day:10월 12일",
      "start:1",
      "day:10월 13일",
      "end:2",
      "card:3",
    ]);
    const second = items[3];
    expect(second.type === "message" && second.time).toBe("00:01");
  });

  it("names the sender when it changes", () => {
    const items = buildTimeline(
      [
        message("1", "2026-10-12T01:00:00Z"),
        message("2", "2026-10-12T01:01:00Z"),
        message("3", "2026-10-12T01:02:00Z", { senderId: UNCLE.id }),
      ],
      { left: RETAILER, right: UNCLE },
    );
    const flags = items.filter((item) => item.type === "message").map((item) => item.type === "message" && item.showSender);
    expect(flags).toEqual([true, false, true]);
  });
});

describe("relatedRequestIds", () => {
  it("lists each linked request once, most recent first", () => {
    const ids = relatedRequestIds([
      message("1", "2026-10-01T00:00:00Z", { requestId: "r1" }),
      message("2", "2026-10-02T00:00:00Z", { requestId: "" }),
      message("3", "2026-10-03T00:00:00Z", { requestId: "r2" }),
      message("4", "2026-10-04T00:00:00Z", { requestId: "r1" }),
    ]);
    expect(ids).toEqual(["r1", "r2"]);
  });
});

describe("copy (screens 10.13)", () => {
  it("keeps the dialog and tooltip copy word for word", () => {
    expect(CHAT_COPY.openButton).toBe("사유와 함께 열람");
    expect(CHAT_COPY.dialogTitle).toBe("대화를 열람할까요?");
    expect(CHAT_COPY.dialogDescription).toBe("열람 사유와 운영자 이름이 감사 로그에 남아요.");
    expect(CHAT_COPY.viewerTooltip).toBe("운영자 이상만 대화를 열람할 수 있어요.");
    expect(CHAT_COPY.loadOlder).toBe("이전 대화 더 보기");
  });
});
