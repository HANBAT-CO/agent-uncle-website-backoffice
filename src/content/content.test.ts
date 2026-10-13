import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { woff2CodePoints } from "../../scripts/fonts/woff2-cmap.mjs";

import * as copy from "./copy";
import { DISPLAY_800, DISPLAY_900 } from "./copy";
import filmJson from "./generated/film.json";
import * as glossary from "./glossary";
import * as legal from "./legal";
import * as media from "./media";
import { APP_CLIPS, APP_STILLS, FILM } from "./media";
import * as storyModule from "./story";
import { BEAT_ORDER, BEATS, RECORDS, SECTION_CHROME, SECTION_DEFAULT_BEAT, SECTION_ORDER, type RecordId } from "./story";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Every string reachable from a module's exports, with its path. Functions are skipped. */
function strings(value: unknown, at: string, out: Array<[string, string]> = []): Array<[string, string]> {
  if (typeof value === "string") out.push([at, value]);
  else if (Array.isArray(value)) value.forEach((item, i) => strings(item, `${at}[${i}]`, out));
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) strings(item, `${at}.${key}`, out);
  }
  return out;
}

const CONTENT: Array<[string, unknown]> = [
  ["copy", copy],
  ["story", storyModule],
  ["glossary", glossary],
  ["legal", legal],
  ["media", media],
  ["film.json", filmJson],
];

const ALL_STRINGS = CONTENT.flatMap(([name, value]) => strings(value, name));

