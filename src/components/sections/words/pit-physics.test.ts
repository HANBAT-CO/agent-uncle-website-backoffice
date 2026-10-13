import { describe, expect, it } from "vitest";

import {
  PHYSICS,
  blendPose,
  bodySpecFromRect,
  createRng,
  glossLayout,
  isAbovePit,
  normalizeAngle,
  pitTransition,
  planSpawn,
  recordPoses,
  restorePoses,
  rotatedHalfExtents,
  scalePoses,
  selectBodyIds,
  uprightAngle,
  wallSpecs,
  type BodySpec,
  type PitItemRef,
  type Pose,
} from "./pit-physics";

const DEG = Math.PI / 180;

/** Twelve bodies at the desktop sizes of the S2 pit (6 bubbles, 6 vocabulary pills). */
const DESKTOP_BODIES: BodySpec[] = [
  bodySpecFromRect("b0", "bubble", { width: 124, height: 46 }),
  bodySpecFromRect("b1", "bubble", { width: 148, height: 46 }),
  bodySpecFromRect("b2", "bubble", { width: 214, height: 46 }),
  bodySpecFromRect("b3", "bubble", { width: 206, height: 46 }),
  bodySpecFromRect("b4", "bubble", { width: 232, height: 46 }),
  bodySpecFromRect("b5", "bubble", { width: 60, height: 46 }),
  bodySpecFromRect("v0", "vocab", { width: 134, height: 50 }),
  bodySpecFromRect("v1", "vocab", { width: 134, height: 50 }),
  bodySpecFromRect("v2", "vocab", { width: 134, height: 50 }),
  bodySpecFromRect("v3", "vocab", { width: 128, height: 50 }),
  bodySpecFromRect("v4", "vocab", { width: 92, height: 50 }),
  bodySpecFromRect("v5", "vocab", { width: 134, height: 50 }),
];

const PIT = { width: 980, height: 520 };

function aabb(x: number, y: number, angle: number, spec: BodySpec) {
  const half = rotatedHalfExtents(spec, angle);
  return { left: x - half.x, right: x + half.x, top: y - half.y, bottom: y + half.y };
}

