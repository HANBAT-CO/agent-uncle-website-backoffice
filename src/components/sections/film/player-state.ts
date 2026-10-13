/**
 * The S9 player's discrete state (spec S9, 11 playback policy), as a pure
 * reducer. FilmPlayer feeds it from media events and reader actions; the UI
 * reads only the derived values below. Continuous values (the playhead)
 * never pass through here.
 *
 * Two videos share one frame: the muted brand loop and the film itself (the
 * 16:9 master, or the 9:16 cut on phones). One decoder at a time is the media
 * manager's job; this reducer only decides what the frame shows.
 *
 * Before play the frame is green: the loop's own first frame as its poster
 * (the loop video paused on a decoded frame, `still`), or the plain #0C483E
 * field while that frame loads, under Save-Data, and without JS. The light
 * outro card (the poster files) shows only right after the master ends, where
 * it is the master's own last frame; then the frame returns to the loop.
 */

export type LoopState = "idle" | "playing" | "blocked";
export type MasterState = "idle" | "loading" | "playing" | "paused";

export type FilmState = {
  /** False while the dot has not opened yet (desktop pin below 20%, phones before entry). */
  reveal: boolean;
  loop: LoopState;
  /** The loop has shown frames since the last time the poster took over. */
  loopFrames: boolean;
  /** The loop video holds a decoded frame (its first frame, loaded as the poster), even if it never played. */
  still: boolean;
  master: MasterState;
  /** The master has shown a frame since the reader asked for it. */
  frames: boolean;
  /** The master's muted flag. True until 영상 보기: no sound before an explicit click. */
  muted: boolean;
  /** Active chapter index, -1 when the master is not running. */
  chapter: number;
  /** The master has just ended: its last frame (the end poster) holds until the frame returns to the loop. */
  ended: boolean;
  /** The reader paused the loop (WCAG 2.2.2): it stays on its frame until they play it again. */
  held: boolean;
};

export type FilmEvent =
  | { type: "reveal"; open: boolean }
  | { type: "loop"; state: LoopState }
  | { type: "still" }
  | { type: "rest" }
  | { type: "hold"; held: boolean }
  | { type: "request"; muted: boolean }
  | { type: "playing" }
  | { type: "paused" }
  | { type: "blocked" }
  | { type: "ended" }
  | { type: "volume"; muted: boolean }
  | { type: "chapter"; index: number };

export type FilmDisplay = "field" | "poster" | "loop" | "master";

/** Server render, no JS and reduced motion: the composed final state (the green frame with its play mark and button). */
export const initialFilmState: FilmState = {
  reveal: true,
  loop: "idle",
  loopFrames: false,
  still: false,
  master: "idle",
  frames: false,
  muted: true,
  chapter: -1,
  ended: false,
  held: false,
};

function patch(state: FilmState, next: Partial<FilmState>): FilmState {
  for (const key of Object.keys(next) as (keyof FilmState)[]) {
    if (state[key] !== next[key]) return { ...state, ...next };
  }
  return state;
}

export function filmReducer(state: FilmState, event: FilmEvent): FilmState {
  switch (event.type) {
    case "reveal":
      return patch(state, { reveal: event.open });
    case "loop":
      return patch(state, { loop: event.state, loopFrames: event.state === "playing" ? true : state.loopFrames });
    case "still":
      return patch(state, { still: true });
    case "rest":
      return patch(state, { ended: false });
    case "hold":
      return patch(state, { held: event.held });
    case "request":
      return patch(state, { master: state.master === "playing" ? "playing" : "loading", muted: event.muted, ended: false });
    case "playing":
      return patch(state, { master: "playing", frames: true });
    case "paused":
      if (state.master === "idle") return state;
      return state.frames ? patch(state, { master: "paused" }) : patch(state, { master: "idle", chapter: -1 });
    case "blocked":
      return patch(state, { master: "idle", frames: false, chapter: -1 });
    case "ended":
      // The poster is the master's last frame, so handing back to it is seamless.
      return patch(state, { master: "idle", frames: false, chapter: -1, loop: "idle", loopFrames: false, ended: true });
    case "volume":
      return patch(state, { muted: event.muted });
    case "chapter":
      return patch(state, { chapter: event.index });
  }
}

/**
 * What the frame shows. `hasPoster` is false only for the dev fixture (no poster files yet).
 *
 * A loop that has shown frames keeps its last frame when it pauses (out of
 * view, or giving the decoder to the master), so the frame never flashes to
 * another layer at the edge of the viewport.
 */
export function filmDisplay(state: FilmState, hasPoster: boolean): FilmDisplay {
  if (!state.reveal) return "field";
  if (state.master !== "idle" && state.frames) return "master";
  if (state.loop === "playing" || state.loopFrames) return "loop";
  if (state.ended && hasPoster) return "poster";
  if (state.still) return "loop";
  return "field";
}

/** The primary button: 멈춤 while the master loads or plays, otherwise 영상 보기. */
export function primaryAction(state: FilmState): "play" | "pause" {
  return state.master === "loading" || state.master === "playing" ? "pause" : "play";
}

/**
 * The loop's own pause control (WCAG 2.2.2: it moves on its own for more than
 * five seconds). 멈춤 while it plays, 재생 once the reader has paused it, and
 * nothing while the film itself is requested (its controls take over), while
 * the dot is closed, or while the page has paused it (out of view).
 */
export function loopToggle(state: FilmState): "pause" | "play" | null {
  if (!state.reveal || state.master !== "idle") return null;
  if (state.held) return "play";
  return state.loop === "playing" ? "pause" : null;
}

/** The sound toggle shows from the reader's request until the master ends. */
export function soundShown(state: FilmState): boolean {
  return state.master !== "idle";
}