describe("copy guards", () => {
  it("finds the strings it guards", () => {
    expect(ALL_STRINGS.length).toBeGreaterThan(300);
  });

  it("has zero em dashes and zero en dashes", () => {
    const offenders = ALL_STRINGS.filter(([, text]) => /[\u2013\u2014]/.test(text));
    expect(offenders).toEqual([]);
  });

  it.each(["푸시", "결제", "정산", "인증된", "출시일"])("never says %s", (word) => {
    const offenders = ALL_STRINGS.filter(([, text]) => text.includes(word));
    expect(offenders).toEqual([]);
  });

  it("uses typographic quotes only (no ASCII quotes in copy)", () => {
    const offenders = strings(copy, "copy").filter(([, text]) => /['"]/.test(text));
    expect(offenders).toEqual([]);
  });

  it("names no weekday outside the two verbatim 03:06 and 03:07 strings", () => {
    const weekday = /[월화수목금토일]요일/;
    const allowed = /(?:RECORDS\.(r0306|m0307)\.(detail|title)|APP_STILLS\.chatHistoryRecords\.alt)$/;
    const offenders = ALL_STRINGS.filter(([at, text]) => weekday.test(text) && !allowed.test(at));
    expect(offenders).toEqual([]);
  });

  it("uses one label per intent", () => {
    expect(copy.nav.cta.label).toBe("사전 신청");
    expect(copy.hero.ctaPrimary.label).toBe(copy.nav.cta.label);
    expect(copy.signup.submit).toBe(copy.nav.cta.label);
    expect(copy.hero.ctaSecondary.label).toBe("영상 보기");
    expect(copy.film.play).toBe(copy.hero.ctaSecondary.label);
  });

  it("fills template slots", () => {
    expect(copy.fill(copy.receipt.whatIf.ghost, { actual: 1 })).toBe("수령 수량 차이를 알렸어요: 실제 1개 · 기록 2개");
    expect(copy.fill(copy.plate.recordMeta, { time: "03:06" })).toBe("업무 기록 · 03:06");
    expect(copy.fill("{a} {b}", { a: 1 })).toBe("1 {b}");
  });
});

describe("story data matches the spec's data audit (table 0.6)", () => {
  const audit: Record<RecordId, { day: string; time: string; title: string; detail?: string }> = {
    r2005: { day: "10월 10일", time: "20:05", title: "새 사입 요청을 보냈어요" },
    r2031: { day: "10월 10일", time: "20:31", title: "요청을 수락했어요" },
    r0216: {
      day: "10월 11일",
      time: "02:16",
      title: "확보 5개 · 미송 3개 결과를 공유했어요",
      detail: "오트밀 3장은 아침 입고분으로 다시 확인해요.",
    },
    r0306: {
      day: "10월 11일",
      time: "03:06",
      title: "확보 2개 · 미송 4개 결과를 공유했어요",
      detail: "연청 27은 월요일 재입고 예정이에요.",
    },
    m0307: {
      day: "10월 11일",
      time: "03:07",
      title: "데님 연청 27은 2장만 있어서 먼저 챙겼어요. 남은 4장은 월요일 재입고래요.",
    },
    r0553a: { day: "10월 11일", time: "05:53", title: "2개 전달을 기록했어요" },
    r0553b: { day: "10월 11일", time: "05:53", title: "5개 전달을 기록했어요" },
    r0849: { day: "10월 11일", time: "08:49", title: "2개 수령을 확인했어요" },
  };

  it.each(Object.keys(audit) as RecordId[])("%s has the audited day, time, title and detail", (id) => {
    const { day, time, title, detail } = RECORDS[id];
    expect({ day, time, title, ...(detail ? { detail } : {}) }).toEqual(audit[id]);
  });

  it("marks exactly r0306, r0553a and r0849 as ledger moves", () => {
    const moving = (Object.keys(RECORDS) as RecordId[]).filter((id) => RECORDS[id].movesLedger);
    expect(moving.sort()).toEqual(["r0306", "r0553a", "r0849"]);
  });

  it("keeps the cardigan records and the bubble off the denim ledger", () => {
    expect(RECORDS.r0216.request).toBe("cardigan");
    expect(RECORDS.r0553b.request).toBe("cardigan");
    expect(RECORDS.m0307.kind).toBe("message");
  });

  it("matches the beat table (spec 3.3)", () => {
    const table = {
      b2200: ["22:00", "night", [6, 0, 0, 0], ["미확인", 6], "진행 중", ["r2005", "r2031"]],
      b2330: ["23:30", "night", [6, 0, 0, 0], ["미확인", 6], "진행 중", []],
      b0216: ["02:16", "night", [6, 0, 0, 0], ["미확인", 6], "진행 중", ["r0216"]],
      b0306: ["03:06", "night", [6, 2, 0, 0], ["남은 미송", 4], "답변 필요", ["r0306"]],
      b0307: ["03:07", "night", [6, 2, 0, 0], ["남은 미송", 4], "답변 필요", ["m0307"]],
      b0553: ["05:53", "night", [6, 2, 2, 0], ["남은 미송", 4], "답변 필요", ["r0553a", "r0553b"]],
      b0553d: ["05:53", "day", [6, 2, 2, 0], ["남은 미송", 4], "답변 필요", []],
      b0849: ["08:49", "day", [6, 2, 2, 2], ["남은 미송", 4], "답변 필요", ["r0849"]],
      b0941: ["09:41", "day", [6, 2, 2, 2], ["남은 미송", 4], "답변 필요", []],
      bnow: ["now", "day", [6, 2, 2, 2], ["남은 미송", 4], "답변 필요", []],
    } as const;
    expect(Object.keys(table)).toEqual([...BEAT_ORDER]);
    for (const id of BEAT_ORDER) {
      const [clock, phase, numbers, [restLabel, rest], status, adds] = table[id];
      const beat = BEATS[id];
      const { requested, secured, delivered, received, unconfirmed, backorder } = beat.ledger;
      expect([beat.clock, beat.phase, beat.ledger.status, beat.adds]).toEqual([clock, phase, status, adds]);
      expect([requested, secured, delivered, received]).toEqual(numbers);
      expect(restLabel === "미확인" ? unconfirmed : backorder).toBe(rest);
    }
  });

  it("matches the section defaults (spec 3.3) and chrome modes (spec 3.4)", () => {
    expect(SECTION_ORDER).toEqual(["hero", "words", "route", "cart", "dawn", "receipt", "roles", "trust", "film", "signup", "footer"]);
    expect(SECTION_DEFAULT_BEAT).toEqual({
      hero: "b2200",
      words: "b2330",
      route: "b2330",
      cart: "b0307",
      dawn: "b0307",
      receipt: "b0553d",
      roles: "b0941",
      trust: "b0941",
      film: "b0941",
      signup: "bnow",
      footer: "bnow",
    });
    const night = { rail: "open", plate: "full", pill: "show" };
    expect(SECTION_CHROME).toEqual({
      hero: night,
      words: night,
      route: night,
      cart: night,
      dawn: night,
      receipt: night,
      roles: { rail: "spine", plate: "compact", pill: "show" },
      trust: { rail: "spine", plate: "hidden", pill: "hidden" },
      film: { rail: "hidden", plate: "hidden", pill: "hidden" },
      signup: { rail: "open", plate: "full", pill: "hidden" },
      footer: { rail: "pill", plate: "hidden", pill: "hidden" },
    });
  });

  it("labels the denim the way the app does", () => {
    expect(storyModule.DENIM_LABEL).toBe("와이드 데님 팬츠 · 연청 · 27");
    expect(copy.plate.item).toBe(storyModule.DENIM_LABEL);
  });
});

describe("glossary", () => {
  it("has a gloss for every vocabulary pill, in pill order", () => {
    expect(glossary.VOCAB.map((entry) => entry.term)).toEqual([...copy.words.vocab]);
    for (const term of copy.words.vocabMobile) expect(glossary.glossFor(term)).toMatch(/요\.$/);
  });

  it("has a tooltip for every plate label", () => {
    expect(Object.keys(glossary.PLATE_TOOLTIPS).sort()).toEqual(Object.keys(copy.plate.labels).sort());
  });
});

describe("legal", () => {
  it("lists the two launch blockers", () => {
    expect(legal.LEGAL_BLOCKERS.map((blocker) => blocker.id)).toEqual(["company-name", "retention"]);
    expect(legal.CONSENT.items.at(-1)?.value).toBe(legal.RETENTION_DEFAULT);
  });
});

describe("media manifest (spec 11)", () => {
  it("encodes the clips at 720x1564 with the trimmed durations", () => {
    expect(Object.values(APP_CLIPS).map(({ id, width, height, duration }) => [id, width, height, duration])).toEqual([
      ["retailerDenimDetail", 720, 1564, 17.62],
      ["uncleHome", 720, 1564, 16.72],
      ["chatHistory", 720, 1564, 9.1],
    ]);
    for (const clip of Object.values(APP_CLIPS)) {
      expect(clip.webm).toMatch(/^\/media\/app\/[a-z-]+\.webm$/);
      expect(clip.mp4).toBe(clip.webm.replace(/\.webm$/, ".mp4"));
      expect(APP_STILLS[clip.poster]).toBeDefined();
    }
  });

  it("keeps the 1320:2868 aspect in the stills (540x1173, 1080x2347)", () => {
    expect(media.stillHeight(540)).toBe(1173);
    expect(media.stillHeight(1080)).toBe(2347);
    for (const still of Object.values(APP_STILLS)) {
      expect(still.variants.map((v) => [v.width, v.height])).toEqual([
        [540, 1173],
        [1080, 2347],
      ]);
      expect(still.variants[0].avif).toMatch(/^\/media\/app\/[a-z0-9-]+-540\.avif$/);
    }
    expect(APP_STILLS.retailerHome0941.variants[1].webp).toBe("/media/app/retailer-home-0941-1080.webp");
  });

  it("lists the chat history records still for the trust section", () => {
    expect(APP_STILLS.chatHistoryRecords.variants.map((v) => [v.width, v.height, v.avif, v.webp])).toEqual([
      [540, 1173, "/media/app/chat-history-records-540.avif", "/media/app/chat-history-records-540.webp"],
      [1080, 2347, "/media/app/chat-history-records-1080.avif", "/media/app/chat-history-records-1080.webp"],
    ]);
    expect(APP_STILLS.chatHistoryRecords.alt).toContain("20:31");
    expect(APP_STILLS.chatHistoryRecords.alt).toContain("02:16");
    expect(APP_STILLS.chatHistoryRecords.alt).toContain("03:06");
    expect(APP_STILLS.chatHistoryRecords.alt).toContain("03:07");
    expect(APP_STILLS.chatHistoryRecords.alt).toContain("05:53");
    expect(APP_STILLS.chatHistoryRecords.alt).toContain("데님");
  });

  it("lists the loop poster frames for the film pre-play states", () => {
    expect(media.FILM_FILES.posterLoop.variants.map((v) => [v.width, v.height, v.avif, v.webp])).toEqual([
      [800, 450, "/media/film/poster-loop-800.avif", "/media/film/poster-loop-800.webp"],
      [1600, 900, "/media/film/poster-loop-1600.avif", "/media/film/poster-loop-1600.webp"],
    ]);
    expect(media.FILM_FILES.posterLoop.alt).toContain("깊은 초록 격자");
    expect(media.FILM_FILES.posterLoop.alt).toContain("요청 10 · 확보 0 · 전달 0 · 수령 0");

    expect(media.FILM_FILES.posterLoopSocial.variants.map((v) => [v.width, v.height, v.avif, v.webp])).toEqual([
      [540, 960, "/media/film/poster-9x16-loop-540.avif", "/media/film/poster-9x16-loop-540.webp"],
      [1080, 1920, "/media/film/poster-9x16-loop-1080.avif", "/media/film/poster-9x16-loop-1080.webp"],
    ]);
    expect(media.FILM_FILES.posterLoopSocial.alt).toContain("세로 화면");
    expect(media.FILM_FILES.posterLoopSocial.alt).toContain("요청 10 · 확보 0 · 전달 0 · 수령 0");
  });

  it("reads the film manifest with eight chapters in timeline order", () => {
    expect(FILM.chapters.map((chapter) => chapter.label)).toEqual(copy.film.chapters);
    const starts = FILM.chapters.map((chapter) => chapter.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(starts.at(-1)).toBeLessThan(FILM.duration);
  });
});

describe("display font subsets (spec 4.2)", () => {
  const cases = [
    { weight: 800, strings: DISPLAY_800 },
    { weight: 900, strings: DISPLAY_900 },
  ] as const;

  it("puts the H1 and every H2 in DISPLAY_800", () => {
    const headings = [
      copy.hero.h1,
      copy.hero.h1Mobile,
      copy.words.h2,
      copy.route.h2,
      copy.cart.h2,
      copy.dawn.h2,
      copy.receipt.h2,
      copy.roles.h2,
      copy.trust.h2,
      copy.film.h2,
      copy.signup.h2,
    ].flat();
    for (const line of headings) expect(DISPLAY_800).toContain(line);
  });

  it("puts the wordmark, digits, ≤ and 장 in DISPLAY_900", () => {
    expect(DISPLAY_900.join("")).toContain("사입삼춘.");
    for (const ch of "0123456789≤장") expect(DISPLAY_900.join("")).toContain(ch);
  });

  it.each(cases)("subset $weight has a glyph for every display character", ({ weight, strings: lines }) => {
    const font = readFileSync(path.join(root, `src/app/fonts/paperlogy-${weight}-display.woff2`));
    const mapped = woff2CodePoints(font);
    const missing = [...new Set(lines.join(""))].filter((ch) => !mapped.has(ch.codePointAt(0) ?? -1));
    expect(missing, `run npm run fonts:display (missing: ${missing.join("")})`).toEqual([]);
  });

  it.each(cases)("the $weight character list (scripts/fonts) has every display character", ({ weight, strings: lines }) => {
    const listed = new Set(readFileSync(path.join(root, `scripts/fonts/display-${weight}.txt`), "utf8"));
    const missing = [...new Set(lines.join(""))].filter((ch) => !listed.has(ch));
    expect(missing, "run npm run fonts:display").toEqual([]);
  });
});
