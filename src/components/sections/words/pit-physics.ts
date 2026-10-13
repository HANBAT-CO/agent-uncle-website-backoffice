/**
 * S2 physics pit, pure parts (spec S2, 6.6). No DOM and no matter-js here:
 * Pit.tsx feeds DOM rects in and applies the results to matter bodies, so the
 * decisions that matter for determinism and reversibility stay unit-tested.
 *
 * - Body sizing from DOM boxes: a rounded rectangle whose chamfer is just
 *   under half its height, so the ends are round without degenerate edges.
 * - Spawn: two waves 250ms apart, each spread across the pit in lanes, every
 *   body tilted within plus or minus 25 degrees and stacked above the pit so
 *   no two bodies start overlapping (an overlap would pop them apart).
 * - Walls: floor, sides and a ceiling outside the bin (the part of the pit
 *   box the pile lives in; the whole box by default).
 * - Freeze records each body's pose by id; restore falls back for bodies that
 *   never spawned. A pose still poking above the pit top after the settle is
 *   treated as never landed, and a pill resting past 90 degrees is turned a
 *   half turn (same footprint, label up).
 *
 * Coordinates are pit pixels: x from the left wall, y from the pit top, the
 * pose is the body's centre, angles in radians (matter-js convention).
 */

export type PitItemKind = "bubble" | "vocab";

export type PitSize = { readonly width: number; readonly height: number };

export type Pose = { readonly x: number; readonly y: number; readonly angle: number };

export type PoseMap = Readonly<Record<string, Pose>>;

export type BodySpec = {
  readonly id: string;
  readonly kind: PitItemKind;
  readonly width: number;
  readonly height: number;
  /** Corner radius for Bodies.rectangle({ chamfer: { radius } }). */
  readonly chamfer: number;
};

export type SpawnPlan = {
  readonly id: string;
  readonly wave: 0 | 1;
  /** Milliseconds after the fall starts. */
  readonly delay: number;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
};

/** The pile's horizontal extent inside the pit, in pit pixels. */
export type Bin = { readonly left: number; readonly width: number };

