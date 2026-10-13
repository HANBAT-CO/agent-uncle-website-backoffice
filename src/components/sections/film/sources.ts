/**
 * Which film files the S9 player uses (spec S9, 11). Pure; resolved on the
 * server in index.tsx so only the chosen paths reach the client.
 *
 * - release: FILM.ready is true (the audited green renders exist). Paths come
 *   from film.json `files`, falling back to the canonical FILM_FILES (the
 *   posters always come from FILM_FILES: film.json omits them, see WP-03).
 * - fixture: next dev only, before the renders exist. Every video source is a
 *   4-second #0C483E clip and there are no posters or chapter stills.
 * - null: a production build before the film is ready. The section renders
 *   its non-shipping state (the dot opening onto the plain field, no player)
 *   and the release gate in WP-20 blocks the deploy.
 */

import type { Film, FilmFiles, Poster } from "@/content/media";

export type FilmSources = {
  kind: "release" | "fixture";
  /** Muted brand-palette loop for the 16:9 frame: 1080p from WIDE_FROM, else 720p. */
  loop: { wide: string; narrow: string };
  /** 16:9 master with sound: 1080p from WIDE_FROM, else 720p. */
  master: { wide: string; narrow: string };
  /** 9:16 cut with sound for the frame below FRAME_16X9_FROM. */
  social: string;
  /** Last frame of the master (16:9), or null when there is none yet. Shown only right after the master ends. */
  poster: Poster | null;
  /** Last frame of the 9:16 cut, or null when there is none yet. Shown only right after the 9:16 cut ends. */
  posterSocial: Poster | null;
  /** The 16:9 loop at STILL_AT: it matches the still before the loop decodes and under Save-Data. */
  posterLoop: Poster | null;
  /** Centre cover crop of the loop at STILL_AT: the phones' stand-in on the same terms. */
  posterLoopSocial: Poster | null;
  /** chapter-{i}-480.avif in chapter order; empty when there are none yet. */
  chapterStills: string[];
};

/** Viewport width (CSS px) from which the frame is 16:9; below it the 9:16 cut plays. */
export const FRAME_16X9_FROM = 768;
/** Viewport width (CSS px) from which the 1080p files play. */
export const WIDE_FROM = 1280;

/**
 * The dev fixture path, only in `next dev`. In a production build this
 * constant folds to null and the string is dropped, so the fixture is never
 * referenced there.
 */
export const DEV_FIXTURE: string | null =
  process.env.NODE_ENV === "development" ? "/media/film/dev-fixture.mp4" : null;

export function resolveFilmSources(film: Film, canonical: FilmFiles, devFixture: string | null): FilmSources | null {
  if (film.ready) {
    const files = film.files;
    return {
      kind: "release",
      loop: { wide: files.loop1080 ?? canonical.loop1080, narrow: files.loop720 ?? canonical.loop720 },
      master: { wide: files.master1080 ?? canonical.master1080, narrow: files.master720 ?? canonical.master720 },
      social: files.social720 ?? canonical.social720,
      poster: canonical.posterEnd,
      posterSocial: canonical.posterSocialEnd,
      posterLoop: canonical.posterLoop,
      posterLoopSocial: canonical.posterLoopSocial,
      chapterStills: files.chapterStills ?? canonical.chapterStills,
    };
  }

  if (devFixture === null) return null;
  return {
    kind: "fixture",
    loop: { wide: devFixture, narrow: devFixture },
    master: { wide: devFixture, narrow: devFixture },
    social: devFixture,
    poster: null,
    posterSocial: null,
    posterLoop: null,
    posterLoopSocial: null,
    chapterStills: [],
  };
}

/** The file 영상 보기 plays at this viewport width. */
export function pickMaster(sources: FilmSources, viewportWidth: number): string {
  if (viewportWidth < FRAME_16X9_FROM) return sources.social;
  return viewportWidth >= WIDE_FROM ? sources.master.wide : sources.master.narrow;
}

/** The muted loop at this viewport width, or null in the 9:16 frame (it never plays there, spec S9 mobile). */
export function pickLoop(sources: FilmSources, viewportWidth: number): string | null {
  if (viewportWidth < FRAME_16X9_FROM) return null;
  return viewportWidth >= WIDE_FROM ? sources.loop.wide : sources.loop.narrow;
}

/** Seconds into the loop for its poster frame (the 요청 10 · 확보 0 grid, spec S9 "the loop's first frame as poster"). */
export const STILL_AT = 0.1;

/**
 * The loop file whose first frame is the frame's poster before play: the
 * loop that plays at this width, and the 720 loop in the 9:16 frame (cover
 * crops its centre, which holds the grid and the whole ledger line).
 */
export function pickStill(sources: FilmSources, viewportWidth: number): string {
  return pickLoop(sources, viewportWidth) ?? sources.loop.narrow;
}
