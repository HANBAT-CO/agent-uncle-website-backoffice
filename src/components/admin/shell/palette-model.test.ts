import { describe, expect, it } from "vitest";

import {
  RECENT_LIMIT,
  RECENT_STORAGE_KEY,
  SEARCH_SCOPES,
  highlightParts,
  matchesQuery,
  parseRecent,
  parseScope,
  pushRecent,
  type RecentItem,
} from "./palette-model";

describe("recent items (au-admin-recent)", () => {
  const a: RecentItem = { kind: "account", id: "a1", label: "망원 셀렉트샵" };
  const r: RecentItem = { kind: "request", id: "r1", label: "스트라이프 니트 티" };

  it("uses the spec storage key and keeps 5", () => {
    expect(RECENT_STORAGE_KEY).toBe("au-admin-recent");
    expect(RECENT_LIMIT).toBe(5);
  });

  it("puts the newest first and moves a repeat to the front", () => {
    expect(pushRecent([a], r)).toEqual([r, a]);
    expect(pushRecent([r, a], { ...a, label: "새 이름" })).toEqual([{ ...a, label: "새 이름" }, r]);
  });

  it("caps the list at 5", () => {
    const many = Array.from({ length: 5 }, (_, i): RecentItem => ({ kind: "account", id: `a${i}`, label: `계정 ${i}` }));
    const next = pushRecent(many, r);
    expect(next).toHaveLength(5);
    expect(next[0]).toEqual(r);
    expect(next.map((item) => item.id)).not.toContain("a4");
  });

  it("stores ids and labels only", () => {
    const leaky = { kind: "lead", id: "l1", label: "재민 셀렉트", contact: "010-1234-5678", message: "hi" } as unknown as RecentItem;
    expect(pushRecent([], leaky)).toEqual([{ kind: "lead", id: "l1", label: "재민 셀렉트" }]);
  });

  it("parses stored JSON defensively", () => {
    expect(parseRecent(null)).toEqual([]);
    expect(parseRecent("not json")).toEqual([]);
    expect(parseRecent(JSON.stringify({ kind: "account" }))).toEqual([]);
    expect(
      parseRecent(
        JSON.stringify([
          { kind: "account", id: "a1", label: "망원 셀렉트샵", phone: "010" },
          { kind: "screen", id: "x", label: "y" },
          { kind: "request", id: "", label: "빈 ID" },
          { kind: "request", id: "r1", label: 3 },
          { kind: "request", id: "r2", label: "니트" },
        ]),
      ),
    ).toEqual([
      { kind: "account", id: "a1", label: "망원 셀렉트샵" },
      { kind: "request", id: "r2", label: "니트" },
    ]);
  });

  it("parses at most 5 items", () => {
    const stored = JSON.stringify(Array.from({ length: 9 }, (_, i) => ({ kind: "account", id: `a${i}`, label: `계정 ${i}` })));
    expect(parseRecent(stored)).toHaveLength(5);
  });
});

describe("highlightParts", () => {
  it("wraps a Hangul substring", () => {
    expect(highlightParts("망원 셀렉트샵", "셀렉트")).toEqual([
      { text: "망원 ", match: false },
      { text: "셀렉트", match: true },
      { text: "샵", match: false },
    ]);
  });

  it("matches case-insensitively and keeps the original case", () => {
    expect(highlightParts("APM 최삼촌", "apm")).toEqual([
      { text: "APM", match: true },
      { text: " 최삼촌", match: false },
    ]);
  });

  it("marks every occurrence", () => {
    expect(highlightParts("니트 니트", "니트").filter((part) => part.match)).toHaveLength(2);
  });

  it("treats the query literally and trims it", () => {
    expect(highlightParts("세트 (1+1)", " (1+1) ")).toEqual([
      { text: "세트 ", match: false },
      { text: "(1+1)", match: true },
    ]);
  });

  it("returns the whole text unmarked for an empty query or no text", () => {
    expect(highlightParts("망원", "")).toEqual([{ text: "망원", match: false }]);
    expect(highlightParts("", "망원")).toEqual([]);
  });
});

describe("matchesQuery", () => {
  it("matches screen labels by substring, ignoring case and the · separator", () => {
    expect(matchesQuery("계정·가입", "계정")).toBe(true);
    expect(matchesQuery("계정·가입", "계정가입")).toBe(true);
    expect(matchesQuery("감사 로그", "감사로그")).toBe(true);
    expect(matchesQuery("랜딩 문의", "요청")).toBe(false);
    expect(matchesQuery("랜딩 문의", "")).toBe(true);
  });
});

describe("parseScope", () => {
  it("accepts the four scopes and defaults to all", () => {
    expect(SEARCH_SCOPES).toEqual(["all", "accounts", "requests", "leads"]);
    expect(parseScope("requests")).toBe("requests");
    expect(parseScope(["leads", "accounts"])).toBe("leads");
    expect(parseScope("nope")).toBe("all");
    expect(parseScope(undefined)).toBe("all");
  });
});
