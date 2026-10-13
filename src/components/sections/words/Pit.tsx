"use client";

import { useEffect, type RefObject } from "react";
import type MatterNamespace from "matter-js";

import {
  binOf,
  bodySize,
  clearBodies,
  collectBodies,
  heapFrame,
  pitSize,
  placeGloss,
  setFlag,
  setPitMode,
  writePose,
  type PitBodyEls,
} from "./pit-dom";
import { NO_SPIN_IDS, fallbackHeap, heapPose, heapSpot, type HeapLayout } from "./pit-heap";
import {
  PHYSICS,
  bodySpecFromRect,
  createRng,
  isAbovePit,
  normalizeAngle,
  planSpawn,
  recordPoses,
  restorePoses,
  selectBodyIds,
  spawnTop,
  uprightAngle,
  wallSpecs,
  type Bin,
  type PitPhase,
  type PitSize,
  type Pose,
  type PoseMap,
  type SpawnPlan,
} from "./pit-physics";

/**
 * S2 physics pit (spec S2, 6.1, 6.6, 13). Lazy client leaf: WordsMotion mounts
 * it once the section is within a viewport, and it imports matter-js only
 * then. It renders nothing; it drives the server-rendered pills.
 *
 * - Engine: gravity y 1.1, sleeping on. Walls from the bin (the heap frame's
 *   width: a narrow, deep bin on desktop so the twelve pills stack, and about
 *   70% of the column on phones so the eight stack). Bodies
 *   are chamfered rectangles sized from each pill's layout box (restitution
 *   0.25, friction 0.5, frictionAir 0.02), spawned in two waves 250ms apart
 *   from just above the pit top, already falling (PHYSICS.spawnSpeed), so the
 *   pile lands in about a second. The pit clips both axes, so the pills slide
 *   in under the lede line and never cross the copy; once every body is in,
 *   the ceiling drops to the pit top so a throw stays in the arena.
 * - afterUpdate writes translate3d + rotate to the pills that moved. Spin is
 *   damped past about 34 degrees, '…' never spins, and a pill resting past 90
 *   degrees turns a half turn (same footprint, label up).
 * - freeze() never records a pill in mid-air: it spawns any pending wave,
 *   runs the engine synchronously until the pile rests, and returns both the
 *   poses the pills had (for a short settle tween) and the resting poses. A
 *   pit that never fell (arrival from below) starts and settles in one go.
 *   thaw() undoes it when the reader scrubs back to the pile: the bodies go
 *   dynamic again, asleep where they are drawn, and can be grabbed; the next
 *   freeze records the pile afresh. reset() (the reader went back above the
 *   section) returns the pit to its fresh-load state: the heap, unseen until
 *   the next fall (words.css), its vocabulary pills still in the tab order.
 * - matter-js failing to load (a flaky network, chunk hashes gone after a
 *   deploy) calls onFailed: WordsMotion shows the heap at rest instead.
 * - The runner runs only while the pit intersects the viewport and stops
 *   when every body sleeps (a press on a pill wakes it), so nothing loops
 *   idle or off-screen.
 * - Fine pointer on desktop: MouseConstraint (stiffness 0.2) to grab and
 *   throw. Its wheel and touch listeners are removed, so Lenis keeps the
 *   wheel and touch scrolling is never captured; mouseup is heard on the
 *   window, so a release outside the pit ends the drag.
 * - Phones: 8 bodies, no MouseConstraint. Low power: the six bubbles only.
 *
 * Test hooks on [data-words-pit]: data-pit-mode (heap | live),
 * data-pit-runner (running | stopped), data-pit-frames (engine updates, a
 * counter that must stand still off-screen), data-pit-bodies (body count),
 * data-pit-engine (ready), data-pit-asleep, data-pit-sealed (ceiling at the
 * pit top).
 */

type Matter = typeof MatterNamespace;

export type FreezeResult = {
  /** Where each pill rests: the settled pile, by id. */
  poses: PoseMap;
  /** Where each pill was when the freeze came (mid-air after a fast scroll); equal to poses if it had settled. */
  from: PoseMap;
  size: PitSize;
  bin: Bin;
};

