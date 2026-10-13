import { describe, expect, it } from "vitest";

import { AUTOPLAY_AT, MediaManagerCore, PAUSE_BELOW, type MediaElementLike } from "./media-manager";

/** A stand-in for HTMLVideoElement: play() resolves or rejects on demand. */
class FakeVideo implements MediaElementLike {
  paused = true;
  ended = false;
  plays = 0;
  pauses = 0;
  private pending: Array<{ resolve: () => void; reject: (reason: unknown) => void }> = [];

  constructor(private readonly mode: "resolve" | "reject" | "manual" = "resolve") {}

  play(): Promise<void> {
    this.plays += 1;
    if (this.mode === "reject") return Promise.reject(new DOMException("autoplay blocked", "NotAllowedError"));
    this.paused = false;
    if (this.mode === "resolve") return Promise.resolve();
    return new Promise((resolve, reject) => this.pending.push({ resolve, reject }));
  }

  pause(): void {
    this.pauses += 1;
    this.paused = true;
  }

  /** Settles the oldest manual play() call. */
  settle(): void {
    this.pending.shift()?.resolve();
  }
}

function setup() {
  let time = 0;
  const manager = new MediaManagerCore({ now: () => time });
  return {
    manager,
    tick: (ms: number) => {
      time += ms;
    },
  };
}

