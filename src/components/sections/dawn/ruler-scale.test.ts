import { describe, expect, it } from "vitest";

import { dawn } from "@/content/copy";

import {
  RULER_HOURS,
  centerOffset,
  eventMarks,
  formatClock,
  hourTicks,
  parseClock,
  rulerHours,
  rulerX,
  timeAtPlayhead,
  type RulerScale,
} from "./ruler-scale";

/** Every minute from 20:00 to 11:00 in ruler order (crossing midnight). */
function everyRulerMinute(): string[] {
  const times: string[] = [];
  for (let minute = 0; minute <= RULER_HOURS * 60; minute += 1) {
    times.push(formatClock((20 * 60 + minute) % (24 * 60)));
  }
  return times;
}

describe("parseClock", () => {
  it("reads HH:MM as minutes since midnight", () => {
    expect(parseClock("00:00")).toBe(0);
    expect(parseClock("05:53")).toBe(353);
    expect(parseClock("20:05")).toBe(1205);
    expect(parseClock("23:59")).toBe(1439);
  });

  it.each(["5:53", "24:00", "12:60", "ab:cd", "05:5", "05-53", ""])("rejects %j", (value) => {
    expect(() => parseClock(value)).toThrow(RangeError);
  });

  it("round-trips through formatClock", () => {
    for (let minute = 0; minute < 24 * 60; minute += 7) {
      expect(parseClock(formatClock(minute))).toBe(minute);
    }
    expect(formatClock(353)).toBe("05:53");
    expect(formatClock(24 * 60 + 5)).toBe("00:05");
  });
});

describe("rulerHours (20:00 to 11:00, crossing midnight)", () => {
  it("starts at 20:00 and ends at 11:00", () => {
    expect(rulerHours("20:00")).toBe(0);
    expect(rulerHours("11:00")).toBe(RULER_HOURS);
    expect(RULER_HOURS).toBe(15);
  });

  it("keeps counting across midnight", () => {
    expect(rulerHours("23:30")).toBe(3.5);
    expect(rulerHours("00:00")).toBe(4);
    expect(rulerHours("05:53")).toBeCloseTo(9 + 53 / 60, 10);
    expect(rulerHours("23:59")).toBeLessThan(rulerHours("00:00"));
    expect(rulerHours("00:00")).toBeLessThan(rulerHours("00:01"));
  });

  it("is strictly increasing minute by minute over the whole night", () => {
    const hours = everyRulerMinute().map(rulerHours);
    for (let i = 1; i < hours.length; i += 1) {
      expect(hours[i]).toBeGreaterThan(hours[i - 1]);
    }
  });

  it.each(["11:01", "12:00", "15:30", "19:59"])("refuses %s (outside the night)", (value) => {
    expect(() => rulerHours(value)).toThrow(RangeError);
  });

  it("orders the page's event marks the way the night happened", () => {
    const hours = dawn.ruler.marks.map(rulerHours);
    expect(hours).toEqual([...hours].sort((a, b) => a - b));
    expect(new Set(hours).size).toBe(hours.length);
  });
});

describe("positions and the centre playhead", () => {
  const scale: RulerScale = { pxPerHour: 60, origin: 10 };

  it("maps a time to x on the track", () => {
    expect(rulerX("20:00", scale)).toBe(10);
    expect(rulerX("00:00", scale)).toBe(250);
    expect(rulerX("05:53", scale)).toBeCloseTo(10 + 593, 10);
  });

  it("translates the track so the time sits under the playhead", () => {
    const playheadX = 480;
    for (const time of everyRulerMinute()) {
      expect(rulerX(time, scale) + centerOffset(time, scale, playheadX)).toBeCloseTo(playheadX, 9);
    }
    expect(centerOffset("05:53", scale, playheadX)).toBeCloseTo(480 - 603, 9);
  });

  it("reads back the time under the playhead from a translation, across midnight", () => {
    for (const time of everyRulerMinute()) {
      expect(timeAtPlayhead(centerOffset(time, scale, 333), scale, 333)).toBe(time);
    }
  });

  it("moves the track left as the night goes on", () => {
    expect(centerOffset("05:53", scale, 400)).toBeLessThan(centerOffset("03:07", scale, 400));
  });
});

describe("hourTicks", () => {
  const ticks = hourTicks(dawn.ruler.labels);

  it("has one tick per hour from 20 to 11", () => {
    expect(ticks).toHaveLength(16);
    expect(ticks[0]).toMatchObject({ time: "20:00", at: 0 });
    expect(ticks.at(-1)).toMatchObject({ time: "11:00", at: 15 });
    expect(ticks.map((tick) => tick.at)).toEqual(Array.from({ length: 16 }, (_, i) => i));
    expect(ticks.find((tick) => tick.time === "00:00")?.at).toBe(4);
  });

  it("labels exactly the copy's hours, in order", () => {
    const labelled = ticks.filter((tick) => tick.label !== null);
    expect(labelled.map((tick) => tick.label)).toEqual([...dawn.ruler.labels]);
    expect(labelled.map((tick) => tick.time)).toEqual(["20:00", "22:00", "00:00", "02:00", "04:00", "06:00", "08:00", "10:00"]);
    expect(ticks.find((tick) => tick.time === "11:00")?.label).toBeNull();
  });

  it("refuses a label that is not an hour of the night", () => {
    expect(() => hourTicks(["13"])).toThrow(RangeError);
    expect(() => hourTicks(["7"])).toThrow(RangeError);
  });
});

describe("eventMarks", () => {
  it("places the marks on the ruler in time order", () => {
    const marks = eventMarks(["05:53", "20:31", "03:06", "20:05", "02:16"]);
    expect(marks.map((mark) => mark.time)).toEqual(["20:05", "20:31", "02:16", "03:06", "05:53"]);
    for (const mark of marks) expect(mark.at).toBeCloseTo(rulerHours(mark.time), 12);
  });

  it("never puts two close labels on the same row", () => {
    const minGap = 1.1;
    const marks = eventMarks(dawn.ruler.marks, minGap);
    for (let i = 1; i < marks.length; i += 1) {
      if (marks[i].at - marks[i - 1].at < minGap) expect(marks[i].row).not.toBe(marks[i - 1].row);
    }
    expect(marks.map((mark) => mark.row)).toEqual([0, 1, 0, 1, 0]);
  });

  it("returns to the first row once there is room", () => {
    expect(eventMarks(["20:00", "23:00", "02:00"]).map((mark) => mark.row)).toEqual([0, 0, 0]);
  });
});
