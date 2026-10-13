import { describe, expect, it } from "vitest";

import overviewFixture from "@/lib/admin/rpc/__fixtures__/overview.owner.json";
import { overviewSchema } from "@/lib/admin/rpc/schemas";

import { agingBars, dayBars, kpiTiles, parseRange, rangeHref, stampLabel, summaryLines } from "./model";

const overview = overviewSchema.parse(overviewFixture);

describe("parseRange", () => {
  it("accepts 1, 7 and 30 and falls back to 1 (오늘)", () => {
    expect(parseRange("7")).toBe(7);
    expect(parseRange("30")).toBe(30);
    expect(parseRange("1")).toBe(1);
    expect(parseRange(undefined)).toBe(1);
    expect(parseRange("14")).toBe(1);
    expect(parseRange(["30", "7"])).toBe(30);
    expect(parseRange("7abc")).toBe(1);
  });
});

describe("rangeHref", () => {
  it("keeps other params, drops range for 오늘", () => {
    expect(rangeHref("demo=1", 7)).toBe("/admin?demo=1&range=7");
    expect(rangeHref("range=7&demo=1", 1)).toBe("/admin?demo=1");
    expect(rangeHref("", 30)).toBe("/admin?range=30");
    expect(rangeHref("range=30", 1)).toBe("/admin");
  });
});

describe("kpiTiles", () => {
  it("has the six tiles of screens 10.5 with their copy, units and links", () => {
    const tiles = kpiTiles(overview, { includeDemo: false });
    expect(tiles.map((tile) => [tile.label, tile.value, tile.unit, tile.href])).toEqual([
      ["새 사입 요청", 42, "건", "/admin/requests?from=2026-10-07"],
      ["확인이 필요한 요청", 10, "건", "/admin/requests?view=attention"],
      ["기한 지난 미송 재확인", 4, "건", "/admin/backorders?view=due"],
      ["수령 대기", 7, "회차", "/admin/deliveries?view=awaiting"],
      ["가입 미완료", 2, "명", "/admin/accounts?view=signup"],
      ["새 랜딩 문의", 11, "건", "/admin/leads?status=new"],
    ]);
  });

  it("links 새 사입 요청 to the KST start day of the period", () => {
    const today = kpiTiles({ ...overview, since: "2026-10-12T15:00:00+00:00" }, { includeDemo: false });
    expect(today[0].href).toBe("/admin/requests?from=2026-10-13");
  });

  it("carries demo=1 into every link when demo rows are included (live only)", () => {
    const tiles = kpiTiles(overview, { includeDemo: true });
    expect(tiles.every((tile) => tile.href.endsWith("demo=1"))).toBe(true);
    expect(tiles[1].href).toBe("/admin/requests?view=attention&demo=1");
  });

  it("marks the attention and overdue tiles only when they have items", () => {
    const tiles = kpiTiles(overview, { includeDemo: false });
    expect(tiles.filter((tile) => tile.attention).map((tile) => tile.label)).toEqual(["확인이 필요한 요청", "기한 지난 미송 재확인"]);
    const calm = kpiTiles({ ...overview, kpi: { ...overview.kpi, attention: 0, overdueRechecks: 0 } }, { includeDemo: false });
    expect(calm.some((tile) => tile.attention)).toBe(false);
  });
});

describe("summaryLines", () => {
  it("writes the side summary of screens 10.5", () => {
    expect(summaryLines(overview)).toEqual([
      "소매업자 13명 · 사입삼촌 6명 · 업무 중 5명",
      "연결 완료 19곳 · 수락 대기 2건",
      "채팅 24시간 3건",
      "첨부 68개 · 559.7KB",
      "열린 케이스 1건",
      "게시 중 공지 1건",
      "점검 모드 꺼짐",
    ]);
  });

  it("shows 점검 모드 켜짐 and 쓰기 차단 when the freeze is on", () => {
    const lines = summaryLines({ ...overview, maintenance: { active: true, blockWrites: true } });
    expect(lines.at(-1)).toBe("점검 모드 켜짐 · 쓰기 차단");
    expect(summaryLines({ ...overview, maintenance: { active: true, blockWrites: false } }).at(-1)).toBe("점검 모드 켜짐");
    expect(summaryLines({ ...overview, maintenance: null }).at(-1)).toBe("점검 모드 꺼짐");
  });

  it("reads missing connection states as 0", () => {
    expect(summaryLines({ ...overview, connections: {} })[1]).toBe("연결 완료 0곳 · 수락 대기 0건");
  });
});

describe("stampLabel", () => {
  it("is the KST HH:mm of generatedAt plus 기준", () => {
    expect(stampLabel("2026-10-13T12:07:53.875112+00:00")).toBe("21:07 기준");
    expect(stampLabel("2026-10-13T15:30:00Z")).toBe("00:30 기준");
  });
});

describe("dayBars", () => {
  it("turns the 14-day series into labelled bars, oldest first", () => {
    const bars = dayBars(overview.newRequestsByDay);
    expect(bars).toHaveLength(14);
    expect(bars[0]).toEqual({ day: "2026-09-30", tick: "9.30", label: "9월 30일", count: 1 });
    expect(bars.at(-1)).toEqual({ day: "2026-10-13", tick: "10.13", label: "10월 13일", count: 3 });
  });

  it("is empty for a null series", () => {
    expect(dayBars(null)).toEqual([]);
  });
});

describe("agingBars", () => {
  it("has the four buckets of screens 10.5 in order", () => {
    expect(agingBars({ "0-1": 2, "2-3": 2, "4-7": 0, "8+": 1 })).toEqual([
      { key: "0-1", label: "0-1일", count: 2 },
      { key: "2-3", label: "2-3일", count: 2 },
      { key: "4-7", label: "4-7일", count: 0 },
      { key: "8+", label: "8일 이상", count: 1 },
    ]);
  });
});