describe("createRng", () => {
  it("is deterministic per seed and stays in [0, 1)", () => {
    const a = createRng(7);
    const b = createRng(7);
    const first = Array.from({ length: 50 }, () => a());
    const second = Array.from({ length: 50 }, () => b());
    expect(first).toEqual(second);
    for (const value of first) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("gives different sequences for different seeds", () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(Array.from({ length: 5 }, () => a())).not.toEqual(Array.from({ length: 5 }, () => b()));
  });
});

describe("bodySpecFromRect", () => {
  it("takes the DOM box as the body size and rounds the ends with a chamfer just under half the height", () => {
    const spec = bodySpecFromRect("b0", "bubble", { width: 124.4, height: 46 });
    expect(spec).toMatchObject({ id: "b0", kind: "bubble", width: 124.4, height: 46 });
    expect(spec.chamfer).toBeLessThan(23);
    expect(spec.chamfer).toBeGreaterThan(22);
  });

  it("never lets the chamfer exceed half the shorter side (no degenerate edges on near-round bubbles)", () => {
    const spec = bodySpecFromRect("b5", "bubble", { width: 40, height: 46 });
    expect(spec.chamfer).toBeLessThan(20);
  });

  it("rejects an element without a layout box", () => {
    expect(() => bodySpecFromRect("v1", "vocab", { width: 0, height: 50 })).toThrow(/v1/);
  });
});

describe("rotatedHalfExtents", () => {
  it("is the half box at rest and grows with the angle", () => {
    const spec = bodySpecFromRect("x", "bubble", { width: 200, height: 40 });
    expect(rotatedHalfExtents(spec, 0)).toEqual({ x: 100, y: 20 });
    const tilted = rotatedHalfExtents(spec, 25 * DEG);
    expect(tilted.y).toBeCloseTo(100 * Math.sin(25 * DEG) + 20 * Math.cos(25 * DEG), 6);
    expect(tilted.x).toBeCloseTo(100 * Math.cos(25 * DEG) + 20 * Math.sin(25 * DEG), 6);
  });
});

describe("planSpawn", () => {
  it("is deterministic for a seed", () => {
    expect(planSpawn(DESKTOP_BODIES, PIT, createRng(42))).toEqual(planSpawn(DESKTOP_BODIES, PIT, createRng(42)));
  });

  it("changes with the seed", () => {
    const a = planSpawn(DESKTOP_BODIES, PIT, createRng(1)).map((s) => [s.id, Math.round(s.x)]);
    const b = planSpawn(DESKTOP_BODIES, PIT, createRng(2)).map((s) => [s.id, Math.round(s.x)]);
    expect(a).not.toEqual(b);
  });

  it("spawns every body exactly once in two waves of six, 250ms apart", () => {
    const plan = planSpawn(DESKTOP_BODIES, PIT, createRng(3));
    expect(plan.map((s) => s.id).sort()).toEqual(DESKTOP_BODIES.map((b) => b.id).sort());
    expect(plan.filter((s) => s.wave === 0)).toHaveLength(6);
    expect(plan.filter((s) => s.wave === 1)).toHaveLength(6);
    for (const spawn of plan) expect(spawn.delay).toBe(spawn.wave * PHYSICS.waveGapMs);
    expect(PHYSICS.waveGapMs).toBe(250);
  });

  it("keeps the spec constants and lets the pills enter falling, below terminal speed", () => {
    expect(PHYSICS.gravityY).toBe(1.1);
    expect(PHYSICS.frictionAir).toBe(0.02);
    // matter-js: gravity adds gravityY * 0.001 * step^2 px per step; air friction removes frictionAir of the speed.
    const terminal = (PHYSICS.gravityY * 0.001 * PHYSICS.stepMs ** 2) / PHYSICS.frictionAir;
    expect(PHYSICS.spawnSpeed).toBeGreaterThan(0);
    expect(PHYSICS.spawnSpeed).toBeLessThan(terminal * 0.75);
  });

  it("splits an odd or smaller set into two waves (mobile has 8 bodies, low power 6)", () => {
    const eight = planSpawn(DESKTOP_BODIES.slice(0, 8), PIT, createRng(9));
    expect(eight.filter((s) => s.wave === 0)).toHaveLength(4);
    expect(eight.filter((s) => s.wave === 1)).toHaveLength(4);
    const seven = planSpawn(DESKTOP_BODIES.slice(0, 7), PIT, createRng(9));
    expect(seven.filter((s) => s.wave === 0)).toHaveLength(4);
    expect(seven.filter((s) => s.wave === 1)).toHaveLength(3);
  });

  it("starts every body within plus or minus 25 degrees", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      for (const spawn of planSpawn(DESKTOP_BODIES, PIT, createRng(seed))) {
        expect(Math.abs(spawn.angle)).toBeLessThanOrEqual(25 * DEG + 1e-9);
      }
    }
  });

  it("spreads each wave across the pit and keeps every body between the walls", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const plan = planSpawn(DESKTOP_BODIES, PIT, createRng(seed));
      for (const spawn of plan) {
        const spec = DESKTOP_BODIES.find((b) => b.id === spawn.id);
        if (!spec) throw new Error(spawn.id);
        const box = aabb(spawn.x, spawn.y, spawn.angle, spec);
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(PIT.width);
      }
      for (const wave of [0, 1]) {
        const xs = plan.filter((s) => s.wave === wave).map((s) => s.x);
        expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(PIT.width * 0.45);
      }
    }
  });

  it("starts every body above the pit, with no two bodies overlapping", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const plan = planSpawn(DESKTOP_BODIES, PIT, createRng(seed));
      const boxes = plan.map((spawn) => {
        const spec = DESKTOP_BODIES.find((b) => b.id === spawn.id);
        if (!spec) throw new Error(spawn.id);
        return aabb(spawn.x, spawn.y, spawn.angle, spec);
      });
      for (const box of boxes) expect(box.bottom).toBeLessThanOrEqual(0);
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const [a, b] = [boxes[i], boxes[j]];
          const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
          expect(overlap, `${plan[i].id} and ${plan[j].id} overlap (seed ${seed})`).toBe(false);
        }
      }
    }
  });

  it("can start every body a clearance above the pit (above the stage, so pills fall in from out of view)", () => {
    const plan = planSpawn(DESKTOP_BODIES, PIT, createRng(5), { clearance: 340 });
    for (const spawn of plan) {
      const spec = DESKTOP_BODIES.find((b) => b.id === spawn.id);
      if (!spec) throw new Error(spawn.id);
      expect(aabb(spawn.x, spawn.y, spawn.angle, spec).bottom).toBeLessThanOrEqual(-340);
    }
  });

  it("starts the second wave above the first", () => {
    const plan = planSpawn(DESKTOP_BODIES, PIT, createRng(11));
    const lowestSecond = Math.max(...plan.filter((s) => s.wave === 1).map((s) => s.y));
    const highestFirst = Math.min(...plan.filter((s) => s.wave === 0).map((s) => s.y));
    expect(lowestSecond).toBeLessThan(highestFirst);
  });

  it("centres a body wider than the pit instead of throwing", () => {
    const wide = [bodySpecFromRect("w", "bubble", { width: 600, height: 40 })];
    const [spawn] = planSpawn(wide, { width: 300, height: 400 }, createRng(1));
    expect(spawn.x).toBe(150);
  });
});