export type PitHandle = {
  /** Spawn the two waves and run. Once per entry. */
  start(): void;
  /** Settle the pile now, make every body static and return the poses. Starts first if the pit never fell. */
  freeze(): FreezeResult;
  /** Bring the pile to rest at once and keep it live (a keyboard user tabbed into a falling pit). */
  settle(): void;
  /**
   * Back below the freeze (a reverse scrub): the frozen pile turns live again
   * at `poses` (where WordsMotion draws it), asleep until a press wakes it.
   * False when this engine never froze a pile (WordsMotion laid the heap out
   * before matter-js arrived): that pile stays frozen.
   */
  thaw(poses: PoseMap): boolean;
  /**
   * Back to the fresh-load state: no bodies, the heap in place (words.css keeps it unseen until
   * the next fall), every pill still focusable, ready to fall again.
   */
  reset(): void;
  /** Resume after sleep (a press on a pill). */
  wake(): void;
};

export type PitProps = {
  rootRef: RefObject<HTMLElement | null>;
  layout: HeapLayout;
  lowPower: boolean;
  /** MouseConstraint: desktop with a fine pointer. */
  interactive: boolean;
  handle: RefObject<PitHandle | null>;
  control: RefObject<{ phase: PitPhase }>;
  onReady: () => void;
  /** matter-js could not be loaded: there is no engine this visit. */
  onFailed: () => void;
};

/** Spawn seeds: deterministic per run, a different heap on each replay. */
const SEED = 2330;

type MouseHandlers = {
  mousemove: EventListener;
  mousedown: EventListener;
  mouseup: EventListener;
  mousewheel: EventListener;
};

