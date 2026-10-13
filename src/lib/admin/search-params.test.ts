import { describe, expect, it } from "vitest";
import { createLoader } from "nuqs/server";

import { dateRangeParsers, pageParsers, toOffset } from "./search-params";

const load = createLoader({ ...pageParsers, ...dateRangeParsers });

describe("pageParsers", () => {
  it("defaults", () => {
    expect(load("")).toEqual({ page: 1, size: 50, q: "", sort: "", demo: false, view: "", from: null, to: null });
  });

  it("parses a pasted link", () => {
    expect(load("?page=3&size=100&q=%EB%8B%88%ED%8A%B8&sort=created_asc&demo=true&view=attention&from=2026-10-01&to=2026-10-13")).toEqual({
      page: 3,
      size: 100,
      q: "니트",
      sort: "created_asc",
      demo: true,
      view: "attention",
      from: "2026-10-01",
      to: "2026-10-13",
    });
  });

  it("rejects page sizes outside 50, 100 and 200", () => {
    expect(load("?size=75").size).toBe(50);
    expect(load("?size=200").size).toBe(200);
  });

  it("rejects malformed days and pages", () => {
    expect(load("?from=2026-13-01&to=yesterday")).toMatchObject({ from: null, to: null });
    expect(load("?page=abc").page).toBe(1);
  });
});

describe("toOffset", () => {
  it("converts 1-based pages", () => {
    expect(toOffset(1, 50)).toBe(0);
    expect(toOffset(3, 100)).toBe(200);
    expect(toOffset(0, 50)).toBe(0);
    expect(toOffset(-2, 50)).toBe(0);
  });
});
