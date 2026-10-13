import { describe, expect, it } from "vitest";

import {
  filmDisplay,
  filmReducer,
  initialFilmState,
  loopToggle,
  primaryAction,
  soundShown,
  type FilmEvent,
  type FilmState,
} from "./player-state";

function run(...events: FilmEvent[]): FilmState {
  return events.reduce(filmReducer, initialFilmState);
}

describe("initial state", () => {
  it("is the composed final state: reveal open, nothing playing, master muted, the green field (never the light outro card)", () => {
    expect(initialFilmState).toMatchObject({ reveal: true, loop: "idle", master: "idle", muted: true, chapter: -1, ended: false, still: false, held: false });
    expect(filmDisplay(initialFilmState, true)).toBe("field");
    expect(filmDisplay(initialFilmState, false)).toBe("field");
    expect(primaryAction(initialFilmState)).toBe("play");
    expect(soundShown(initialFilmState)).toBe(false);
  });
});

describe("the loop's pause control (WCAG 2.2.2)", () => {
  it("offers 멈춤 only while the loop plays and nothing else is requested", () => {
    expect(loopToggle(initialFilmState)).toBeNull();
    const playing = run({ type: "loop", state: "playing" });
    expect(loopToggle(playing)).toBe("pause");
    // Paused by the page (out of view, the decoder handed to the film): nothing to offer.
    expect(loopToggle(filmReducer(playing, { type: "loop", state: "idle" }))).toBeNull();
    // The film runs: its own controls take over.
    expect(loopToggle(filmReducer(playing, { type: "request", muted: false }))).toBeNull();
    // The dot has closed again.
    expect(loopToggle(filmReducer(playing, { type: "reveal", open: false }))).toBeNull();
  });

  it("holds the loop on its frame once the reader pauses it, until they play it again", () => {
    const held = run({ type: "loop", state: "playing" }, { type: "hold", held: true }, { type: "loop", state: "idle" });
    expect(held.held).toBe(true);
    expect(loopToggle(held)).toBe("play");
    // The paused loop keeps its frame: no flash to another layer.
    expect(filmDisplay(held, true)).toBe("loop");
    // Watching the film and its end do not undo the reader's choice.
    const after = [{ type: "request", muted: false }, { type: "playing" }, { type: "ended" }, { type: "rest" }] as const;
    expect(after.reduce<FilmState>(filmReducer, held).held).toBe(true);
    const released = filmReducer(held, { type: "hold", held: false });
    expect(released.held).toBe(false);
    expect(loopToggle(released)).toBeNull();
    expect(loopToggle(filmReducer(released, { type: "loop", state: "playing" }))).toBe("pause");
  });
});

describe("the reveal and the loop", () => {
  it("shows the plain field while the reveal is closed, whatever plays", () => {
    expect(filmDisplay(run({ type: "reveal", open: false }), true)).toBe("field");
    const masterPlaying = run({ type: "request", muted: false }, { type: "playing" }, { type: "reveal", open: false });
    expect(filmDisplay(masterPlaying, true)).toBe("field");
  });

  it("shows the loop once its frames flow, and the green field when it is blocked before any frame", () => {
    const open = run({ type: "reveal", open: false }, { type: "reveal", open: true });
    expect(filmDisplay(open, true)).toBe("field");
    const playing = filmReducer(open, { type: "loop", state: "playing" });
    expect(filmDisplay(playing, true)).toBe("loop");
    expect(filmDisplay(filmReducer(open, { type: "loop", state: "blocked" }), true)).toBe("field");
  });

  it("keeps a paused loop's last frame (out of view) instead of swapping to another layer", () => {
    const paused = run({ type: "loop", state: "playing" }, { type: "loop", state: "idle" });
    expect(paused.loopFrames).toBe(true);
    expect(filmDisplay(paused, true)).toBe("loop");
  });

  it("shows the loop's first frame as the poster once it is decoded, without playing it", () => {
    const still = run({ type: "still" });
    expect(still.loop).toBe("idle");
    expect(filmDisplay(still, true)).toBe("loop");
    // Blocked autoplay (iOS Low Power Mode) keeps the decoded first frame.
    expect(filmDisplay(filmReducer(still, { type: "loop", state: "blocked" }), true)).toBe("loop");
    // The dot has not opened yet: the plain field, whatever is decoded.
    expect(filmDisplay(filmReducer(still, { type: "reveal", open: false }), true)).toBe("field");
  });
});

