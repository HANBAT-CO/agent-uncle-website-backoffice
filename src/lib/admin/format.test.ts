import { describe, expect, it } from "vitest";

import { bytes, dday, formatKst, formatKstStamp, formatRelative, formatSince, isKstDay, kstDayRange, kstToday, qty } from "./format";

const NOW = new Date("2026-10-13T03:00:00.000Z"); // 12:00 KST

describe("formatKst", () => {
  it("renders KST month, day and time", () => {
    expect(formatKst("2026-10-12T17:05:00Z", { now: NOW })).toBe("10월 13일 02:05");
  });

  it("returns '-' for empty or invalid values", () => {
    expect(formatKst(null)).toBe("-");
    expect(formatKst(undefined)).toBe("-");
    expect(formatKst("")).toBe("-");
    expect(formatKst("not a date")).toBe("-");
  });

  it("adds the year when it is not the current KST year", () => {
    // 2025-12-31 16:30 UTC is already 2026-01-01 in KST, so no year.
    expect(formatKst("2025-12-31T16:30:00Z", { now: NOW })).toBe("1월 1일 01:30");
    expect(formatKst("2025-06-01T00:00:00Z", { now: NOW })).toBe("2025년 6월 1일 09:00");
    expect(formatKst("2026-06-01T00:00:00Z", { now: NOW, withYear: "always" })).toBe("2026년 6월 1일 09:00");
  });

  it("can drop the time", () => {
    expect(formatKst("2026-10-12T17:05:00Z", { now: NOW, time: false })).toBe("10월 13일");
  });

  it("accepts plain KST days", () => {
    expect(formatKst("2026-10-15", { now: NOW, time: false })).toBe("10월 15일");
  });
});

describe("formatKstStamp", () => {
  it("writes a spreadsheet-friendly KST stamp", () => {
    expect(formatKstStamp("2026-10-12T17:05:00Z")).toBe("2026-10-13 02:05");
    expect(formatKstStamp(null)).toBe("");
    expect(formatKstStamp("nope")).toBe("");
  });
});

describe("formatRelative", () => {
  it("reads 방금 within a minute", () => {
    expect(formatRelative("2026-10-13T02:59:30Z", NOW)).toBe("방금");
  });

  it("reads minutes, hours and days ago", () => {
    expect(formatRelative("2026-10-13T02:45:00Z", NOW)).toBe("15분 전");
    expect(formatRelative("2026-10-12T15:00:00Z", NOW)).toBe("12시간 전");
    expect(formatRelative("2026-10-10T03:00:00Z", NOW)).toBe("3일 전");
  });

  it("reads the future as 후", () => {
    expect(formatRelative("2026-10-13T05:00:00Z", NOW)).toBe("2시간 후");
  });

  it("returns '-' for null", () => {
    expect(formatRelative(null, NOW)).toBe("-");
  });
});

describe("formatSince", () => {
  it("reads hours and days elapsed", () => {
    expect(formatSince("2026-10-12T22:00:00Z", NOW)).toBe("5시간째");
    expect(formatSince("2026-10-10T03:00:00Z", NOW)).toBe("3일째");
    expect(formatSince("2026-10-13T02:50:00Z", NOW)).toBe("1시간째");
    expect(formatSince(null, NOW)).toBe("-");
  });
});

describe("KST days", () => {
  it("kstDayRange gives the UTC bounds of a KST day", () => {
    expect(kstDayRange("2026-10-13")).toEqual({ from: "2026-10-12T15:00:00.000Z", to: "2026-10-13T15:00:00.000Z" });
  });

  it("kstDayRange crosses month and year ends", () => {
    expect(kstDayRange("2026-12-31")).toEqual({ from: "2026-12-30T15:00:00.000Z", to: "2026-12-31T15:00:00.000Z" });
    expect(kstDayRange("2026-03-01")).toEqual({ from: "2026-02-28T15:00:00.000Z", to: "2026-03-01T15:00:00.000Z" });
  });

  it("kstDayRange refuses malformed days", () => {
    expect(() => kstDayRange("2026-13-01")).toThrow(RangeError);
    expect(() => kstDayRange("2026-02-30")).toThrow(RangeError);
    expect(() => kstDayRange("13 Oct")).toThrow(RangeError);
  });

  it("isKstDay validates YYYY-MM-DD calendar days", () => {
    expect(isKstDay("2026-10-13")).toBe(true);
    expect(isKstDay("2026-02-29")).toBe(false);
    expect(isKstDay("2028-02-29")).toBe(true);
    expect(isKstDay("")).toBe(false);
  });

  it("kstToday follows the KST calendar, not UTC", () => {
    expect(kstToday(new Date("2026-10-12T15:30:00.000Z"))).toBe("2026-10-13");
    expect(kstToday(new Date("2026-10-12T14:59:59.000Z"))).toBe("2026-10-12");
  });
});

describe("units", () => {
  it("qty puts the number first", () => {
    expect(qty(2, "장")).toBe("2장");
    expect(qty(4, "회차")).toBe("4회차");
    expect(qty(12345, "건")).toBe("12,345건");
  });

  it("bytes", () => {
    expect(bytes(512)).toBe("512B");
    expect(bytes(2048)).toBe("2KB");
    expect(bytes(12.3 * 1024 * 1024)).toBe("12.3MB");
    expect(bytes(0)).toBe("0B");
  });
});

describe("dday", () => {
  it("reads past days as 지남 in the attention tone", () => {
    expect(dday(-3)).toEqual({ label: "3일 지남", tone: "attention" });
  });

  it("reads today and future days", () => {
    expect(dday(0)).toEqual({ label: "오늘", tone: "normal" });
    expect(dday(2)).toEqual({ label: "2일 남음", tone: "neutral" });
  });

  it("returns null without a date", () => {
    expect(dday(null)).toBeNull();
  });
});
