/**
 * One decoder at a time (spec 11 playback policy, spec 0.3).
 *
 * MediaManagerCore is the pure part, unit-tested with fake elements and an
 * injected clock: it owns which video plays, pauses everything else, pauses a
 * video that drops below 25% visibility, and autoplays in-view videos at 50%
 * visibility only when the policy allows it (never under reduced motion or on
 * low-power devices, which include Save-Data).
 *
 * `mediaManager` is the thin browser layer: one shared core, one
 * IntersectionObserver feeding visibility ratios, the reduced-motion media
 * query and the low-power heuristic feeding the policy, and `ended` events.
 * Client code only (DeviceVideo); nothing here runs at import time.
 */
import { isLowPower, type DeviceHints } from "@/lib/device";

/** The slice of HTMLMediaElement the manager needs. */
export type MediaElementLike = {
  play(): Promise<void>;
  pause(): void;
  readonly paused: boolean;
  readonly ended: boolean;
};

export type AutoplayPolicy = { reducedMotion: boolean; lowPower: boolean };

export type RegisterOptions = {
  /** In-view mode: start muted playback at 50% visibility when the policy allows. */
  autoplay?: boolean;
};

/** Below this visibility ratio a playing video pauses (spec S7, S9). */
export const PAUSE_BELOW = 0.25;
/** At or above this visibility ratio an in-view video may autoplay (spec S8). */
export const AUTOPLAY_AT = 0.5;

type Entry = {
  el: MediaElementLike;
  autoplay: boolean;
  /**
   * Whether the next entry into view may autoplay. Disarmed by a reader's
   * pause, by the end of playback and by losing the decoder to another video;
   * re-armed when the video leaves view (below PAUSE_BELOW).
   */
  armed: boolean;
  /** Clock time when the video last reached AUTOPLAY_AT, or null while below it. */
  visibleSince: number | null;
  /** Ends a pending start() as failed (set while play() is awaited). */
  abortStart: (() => void) | null;
};

type Active = { id: string; token: number; kind: "user" | "auto" };

export class MediaManagerCore {
  private readonly now: () => number;
  private readonly entries = new Map<string, Entry>();
  private readonly visibility: Map<string, number>;
  private active: Active | null = null;
  private seq = 0;
  /** Ids the manager paused on its own (see takeYield). */
  private readonly yielded = new Set<string>();
  /** SSR-safe default: nothing autoplays until the browser layer reports the real policy. */
  private policy: AutoplayPolicy = { reducedMotion: true, lowPower: true };

  constructor(options: { now: () => number; visibility?: Map<string, number> }) {
    this.now = options.now;
    this.visibility = options.visibility ?? new Map();
  }

  /** The id that holds the decoder (requested or playing), or null. */
  get playingId(): string | null {
    return this.active?.id ?? null;
  }

  get autoplayAllowed(): boolean {
    return !this.policy.reducedMotion && !this.policy.lowPower;
  }

  register(id: string, el: MediaElementLike, options: RegisterOptions = {}): () => void {
    const previous = this.entries.get(id);
    if (previous && previous.el !== el) this.stop(id, previous);
    const entry: Entry = { el, autoplay: options.autoplay ?? false, armed: true, visibleSince: null, abortStart: null };
    this.entries.set(id, entry);

    const ratio = this.visibility.get(id);
    if (ratio !== undefined) this.setVisibility(id, ratio);

    return () => {
      const current = this.entries.get(id);
      // A stale unregister (strict mode remount) must not drop the newer element.
      if (current !== entry) return;
      this.stop(id, entry);
      this.entries.delete(id);
      this.yielded.delete(id);
    };
  }

  /** A reader's explicit play: takes the decoder from anything else. */
  play(id: string): Promise<boolean> {
    return this.start(id, "user");
  }

  /** A reader's explicit pause: no autoplay until the video leaves view and returns. */
  pause(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.armed = false;
    this.yielded.delete(id);
    this.stop(id, entry);
  }

  pauseAll(): void {
    for (const [id, entry] of this.entries) this.yieldEntry(id, entry);
    this.active = null;
  }

  /**
   * True once after the manager itself paused this video: it lost the decoder
   * to another one, fell below PAUSE_BELOW visibility, or pauseAll() ran. The
   * reader's own pause(id) is never a yield. Read it from the element's
   * `pause` event (DeviceVideo onYield="still" rewinds to the still on it).
   */
  takeYield(id: string): boolean {
    return this.yielded.delete(id);
  }

  /** Called by the IntersectionObserver layer with the element's visible ratio (0 to 1). */
  setVisibility(id: string, ratio: number): void {
    this.visibility.set(id, ratio);
    const entry = this.entries.get(id);
    if (!entry) return;

    if (ratio < PAUSE_BELOW) {
      this.yieldEntry(id, entry);
      entry.armed = true;
      entry.visibleSince = null;
      return;
    }

    if (ratio >= AUTOPLAY_AT) {
      entry.visibleSince ??= this.now();
      this.maybeAutoplay(id, entry);
    } else {
      entry.visibleSince = null;
    }
  }

  setPolicy(policy: Partial<AutoplayPolicy>): void {
    this.policy = { ...this.policy, ...policy };
    if (this.autoplayAllowed || this.active?.kind !== "auto") return;
    const entry = this.entries.get(this.active.id);
    if (entry) this.yieldEntry(this.active.id, entry);
  }

