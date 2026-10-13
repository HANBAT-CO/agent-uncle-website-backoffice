/**
 * The wire between DawnMotion (owns the pin and its scrubbed timeline) and
 * the lazy DawnSky island (owns the WebGL loop). No React state crosses it:
 * the sky pulls progress on its own frames, and the motion side only wakes
 * it on pin toggles, refreshes and timeline updates.
 *
 *   const link = createSkyLink();
 *   link.setSource({ progress: () => tl.progress(), running: () => st.isActive });
 *   const stop = link.listen(wakeTheLoop);   // DawnSky
 *   link.wake();                             // DawnMotion, e.g. onToggle
 *
 * It also carries the "near" signal (the cart section entered the viewport),
 * which gates both the sky chunk and the MotionPath plugin.
 */

export type SkySource = {
  /** Scrubbed timeline progress, 0..1. */
  progress(): number;
  /** True while the pin is active or its scrub is still catching up. */
  running(): boolean;
};

export type SkyLink = {
  progress(): number;
  running(): boolean;
  setSource(source: SkySource | null): void;
  /** Subscribe to wake-ups. Returns the unsubscribe. */
  listen(fn: () => void): () => void;
  wake(): void;
  isNear(): boolean;
  markNear(): void;
  /** Runs `fn` once when near (immediately if already near). Returns a cancel. */
  whenNear(fn: () => void): () => void;
};

export function createSkyLink(): SkyLink {
  let source: SkySource | null = null;
  let near = false;
  const listeners = new Set<() => void>();
  const nearCallbacks = new Set<() => void>();

  return {
    progress: () => (source ? Math.min(1, Math.max(0, source.progress())) : 0),
    running: () => (source ? source.running() : false),

    setSource(next) {
      source = next;
      for (const listener of [...listeners]) listener();
    },

    listen(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },

    wake() {
      for (const listener of [...listeners]) listener();
    },

    isNear: () => near,

    markNear() {
      if (near) return;
      near = true;
      const callbacks = [...nearCallbacks];
      nearCallbacks.clear();
      for (const callback of callbacks) callback();
    },

    whenNear(fn) {
      if (near) {
        fn();
        return () => {};
      }
      nearCallbacks.add(fn);
      return () => {
        nearCallbacks.delete(fn);
      };
    },
  };
}