describe("wallSpecs", () => {
  it("builds a floor, two side walls and a ceiling outside the pit box", () => {
    const walls = wallSpecs(PIT, { thickness: 400, ceilingY: -900 });
    expect(walls.map((wall) => wall.name)).toEqual(["floor", "left", "right", "ceiling"]);
    const [floor, left, right, ceiling] = walls;
    expect(floor.y - floor.height / 2).toBe(PIT.height);
    expect(left.x + left.width / 2).toBe(0);
    expect(right.x - right.width / 2).toBe(PIT.width);
    expect(ceiling.y + ceiling.height / 2).toBe(-900);
    // Side walls reach from above the ceiling to below the floor, so nothing escapes at the corners.
    expect(left.y - left.height / 2).toBeLessThanOrEqual(-900 - 400);
    expect(left.y + left.height / 2).toBeGreaterThanOrEqual(PIT.height + 400);
    expect(floor.width).toBeGreaterThan(PIT.width + 2 * 400 - 1);
  });

  it("puts the side walls at the bin's edges and seals the pit top with a ceiling at 0", () => {
    const bin = { left: 0, width: 624 };
    const [floor, left, right, ceiling] = wallSpecs(PIT, { thickness: 400, ceilingY: 0, bin });
    expect(left.x + left.width / 2).toBe(0);
    expect(right.x - right.width / 2).toBe(624);
    expect(floor.x).toBe(312);
    expect(floor.width).toBe(624 + 800);
    expect(ceiling.y + ceiling.height / 2).toBe(0);
    expect(ceiling.width).toBe(624 + 800);
  });
});

