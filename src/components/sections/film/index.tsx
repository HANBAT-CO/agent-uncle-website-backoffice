import { QuantityDot } from "@/components/dot/QuantityDot";
import { AppIcon } from "@/components/icons/AppIcon";
import { SectionHeading } from "@/components/section/SectionHeading";
import { SectionShell } from "@/components/section/SectionShell";
import { film } from "@/content/copy";
import { FILM, FILM_FILES } from "@/content/media";

import { chapterTicks } from "./chapters";
import { FilmMotionIsland } from "./FilmMotionIsland";
import { FilmChapters, FilmControls, FilmLoopToggle, FilmPlayer, FilmScreen, type FilmLabels } from "./FilmPlayer";
import { DEV_FIXTURE, resolveFilmSources } from "./sources";
import "./film.css";

/**
 * S9 film · 요청부터 수령까지, 영상으로 봐요 (spec S9, 11, 4.4).
 *
 * Server Component: the heading, the stage, the controls, the caption and the
 * film's text equivalent are all here in reading order, so the no-JS page and
 * the reduced-motion page read the same: the green frame (the loop's first
 * frame once it is decoded) in a double-bezel card with its play mark and
 * play button.
 *
 *   pin spacer (our own, so a refresh never moves a focused control)
 *   scene (pinned on desktop)
 *     h2
 *     stage: shell (tray + ring) > core (paper) > dot + frame (FilmScreen)
 *            + the loop's pause on the frame's corner (FilmLoopToggle)
 *     chapter ticks (16:9 frame only)
 *     bar: controls + caption
 *   after: details 영상 내용 (and its reduced-motion note)
 *
 * The page's dot is the film's mask origin: on desktop the frame grows out
 * of a 16px circle at the card's centre (FilmMotion). Files: only the audited
 * green renders (FILM.ready). Before they exist, next dev plays a 4-second
 * fixture and a production build renders the non-shipping state below.
 */

const TITLE_ID = "film-title";
const DETAILS_ID = "film-details-body";

const LABELS: FilmLabels = {
  play: film.play,
  pause: film.pause,
  soundOn: film.soundOn,
  soundOff: film.soundOff,
  fullscreen: film.fullscreen,
  chapters: film.chaptersLabel,
  chapterAction: film.chapterAction,
  posterAlt: film.posterAlt,
  loopPause: film.loopPause,
  loopPlay: film.loopPlay,
  video: film.h2.join(" "),
};

/** Dates never break at their hyphens (2026-10-12 on one line). */
function keepDates(text: string) {
  return text.split(/(\d{4}-\d{2}-\d{2})/).map((part, index) =>
    index % 2 === 1 ? (
      <span key={index} className="film-nowrap">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

function FilmDetails() {
  return (
    <div className="film-after">
      <div className="film-column">
        <details className="film-details" data-film-details>
          <summary className="film-details-summary">
            {film.details.summary}
            <AppIcon name="chevron" size={14} className="film-details-chevron" />
          </summary>
          <p id={DETAILS_ID} className="film-details-body">
            {keepDates(film.details.body)}
          </p>
        </details>
        {/* Reduced motion: the text is open by default. CSS swaps the disclosure for this note, no JS needed. */}
        <div className="film-details-note" data-film-details-note>
          <p className="film-details-note-title">{film.details.summary}</p>
          <p className="film-details-body">{keepDates(film.details.body)}</p>
        </div>
      </div>
    </div>
  );
}

/** A production build before FILM.ready: the dot on the plain field, no player (WP-20 blocks the release). */
function NonShippingFilm() {
  return (
    <>
      <div className="film-scene" data-film-scene data-film-state="not-ready">
        <div className="film-column">
          <SectionHeading id={TITLE_ID} lines={film.h2} className="film-title" />
          <div className="film-stage">
            <div className="film-shell">
              <span className="film-ring" aria-hidden="true" />
              <div className="film-core film-core-empty">
                <QuantityDot tone="ink" className="film-dot film-dot-static" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <FilmDetails />
    </>
  );
}

export function FilmSection() {
  const sources = resolveFilmSources(FILM, FILM_FILES, DEV_FIXTURE);
  const ticks = chapterTicks(FILM.chapters, FILM.duration);

  return (
    <SectionShell id="film" titleId={TITLE_ID} tone="day" pad="none" className="film">
      {sources ? (
        <FilmPlayer sources={sources} ticks={ticks} duration={FILM.duration} labels={LABELS} describedBy={DETAILS_ID}>
          <FilmMotionIsland>
            <div className="film-pin-spacer" data-film-pin-spacer>
              <div className="film-scene" data-film-scene data-film-sources={sources.kind}>
                <div className="film-column">
                  <SectionHeading id={TITLE_ID} lines={film.h2} className="film-title" />
                  <div className="film-stage" data-film-stage>
                    {/* Double-bezel (spec 4.4): a 6px tray with a hairline ring around a 24px paper core. */}
                    <div className="film-shell" data-film-shell>
                      <span className="film-ring" aria-hidden="true" />
                      <div className="film-core" data-film-core>
                        <QuantityDot tone="ink" className="film-dot" />
                        <FilmScreen />
                        <FilmLoopToggle />
                      </div>
                    </div>
                  </div>
                  {sources.kind === "release" ? <FilmChapters /> : null}
                  <div className="film-bar">
                    <FilmControls />
                    <p className="film-caption">{film.caption}</p>
                  </div>
                </div>
              </div>
            </div>
            <FilmDetails />
          </FilmMotionIsland>
        </FilmPlayer>
      ) : (
        <NonShippingFilm />
      )}
    </SectionShell>
  );
}
