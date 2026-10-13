import { describe, expect, it } from "vitest";

import { film } from "@/content/copy";
import { FILM, type FilmChapter } from "@/content/media";

import { activeChapter, chapterTicks, playheadPercent, seekTarget } from "./chapters";

const DURATION = 52;
const CHAPTERS: FilmChapter[] = [
  { label: "연결", start: 0 },
  { label: "요청", start: 6.5 },
  { label: "수락", start: 13 },
  { label: "확보", start: 17 },
  { label: "미송", start: 21.9 },
  { label: "전달", start: 31.5 },
  { label: "수령", start: 37.5 },
  { label: "기록", start: 42.5 },
];

describe("chapterTicks", () => {
  it("places every chapter at its start as a percent of the duration", () => {
    const ticks = chapterTicks(CHAPTERS, DURATION);
    expect(ticks.map((tick) => tick.label)).toEqual(["연결", "요청", "수락", "확보", "미송", "전달", "수령", "기록"]);
    expect(ticks[0].percent).toBe(0);
    expect(ticks[1].percent).toBeCloseTo(12.5, 6);
    expect(ticks[3].percent).toBeCloseTo((17 / 52) * 100, 6);
    expect(ticks.every((tick, index) => tick.index === index)).toBe(true);
  });

  it("orders chapters by start time whatever order they arrive in", () => {
    const shuffled = [CHAPTERS[5], CHAPTERS[0], CHAPTERS[7], CHAPTERS[2], CHAPTERS[1], CHAPTERS[6], CHAPTERS[3], CHAPTERS[4]];
    const ticks = chapterTicks(shuffled, DURATION);
    expect(ticks.map((tick) => tick.start)).toEqual([0, 6.5, 13, 17, 21.9, 31.5, 37.5, 42.5]);
    for (let index = 1; index < ticks.length; index += 1) {
      expect(ticks[index].percent).toBeGreaterThan(ticks[index - 1].percent);
    }
  });

  it("ends each chapter where the next begins and the last one at the end of the film", () => {
    const ticks = chapterTicks(CHAPTERS, DURATION);
    for (let index = 0; index < ticks.length - 1; index += 1) {
      expect(ticks[index].end).toBe(ticks[index + 1].start);
    }
    expect(ticks.at(-1)?.end).toBe(DURATION);
  });

  it("rejects chapters that cannot sit on the timeline", () => {
    expect(() => chapterTicks([{ label: "연결", start: 0 }, { label: "요청", start: 0 }], DURATION)).toThrow(/same start/);
    expect(() => chapterTicks([{ label: "연결", start: -1 }], DURATION)).toThrow(/outside/);
    expect(() => chapterTicks([{ label: "기록", start: 52 }], DURATION)).toThrow(/outside/);
    expect(() => chapterTicks(CHAPTERS, 0)).toThrow(/duration/);
    expect(() => chapterTicks(CHAPTERS, Number.NaN)).toThrow(/duration/);
  });

  it("matches the generated film data and the page copy", () => {
    const ticks = chapterTicks(FILM.chapters, FILM.duration);
    expect(ticks.map((tick) => tick.label)).toEqual([...film.chapters]);
    expect(FILM.files.chapterStills?.length ?? ticks.length).toBe(ticks.length);
  });
});

describe("activeChapter", () => {
  const ticks = chapterTicks(CHAPTERS, DURATION);

  it("finds the chapter that contains a time, starts inclusive", () => {
    expect(activeChapter(ticks, 0)).toBe(0);
    expect(activeChapter(ticks, 6.49)).toBe(0);
    expect(activeChapter(ticks, 6.5)).toBe(1);
    expect(activeChapter(ticks, 17)).toBe(3);
    expect(activeChapter(ticks, 21.89)).toBe(3);
    expect(activeChapter(ticks, 30)).toBe(4);
  });

  it("keeps the last chapter through the end of the film and past it", () => {
    expect(activeChapter(ticks, 42.5)).toBe(7);
    expect(activeChapter(ticks, 51.99)).toBe(7);
    expect(activeChapter(ticks, DURATION)).toBe(7);
    expect(activeChapter(ticks, 600)).toBe(7);
  });

  it("returns -1 before the first chapter, for unknown times and without chapters", () => {
    const late = chapterTicks([{ label: "요청", start: 5 }], DURATION);
    expect(activeChapter(late, 4.99)).toBe(-1);
    expect(activeChapter(ticks, -0.01)).toBe(-1);
    expect(activeChapter(ticks, Number.NaN)).toBe(-1);
    expect(activeChapter([], 10)).toBe(-1);
  });
});

describe("seekTarget", () => {
  const ticks = chapterTicks(CHAPTERS, DURATION);

  it("seeks to the chapter start", () => {
    expect(seekTarget(ticks, 0)).toBe(0);
    expect(seekTarget(ticks, 3)).toBe(17);
    expect(seekTarget(ticks, 7)).toBe(42.5);
  });

  it("clamps indexes outside the list to the first and last chapter", () => {
    expect(seekTarget(ticks, -3)).toBe(0);
    expect(seekTarget(ticks, 8)).toBe(42.5);
    expect(seekTarget(ticks, 99)).toBe(42.5);
    expect(seekTarget(ticks, 2.7)).toBe(13);
  });

  it("starts from 0 when there are no chapters", () => {
    expect(seekTarget([], 4)).toBe(0);
  });
});

describe("playheadPercent", () => {
  it("maps time to a percent of the duration, clamped to the film", () => {
    expect(playheadPercent(0, DURATION)).toBe(0);
    expect(playheadPercent(26, DURATION)).toBe(50);
    expect(playheadPercent(52, DURATION)).toBe(100);
    expect(playheadPercent(80, DURATION)).toBe(100);
    expect(playheadPercent(-2, DURATION)).toBe(0);
  });

  it("reads unknown times and durations as the start", () => {
    expect(playheadPercent(Number.NaN, DURATION)).toBe(0);
    expect(playheadPercent(10, 0)).toBe(0);
    expect(playheadPercent(10, Number.POSITIVE_INFINITY)).toBe(0);
  });
});