export type WallSpec = {
  readonly name: "floor" | "left" | "right" | "ceiling";
  /** Centre and size, as Bodies.rectangle takes them. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

/** What selectBodyIds needs to know about a pill. */
export type PitItemRef = { readonly id: string; readonly kind: PitItemKind; readonly desktopOnly: boolean };

export type PitPhase = "idle" | "falling" | "frozen";
export type PitEvent = "start" | "freeze" | "reset";

const DEG = Math.PI / 180;
/** Float tolerance for spawn stacking: a box moved exactly onto another's edge does not overlap it. */
const EPS = 1e-6;

/** Spec S2 physics constants. */
export const PHYSICS = {
  gravityY: 1.1,
  restitution: 0.25,
  friction: 0.5,
  frictionAir: 0.02,
  /** MouseConstraint stiffness (fine pointer only). */
  mouseStiffness: 0.2,
  waveGapMs: 250,
  maxSpawnAngle: 25 * DEG,
  /** Thick walls so a thrown pill cannot tunnel through in one step. */
  wallThickness: 400,
  /** Vertical clearance between stacked spawns and above the pit edge. */
  spawnGap: 16,
  /** Space between the highest spawn and the ceiling (until every body is inside the pit). */
  ceilingClearance: 160,
  /**
   * Downward speed a pill enters with (px per 1000/60 ms step, about 600px/s;
   * terminal speed under gravity 1.1 and frictionAir 0.02 is about 15). The
   * pills arrive already falling, so the stacked spawns land in about 1.2s
   * instead of 2s or more, and the pile is at rest before the freeze at
   * ordinary scroll speeds.
   */
  spawnSpeed: 10,
  /** Freeze and keyboard focus: at most this many synchronous steps to bring the pile to rest. */
  settleSteps: 600,
  /** One synchronous step (ms). */
  stepMs: 1000 / 60,
  /** Past this tilt (radians) a body's spin is damped each step, so pills rarely tip onto an edge. */
  tiltDampFrom: 0.6,
  tiltDamp: 0.85,
  /** A body this slow counts as resting for the upright check. */
  restSpeed: 0.3,
  restAngularSpeed: 0.02,
} as const;

/** mulberry32: a small seeded PRNG in [0, 1), deterministic across engines. */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A body from an element's untransformed layout box (offsetWidth / offsetHeight). */
export function bodySpecFromRect(id: string, kind: PitItemKind, rect: { width: number; height: number }): BodySpec {
  if (!(rect.width > 0) || !(rect.height > 0)) {
    throw new Error(`pit body ${id} has no layout box (${rect.width} x ${rect.height})`);
  }
  // Exactly half the side makes two chamfer arcs meet in a zero-length edge,
  // whose zero normal can replace a real collision axis. Stay just under it.
  const chamfer = Math.max(0, Math.min(rect.width, rect.height) / 2 - 0.5);
  return { id, kind, width: rect.width, height: rect.height, chamfer };
}

/** Half extents of the axis-aligned box around a rotated body. */
export function rotatedHalfExtents(size: { width: number; height: number }, angle: number): { x: number; y: number } {
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  const hw = size.width / 2;
  const hh = size.height / 2;
  return { x: hw * cos + hh * sin, y: hw * sin + hh * cos };
}

function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

type Box = { left: number; right: number; top: number; bottom: number };

/**
 * Where and when each body enters. Deterministic for a given rng sequence:
 * pass createRng(seed). Bodies are shuffled into two waves (the first takes
 * the extra one of an odd set); within a wave each body gets its own lane
 * across the pit, a tilt within plus or minus 25 degrees, and the lowest free
 * height above the pit that clears every body placed before it. The second
 * wave starts above the first. `clearance` lifts the whole plan further,
 * e.g. to start above the stage so the pills fall into view.
 */
export function planSpawn(
  bodies: readonly BodySpec[],
  pit: PitSize,
  rng: () => number,
  { clearance = 0 }: { clearance?: number } = {},
): SpawnPlan[] {
  const order = shuffled(bodies, rng);
  const firstWave = Math.ceil(order.length / 2);
  const waves: BodySpec[][] = [order.slice(0, firstWave), order.slice(firstWave)];
  const gap = PHYSICS.spawnGap;
  const placed: Box[] = [];
  const plan: SpawnPlan[] = [];
  let waveBase = -gap - Math.max(0, clearance);

  waves.forEach((members, waveIndex) => {
    const wave = waveIndex === 0 ? 0 : 1;
    const lanes = shuffled(
      members.map((_, index) => index),
      rng,
    );
    const laneWidth = pit.width / Math.max(1, members.length);
    const waveBoxes: Box[] = [];

    members.forEach((spec, index) => {
      const angle = (rng() * 2 - 1) * PHYSICS.maxSpawnAngle;
      const half = rotatedHalfExtents(spec, angle);
      const laneCentre = (lanes[index] + 0.5) * laneWidth;
      const jitter = (rng() - 0.5) * laneWidth * 0.5;
      const x = half.x * 2 >= pit.width ? pit.width / 2 : clamp(laneCentre + jitter, half.x, pit.width - half.x);

      let y = waveBase - half.y;
      let moved = true;
      // Every move lifts the body above one more placed box, so placed.length
      // passes always settle it; the bound only guards against bad input.
      for (let pass = 0; moved && pass <= placed.length; pass += 1) {
        moved = false;
        for (const box of placed) {
          const overlapsX = x - half.x < box.right - EPS && box.left + EPS < x + half.x;
          const overlapsY = y - half.y < box.bottom + gap - EPS && box.top - gap + EPS < y + half.y;
          if (overlapsX && overlapsY) {
            y = box.top - gap - half.y;
            moved = true;
          }
        }
      }

      const box = { left: x - half.x, right: x + half.x, top: y - half.y, bottom: y + half.y };
      placed.push(box);
      waveBoxes.push(box);
      plan.push({ id: spec.id, wave, delay: wave * PHYSICS.waveGapMs, x, y, angle });
    });

    if (waveBoxes.length > 0) waveBase = Math.min(...waveBoxes.map((box) => box.top)) - gap;
  });

  return plan;
}

/** Highest point any spawn reaches (pit y, negative above the pit). */
export function spawnTop(plan: readonly SpawnPlan[], bodies: readonly BodySpec[]): number {
  let top = 0;
  for (const spawn of plan) {
    const spec = bodies.find((body) => body.id === spawn.id);
    if (!spec) continue;
    top = Math.min(top, spawn.y - rotatedHalfExtents(spec, spawn.angle).y);
  }
  return top;
}

/**
 * Static walls around the bin (the whole pit box by default): the floor at
 * the pit bottom, side walls at the bin's edges that reach from above the
 * ceiling to below the floor, and a ceiling (high above the spawns while the
 * pills fall in, then at the pit top so a thrown pill stays in the arena).
 */
export function wallSpecs(
  pit: PitSize,
  { thickness, ceilingY, bin }: { thickness: number; ceilingY: number; bin?: Bin },
): WallSpec[] {
  const t = thickness;
  const left = bin?.left ?? 0;
  const width = bin?.width ?? pit.width;
  const centre = left + width / 2;
  const sideHeight = pit.height - ceilingY + 2 * t;
  const sideY = (ceilingY + pit.height) / 2;
  return [
    { name: "floor", x: centre, y: pit.height + t / 2, width: width + 2 * t, height: t },
    { name: "left", x: left - t / 2, y: sideY, width: t, height: sideHeight },
    { name: "right", x: left + width + t / 2, y: sideY, width: t, height: sideHeight },
    { name: "ceiling", x: centre, y: ceilingY - t / 2, width: width + 2 * t, height: t },
  ];
}

/**
 * Which pills become bodies (spec S2, 6.6): all 12 on desktop; 8 on phones
 * (the six bubbles plus the two mobile pills); on low-power devices the six
 * bubbles only.
 */
export function selectBodyIds(
  items: readonly PitItemRef[],
  { mode, lowPower }: { mode: "desktop" | "mobile"; lowPower: boolean },
): string[] {
  return items
    .filter((item) => {
      if (lowPower) return item.kind === "bubble";
      if (mode === "mobile") return !item.desktopOnly;
      return true;
    })
    .map((item) => item.id);
}

/** Freeze: each body's centre and angle by id (matter bodies carry the id as their label). */
export function recordPoses(
  bodies: Iterable<{ label: string; position: { x: number; y: number }; angle: number }>,
): PoseMap {
  const poses: Record<string, Pose> = {};
  for (const body of bodies) {
    poses[body.label] = { x: body.position.x, y: body.position.y, angle: body.angle };
  }
  return poses;
}

/** A pose for every id: the recorded one, or the fallback (the static heap) for bodies that never spawned. */
export function restorePoses(poses: PoseMap, ids: readonly string[], fallback: (id: string) => Pose): PoseMap {
  const out: Record<string, Pose> = {};
  for (const id of ids) out[id] = poses[id] ?? fallback(id);
  return out;
}

/**
 * Poses recorded in one pit size, mapped to another (a resize while frozen):
 * x scales with the bin (the whole width by default), y keeps its distance
 * from the floor, since the pile rests on it.
 */
export function scalePoses(poses: PoseMap, from: PitSize, to: PitSize, bins?: { from: Bin; to: Bin }): PoseMap {
  const source = bins?.from ?? { left: 0, width: from.width };
  const target = bins?.to ?? { left: 0, width: to.width };
  const sx = source.width > 0 ? target.width / source.width : 1;
  const out: Record<string, Pose> = {};
  for (const [id, pose] of Object.entries(poses)) {
    out[id] = { x: target.left + (pose.x - source.left) * sx, y: to.height - (from.height - pose.y), angle: pose.angle };
  }
  return out;
}

/** An angle in (-180, 180] degrees, in radians. */
export function normalizeAngle(angle: number): number {
  const turn = Math.PI * 2;
  const wrapped = ((((angle + Math.PI) % turn) + turn) % turn) - Math.PI;
  return wrapped === -Math.PI ? Math.PI : wrapped;
}

/**
 * The same footprint with the label up: a pill is symmetric under a half
 * turn, so a tilt past 90 degrees either way is the same box upside down.
 * Returns the equivalent angle within plus or minus 90 degrees.
 */
export function uprightAngle(angle: number): number {
  const a = normalizeAngle(angle);
  if (a > Math.PI / 2) return a - Math.PI;
  if (a < -Math.PI / 2) return a + Math.PI;
  return a;
}

/** The body's rotated box pokes above the pit top (it never landed). */
export function isAbovePit(pose: Pose, size: { width: number; height: number }): boolean {
  return pose.y - rotatedHalfExtents(size, pose.angle).y < -1;
}

/** Between two poses at t (0..1): the centre on a line, the tilt along the shorter turn. */
export function blendPose(from: Pose, to: Pose, t: number): Pose {
  const k = clamp(t, 0, 1);
  const turn = normalizeAngle(to.angle - from.angle);
  return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, angle: from.angle + turn * k };
}

