/**
 * The S9 player's imperative half (spec S9, 11 playback policy). One
 * controller per FilmPlayer; it owns the two <video> elements of the frame
 * and turns reader actions and motion signals into media calls, and media
 * events into reducer events (player-state.ts).
 *
 * - loop: the muted brand loop (16:9 frame only). Starts when the reveal
 *   opens (FilmMotion), only when muted autoplay is allowed: motion on, not
 *   low power (which includes Save-Data), and play() not rejected. It has its
 *   own pause control (WCAG 2.2.2); once the reader pauses it, nothing
 *   restarts it (not the view, not the film's end) until they play it again.
 * - still: before play, the loop video also serves as the frame's poster:
 *   its first frame, decoded without playing (preload metadata and a seek),
 *   as soon as the frame comes within a viewport of the screen. Everywhere
 *   but Save-Data (no extra bytes there: the plain green field).
 * - master: the film with sound (16:9 master, or the 9:16 cut below 768px).
 *   Plays only from a click: 영상 보기, a chapter tick or the frame itself.
 *   When it ends, its last frame (the end poster) holds for a moment, then
 *   the frame returns to the loop (spec S9).
 * - The frame's shape follows the viewport (16:9 from 768px): a loaded film
 *   cut that no longer fits is unloaded, and the frame goes back to its
 *   poster for the new shape.
 * - Both are registered with the page's media manager: one decoder at a time,
 *   and a video pauses below 25% visibility. The loop resumes when the frame
 *   is back in view; the master waits for the reader.
 *
 * Client only (touches the DOM and the media manager). Element hooks are
 * React 19 callback refs that return their cleanup.
 */

import { mediaManager, PAUSE_BELOW } from "@/components/device/media-manager";

import { activeChapter, seekTarget, type ChapterTick } from "./chapters";
import { initialFilmState, type FilmEvent, type FilmState } from "./player-state";
import { FRAME_16X9_FROM, STILL_AT, pickLoop, pickMaster, pickStill, type FilmSources } from "./sources";

type FullscreenVideo = HTMLVideoElement & {
  /** iOS Safari: the only way to show a video full screen on iPhone. */
  webkitEnterFullscreen?: () => void;
};

type ControllerOptions = {
  /** A unique, DOM-safe prefix (useId). */
  id: string;
  sources: FilmSources;
  ticks: readonly ChapterTick[];
  dispatch: (event: FilmEvent) => void;
};

export type FilmController = ReturnType<typeof createFilmController>;

/** How long the master's last frame holds after it ends, before the frame returns to the loop. */
const END_HOLD_MS = 1500;

type FrameShape = "16x9" | "9x16";

/** Save-Data: no bytes beyond what the reader asks for (not even the loop's poster frame). */
function saveData(): boolean {
  return (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
}

/** Listen and hand back the matching remover. */
function listen(target: EventTarget, type: string, handler: () => void): () => void {
  target.addEventListener(type, handler);
  return () => target.removeEventListener(type, handler);
}

/** Point a video at `src` unless it already plays it. True when the source changed. */
function setSource(video: HTMLVideoElement, src: string): boolean {
  if (video.dataset.src === src) return false;
  video.dataset.src = src;
  video.src = src;
  return true;
}

/** Seek now, or as soon as the metadata is in (seeking before it is unreliable in WebKit). */
function seek(video: HTMLVideoElement, at: number): void {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
    video.currentTime = at;
    return;
  }
  video.addEventListener(
    "loadedmetadata",
    () => {
      video.currentTime = at;
    },
    { once: true },
  );
}

