/**
 * Camera math for the market map: the hairline kernel's projection and its
 * inverse, and the lens pick (spec S1, hairline rule 01).
 *
 * Pure and dependency-free, so a client leaf can import it: pass the slim
 * `toPickView(view)` object from a Server Component (never import ./views in a
 * client component; it carries every path string of the map).
 *
 * Projection (kernel `proj`): with c = cos(az), s = sin(az) and zf = sqrt(1 - k²)
 *   X = x·c − y·s,  Y = x·s + y·c
 *   sx = ox + S·X,  sy = oy + S·(Y·k − z·zf)
 * Screen points are in viewBox units of the view.
 */
import type { MapBuildingId, MapCamera, MapPickView } from "./views";

/** Nearest-building fallback for the lens, in world units (spec S1). */
export const PICK_RADIUS = 12;

type Basis = { c: number; s: number; zf: number };

function basis(camera: MapCamera): Basis {
  const az = (camera.az * Math.PI) / 180;
  return { c: Math.cos(az), s: Math.sin(az), zf: Math.sqrt(1 - camera.k * camera.k) };
}

/** World [x, y, z] to a screen point (the kernel's `proj`). */
export function project(view: Pick<MapPickView, "camera">, x: number, y: number, z = 0): [number, number] {
  const { camera } = view;
  const { c, s, zf } = basis(camera);
  const X = x * c - y * s;
  const Y = x * s + y * c;
  return [camera.ox + camera.S * X, camera.oy + camera.S * (Y * camera.k - z * zf)];
}

/** The world [x, y] under a screen point, on the plane at height z (ground by default; the kernel's `unproj`). */
export function unproject(view: Pick<MapPickView, "camera">, sx: number, sy: number, z = 0): [number, number] {
  const { camera } = view;
  const { c, s, zf } = basis(camera);
  const X = (sx - camera.ox) / camera.S;
  const Y = ((sy - camera.oy) / camera.S + z * zf) / camera.k;
  return [X * c + Y * s, -X * s + Y * c];
}

/* ------------------------------------------------------------------ */
/* Distances on the ground plane                                       */
/* ------------------------------------------------------------------ */

type Vec = readonly [number, number];
type Rect = readonly [number, number, number, number];

function pointRectDistance([x, y]: Vec, [x0, y0, x1, y1]: Rect): number {
  const dx = Math.max(x0 - x, 0, x - x1);
  const dy = Math.max(y0 - y, 0, y - y1);
  return Math.hypot(dx, dy);
}

function pointSegmentDistance([px, py]: Vec, [ax, ay]: Vec, [bx, by]: Vec): number {
  const vx = bx - ax;
  const vy = by - ay;
  const lengthSquared = vx * vx + vy * vy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / lengthSquared));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

/** Whether segment a-b crosses the rectangle (Liang-Barsky clip). */
function segmentHitsRect([ax, ay]: Vec, [bx, by]: Vec, [x0, y0, x1, y1]: Rect): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  const edges: Array<[number, number]> = [
    [-dx, ax - x0],
    [dx, x1 - ax],
    [-dy, ay - y0],
    [dy, y1 - ay],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return true;
}

/** Shortest distance between segment a-b and the rectangle (0 when they meet). */
function segmentRectDistance(a: Vec, b: Vec, rect: Rect): number {
  if (segmentHitsRect(a, b, rect)) return 0;
  const [x0, y0, x1, y1] = rect;
  const corners: Vec[] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  return Math.min(
    pointRectDistance(a, rect),
    pointRectDistance(b, rect),
    ...corners.map((corner) => pointSegmentDistance(corner, a, b)),
  );
}

/**
 * The building under a screen point, tested against rest geometry only, so a
 * scaled or fading map never moves the hit area (rule 01).
 *
 * The pointer's view ray, between the ground and a building's roof height,
 * traces a segment on the ground plane: unproject at z = 0 and at z = height.
 * The ray passes through the building's rest prism exactly when that segment
 * crosses its footprint. Several hits: the frontmost wins (the one painted
 * last, as on screen). No hit: the building whose segment comes nearest, if
 * within PICK_RADIUS world units; otherwise null.
 */
export function pickBuilding(view: MapPickView, sx: number, sy: number): MapBuildingId | null {
  const ground = unproject(view, sx, sy, 0);
  let hit: { id: MapBuildingId; order: number } | null = null;
  let nearest: { id: MapBuildingId; order: number; distance: number } | null = null;

  for (const building of view.buildings) {
    const top = unproject(view, sx, sy, building.height);
    const distance = segmentRectDistance(ground, top, building.footprint);
    if (distance === 0) {
      if (!hit || building.order > hit.order) hit = { id: building.id, order: building.order };
      continue;
    }
    if (
      distance <= PICK_RADIUS &&
      (!nearest || distance < nearest.distance || (distance === nearest.distance && building.order > nearest.order))
    ) {
      nearest = { id: building.id, order: building.order, distance };
    }
  }

  return hit?.id ?? nearest?.id ?? null;
}