describe("MediaManagerCore", () => {
  it("resolves false and frees the decoder when every source fails (play() never settles)", async () => {
    const { manager } = setup();
    const broken = new FakeVideo("manual");
    const other = new FakeVideo();
    manager.register("a", broken);
    manager.register("b", other);
    const started = manager.play("a");
    expect(manager.playingId).toBe("a");
    manager.notifyFailed("a");
    await expect(started).resolves.toBe(false);
    expect(manager.playingId).toBeNull();
    expect(broken.paused).toBe(true);
    await expect(manager.play("b")).resolves.toBe(true);
    expect(manager.playingId).toBe("b");
  });

  it("ignores a failure report for a video that does not hold the decoder", async () => {
    const { manager } = setup();
    const a = new FakeVideo();
    const b = new FakeVideo();
    manager.register("a", a);
    manager.register("b", b);
    await manager.play("a");
    manager.notifyFailed("b");
    expect(manager.playingId).toBe("a");
    expect(a.paused).toBe(false);
  });

  it("plays a registered video and resolves true", async () => {
    const { manager } = setup();
    const video = new FakeVideo();
    manager.register("a", video);
    await expect(manager.play("a")).resolves.toBe(true);
    expect(video.paused).toBe(false);
    expect(manager.playingId).toBe("a");
  });

  it("returns an unregister function that forgets and pauses the video", async () => {
    const { manager } = setup();
    const video = new FakeVideo();
    const unregister = manager.register("a", video);
    await manager.play("a");
    unregister();
    expect(video.paused).toBe(true);
    expect(manager.playingId).toBeNull();
    await expect(manager.play("a")).resolves.toBe(false);
    expect(video.plays).toBe(1);
  });

  it("keeps a newer registration when a stale unregister runs (strict mode remount)", async () => {
    const { manager } = setup();
    const first = new FakeVideo();
    const second = new FakeVideo();
    const unregisterFirst = manager.register("a", first);
    manager.register("a", second);
    unregisterFirst();
    await expect(manager.play("a")).resolves.toBe(true);
    expect(second.paused).toBe(false);
  });

  it("lets only one video play at a time", async () => {
    const { manager } = setup();
    const a = new FakeVideo();
    const b = new FakeVideo();
    manager.register("a", a);
    manager.register("b", b);
    await manager.play("a");
    await manager.play("b");
    expect(a.paused).toBe(true);
    expect(b.paused).toBe(false);
    expect(manager.playingId).toBe("b");
  });

  it("resolves false when the element rejects play() (autoplay blocked, low power mode)", async () => {
    const { manager } = setup();
    const video = new FakeVideo("reject");
    manager.register("a", video);
    await expect(manager.play("a")).resolves.toBe(false);
    expect(manager.playingId).toBeNull();
  });

  it("pauses the earlier request when a later play() settles first", async () => {
    const { manager } = setup();
    const slow = new FakeVideo("manual");
    const fast = new FakeVideo();
    manager.register("slow", slow);
    manager.register("fast", fast);
    const slowResult = manager.play("slow");
    await expect(manager.play("fast")).resolves.toBe(true);
    slow.settle();
    await expect(slowResult).resolves.toBe(false);
    expect(slow.paused).toBe(true);
    expect(fast.paused).toBe(false);
    expect(manager.playingId).toBe("fast");
  });

  it("resolves false for an unknown id", async () => {
    const { manager } = setup();
    await expect(manager.play("missing")).resolves.toBe(false);
  });

  it("pause() and pauseAll() stop playback", async () => {
    const { manager } = setup();
    const a = new FakeVideo();
    const b = new FakeVideo();
    manager.register("a", a);
    manager.register("b", b);
    await manager.play("a");
    manager.pause("a");
    expect(a.paused).toBe(true);
    expect(manager.playingId).toBeNull();
    await manager.play("b");
    manager.pauseAll();
    expect(b.paused).toBe(true);
    expect(manager.playingId).toBeNull();
  });

  describe("yields (pauses the reader did not ask for)", () => {
    it("marks the video that loses the decoder to another, and not the reader's own pause", async () => {
      const { manager } = setup();
      const a = new FakeVideo();
      const b = new FakeVideo();
      manager.register("a", a);
      manager.register("b", b);
      await manager.play("a");
      await manager.play("b");
      expect(a.paused).toBe(true);
      expect(manager.takeYield("a")).toBe(true);
      // read once: the flag belongs to that one pause event
      expect(manager.takeYield("a")).toBe(false);
      manager.pause("b");
      expect(manager.takeYield("b")).toBe(false);
    });

    it("marks a pause below 25% visibility and pauseAll()", async () => {
      const { manager } = setup();
      const a = new FakeVideo();
      const b = new FakeVideo();
      manager.register("a", a);
      manager.register("b", b);
      await manager.play("a");
      manager.setVisibility("a", PAUSE_BELOW - 0.05);
      expect(manager.takeYield("a")).toBe(true);
      await manager.play("b");
      manager.pauseAll();
      expect(manager.takeYield("b")).toBe(true);
    });

    it("does not mark a video that was already paused, and clears a stale mark on the next play", async () => {
      const { manager } = setup();
      const a = new FakeVideo();
      manager.register("a", a);
      manager.setVisibility("a", 0);
      expect(manager.takeYield("a")).toBe(false);
      await manager.play("a");
      manager.pauseAll();
      await manager.play("a");
      manager.pause("a");
      expect(manager.takeYield("a")).toBe(false);
    });
  });

  describe("visibility", () => {
    it("uses the spec thresholds: pause below 25%, autoplay at 50%", () => {
      expect(PAUSE_BELOW).toBe(0.25);
      expect(AUTOPLAY_AT).toBe(0.5);
    });

    it("pauses a playing video when less than 25% of it is visible", async () => {
      const { manager } = setup();
      const video = new FakeVideo();
      manager.register("a", video);
      manager.setVisibility("a", 1);
      await manager.play("a");
      manager.setVisibility("a", 0.3);
      expect(video.paused).toBe(false);
      manager.setVisibility("a", 0.2);
      expect(video.paused).toBe(true);
      expect(manager.playingId).toBeNull();
    });

    it("autoplays an in-view video at 50% visibility when allowed", async () => {
      const { manager } = setup();
      manager.setPolicy({ reducedMotion: false, lowPower: false });
      const video = new FakeVideo();
      manager.register("a", video, { autoplay: true });
      manager.setVisibility("a", 0.4);
      expect(video.plays).toBe(0);
      manager.setVisibility("a", 0.5);
      await Promise.resolve();
      expect(video.plays).toBe(1);
      expect(manager.playingId).toBe("a");
    });

    it("never autoplays an on-demand video", () => {
      const { manager } = setup();
      manager.setPolicy({ reducedMotion: false, lowPower: false });
      const video = new FakeVideo();
      manager.register("a", video);
      manager.setVisibility("a", 1);
      expect(video.plays).toBe(0);
    });

    it("does not autoplay under reduced motion", () => {
      const { manager } = setup();
      manager.setPolicy({ reducedMotion: true, lowPower: false });
      const video = new FakeVideo();
      manager.register("a", video, { autoplay: true });
      manager.setVisibility("a", 1);
      expect(video.plays).toBe(0);
      expect(manager.autoplayAllowed).toBe(false);
    });

    it("does not autoplay on low-power devices", () => {
      const { manager } = setup();
      manager.setPolicy({ reducedMotion: false, lowPower: true });
      const video = new FakeVideo();
      manager.register("a", video, { autoplay: true });
      manager.setVisibility("a", 1);
      expect(video.plays).toBe(0);
    });

    it("starts disallowed until a policy says otherwise (the SSR-safe default)", () => {
      const { manager } = setup();
      const video = new FakeVideo();
      manager.register("a", video, { autoplay: true });
      manager.setVisibility("a", 1);
      expect(video.plays).toBe(0);
    });

    it("stops an autoplaying video when the policy turns autoplay off", async () => {
      const { manager } = setup();
      manager.setPolicy({ reducedMotion: false, lowPower: false });
      const video = new FakeVideo();
      manager.register("a", video, { autoplay: true });
      manager.setVisibility("a", 1);
      await Promise.resolve();
      manager.setPolicy({ reducedMotion: true });
      expect(video.paused).toBe(true);
    });

    it("keeps a user's pause until the video leaves view and comes back", async () => {
      const { manager } = setup();
      manager.setPolicy({ reducedMotion: false, lowPower: false });
      const video = new FakeVideo();
      manager.register("a", video, { autoplay: true });
      manager.setVisibility("a", 1);
      await Promise.resolve();
      manager.pause("a");
      manager.setVisibility("a", 0.9);
      manager.setVisibility("a", 1);
      expect(video.plays).toBe(1);
      manager.setVisibility("a", 0);
      manager.setVisibility("a", 0.6);
      expect(video.plays).toBe(2);
    });

    it("does not replay a finished in-view video until it re-enters view", async () => {
      const { manager } = setup();
      manager.setPolicy({ reducedMotion: false, lowPower: false });
      const video = new FakeVideo();
      manager.register("a", video, { autoplay: true });
      manager.setVisibility("a", 1);
      await Promise.resolve();
      video.paused = true;
      video.ended = true;
      manager.notifyEnded("a");
      expect(manager.playingId).toBeNull();
      manager.setVisibility("a", 0.8);
      expect(video.plays).toBe(1);
      manager.setVisibility("a", 0.1);
      manager.setVisibility("a", 0.7);
      expect(video.plays).toBe(2);
    });

    it("lets the most recently visible in-view video take the decoder", async () => {
      const { manager, tick } = setup();
      manager.setPolicy({ reducedMotion: false, lowPower: false });
      const a = new FakeVideo();
      const b = new FakeVideo();
      manager.register("a", a, { autoplay: true });
      manager.register("b", b, { autoplay: true });
      manager.setVisibility("a", 1);
      await Promise.resolve();
      tick(400);
      manager.setVisibility("b", 0.6);
      await Promise.resolve();
      expect(a.paused).toBe(true);
      expect(b.paused).toBe(false);
      expect(manager.playingId).toBe("b");
      // A stays put while still in view: no ping-pong.
      tick(400);
      manager.setVisibility("a", 0.9);
      expect(a.plays).toBe(1);
    });

    it("never takes over a video the reader started", async () => {
      const { manager } = setup();
      manager.setPolicy({ reducedMotion: false, lowPower: false });
      const user = new FakeVideo();
      const auto = new FakeVideo();
      manager.register("user", user);
      manager.register("auto", auto, { autoplay: true });
      await manager.play("user");
      manager.setVisibility("auto", 1);
      expect(auto.plays).toBe(0);
      expect(manager.playingId).toBe("user");
    });

    it("autoplays on register when the video is already in view", async () => {
      const { manager } = setup();
      manager.setPolicy({ reducedMotion: false, lowPower: false });
      manager.setVisibility("a", 0.75);
      const video = new FakeVideo();
      manager.register("a", video, { autoplay: true });
      await Promise.resolve();
      expect(video.plays).toBe(1);
    });
  });
});
