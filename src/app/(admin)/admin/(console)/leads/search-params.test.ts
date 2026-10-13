import { describe, expect, it } from "vitest";

import { loadChatParams } from "../chats/search-params";
import { loadNoticeParams } from "../notices/search-params";

import { loadLeadParams } from "./search-params";

describe("URL state of 채팅 열람, 알림·공지, 랜딩 문의", () => {
  it("reads the chat pair and the page, never anything else", () => {
    const params = loadChatParams({ a: "2a336ccd-257f-4525-be92-4f3c68888364", b: "c8bc5f8d-4021-495d-9660-64b09131c33a", page: "2", size: "999" });
    expect(params).toMatchObject({ a: "2a336ccd-257f-4525-be92-4f3c68888364", b: "c8bc5f8d-4021-495d-9660-64b09131c33a", page: 2, size: 50 });
    expect(Object.keys(params).sort()).toEqual(["a", "b", "demo", "page", "size"]);
  });

  it("defaults 알림·공지 to the 알림 기록 tab and checks the views", () => {
    expect(loadNoticeParams({})).toMatchObject({ tab: "history", view: null, notice: null, page: 1 });
    expect(loadNoticeParams({ tab: "notices", notice: "new" })).toMatchObject({ tab: "notices", notice: "new" });
    expect(loadNoticeParams({ tab: "drafts", view: "everything" })).toMatchObject({ tab: "history", view: null });
    expect(loadNoticeParams({ view: "unread" }).view).toBe("unread");
  });

  it("reads the lead view, the 처리 상태 filter, the search and the open row", () => {
    expect(loadLeadParams({})).toMatchObject({ view: null, status: null, q: "", lead: null, page: 1, size: 50 });
    expect(loadLeadParams({ view: "clean", status: "contacted", q: "재민", lead: "e534df28" })).toMatchObject({
      view: "clean",
      status: "contacted",
      q: "재민",
      lead: "e534df28",
    });
    expect(loadLeadParams({ view: "spam-only", status: "deleted" })).toMatchObject({ view: null, status: null });
  });
});
