import { describe, expect, it } from "vitest";

import { getMapView } from "@/components/map/views";

import { DRAW_DURATION_S, drawPlan, drawTotal, INTRO, introSchedule, SECONDS_PER_WORLD_UNIT } from "./draw-plan";

const view = getMapView("hero-desktop");
const plan = drawPlan(view);

describe("drawPlan (hero draw-in, spec S1)", () => {
  it("staggers at 40ms per 10 world units", () => {
    expect(SECONDS_PER_WORLD_UNIT).toBeCloseTo(0.004, 9);
  });

  it("starts at 청평화 and reaches every building by distance", () => {
    const delay = (id: string) => plan.buildings.find((step) => step.id === id)?.delay;
    expect(delay("cheongpyeonghwa")).toBe(0);
    // Footprint centres: 청평화 (85, 32), 디오트 (126, 13), APM (28, 71), 남평화 (148, 72).
    expect(delay("diot")).toBeCloseTo(Math.hypot(41, 19) * 0.004, 3);
    expect(delay("apm")).toBeCloseTo(Math.hypot(57, 39) * 0.004, 3);
    expect(delay("nampyeonghwa")).toBeCloseTo(Math.hypot(63, 40) * 0.004, 3);
    const order = [...plan.buildings].sort((a, b) => a.delay - b.delay).map((step) => step.id);
    expect(order).toEqual(["cheongpyeonghwa", "diot", "apm", "nampyeonghwa"]);
  });

  it("covers both stream lines and both roads", () => {
    expect(plan.lines.filter((line) => line.kind === "stream").map((line) => line.index)).toEqual([0, 1]);
    expect(plan.lines.filter((line) => line.kind === "road").map((line) => line.name).sort()).toEqual(["avenue", "north"]);
  });

  it("draws each line outward from its point nearest to 청평화", () => {
    const line = (kind: "stream" | "road", key: number | string) =>
      plan.lines.find((entry) => (entry.kind === "stream" ? entry.index === key : entry.name === key));
    // The north road runs along y = 0 (world): 청평화's centre is 32 units off it.
    expect(line("road", "north")?.delay).toBeCloseTo(32 * 0.004, 2);
    // The avenue runs along x = 46: 39 units.
    expect(line("road", "avenue")?.delay).toBeCloseTo(39 * 0.004, 2);
    // The stream lines run along y = 50 and y = 55: 18 and 23 units.
    expect(line("stream", 0)?.delay).toBeCloseTo(18 * 0.004, 2);
    expect(line("stream", 1)?.delay).toBeCloseTo(23 * 0.004, 2);
    for (const entry of plan.lines) {
      expect(entry.from).toBeGreaterThan(0.2);
      expect(entry.from).toBeLessThan(0.8);
    }
  });

  it("finishes the last stroke within the draw budget", () => {
    const latest = Math.max(...plan.buildings.map((step) => step.delay), ...plan.lines.map((line) => line.delay));
    expect(drawTotal(plan)).toBeCloseTo(latest + DRAW_DURATION_S, 6);
    expect(drawTotal(plan)).toBeLessThan(1.4);
  });

  it("is plain data a Server Component can pass to a client leaf", () => {
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
  });
});

describe("introSchedule (what follows the strokes)", () => {
  const total = drawTotal(plan);
  const schedule = introSchedule(total);

  it("fades the floor ticks in last, as the strokes finish", () => {
    expect(schedule.ticks).toBeLessThan(total);
    expect(schedule.ticks + INTRO.tickFade).toBeGreaterThanOrEqual(total);
  });

  it("lights the dot after the strokes, then the lens and the record cards", () => {
    expect(schedule.dot).toBeGreaterThanOrEqual(total);
    expect(schedule.lens).toBeGreaterThan(schedule.dot);
    expect(schedule.cards).toBeGreaterThan(schedule.dot);
  });

  it("ends when the second record card has landed", () => {
    expect(schedule.end).toBeCloseTo(schedule.cards + INTRO.cardSpring + INTRO.cardStagger, 6);
    expect(schedule.end).toBeGreaterThanOrEqual(schedule.lens + INTRO.lensFade);
  });

  it("never schedules before the start", () => {
    const quick = introSchedule(0.05);
    for (const value of Object.values(quick)) expect(value).toBeGreaterThanOrEqual(0);
  });
});