function createPitEngine(
  M: Matter,
  pit: HTMLElement,
  { layout, lowPower, interactive }: { layout: HeapLayout; lowPower: boolean; interactive: boolean },
): { handle: PitHandle; dispose: () => void } {
  const items = collectBodies(pit).filter((body) => layout === "desktop" || !body.desktopOnly);
  const chosenIds = new Set(selectBodyIds(items, { mode: layout, lowPower }));
  const chosen = items.filter((body) => chosenIds.has(body.id));
  const byId = new Map(chosen.map((body) => [body.id, body]));
  const heapName = fallbackHeap(layout);

  const engine = M.Engine.create({ gravity: { x: 0, y: PHYSICS.gravityY }, enableSleeping: true });
  const runner = M.Runner.create();
  const live = new Map<string, MatterNamespace.Body>();
  const sizes = new Map<string, { width: number; height: number }>();
  let walls: MatterNamespace.Body[] = [];
  let ceilingY = -800;
  let sealed = false;
  let phase: PitPhase = "idle";
  let running = false;
  let visible = false;
  /** Synchronous settle in progress: step the physics without touching the DOM. */
  let quiet = false;
  let frames = 0;
  let replays = 0;
  let pending = 0;
  let timers: ReturnType<typeof setTimeout>[] = [];
  /** Waves whose timer has not fired yet (a freeze spawns them at once). */
  let queued: SpawnPlan[][] = [];
  let frozen: FreezeResult | null = null;

  /* ---------- Mouse (fine pointer, desktop) ---------- */
  let mouse: MatterNamespace.Mouse | null = null;
  let mouseConstraint: MatterNamespace.MouseConstraint | null = null;
  let handlers: MouseHandlers | null = null;
  const releaseMouse = () => {
    if (mouse) (mouse as unknown as { button: number }).button = -1;
  };
  if (interactive) {
    mouse = M.Mouse.create(pit);
    handlers = mouse as unknown as MouseHandlers;
    // Keep the wheel for Lenis and never capture touch scrolling.
    pit.removeEventListener("wheel", handlers.mousewheel);
    pit.removeEventListener("mousewheel", handlers.mousewheel);
    pit.removeEventListener("DOMMouseScroll", handlers.mousewheel);
    pit.removeEventListener("touchmove", handlers.mousemove);
    pit.removeEventListener("touchstart", handlers.mousedown);
    pit.removeEventListener("touchend", handlers.mouseup);
    // A throw released over the heading still ends the drag (and lets the runner sleep).
    pit.removeEventListener("mouseup", handlers.mouseup);
    window.addEventListener("mouseup", handlers.mouseup);
    window.addEventListener("blur", releaseMouse);
    mouseConstraint = M.MouseConstraint.create(engine, {
      mouse,
      constraint: { stiffness: PHYSICS.mouseStiffness, render: { visible: false } } as MatterNamespace.IConstraintDefinition,
    });
  }

  const setRunnerAttr = () => {
    pit.dataset.pitRunner = running ? "running" : "stopped";
    pit.dataset.pitFrames = String(frames);
  };

  const run = () => {
    if (running || !visible || phase !== "falling") return;
    delete pit.dataset.pitAsleep;
    M.Runner.run(runner, engine);
    running = true;
    setRunnerAttr();
  };

  const stop = () => {
    if (!running) return;
    M.Runner.stop(runner);
    running = false;
    setRunnerAttr();
  };

  const buildWalls = (size: PitSize) => {
    if (walls.length > 0) M.Composite.remove(engine.world, walls);
    walls = wallSpecs(size, { thickness: PHYSICS.wallThickness, ceilingY, bin: binOf(pit) }).map((wall) =>
      M.Bodies.rectangle(wall.x, wall.y, wall.width, wall.height, { isStatic: true, label: `wall-${wall.name}` }),
    );
    M.Composite.add(engine.world, walls);
  };

  /** Once every pill is inside the pit, the ceiling drops to the pit top: throws stay in the arena. */
  const sealIfInside = () => {
    if (sealed || pending > 0 || live.size === 0) return;
    for (const body of live.values()) if (body.bounds.min.y < 0) return;
    sealed = true;
    ceilingY = 0;
    pit.dataset.pitSealed = "";
    buildWalls(pitSize(pit));
  };

  const addMouse = () => {
    if (mouseConstraint && !engine.world.constraints.includes(mouseConstraint.constraint)) {
      M.Composite.add(engine.world, mouseConstraint);
      pit.dataset.pitGrab = "";
    }
  };

  const removeMouse = () => {
    releaseMouse();
    if (mouseConstraint) M.Composite.remove(engine.world, mouseConstraint);
    delete pit.dataset.pitGrab;
  };

  const write = (body: PitBodyEls, matterBody: MatterNamespace.Body) => {
    const size = sizes.get(body.id);
    if (!size) return;
    const pose = { x: matterBody.position.x, y: matterBody.position.y, angle: matterBody.angle };
    writePose(body, pose, size);
    if (body.wrapper.hasAttribute("data-gloss-open")) placeGloss(body, pit, pose);
  };

  /** Keep labels readable: damp spin past the tilt limit; a resting pill past 90 degrees turns label up. */
  const keepReadable = (matterBody: MatterNamespace.Body) => {
    const angle = normalizeAngle(matterBody.angle);
    if (Math.abs(angle) > PHYSICS.tiltDampFrom) {
      M.Body.setAngularVelocity(matterBody, matterBody.angularVelocity * PHYSICS.tiltDamp);
    }
    if (
      Math.abs(angle) > Math.PI / 2 &&
      matterBody.speed < PHYSICS.restSpeed &&
      matterBody.angularSpeed < PHYSICS.restAngularSpeed
    ) {
      // Same footprint, so the pile does not move; only the label turns the right way up.
      M.Body.setAngle(matterBody, matterBody.angle + (uprightAngle(angle) - angle));
    }
  };

  M.Events.on(engine, "afterUpdate", () => {
    frames += 1;
    let awake = 0;
    for (const [id, matterBody] of live) {
      if (matterBody.isStatic || matterBody.isSleeping) continue;
      awake += 1;
      keepReadable(matterBody);
      if (quiet) continue;
      const body = byId.get(id);
      if (body) write(body, matterBody);
    }
    sealIfInside();
    if (quiet) return;
    if (frames % 10 === 0) pit.dataset.pitFrames = String(frames);
    const holding = mouseConstraint?.body != null || (mouse !== null && mouse.button === 0);
    if (awake === 0 && pending === 0 && !holding) {
      pit.dataset.pitAsleep = "";
      stop();
    }
  });

  /*
   * ---------- Reveal ----------
   * hideAll() hides every pill as the pit leaves the CSS heap for live mode, and the pills it hid
   * show two frames later, once a frame has painted them hidden. A pill painted on the heap and
   * then on the spawn line in the next frame reads as a jump, and Chrome scores it as a layout
   * shift (an ancestor's opacity does not exempt it; visibility does). A pill holding keyboard
   * focus is never held back, so focus always sits on a rendered control.
   */
  let revealFrame = 0;
  const toReveal = new Set<PitBodyEls>();
  const cancelReveal = () => {
    cancelAnimationFrame(revealFrame);
    revealFrame = 0;
    toReveal.clear();
  };
  const holdReveal = () => {
    cancelReveal();
    revealFrame = requestAnimationFrame(() => {
      revealFrame = requestAnimationFrame(() => {
        revealFrame = 0;
        for (const body of toReveal) setFlag(body, "pitHidden", false);
        toReveal.clear();
      });
    });
  };
  const show = (body: PitBodyEls) => {
    if (revealFrame && !body.wrapper.contains(document.activeElement)) toReveal.add(body);
    else setFlag(body, "pitHidden", false);
  };

  const spawn = (plan: readonly SpawnPlan[]) => {
    const added: MatterNamespace.Body[] = [];
    for (const entry of plan) {
      const body = byId.get(entry.id);
      const size = sizes.get(entry.id);
      if (!body || !size) continue;
      const spec = bodySpecFromRect(body.id, body.kind, size);
      const noSpin = NO_SPIN_IDS.has(body.id);
      // '…' never spins and starts nearly level, so it always reads as an ellipsis.
      const angle = noSpin ? entry.angle * 0.25 : entry.angle;
      const matterBody = M.Bodies.rectangle(entry.x, entry.y, spec.width, spec.height, {
        chamfer: { radius: spec.chamfer },
        restitution: PHYSICS.restitution,
        friction: PHYSICS.friction,
        frictionAir: PHYSICS.frictionAir,
        angle,
        label: body.id,
      });
      if (noSpin) M.Body.setInertia(matterBody, Infinity);
      // The pills enter already falling (they slide in under the pit's clipped top edge).
      M.Body.setVelocity(matterBody, { x: 0, y: PHYSICS.spawnSpeed });
      live.set(body.id, matterBody);
      added.push(matterBody);
      writePose(body, { x: entry.x, y: entry.y, angle }, size);
      show(body);
    }
    M.Composite.add(engine.world, added);
    pending -= 1;
    run();
  };

  const clearTimers = () => {
    for (const timer of timers) clearTimeout(timer);
    timers = [];
    queued = [];
    pending = 0;
  };

  /** Spawn every wave still waiting for its timer, now. */
  const flushPending = () => {
    const waves = queued;
    for (const timer of timers) clearTimeout(timer);
    timers = [];
    queued = [];
    for (const wave of waves) spawn(wave);
  };

  /** Run the engine synchronously (no DOM writes) until every body sleeps, within a step budget. */
  const fastForward = () => {
    const anyAwake = () => {
      for (const matterBody of live.values()) if (!matterBody.isStatic && !matterBody.isSleeping) return true;
      return false;
    };
    quiet = true;
    try {
      for (let step = 0; step < PHYSICS.settleSteps && anyAwake(); step += 1) {
        M.Engine.update(engine, PHYSICS.stepMs);
      }
    } finally {
      quiet = false;
    }
  };

  const currentPoses = (): PoseMap => recordPoses(live.values());

  const removeBodies = () => {
    if (live.size > 0) M.Composite.remove(engine.world, [...live.values()]);
    live.clear();
  };

  const hideAll = () => {
    for (const body of items) {
      setFlag(body, "pitHidden", true);
      setFlag(body, "pitSkip", !chosenIds.has(body.id));
      setFlag(body, "landed", false);
      setFlag(body, "glossOpen", false);
    }
    holdReveal();
  };

  const handle: PitHandle = {
    start() {
      if (phase !== "idle") return;
      phase = "falling";
      frozen = null;
      sealed = false;
      delete pit.dataset.pitSealed;
      setPitMode(pit, "live");
      hideAll();
      // Measure in live mode, untransformed: the bodies' own boxes. A pill with no box yet (a
      // resize or a font swap mid-layout) sits this fall out; the freeze puts it on its heap spot.
      sizes.clear();
      const ready: PitBodyEls[] = [];
      for (const body of chosen) {
        const box = bodySize(body);
        if (!(box.width > 0 && box.height > 0)) continue;
        sizes.set(body.id, box);
        ready.push(body);
      }
      const specs = ready.map((body) => bodySpecFromRect(body.id, body.kind, sizes.get(body.id) ?? bodySize(body)));
      const size = pitSize(pit);
      const bin = binOf(pit);
      // Spawn just above the pit top, across the bin. The pit clips, so the
      // pills slide in under the lede line instead of raining through it.
      const plan = planSpawn(specs, { width: bin.width, height: size.height }, createRng(SEED + replays), {
        clearance: 0,
      }).map((entry) => ({ ...entry, x: entry.x + bin.left }));
      ceilingY = spawnTop(plan, specs) - PHYSICS.ceilingClearance;
      buildWalls(size);
      addMouse();
      pit.dataset.pitBodies = String(ready.length);

      const waves = [0, 1].map((wave) => plan.filter((entry) => entry.wave === wave)).filter((wave) => wave.length > 0);
      pending = waves.length;
      for (const wave of waves) {
        const delay = wave[0].delay;
        if (delay === 0) {
          spawn(wave);
          continue;
        }
        queued.push(wave);
        timers.push(
          setTimeout(() => {
            queued = queued.filter((entry) => entry !== wave);
            spawn(wave);
          }, delay),
        );
      }
    },

    freeze() {
      if (phase === "frozen" && frozen) return frozen;
      if (phase === "idle") handle.start();
      flushPending();
      removeMouse();
      const ids = chosen.map((body) => body.id);
      const frame = heapFrame(pit);
      const fallback = (id: string): Pose => heapPose(heapSpot(id, heapName), frame);
      const from = restorePoses(currentPoses(), ids, fallback);
      // Never record a pill in mid-air: run the pile to rest first.
      fastForward();
      const settled = currentPoses();
      const poses: Record<string, Pose> = {};
      for (const id of ids) {
        const pose = settled[id];
        const size = sizes.get(id);
        // Still above the pit after the settle (wedged on a throw): it never landed; use its heap spot.
        poses[id] = pose && size && !isAbovePit(pose, size) ? { ...pose, angle: uprightAngle(pose.angle) } : fallback(id);
      }
      for (const body of chosen) {
        writePose(body, from[body.id], sizes.get(body.id) ?? bodySize(body));
        show(body);
      }
      for (const matterBody of live.values()) M.Body.setStatic(matterBody, true);
      stop();
      phase = "frozen";
      frozen = { poses, from, size: pitSize(pit), bin: binOf(pit) };
      return frozen;
    },

    settle() {
      if (phase === "frozen") return;
      if (phase === "idle") handle.start();
      flushPending();
      fastForward();
      for (const [id, matterBody] of live) {
        const body = byId.get(id);
        if (body) write(body, matterBody);
      }
    },

    thaw(poses) {
      if (phase !== "frozen") return false;
      for (const [id, matterBody] of live) {
        const pose = poses[id];
        if (pose) {
          M.Body.setPosition(matterBody, { x: pose.x, y: pose.y });
          M.Body.setAngle(matterBody, pose.angle);
        }
        M.Body.setStatic(matterBody, false);
        M.Sleeping.set(matterBody, true);
      }
      // The pit may have been resized while frozen: the walls follow it, the ceiling stays sealed.
      buildWalls(pitSize(pit));
      addMouse();
      frozen = null;
      phase = "falling";
      pit.dataset.pitAsleep = "";
      return true;
    },

    reset() {
      clearTimers();
      cancelReveal();
      stop();
      removeBodies();
      removeMouse();
      phase = "idle";
      frozen = null;
      sealed = false;
      ceilingY = -800;
      replays += 1;
      frames = 0;
      delete pit.dataset.pitAsleep;
      delete pit.dataset.pitSealed;
      setRunnerAttr();
      // The fresh-load state, not hidden pills: hidden (visibility) would take the vocabulary pills
      // out of the tab order and the accessibility tree until the next fall. The heap waits unseen
      // by opacity alone (words.css); start() hides the pills as the next fall begins.
      clearBodies(items);
      setPitMode(pit, "heap");
    },

    wake() {
      if (phase !== "falling") return;
      run();
    },
  };

  /* ---------- Visibility: run only while the pit intersects ---------- */
  const observer = new IntersectionObserver((entries) => {
    const entry = entries.at(-1);
    if (!entry) return;
    visible = entry.isIntersecting;
    if (visible) run();
    else stop();
  });
  observer.observe(pit);

  /* ---------- Resize while falling: walls follow the bin, the pile keeps its shape ---------- */
  let lastSize = pitSize(pit);
  let lastBin = binOf(pit);
  const resizer = new ResizeObserver(() => {
    const size = pitSize(pit);
    if (size.width === lastSize.width && size.height === lastSize.height) return;
    const prevSize = lastSize;
    const prevBin = lastBin;
    lastSize = size;
    lastBin = binOf(pit);
    if (phase !== "falling") return;
    buildWalls(size);
    const sx = prevBin.width > 0 ? lastBin.width / prevBin.width : 1;
    for (const matterBody of live.values()) {
      const halfX = (matterBody.bounds.max.x - matterBody.bounds.min.x) / 2;
      const halfY = (matterBody.bounds.max.y - matterBody.bounds.min.y) / 2;
      // x scales with the bin (so bodies are not dropped onto each other), y keeps its distance from the floor.
      const scaledX = lastBin.left + (matterBody.position.x - prevBin.left) * sx;
      const x = Math.min(Math.max(scaledX, lastBin.left + halfX), Math.max(lastBin.left + halfX, lastBin.left + lastBin.width - halfX));
      const y = Math.min(size.height - (prevSize.height - matterBody.position.y), size.height - halfY);
      if (x !== matterBody.position.x || y !== matterBody.position.y) M.Body.setPosition(matterBody, { x, y });
      M.Sleeping.set(matterBody, false);
    }
    run();
  });
  resizer.observe(pit);

  pit.dataset.pitEngine = "ready";
  setRunnerAttr();

  const dispose = () => {
    clearTimers();
    cancelReveal();
    stop();
    observer.disconnect();
    resizer.disconnect();
    if (handlers) {
      pit.removeEventListener("mousemove", handlers.mousemove);
      pit.removeEventListener("mousedown", handlers.mousedown);
      window.removeEventListener("mouseup", handlers.mouseup);
      window.removeEventListener("blur", releaseMouse);
    }
    M.Events.off(engine, "afterUpdate");
    M.Composite.clear(engine.world, false);
    M.Engine.clear(engine);
    live.clear();
    delete pit.dataset.pitEngine;
    delete pit.dataset.pitGrab;
    delete pit.dataset.pitBodies;
    delete pit.dataset.pitAsleep;
    delete pit.dataset.pitSealed;
  };

  return { handle, dispose };
}

export default function Pit({ rootRef, layout, lowPower, interactive, handle, control, onReady, onFailed }: PitProps) {
  useEffect(() => {
    const pit = rootRef.current?.querySelector<HTMLElement>("[data-words-pit]");
    if (!pit) return;
    let disposed = false;
    let dispose: (() => void) | null = null;

    void import("matter-js").then(
      (mod) => {
        if (disposed) return;
        const M = ((mod as unknown as { default?: Matter }).default ?? mod) as Matter;
        const engine = createPitEngine(M, pit, { layout, lowPower, interactive });
        dispose = engine.dispose;
        handle.current = engine.handle;
        // A freeze before the engine existed already laid the pills out; leave them.
        if (control.current.phase === "frozen") return;
        onReady();
      },
      // Only the load: an error past it is a bug, not a missing engine.
      () => {
        if (!disposed) onFailed();
      },
    );

    return () => {
      disposed = true;
      handle.current = null;
      dispose?.();
    };
  }, [rootRef, layout, lowPower, interactive, handle, control, onReady, onFailed]);

  return null;
}
