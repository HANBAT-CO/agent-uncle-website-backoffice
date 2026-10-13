import { describe, expect, it } from "vitest";

import { FILM, FILM_FILES, type Film } from "@/content/media";

import { FRAME_16X9_FROM, WIDE_FROM, pickLoop, pickMaster, pickStill, resolveFilmSources } from "./sources";

const FIXTURE = "/media/film/dev-fixture.mp4";

const READY: Film = {
  ready: true,
  duration: 52,
  chapters: [{ label: "연결", start: 0 }],
  files: { master1080: "/m1080.mp4", master720: "/m720.mp4", social720: "/s720.mp4", loop720: "/l720.mp4", loop1080: "/l1080.mp4" },
};

const NOT_READY: Film = { ready: false, duration: 4, chapters: [{ label: "연결", start: 0 }], files: {} };

describe("resolveFilmSources", () => {
  it("uses the generated files when the film is ready, and the canonical paths for anything missing", () => {
    const sources = resolveFilmSources(READY, FILM_FILES, null);
    expect(sources).toMatchObject({
      kind: "release",
      loop: { wide: "/l1080.mp4", narrow: "/l720.mp4" },
      master: { wide: "/m1080.mp4", narrow: "/m720.mp4" },
      social: "/s720.mp4",
    });
    // film.json omits the posters (WP-03 typing note): they come from FILM_FILES.
    expect(sources?.poster).toBe(FILM_FILES.posterEnd);
    expect(sources?.posterSocial).toBe(FILM_FILES.posterSocialEnd);
    expect(sources?.posterLoop).toBe(FILM_FILES.posterLoop);
    expect(sources?.posterLoopSocial).toBe(FILM_FILES.posterLoopSocial);
    expect(sources?.chapterStills).toEqual(FILM_FILES.chapterStills);
  });

  it("never touches the dev fixture when the film is ready", () => {
    const sources = resolveFilmSources(READY, FILM_FILES, FIXTURE);
    expect(JSON.stringify(sources)).not.toContain("dev-fixture");
  });

  it("plays the dev fixture everywhere before the audited renders exist, only when a fixture is given", () => {
    const sources = resolveFilmSources(NOT_READY, FILM_FILES, FIXTURE);
    expect(sources).toEqual({
      kind: "fixture",
      loop: { wide: FIXTURE, narrow: FIXTURE },
      master: { wide: FIXTURE, narrow: FIXTURE },
      social: FIXTURE,
      poster: null,
      posterSocial: null,
      posterLoop: null,
      posterLoopSocial: null,
      chapterStills: [],
    });
  });

  it("renders no player in production before the film is ready", () => {
    expect(resolveFilmSources(NOT_READY, FILM_FILES, null)).toBeNull();
  });

  it("resolves the shipped film.json to release files", () => {
    const sources = resolveFilmSources(FILM, FILM_FILES, null);
    expect(FILM.ready).toBe(true);
    expect(sources?.kind).toBe("release");
    expect(sources?.master.wide).toBe(FILM_FILES.master1080);
  });
});

describe("pickMaster", () => {
  const sources = resolveFilmSources(READY, FILM_FILES, null);
  if (!sources) throw new Error("ready film must resolve");

  it("plays the 9:16 cut below 768px, the 720 master below 1280px and the 1080 master from 1280px", () => {
    expect(FRAME_16X9_FROM).toBe(768);
    expect(WIDE_FROM).toBe(1280);
    expect(pickMaster(sources, 390)).toBe("/s720.mp4");
    expect(pickMaster(sources, 767)).toBe("/s720.mp4");
    expect(pickMaster(sources, 768)).toBe("/m720.mp4");
    expect(pickMaster(sources, 1279)).toBe("/m720.mp4");
    expect(pickMaster(sources, 1280)).toBe("/m1080.mp4");
    expect(pickMaster(sources, 2560)).toBe("/m1080.mp4");
  });
});

describe("pickLoop", () => {
  const sources = resolveFilmSources(READY, FILM_FILES, null);
  if (!sources) throw new Error("ready film must resolve");

  it("has no loop in the 9:16 frame, the 720 loop below 1280px and the 1080 loop from 1280px", () => {
    expect(pickLoop(sources, 390)).toBeNull();
    expect(pickLoop(sources, 767)).toBeNull();
    expect(pickLoop(sources, 768)).toBe("/l720.mp4");
    expect(pickLoop(sources, 1279)).toBe("/l720.mp4");
    expect(pickLoop(sources, 1280)).toBe("/l1080.mp4");
  });
});

describe("pickStill", () => {
  const sources = resolveFilmSources(READY, FILM_FILES, null);
  if (!sources) throw new Error("ready film must resolve");

  it("takes the poster frame from the loop that plays at this width, and from the 720 loop in the 9:16 frame", () => {
    expect(pickStill(sources, 390)).toBe("/l720.mp4");
    expect(pickStill(sources, 1024)).toBe("/l720.mp4");
    expect(pickStill(sources, 1440)).toBe("/l1080.mp4");
  });
});