/**
 * The pit's lifecycle: idle (pre-fall), falling (physics live), frozen
 * (static, poses recorded). It falls once per entry; reset returns to the
 * pre-fall state so re-entry replays the fall.
 */
export function pitTransition(phase: PitPhase, event: PitEvent): PitPhase {
  if (event === "reset") return "idle";
  if (event === "freeze") return "frozen";
  return phase === "idle" ? "falling" : phase;
}

/**
 * Where a vocabulary pill's glossary caption sits (spec S2): 16px below the
 * pill's rotated box, or above it when it would run past the pit floor,
 * centred on the pill and kept inside the pit horizontally. `box` is the
 * rotated box in pit pixels, `origin` the caption's positioning parent's
 * top-left in pit pixels; the result is relative to that origin.
 */
export function glossLayout(
  box: { left: number; top: number; right: number; bottom: number },
  origin: { x: number; y: number },
  pit: PitSize,
  gloss: { width: number; height: number },
  gap = 16,
): { left: number; top: number; side: "below" | "above" } {
  const side = box.bottom + gap + gloss.height <= pit.height ? "below" : "above";
  const top = side === "below" ? box.bottom + gap : box.top - gap - gloss.height;
  const centre = (box.left + box.right) / 2;
  const left = clamp(centre - gloss.width / 2, 0, Math.max(0, pit.width - gloss.width));
  return { left: left - origin.x, top: top - origin.y, side };
}
