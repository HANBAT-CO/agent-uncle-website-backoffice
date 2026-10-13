"use client";

import {
  createContext,
  use,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { CornersOutIcon, PauseIcon, PlayIcon, SpeakerHighIcon, SpeakerSlashIcon } from "@/components/icons/PhosphorLight";
import { srcSets } from "@/content/media";
import { useLowPower } from "@/lib/device";

import { playheadPercent, type ChapterTick } from "./chapters";
import { createFilmController, type FilmController } from "./film-controller";
import { filmDisplay, filmReducer, initialFilmState, loopToggle, primaryAction, soundShown, type FilmState } from "./player-state";
import type { FilmSources } from "./sources";

/**
 * S9 film player (spec S9, 11). Client leaves around the server-rendered
 * stage in index.tsx:
 *
 *   <FilmPlayer sources ticks labels describedBy duration>   provider: state + controller
 *     <FilmMotion>                                           reveal (GSAP leaf)
 *       ...<FilmScreen />                                    the frame: poster, loop, film
 *       ...<FilmLoopToggle />                                the loop's own pause (WCAG 2.2.2)
 *       ...<FilmChapters />                                  chapter ticks (16:9 frame only)
 *       ...<FilmControls />                                  영상 보기 / 멈춤, sound, full screen
 *
 * The frame stacks three layers over the loop's #0C483E field: the end
 * poster (the film's last frame, art-directed 16:9 / 9:16, shown only right
 * after the film ends), the muted loop (also the poster before play: its
 * first frame) and the film. data-display on the frame says which one shows;
 * film.css crossfades them (700ms on the snap curve), the incoming layer
 * always over the outgoing one. A play mark (the page's dot grown into a
 * mint disc) sits over the frame while nothing is requested.
 *
 * No sound before an explicit click: the loop is always muted, and the film
 * is muted until 영상 보기, a tick or a click on the frame starts it.
 */

export type FilmLabels = {
  play: string;
  pause: string;
  soundOn: string;
  soundOff: string;
  fullscreen: string;
  chapters: string;
  /** Visually hidden after each tick's label: what pressing it does (수락 구간부터 보기). */
  chapterAction: string;
  /** Alt text of the end poster (the outro card's own words). */
  posterAlt: string;
  /** The muted loop's own pause and play (it moves on its own for more than five seconds). */
  loopPause: string;
  loopPlay: string;
  /** Accessible name of the film video (the section heading). */
  video: string;
};

type FilmConfig = {
  /** DOM id of the film <video> (aria-controls of every control). */
  videoId: string;
  sources: FilmSources;
  ticks: readonly ChapterTick[];
  duration: number;
  labels: FilmLabels;
  /** id of the text equivalent (the details body). */
  describedBy: string;
};

const ConfigContext = createContext<FilmConfig | null>(null);
const ControllerContext = createContext<FilmController | null>(null);
const StateContext = createContext<FilmState>(initialFilmState);

function useConfig(): FilmConfig {
  const config = use(ConfigContext);
  if (!config) throw new Error("Film components must be rendered inside <FilmPlayer>.");
  return config;
}

/** The player's actions (stable for the player's lifetime). */
export function useFilmController(): FilmController {
  const controller = use(ControllerContext);
  if (!controller) throw new Error("useFilmController must be used inside <FilmPlayer>.");
  return controller;
}

type FilmPlayerProps = Omit<FilmConfig, "videoId"> & { children: ReactNode };

export function FilmPlayer({ sources, ticks, duration, labels, describedBy, children }: FilmPlayerProps) {
  const id = useId();
  const [state, dispatch] = useReducer(filmReducer, initialFilmState);
  const [controller] = useState(() => createFilmController({ id, sources, ticks, dispatch }));
  const lowPower = useLowPower();

  useEffect(() => {
    controller.sync(state);
  }, [controller, state]);

  useEffect(() => {
    controller.setLowPower(lowPower);
  }, [controller, lowPower]);

  const config = useMemo(
    () => ({
      videoId: controller.masterId,
      sources,
      ticks,
      duration,
      labels,
      describedBy,
    }),
    [controller, sources, ticks, duration, labels, describedBy],
  );

  return (
    <ConfigContext value={config}>
      <ControllerContext value={controller}>
        <StateContext value={state}>{children}</StateContext>
      </ControllerContext>
    </ConfigContext>
  );
}

/* ------------------------------------------------------------------ */
/* Frame                                                               */
/* ------------------------------------------------------------------ */

/** The core's rendered width per layout (film.css --film-core-w), for the poster srcset. */
const POSTER_SIZES = "(min-width: 1024px) min(86vw, 1188px), 86vw";
const SOCIAL_POSTER_SIZES = "min(86vw, 420px)";
/** The 9:16 frame below this width (sources.ts FRAME_16X9_FROM). */
const PHONE = "(max-width: 767px)";

export function FilmScreen() {
  const { sources, labels, describedBy, videoId } = useConfig();
  const controller = useFilmController();
  const state = use(StateContext);
  const frame = useRef<HTMLDivElement>(null);
  const loop = useRef<HTMLVideoElement>(null);
  const film = useRef<HTMLVideoElement>(null);
  const display = filmDisplay(state, sources.poster !== null);
  const poster = sources.poster ? srcSets(sources.poster) : null;
  const social = sources.posterSocial ? srcSets(sources.posterSocial) : null;
  const loopPoster = sources.posterLoop ? srcSets(sources.posterLoop) : null;
  const loopSocial = sources.posterLoopSocial ? srcSets(sources.posterLoopSocial) : null;

  // Layout effects: the elements are attached before FilmMotion (an ancestor) sets the reveal up.
  useLayoutEffect(() => controller.attachLoop(loop.current), [controller]);
  useLayoutEffect(() => controller.attachMaster(film.current), [controller]);
  useLayoutEffect(() => controller.attachFrame(frame.current), [controller]);

  return (
    <div
      ref={frame}
      className="film-media"
      data-film-media
      data-display={display}
      data-master={state.master}
      data-loop={state.loop}
      data-reveal={state.reveal}
      onClick={controller.togglePlay}
    >
      {loopPoster && sources.posterLoop ? (
        <picture className="film-layer film-loop-poster" data-film-loop-poster>
          {loopSocial ? <source media={PHONE} type="image/avif" srcSet={loopSocial.avif} sizes={SOCIAL_POSTER_SIZES} /> : null}
          {loopSocial ? <source media={PHONE} type="image/webp" srcSet={loopSocial.webp} sizes={SOCIAL_POSTER_SIZES} /> : null}
          <source type="image/avif" srcSet={loopPoster.avif} sizes={POSTER_SIZES} />
          <source type="image/webp" srcSet={loopPoster.webp} sizes={POSTER_SIZES} />
          <img
            src={loopPoster.fallback}
            width={loopPoster.width}
            height={loopPoster.height}
            alt=""
            aria-hidden="true"
            loading="eager"
            decoding="async"
          />
        </picture>
      ) : null}
      {poster && sources.poster ? (
        <picture className="film-layer film-poster" data-film-poster>
          {social ? <source media={PHONE} type="image/avif" srcSet={social.avif} sizes={SOCIAL_POSTER_SIZES} /> : null}
          {social ? <source media={PHONE} type="image/webp" srcSet={social.webp} sizes={SOCIAL_POSTER_SIZES} /> : null}
          <source type="image/avif" srcSet={poster.avif} sizes={POSTER_SIZES} />
          <source type="image/webp" srcSet={poster.webp} sizes={POSTER_SIZES} />
          {/* Pre-encoded AVIF/WebP pair from the media pipeline (spec 11), art-directed per frame shape. */}
          <img
            src={poster.fallback}
            width={poster.width}
            height={poster.height}
            alt={labels.posterAlt}
            aria-hidden={display === "poster" ? undefined : true}
            loading="lazy"
            decoding="async"
          />
        </picture>
      ) : null}
      <video
        ref={loop}
        className="film-layer film-video"
        data-film-video="loop"
        muted
        loop
        playsInline
        preload="none"
        aria-hidden="true"
        tabIndex={-1}
        disablePictureInPicture
        disableRemotePlayback
      />
      <video
        ref={film}
        id={videoId}
        className="film-layer film-video"
        data-film-video="master"
        playsInline
        preload="none"
        aria-label={labels.video}
        aria-describedby={describedBy}
        aria-hidden={display === "master" ? undefined : true}
        disableRemotePlayback
      />
      {/* The frame is a play target (click): this says so. 영상 보기 below stays the labelled control. */}
      <span className="film-mark" aria-hidden="true">
        <span className="film-mark-disc">
          <PlayIcon size={24} weight="light" />
        </span>
      </span>
    </div>
  );
}

/**
 * The muted loop's pause control (WCAG 2.2.2), on the frame's corner where
 * the loop plays. Shown while the loop plays (멈춤) and once the reader has
 * paused it (재생); gone while the film runs or the page has paused the loop.
 * In desktop motion it lands with the card (--film-land).
 */
export function FilmLoopToggle() {
  const { labels } = useConfig();
  const controller = useFilmController();
  const state = use(StateContext);
  const action = loopToggle(state);
  // Keep the last label while it fades out, so it never flips mid-fade.
  const [shown, setShown] = useState<"pause" | "play">("pause");
  const [focused, setFocused] = useState(false);
  if (action !== null && action !== shown) setShown(action);
  const label = shown === "pause" ? labels.loopPause : labels.loopPlay;
  const visible = action !== null || focused;

  return (
    <button
      type="button"
      className="film-loop-toggle"
      data-film-loop-toggle={shown}
      data-shown={visible}
      inert={!visible}
      aria-label={label}
      onClick={controller.toggleLoop}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {shown === "pause" ? <PauseIcon size={18} weight="light" aria-hidden="true" /> : <PlayIcon size={18} weight="light" aria-hidden="true" />}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

export function FilmControls() {
  const { labels, videoId } = useConfig();
  const controller = useFilmController();
  const state = use(StateContext);
  const primary = primaryAction(state);
  const sound = soundShown(state);

  return (
    <div className="film-controls" data-film-controls>
      <button
        type="button"
        className="film-play"
        data-film-play={primary}
        aria-controls={videoId}
        onClick={controller.togglePlay}
        onPointerEnter={controller.preload}
        onFocus={controller.preload}
      >
        <span className="film-play-label">{primary === "pause" ? labels.pause : labels.play}</span>
        <span aria-hidden="true" className="film-play-circle">
          {primary === "pause" ? <PauseIcon size={20} weight="light" /> : <PlayIcon size={20} weight="light" />}
        </span>
      </button>
      {/* Space is held while hidden, so nothing shifts when the film starts. */}
      <button
        type="button"
        className="film-chip"
        data-film-sound={state.muted ? "off" : "on"}
        data-shown={sound}
        inert={!sound}
        aria-controls={videoId}
        onClick={controller.toggleSound}
      >
        {state.muted ? (
          <SpeakerSlashIcon size={20} weight="light" aria-hidden="true" />
        ) : (
          <SpeakerHighIcon size={20} weight="light" aria-hidden="true" />
        )}
        <span>{state.muted ? labels.soundOn : labels.soundOff}</span>
      </button>
      <button
        type="button"
        className="film-chip film-fullscreen"
        data-film-fullscreen
        data-shown={sound}
        inert={!sound}
        aria-controls={videoId}
        onClick={controller.enterFullscreen}
      >
        <CornersOutIcon size={20} weight="light" aria-hidden="true" />
        <span>{labels.fullscreen}</span>
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Chapters                                                            */
/* ------------------------------------------------------------------ */

/** Arrow keys walk the timeline (wrapping), Home and End jump to its ends. */
function nextTick(key: string, at: number, last: number): number | null {
  switch (key) {
    case "ArrowRight":
      return at === last ? 0 : at + 1;
    case "ArrowLeft":
      return at === 0 ? last : at - 1;
    case "Home":
      return 0;
    case "End":
      return last;
    default:
      return null;
  }
}

export function FilmChapters() {
  const { sources, ticks, duration, labels, videoId } = useConfig();
  const controller = useFilmController();
  const state = use(StateContext);
  const root = useRef<HTMLDivElement>(null);
  const playing = state.master === "playing";
  const idle = state.master === "idle";
  // Roving tab stop: one Tab stop for the whole timeline (the current chapter, else the last focused tick).
  const [roving, setRoving] = useState(0);
  const tabStop = state.chapter >= 0 ? state.chapter : roving;

  const onKeyDown = (event: KeyboardEvent<HTMLOListElement>) => {
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-film-tick]"));
    const at = buttons.findIndex((button) => button === document.activeElement);
    if (at < 0) return;
    const next = nextTick(event.key, at, buttons.length - 1);
    if (next === null) return;
    event.preventDefault();
    setRoving(next);
    buttons[next]?.focus();
  };

  // The playhead is a CSS variable written per frame while the film plays (no React state).
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const write = () => element.style.setProperty("--film-playhead", String(playheadPercent(controller.currentTime(), duration) / 100));
    if (idle) {
      element.style.setProperty("--film-playhead", "0");
      return;
    }
    write();
    if (!playing) return;
    let frame = requestAnimationFrame(function tick() {
      write();
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [controller, duration, idle, playing]);

  return (
    <div ref={root} className="film-chapters" data-film-chapters>
      <div className="film-track" aria-hidden="true">
        <span className="film-track-fill" />
      </div>
      <ol className="film-ticks" aria-label={labels.chapters} onKeyDown={onKeyDown}>
        {ticks.map((tick) => {
          const still = sources.chapterStills[tick.index];
          return (
            <li key={tick.index} className="film-tick" style={{ "--tick-p": tick.percent } as CSSProperties}>
              <button
                type="button"
                data-film-tick={tick.index}
                tabIndex={tick.index === tabStop ? 0 : -1}
                aria-current={state.chapter === tick.index ? "true" : undefined}
                aria-controls={videoId}
                onClick={() => controller.playChapter(tick.index)}
                onPointerEnter={controller.preload}
                onFocus={() => {
                  setRoving(tick.index);
                  controller.preload();
                }}
              >
                <span className="film-tick-mark" aria-hidden="true" />
                <span className="film-tick-label">
                  {tick.label}
                  <span className="sr-only"> {labels.chapterAction}</span>
                </span>
                {still ? (
                  <span className="film-tick-preview" aria-hidden="true">
                    {/* 480x270 AVIF chapter still from the media pipeline. */}
                    <picture>
                      <img src={still} width={480} height={270} alt="" loading="lazy" decoding="async" />
                    </picture>
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