  /** The element fired `ended`: it gives up the decoder and waits for its next entry into view. */
  notifyEnded(id: string): void {
    const entry = this.entries.get(id);
    if (entry) entry.armed = false;
    if (this.active?.id === id) this.active = null;
  }

  /**
   * Every source failed to load (404, network error, no decodable type). With
   * <source> children the browser never rejects play(): resource selection
   * just waits for another source. The video gives up the decoder, its
   * pending start resolves false, and it waits for its next entry into view.
   */
  notifyFailed(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.armed = false;
    if (this.active?.id !== id) return;
    this.active = null;
    if (!entry.el.paused) entry.el.pause();
    entry.abortStart?.();
  }

  /* ---------------------------------------------------------------- */

  private maybeAutoplay(id: string, entry: Entry): void {
    if (!entry.autoplay || !entry.armed || !this.autoplayAllowed) return;
    if (this.active?.id === id) return;
    if (this.active) {
      // Never interrupt a video the reader started; among in-view videos the
      // most recently visible one wins.
      if (this.active.kind === "user") return;
      const holder = this.entries.get(this.active.id);
      if (holder?.visibleSince != null && entry.visibleSince != null && holder.visibleSince > entry.visibleSince) return;
    }
    void this.start(id, "auto");
  }

  private async start(id: string, kind: Active["kind"]): Promise<boolean> {
    const entry = this.entries.get(id);
    if (!entry) return false;

    this.yielded.delete(id);
    for (const [otherId, other] of this.entries) {
      if (otherId === id) continue;
      if (!other.el.paused) {
        this.yielded.add(otherId);
        other.el.pause();
      }
      // A displaced in-view video waits for its next entry into view.
      if (this.active?.id === otherId) other.armed = false;
    }

    const token = ++this.seq;
    this.active = { id, token, kind };
    if (kind === "user") entry.armed = true;

    let abort = () => {};
    const aborted = new Promise<"failed">((resolve) => {
      abort = () => resolve("failed");
    });
    entry.abortStart = abort;
    let outcome: "played" | "failed";
    try {
      outcome = await Promise.race([entry.el.play().then(() => "played" as const), aborted]);
    } catch {
      if (this.active?.token === token) this.active = null;
      return false;
    } finally {
      if (entry.abortStart === abort) entry.abortStart = null;
    }
    if (outcome === "failed") return false;

    if (this.active?.token !== token) {
      // A later request took the decoder while this one was starting.
      if (this.active?.id !== id) entry.el.pause();
      return false;
    }
    return true;
  }

  private stop(id: string, entry: Entry): void {
    if (!entry.el.paused) entry.el.pause();
    if (this.active?.id === id) this.active = null;
  }

  /** stop(), marked as the manager's own pause when it actually pauses something. */
  private yieldEntry(id: string, entry: Entry): void {
    if (!entry.el.paused) this.yielded.add(id);
    this.stop(id, entry);
  }
}

/* ------------------------------------------------------------------ */
/* Browser layer                                                       */
/* ------------------------------------------------------------------ */

const THRESHOLDS = [0, 0.1, PAUSE_BELOW, 0.4, AUTOPLAY_AT, 0.75, 1];
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

let core: MediaManagerCore | null = null;
let observer: IntersectionObserver | null = null;
const observed = new Map<Element, string>();

function getCore(): MediaManagerCore {
  if (core) return core;
  const instance = new MediaManagerCore({ now: () => performance.now() });
  const reduced = window.matchMedia(REDUCED_MOTION);
  const sync = () =>
    instance.setPolicy({ reducedMotion: reduced.matches, lowPower: isLowPower(navigator as Navigator & DeviceHints) });
  sync();
  reduced.addEventListener("change", sync);
  core = instance;
  return instance;
}

function getObserver(): IntersectionObserver {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const id = observed.get(entry.target);
        if (id !== undefined) getCore().setVisibility(id, entry.isIntersecting ? entry.intersectionRatio : 0);
      }
    },
    { threshold: THRESHOLDS },
  );
  return observer;
}

/**
 * True when an `error` event (caught in the capture phase, since <source>
 * errors do not bubble) means the video has nothing left to try: the last
 * <source> failed, or the element itself reports a media error.
 */
function isTerminalError(el: HTMLVideoElement, event: Event): boolean {
  const target = event.target;
  if (target === el) return el.error !== null;
  return target instanceof HTMLSourceElement && target.parentElement === el && target.nextElementSibling === null;
}

/**
 * The page's one media manager. register() also watches the element's
 * visibility, its `ended` event and source failures (a missing or blocked
 * file); call the returned function on unmount.
 */
export const mediaManager = {
  register(id: string, el: HTMLVideoElement, options: RegisterOptions = {}): () => void {
    const manager = getCore();
    const unregister = manager.register(id, el, options);
    const onEnded = () => manager.notifyEnded(id);
    const onError = (event: Event) => {
      if (isTerminalError(el, event)) manager.notifyFailed(id);
    };
    el.addEventListener("ended", onEnded);
    el.addEventListener("error", onError, true);
    observed.set(el, id);
    getObserver().observe(el);
    return () => {
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("error", onError, true);
      if (observed.get(el) === id) {
        observed.delete(el);
        observer?.unobserve(el);
      }
      unregister();
    };
  },
  play(id: string): Promise<boolean> {
    return getCore().play(id);
  },
  pause(id: string): void {
    getCore().pause(id);
  },
  pauseAll(): void {
    getCore().pauseAll();
  },
  takeYield(id: string): boolean {
    return getCore().takeYield(id);
  },
};