describe("selectBodyIds", () => {
  const items: PitItemRef[] = [
    { id: "b0", kind: "bubble", desktopOnly: false },
    { id: "b1", kind: "bubble", desktopOnly: false },
    { id: "b2", kind: "bubble", desktopOnly: false },
    { id: "b3", kind: "bubble", desktopOnly: false },
    { id: "b4", kind: "bubble", desktopOnly: false },
    { id: "b5", kind: "bubble", desktopOnly: false },
    { id: "v0", kind: "vocab", desktopOnly: false },
    { id: "v1", kind: "vocab", desktopOnly: true },
    { id: "v2", kind: "vocab", desktopOnly: true },
    { id: "v3", kind: "vocab", desktopOnly: false },
    { id: "v4", kind: "vocab", desktopOnly: true },
    { id: "v5", kind: "vocab", desktopOnly: true },
  ];

  it("uses all 12 bodies on desktop", () => {
    expect(selectBodyIds(items, { mode: "desktop", lowPower: false })).toHaveLength(12);
  });

  it("uses 8 bodies on mobile: the six bubbles plus the two mobile pills", () => {
    expect(selectBodyIds(items, { mode: "mobile", lowPower: false })).toEqual(["b0", "b1", "b2", "b3", "b4", "b5", "v0", "v3"]);
  });

  it("halves the bodies on low-power devices: the six bubbles only", () => {
    const bubbles = ["b0", "b1", "b2", "b3", "b4", "b5"];
    expect(selectBodyIds(items, { mode: "desktop", lowPower: true })).toEqual(bubbles);
    expect(selectBodyIds(items, { mode: "mobile", lowPower: true })).toEqual(bubbles);
  });
});

describe("pose record and restore", () => {
  const bodies = [
    { label: "b0", position: { x: 100, y: 480 }, angle: 0.1 },
    { label: "v2", position: { x: 512.5, y: 430 }, angle: -0.3 },
  ];

  it("records each body's centre and angle by id", () => {
    expect(recordPoses(bodies)).toEqual({
      b0: { x: 100, y: 480, angle: 0.1 },
      v2: { x: 512.5, y: 430, angle: -0.3 },
    });
  });

  it("copies values, so later physics steps do not move a recorded pose", () => {
    const live = [{ label: "b0", position: { x: 10, y: 20 }, angle: 0 }];
    const poses = recordPoses(live);
    live[0].position.x = 999;
    expect(poses.b0.x).toBe(10);
  });

  it("restores recorded poses and falls back for bodies that never spawned", () => {
    const poses = recordPoses(bodies);
    const fallback = (id: string): Pose => ({ x: id.length, y: 1, angle: 0 });
    expect(restorePoses(poses, ["b0", "v2", "b5"], fallback)).toEqual({
      b0: { x: 100, y: 480, angle: 0.1 },
      v2: { x: 512.5, y: 430, angle: -0.3 },
      b5: { x: 2, y: 1, angle: 0 },
    });
  });

  it("rescales poses to a resized pit, keeping each body's distance from the floor", () => {
    const poses = recordPoses(bodies);
    const scaled = scalePoses(poses, { width: 1000, height: 500 }, { width: 800, height: 450 });
    expect(scaled.b0.x).toBeCloseTo(80, 6);
    expect(scaled.b0.y).toBeCloseTo(430, 6);
    expect(scaled.b0.angle).toBe(0.1);
    expect(scaled.v2.x).toBeCloseTo(410, 6);
  });

  it("rescales x through the bin when the pile lives in a narrower bin", () => {
    const poses = recordPoses(bodies);
    const scaled = scalePoses(poses, { width: 1000, height: 500 }, { width: 800, height: 500 }, {
      from: { left: 0, width: 600 },
      to: { left: 0, width: 600 },
    });
    // The bin kept its width, so the pile keeps its x even though the arena narrowed.
    expect(scaled.b0.x).toBeCloseTo(100, 6);
    expect(scaled.v2.x).toBeCloseTo(512.5, 6);
  });
});