describe("the master", () => {
  it("keeps the loop's last frame while the master loads, then shows the master", () => {
    const loop = run({ type: "loop", state: "playing" });
    const loading = run({ type: "loop", state: "playing" }, { type: "request", muted: false }, { type: "loop", state: "idle" });
    expect(loading.master).toBe("loading");
    expect(filmDisplay(loading, true)).toBe("loop");
    expect(primaryAction(loading)).toBe("pause");
    const playing = filmReducer(loading, { type: "playing" });
    expect(filmDisplay(playing, true)).toBe("master");
    expect(filmDisplay(loop, true)).toBe("loop");
  });

  it("plays with sound only when asked, and the sound toggle shows from the request on", () => {
    const requested = run({ type: "request", muted: false });
    expect(requested.muted).toBe(false);
    expect(soundShown(requested)).toBe(true);
    const muted = filmReducer(requested, { type: "volume", muted: true });
    expect(muted.muted).toBe(true);
    expect(soundShown(muted)).toBe(true);
  });

  it("pauses into a paused master that still shows its frame", () => {
    const paused = run({ type: "request", muted: false }, { type: "playing" }, { type: "paused" });
    expect(paused.master).toBe("paused");
    expect(filmDisplay(paused, true)).toBe("master");
    expect(primaryAction(paused)).toBe("play");
    expect(soundShown(paused)).toBe(true);
  });

  it("drops back to idle when paused before any frame arrived", () => {
    const paused = run({ type: "request", muted: false }, { type: "paused" });
    expect(paused.master).toBe("idle");
    expect(filmDisplay(paused, true)).toBe("field");
  });

  it("keeps the loop's frame and the play button when play() is rejected", () => {
    const blocked = run({ type: "loop", state: "playing" }, { type: "request", muted: false }, { type: "loop", state: "idle" }, { type: "blocked" });
    expect(blocked.master).toBe("idle");
    expect(filmDisplay(blocked, true)).toBe("loop");
    expect(primaryAction(blocked)).toBe("play");
    expect(soundShown(blocked)).toBe(false);
  });

  it("hands back to the end poster and 영상 보기 when the master ends, then returns to the loop", () => {
    const ended = run(
      { type: "still" },
      { type: "loop", state: "playing" },
      { type: "request", muted: false },
      { type: "playing" },
      { type: "chapter", index: 7 },
      { type: "ended" },
    );
    expect(ended).toMatchObject({ master: "idle", loop: "idle", chapter: -1, ended: true });
    expect(filmDisplay(ended, true)).toBe("poster");
    expect(primaryAction(ended)).toBe("play");
    expect(soundShown(ended)).toBe(false);
    // After the hold: the loop's frame (and the loop itself when it may play).
    const rested = filmReducer(ended, { type: "rest" });
    expect(filmDisplay(rested, true)).toBe("loop");
    expect(filmDisplay(filmReducer(ended, { type: "loop", state: "playing" }), true)).toBe("loop");
    // Without a decoded loop frame (Save-Data) the frame goes back to the green field.
    const bare = run({ type: "request", muted: false }, { type: "playing" }, { type: "ended" }, { type: "rest" });
    expect(filmDisplay(bare, true)).toBe("field");
    // A new request clears the hold.
    expect(filmReducer(ended, { type: "request", muted: false }).ended).toBe(false);
  });

  it("does not drop a playing master back to loading on a second request (a chapter seek)", () => {
    const seek = run({ type: "request", muted: false }, { type: "playing" }, { type: "request", muted: false });
    expect(seek.master).toBe("playing");
  });

  it("tracks the active chapter", () => {
    expect(run({ type: "chapter", index: 3 }).chapter).toBe(3);
  });

  it("returns the same state object for events that change nothing", () => {
    const state = run({ type: "reveal", open: false });
    expect(filmReducer(state, { type: "reveal", open: false })).toBe(state);
    expect(filmReducer(initialFilmState, { type: "paused" })).toBe(initialFilmState);
    expect(filmReducer(initialFilmState, { type: "chapter", index: -1 })).toBe(initialFilmState);
  });
});
