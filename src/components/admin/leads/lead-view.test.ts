import { describe, expect, it } from "vitest";

import type { LeadRow } from "@/lib/admin/rpc/schemas";

import {
  LEAD_COPY,
  LEAD_VIEWS,
  leadQuery,
  leadTabCounts,
  messagePreview,
  onlyToday,
  sourceSummary,
  statusFilterHref,
  suspectLabels,
} from "./lead-view";

function lead(id: string, createdAt: string, extra: Partial<LeadRow> = {}): LeadRow {
  return {
    id,
    createdAt,
    role: "retailer",
    name: "임채원",
    businessName: "채원 상점",
    contact: "010-1234-0943",
    market: "동대문",
    message: null,
    source: "landing-signup",
    utm: null,
    suspect: false,
    status: "new",
    assignee: null,
    statusUpdatedAt: null,
    notes: 0,
    ...extra,
  };
}

describe("views (screens 10.16)", () => {
  it("lists 새 문의 · 오늘 · 전체 · 의심 제외 with 새 문의 as the default", () => {
    expect(LEAD_VIEWS.map((view) => view.label)).toEqual(["새 문의", "오늘", "전체", "의심 제외"]);
    expect(LEAD_VIEWS[0].key).toBe("new");
  });

  it("maps a view and the 처리 상태 filter to backoffice_list_leads arguments", () => {
    expect(leadQuery("", null)).toEqual({ status: "new", includeSuspect: true, todayOnly: false });
    expect(leadQuery("new", null)).toEqual({ status: "new", includeSuspect: true, todayOnly: false });
    expect(leadQuery("all", null)).toEqual({ status: undefined, includeSuspect: true, todayOnly: false });
    expect(leadQuery("today", null)).toEqual({ status: undefined, includeSuspect: true, todayOnly: true });
    expect(leadQuery("clean", null)).toEqual({ status: undefined, includeSuspect: false, todayOnly: false });
    expect(leadQuery("all", "contacted")).toEqual({ status: "contacted", includeSuspect: true, todayOnly: false });
    expect(leadQuery("unknown", null)).toEqual({ status: "new", includeSuspect: true, todayOnly: false });
  });

  it("moves a status filter picked on 새 문의 to 전체, so the tab matches the rows", () => {
    expect(statusFilterHref({ view: "" }, "contacted")).toEqual({ status: "contacted", view: "all" });
    expect(statusFilterHref({ view: "today" }, "contacted")).toEqual({ status: "contacted", view: "today" });
    expect(statusFilterHref({ view: "clean" }, null)).toEqual({ status: null, view: "clean" });
  });

  it("counts tabs from the status facets where they are exact", () => {
    const facets = { new: 6, contacted: 1, spam: 2 };
    expect(leadTabCounts({ view: "", total: 6, facets })).toEqual({ new: 6, today: null, all: 9, clean: null });
    expect(leadTabCounts({ view: "clean", total: 4, facets })).toEqual({ new: null, today: null, all: null, clean: 4 });
    expect(leadTabCounts({ view: "today", total: 2, facets })).toEqual({ new: 6, today: 2, all: 9, clean: null });
  });
});

describe("onlyToday", () => {
  it("keeps the leads received since KST midnight", () => {
    const now = new Date("2026-10-13T03:00:00Z"); // 12:00 KST
    const rows = [lead("a", "2026-10-13T01:52:04Z"), lead("b", "2026-10-12T15:00:00Z"), lead("c", "2026-10-12T14:59:59Z")];
    expect(onlyToday(rows, now).map((row) => row.id)).toEqual(["a", "b"]);
  });
});

describe("cells", () => {
  it("labels suspect sources: 빠른 제출 for timing-suspect, 테스트 for e2e", () => {
    expect(suspectLabels("landing-signup:timing-suspect")).toEqual(["빠른 제출"]);
    expect(suspectLabels("e2e")).toEqual(["테스트"]);
    expect(suspectLabels("e2e:timing-suspect")).toEqual(["빠른 제출", "테스트"]);
    expect(suspectLabels("landing-signup")).toEqual([]);
    expect(suspectLabels(null)).toEqual([]);
  });

  it("summarises 유입 as the source over utm_source / utm_campaign", () => {
    expect(sourceSummary("landing-signup", { utm_source: "naver", utm_medium: "cpc", utm_campaign: "brand_search" })).toEqual({
      primary: "landing-signup",
      secondary: "naver / brand_search",
    });
    expect(sourceSummary("landing-signup", { utm_source: "instagram" })).toEqual({ primary: "landing-signup", secondary: "instagram" });
    expect(sourceSummary(null, null)).toEqual({ primary: "-", secondary: null });
  });

  it("shows the first 40 characters of 남긴 말", () => {
    expect(messagePreview("가".repeat(45))).toBe(`${"가".repeat(40)}…`);
    expect(messagePreview("  짧은 말  ")).toBe("짧은 말");
    expect(messagePreview("줄\n바꿈")).toBe("줄 바꿈");
    expect(messagePreview(null)).toBe("");
  });

  it("keeps the empty and CSV copy word for word", () => {
    expect(LEAD_COPY.empty).toBe("아직 랜딩 문의가 없어요");
    expect(LEAD_COPY.csvNote).toBe("개인정보가 담긴 파일이에요. 사유를 남기고 내려받아요.");
  });
});