describe("settle helpers", () => {
  it("normalizes angles to (-180, 180] degrees", () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(Math.PI)).toBeCloseTo(Math.PI, 9);
    expect(normalizeAngle(-Math.PI)).toBeCloseTo(Math.PI, 9);
    expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 9);
    expect(normalizeAngle(190 * DEG)).toBeCloseTo(-170 * DEG, 9);
    expect(normalizeAngle(-370 * DEG)).toBeCloseTo(-10 * DEG, 9);
  });

  it("turns a pill resting past 90 degrees a half turn (same footprint, label up)", () => {
    expect(uprightAngle(178 * DEG)).toBeCloseTo(-2 * DEG, 9);
    expect(uprightAngle(-120 * DEG)).toBeCloseTo(60 * DEG, 9);
    expect(uprightAngle(400 * DEG)).toBeCloseTo(40 * DEG, 9);
    expect(uprightAngle(20 * DEG)).toBeCloseTo(20 * DEG, 9);
    for (const angle of [91, 135, 180, 269, -95, -180].map((deg) => deg * DEG)) {
      const up = uprightAngle(angle);
      expect(Math.abs(up)).toBeLessThanOrEqual(Math.PI / 2 + 1e-9);
      // Same footprint: the rotated box is unchanged by the half turn.
      expect(rotatedHalfExtents({ width: 140, height: 60 }, up).y).toBeCloseTo(rotatedHalfExtents({ width: 140, height: 60 }, angle).y, 9);
    }
  });

  it("flags a pose whose rotated box pokes above the pit top (it never landed)", () => {
    const size = { width: 140, height: 60 };
    expect(isAbovePit({ x: 100, y: 30, angle: 0 }, size)).toBe(false);
    expect(isAbovePit({ x: 100, y: 20, angle: 0 }, size)).toBe(true);
    expect(isAbovePit({ x: 100, y: -400, angle: 0.2 }, size)).toBe(true);
    expect(isAbovePit({ x: 100, y: 480, angle: 0.4 }, size)).toBe(false);
  });

  it("blends poses linearly and turns along the shorter arc", () => {
    const from = { x: 0, y: -200, angle: 170 * DEG };
    const to = { x: 100, y: 400, angle: -170 * DEG };
    expect(blendPose(from, to, 0)).toEqual(from);
    const mid = blendPose(from, to, 0.5);
    expect(mid.x).toBe(50);
    expect(mid.y).toBe(100);
    expect(normalizeAngle(mid.angle)).toBeCloseTo(180 * DEG, 9);
    const end = blendPose(from, to, 1);
    expect(normalizeAngle(end.angle)).toBeCloseTo(-170 * DEG, 9);
    expect(blendPose(from, to, 2).x).toBe(100);
  });
});

describe("pitTransition", () => {
  it("falls once from idle, freezes from any state and resets to idle", () => {
    expect(pitTransition("idle", "start")).toBe("falling");
    expect(pitTransition("falling", "start")).toBe("falling");
    expect(pitTransition("falling", "freeze")).toBe("frozen");
    expect(pitTransition("idle", "freeze")).toBe("frozen");
    expect(pitTransition("frozen", "start")).toBe("frozen");
    expect(pitTransition("frozen", "reset")).toBe("idle");
    expect(pitTransition("falling", "reset")).toBe("idle");
  });
});

describe("glossLayout", () => {
  const pit = { width: 900, height: 400 };
  const gloss = { width: 300, height: 30 };

  it("sits 16px below the pill's rotated box when there is room", () => {
    const layout = glossLayout({ left: 400, top: 100, right: 540, bottom: 150 }, { x: 400, y: 105 }, pit, gloss);
    expect(layout.side).toBe("below");
    // In the wrapper's coordinates: wrapper top-left is (400, 105).
    expect(layout.top).toBe(150 + 16 - 105);
    expect(layout.left).toBe(470 - 150 - 400);
  });

  it("flips above the pill near the floor", () => {
    const layout = glossLayout({ left: 400, top: 340, right: 540, bottom: 392 }, { x: 400, y: 344 }, pit, gloss);
    expect(layout.side).toBe("above");
    expect(layout.top).toBe(340 - 16 - 30 - 344);
  });

  it("stays inside the pit horizontally", () => {
    const left = glossLayout({ left: 0, top: 100, right: 80, bottom: 140 }, { x: 0, y: 100 }, pit, gloss);
    expect(left.left).toBe(0);
    const right = glossLayout({ left: 840, top: 100, right: 900, bottom: 140 }, { x: 840, y: 100 }, pit, gloss);
    expect(right.left + 840 + gloss.width).toBe(900);
  });
});
