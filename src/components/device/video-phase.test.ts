import { describe, expect, it } from "vitest";

import { isBusyPhase, phaseAfterEnded, phaseAfterPause, showsVideoForPhase } from "./video-phase";

describe("DeviceVideo phase helpers", () => {
  it("distinguishes manager yields from the reader's own pause", () => {
    expect(phaseAfterPause("playing", { yielded: false, onYield: "still" })).toBe("paused");
    expect(phaseAfterPause("playing", { yielded: true, onYield: "still" })).toBe("still");
    expect(phaseAfterPause("playing", { yielded: true, onYield: "keep" })).toBe("paused");
  });

  it("returns a loading video to the still when play never starts", () => {
    expect(phaseAfterPause("loading", { yielded: false, onYield: "keep" })).toBe("still");
  });

  it("can opt into holding the last video frame at the end", () => {
    expect(phaseAfterEnded("still")).toBe("still");
    expect(phaseAfterEnded("hold")).toBe("ended");
    expect(showsVideoForPhase("ended")).toBe(true);
    expect(isBusyPhase("ended")).toBe(false);
  });
});
