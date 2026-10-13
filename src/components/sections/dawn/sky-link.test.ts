import { describe, expect, it, vi } from "vitest";

import { createSkyLink } from "./sky-link";

describe("createSkyLink", () => {
  it("reads progress 0 and not running without a source", () => {
    const link = createSkyLink();
    expect(link.progress()).toBe(0);
    expect(link.running()).toBe(false);
  });

  it("pulls progress and running state from the current source, clamped to 0..1", () => {
    const link = createSkyLink();
    let value = 0.4;
    let active = true;
    link.setSource({ progress: () => value, running: () => active });
    expect(link.progress()).toBe(0.4);
    expect(link.running()).toBe(true);
    value = 1.2;
    active = false;
    expect(link.progress()).toBe(1);
    expect(link.running()).toBe(false);
    link.setSource(null);
    expect(link.progress()).toBe(0);
  });

  it("wakes listeners on wake and on source changes, until they unsubscribe", () => {
    const link = createSkyLink();
    const listener = vi.fn();
    const stop = link.listen(listener);
    link.wake();
    link.setSource({ progress: () => 0, running: () => false });
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    link.wake();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("fires near callbacks once, and immediately once already near", () => {
    const link = createSkyLink();
    const early = vi.fn();
    const cancelled = vi.fn();
    link.whenNear(early);
    link.whenNear(cancelled)();
    expect(link.isNear()).toBe(false);
    link.markNear();
    link.markNear();
    expect(early).toHaveBeenCalledTimes(1);
    expect(cancelled).not.toHaveBeenCalled();
    const late = vi.fn();
    link.whenNear(late);
    expect(late).toHaveBeenCalledTimes(1);
  });
});