export function createFilmController({ id, sources, ticks, dispatch }: ControllerOptions) {
  const loopId = `${id}-loop`;
  const masterId = `${id}-film`;

  let loop: HTMLVideoElement | null = null;
  let master: FullscreenVideo | null = null;
  /** Mirror of the reducer state, synced after each render (FilmPlayer). */
  let state: FilmState = initialFilmState;
  /** Muted autoplay is allowed by motion (FilmMotion: desktop and mobile motion, never reduced). */
  let autoplay = false;
  /** Low-power devices never autoplay (spec 6.6). True until the browser says otherwise. */
  let lowPower = true;
  /** Mirrors state.reveal without waiting for a render. */
  let reveal = initialFilmState.reveal;
  let inView = false;
  /** FilmMotion's "bring the card to rest" hook (desktop pin), or null. */
  let settle: (() => void) | null = null;
  /** Pending return from the end poster to the loop. */
  let restTimer: ReturnType<typeof setTimeout> | undefined;
  /** The reader paused the loop (mirrors state.held without waiting for a render). */
  let held = false;

  const viewport = () => window.innerWidth;
  const shapeAt = (width: number): FrameShape => (width < FRAME_16X9_FROM ? "9x16" : "16x9");

  /** Point the master at the cut for the frame's current shape. True when the source changed. */
  function setMasterSource(video: HTMLVideoElement): boolean {
    const width = viewport();
    video.dataset.shape = shapeAt(width);
    return setSource(video, pickMaster(sources, width));
  }

  /** The loop's first frame as the poster: metadata only, then a seek decodes one frame. */
  function prepareStill(): void {
    const video = loop;
    if (!video || video.dataset.src || saveData()) return;
    video.preload = "metadata";
    setSource(video, pickStill(sources, viewport()));
  }

  function clearRest(): void {
    clearTimeout(restTimer);
    restTimer = undefined;
  }

  function loopWanted(): boolean {
    return (
      loop !== null &&
      autoplay &&
      !lowPower &&
      !held &&
      reveal &&
      inView &&
      state.master === "idle" &&
      state.loop !== "blocked" &&
      pickLoop(sources, viewport()) !== null
    );
  }

  function playLoop(): void {
    const video = loop;
    const src = pickLoop(sources, viewport());
    if (!video || !src || !loopWanted()) return;
    setSource(video, src);
    video.muted = true;
    void mediaManager.play(loopId).then((started) => {
      // Rejected (iOS Low Power Mode, blocked autoplay, missing file): the poster stays.
      if (!started && video.paused && reveal && state.master === "idle") dispatch({ type: "loop", state: "blocked" });
    });
  }

  function stopLoop(): void {
    if (loop && !loop.paused) mediaManager.pause(loopId);
  }

  function startMaster(at: number | null): void {
    const video = master;
    if (!video) return;
    settle?.();
    clearRest();
    const fresh = state.master === "idle";
    const changed = setMasterSource(video);
    if (at !== null) seek(video, at);
    else if (fresh || changed) seek(video, 0);
    // Sound only now, from the reader's click (an explicit gesture).
    if (fresh) video.muted = false;
    dispatch({ type: "request", muted: video.muted });
    void mediaManager.play(masterId).then((started) => {
      if (!started && video.paused) dispatch({ type: "blocked" });
    });
  }

  return {
    loopId,
    masterId,

    /** Callback ref for the loop <video>. */
    attachLoop(video: HTMLVideoElement | null): (() => void) | undefined {
      if (!video) return undefined;
      loop = video;
      video.defaultMuted = true;
      video.muted = true;
      const decoded = () => {
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) dispatch({ type: "still" });
      };
      const offs = [
        listen(video, "playing", () => dispatch({ type: "loop", state: "playing" })),
        listen(video, "pause", () => dispatch({ type: "loop", state: "idle" })),
        // Poster frame: a paused loop at 0 has nothing decoded yet; a seek makes the browser decode one frame.
        listen(video, "loadedmetadata", () => {
          if (video.paused && video.currentTime < STILL_AT / 2) video.currentTime = STILL_AT;
        }),
        listen(video, "loadeddata", decoded),
        listen(video, "seeked", decoded),
        mediaManager.register(loopId, video),
      ];
      playLoop();
      return () => {
        for (const off of offs) off();
        if (loop === video) loop = null;
      };
    },

    /** Callback ref for the film <video>. */
    attachMaster(video: HTMLVideoElement | null): (() => void) | undefined {
      if (!video) return undefined;
      master = video;
      video.muted = true;
      const offs = [
        listen(video, "playing", () => dispatch({ type: "playing" })),
        listen(video, "pause", () => {
          if (!video.ended) dispatch({ type: "paused" });
        }),
        listen(video, "ended", () => {
          dispatch({ type: "ended" });
          // Hold the last frame (the end poster), then hand back to the loop where it may play.
          clearRest();
          restTimer = setTimeout(() => {
            restTimer = undefined;
            dispatch({ type: "rest" });
            playLoop();
          }, END_HOLD_MS);
        }),
        listen(video, "volumechange", () => dispatch({ type: "volume", muted: video.muted })),
        listen(video, "timeupdate", () => {
          // Metadata loads (a preload, a seek) also fire timeupdate: chapters follow only a running film,
          // and only the 16:9 master (the 9:16 cut has its own timeline, without chapter marks).
          if (state.master === "idle" || video.dataset.shape === "9x16") return;
          dispatch({ type: "chapter", index: video.ended ? -1 : activeChapter(ticks, video.currentTime) });
        }),
        listen(video, "error", () => {
          if (state.master !== "idle") dispatch({ type: "blocked" });
        }),
        mediaManager.register(masterId, video),
      ];
      return () => {
        for (const off of offs) off();
        clearRest();
        if (master === video) master = null;
      };
    },

    /** Callback ref for the frame: the loop resumes when it is back in view. */
    attachFrame(frame: HTMLElement | null): (() => void) | undefined {
      if (!frame) return undefined;
      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries.at(-1);
          if (!entry) return;
          inView = entry.isIntersecting && entry.intersectionRatio >= PAUSE_BELOW;
          playLoop();
        },
        { threshold: [0, PAUSE_BELOW] },
      );
      observer.observe(frame);

      // The poster frame loads one viewport ahead, so the frame is never blank when it arrives.
      const near = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          near.disconnect();
          prepareStill();
        },
        { rootMargin: "100% 0px" },
      );
      near.observe(frame);

      // Phone rotated, window narrowed across 768px: the frame changes shape.
      const wide = window.matchMedia(`(min-width: ${FRAME_16X9_FROM}px)`);
      const onShape = () => {
        if (!pickLoop(sources, viewport())) stopLoop();
        const video = master;
        const loaded = video?.dataset.shape;
        if (!video || !loaded || loaded === shapeAt(viewport())) return;
        // The loaded cut no longer fits the frame (and its timeline is not the ticks'): unload it.
        clearRest();
        mediaManager.pause(masterId);
        video.removeAttribute("src");
        delete video.dataset.src;
        delete video.dataset.shape;
        video.load();
        dispatch({ type: "blocked" });
      };
      wide.addEventListener("change", onShape);

      return () => {
        observer.disconnect();
        near.disconnect();
        wide.removeEventListener("change", onShape);
      };
    },

    /** FilmPlayer: after every render. */
    sync(next: FilmState): void {
      state = next;
    },

    setLowPower(value: boolean): void {
      lowPower = value;
      if (value) stopLoop();
      else playLoop();
    },

    /** FilmMotion: true in desktop and mobile motion, false under reduced motion. */
    setAutoplay(value: boolean): void {
      autoplay = value;
      if (value) playLoop();
      else stopLoop();
    },

    setSettler(fn: (() => void) | null): void {
      settle = fn;
    },

    /** The reader has asked for the film (loading, playing or paused): FilmMotion keeps the frame open then. */
    requested(): boolean {
      return state.master !== "idle";
    },

    /** FilmMotion: the dot has opened (true) or closed again (false). */
    reveal(open: boolean): void {
      if (reveal === open) return;
      reveal = open;
      dispatch({ type: "reveal", open });
      if (!open) {
        stopLoop();
        // No sound from a dot: a running film pauses when the card closes.
        if (state.master === "playing" || state.master === "loading") mediaManager.pause(masterId);
        return;
      }
      if (state.loop === "blocked") {
        dispatch({ type: "loop", state: "idle" });
        state = { ...state, loop: "idle" };
      }
      playLoop();
    },

    /** The loop's own 멈춤 / 재생 (WCAG 2.2.2). */
    toggleLoop(): void {
      held = !held;
      dispatch({ type: "hold", held });
      if (held) stopLoop();
      else playLoop();
    },

    /** 영상 보기 / 멈춤, and a click on the frame. */
    togglePlay(): void {
      if (state.master === "loading" || state.master === "playing") {
        mediaManager.pause(masterId);
        return;
      }
      startMaster(null);
    },

    /** A chapter tick: seek the film to the chapter start and play. */
    playChapter(index: number): void {
      const at = seekTarget(ticks, index);
      dispatch({ type: "chapter", index: activeChapter(ticks, at) });
      if (master && state.master === "playing") {
        settle?.();
        master.currentTime = at;
        return;
      }
      startMaster(at);
    },

    toggleSound(): void {
      if (master) master.muted = !master.muted;
    },

    /** iOS: webkitEnterFullscreen on the video; elsewhere the Fullscreen API. */
    enterFullscreen(): void {
      const video = master;
      if (!video) return;
      if (typeof video.webkitEnterFullscreen === "function") {
        try {
          video.webkitEnterFullscreen();
        } catch {
          // Not ready yet (no metadata): the inline film keeps playing.
        }
        return;
      }
      if (typeof video.requestFullscreen === "function") void video.requestFullscreen().catch(() => undefined);
    },

    /** Hover or focus on 영상 보기 or a tick: fetch the film's metadata ahead of the click. */
    preload(): void {
      const video = master;
      if (!video || video.dataset.src) return;
      video.preload = "metadata";
      setMasterSource(video);
    },

    /** The film's playhead in seconds (0 before it loads). */
    currentTime(): number {
      return master?.currentTime ?? 0;
    },
  };
}
