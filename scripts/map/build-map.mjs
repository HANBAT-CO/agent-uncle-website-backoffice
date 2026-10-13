#!/usr/bin/env node
/**
 * Market map build (spec 4.8): turns the schematic world in
 * src/components/map/geometry.json into screen-space SVG paths per view and
 * writes src/components/map/generated/map-views.json.
 *
 *   npm run map             regenerate the JSON
 *   npm run map -- --check  exit 1 when the committed JSON is stale
 *
 * Geometry comes only from the hairline kernel's pure functions (Cam, proj,
 * rings, prism, facing, poly, open, hull, r2), so the map and
 * the S4 cart share one stroke grammar: every building is a rounded prism drawn
 * as a silhouette plus one crease (rule 09), with up to four floor ticks.
 * Nothing here touches the DOM, a clock or randomness, so two runs write
 * identical files.
 *
 * Camera (kernel convention): Cam(45, 0.5, S) is the 2:1 view. World x/y are
 * on the ground, z is up; +x runs down to the right on screen, +y down to the
 * left, and the corner with the largest x + y is nearest the viewer, so
 * buildings are painted by ascending x + y of their footprint centre.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

import HL from "../../src/vendor/hairline/kernel.mjs";

const { Cam, proj, rings, prism, facing, poly, open, hull, r2 } = HL;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const GEOMETRY_PATH = resolve(ROOT, "src/components/map/geometry.json");
export const OUTPUT_PATH = resolve(ROOT, "src/components/map/generated/map-views.json");

/** Budgets from spec 13 for the inline hero-desktop SVG. */
export const BUDGET = { gzipBytes: 30 * 1024, paths: 600 };

/** Door opening drawn on its face, in world units. */
const DOOR = { width: 3.2, height: 4.6 };

/* ------------------------------------------------------------------ */
/* Small numeric helpers                                               */
/* ------------------------------------------------------------------ */

const round4 = (n) => Math.round(n * 1e4) / 1e4;
const pt = (p) => [r2(p[0]), r2(p[1])];

/**
 * Length of an M/L/Z path string as the kernel writes it (poly, open, seg),
 * measured numerically segment by segment.
 */
export function pathLength(d) {
  let length = 0;
  let start = null;
  let last = null;
  const commands = d.match(/[MLZ][^MLZ]*/g) ?? [];
  for (const command of commands) {
    const type = command[0];
    if (type === "Z") {
      if (last && start) length += Math.hypot(start[0] - last[0], start[1] - last[1]);
      last = start;
      continue;
    }
    const [x, y] = command.slice(1).trim().split(/[\s,]+/).map(Number);
    if (type === "M") {
      start = [x, y];
    } else if (last) {
      length += Math.hypot(x - last[0], y - last[1]);
    }
    last = [x, y];
  }
  return r2(length);
}

/** One drawable path with its measured length (style --len for draw-in). */
function path(d) {
  return { d, length: pathLength(d) };
}

function polylineLength(points) {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return length;
}

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

function centre([x0, y0, x1, y1]) {
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}

const FACES = {
  east: { normal: [1, 0], axis: "y" },
  west: { normal: [-1, 0], axis: "y" },
  south: { normal: [0, 1], axis: "x" },
  north: { normal: [0, -1], axis: "x" },
};

/**
 * A wall of the footprint: its outward normal, its length and the ground point
 * at fraction u along it (from the smaller coordinate). Throws when the wall
 * faces away from the camera, because a mark drawn there would show through
 * the opaque plate in front of it (rule 06).
 */
function wall(id, [x0, y0, x1, y1], name, front) {
  const spec = FACES[name];
  if (!spec) throw new Error(`${id}: unknown face ${name}`);
  if (!front({ nu: spec.normal[0], nv: spec.normal[1] })) {
    throw new Error(`${id}: the ${name} face looks away from the camera (rule 06)`);
  }
  const along = spec.axis === "y" ? [y0, y1] : [x0, x1];
  const fixed = { east: x1, west: x0, south: y1, north: y0 }[name];
  return {
    name,
    length: along[1] - along[0],
    at: (u) => {
      const v = along[0] + (along[1] - along[0]) * u;
      return spec.axis === "y" ? [fixed, v] : [v, fixed];
    },
    fraction: ([x, y]) => ((spec.axis === "y" ? y : x) - along[0]) / (along[1] - along[0]),
  };
}

/** The wall a ground point lies on, by name. */
function wallNameOf([x0, y0, x1, y1], [x, y]) {
  const eps = 1e-9;
  if (Math.abs(x - x1) < eps) return "east";
  if (Math.abs(x - x0) < eps) return "west";
  if (Math.abs(y - y1) < eps) return "south";
  if (Math.abs(y - y0) < eps) return "north";
  return null;
}

/** The eight corners of a box footprint from z 0 to h, for camera fitting. */
function boxCorners([x0, y0, x1, y1], h) {
  const out = [];
  for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [0, h]) out.push([x, y, z]);
  return out;
}

function screenBounds(P, points) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    const [sx, sy] = P(p[0], p[1], p[2] ?? 0);
    minX = Math.min(minX, sx);
    maxX = Math.max(maxX, sx);
    minY = Math.min(minY, sy);
    maxY = Math.max(maxY, sy);
  }
  return { minX, maxX, minY, maxY };
}

/**
 * The camera for a view. S fills `fill.width` of the viewBox width with the
 * listed buildings. Then either `focus.at` puts the focus building's roof
 * centre at that fraction of the viewBox (hero-desktop: 청평화 at 44%, 46%),
 * or `center` centres the listed buildings' box there (hero-mobile, framed on
 * 청평화 and APM).
 */
function cameraFor(view, buildingsById) {
  const [width, height] = view.viewBox;
  const C = Cam(view.camera.az, view.camera.k, 1);
  const corners = view.fill.buildings.flatMap((id) => {
    const b = buildingsById.get(id);
    return boxCorners(b.footprint, b.height);
  });
  const unitBox = screenBounds(proj(C), corners);
  C.S = round4((view.fill.width * width) / (unitBox.maxX - unitBox.minX));

  if (view.center) {
    const box = screenBounds(proj(C), corners);
    C.ox = round4(view.center[0] * width - (box.minX + box.maxX) / 2);
    C.oy = round4(view.center[1] * height - (box.minY + box.maxY) / 2);
    return C;
  }

  const focus = buildingsById.get(view.focus.building);
  const [fx, fy] = centre(focus.footprint);
  const [rx, ry] = proj(C)(fx, fy, focus.height);
  C.ox = round4(view.focus.at[0] * width - rx);
  C.oy = round4(view.focus.at[1] * height - ry);
  return C;
}

/**
 * One building: a rounded prism (silhouette and one crease), one short tick per
 * storey on a visible wall at mid-storey height, a door opening on its wall,
 * and the anchors sections need (roof, base, door, tick centres).
 */
function buildBuilding(b, P, front, shape) {
  const [x0, y0, x1, y1] = b.footprint;
  const [ring, inner] = rings(x0, y0, x1, y1, shape.radius, shape.crease);
  const solid = prism(P, front, ring, inner, 0, b.height);
  const [cx, cy] = centre(b.footprint);

  if (b.floors < 1 || b.floors > 4) throw new Error(`${b.id}: 1 to 4 floors (spec 4.8)`);
  const tickWall = wall(b.id, b.footprint, b.ticks.face, front);
  const half = Math.min(b.ticks.length, tickWall.length * 0.6) / tickWall.length / 2;
  const floors = [];
  for (let i = 1; i <= b.floors; i++) {
    const z = (b.height * (i - 0.5)) / b.floors;
    const [ax, ay] = tickWall.at(b.ticks.at - half);
    const [bx, by] = tickWall.at(b.ticks.at + half);
    const [mx, my] = tickWall.at(b.ticks.at);
    floors.push({ floor: i, z: r2(z), ...path(open([P(ax, ay, z), P(bx, by, z)])), anchor: pt(P(mx, my, z)) });
  }

  let door = null;
  if (b.door) {
    const [dx, dy] = b.door;
    const name = wallNameOf(b.footprint, [dx, dy]);
    if (!name) throw new Error(`${b.id}: door ${b.door} is not on the footprint edge`);
    const doorWall = wall(b.id, b.footprint, name, front);
    const u = doorWall.fraction([dx, dy]);
    const du = DOOR.width / doorWall.length / 2;
    const a = doorWall.at(u - du);
    const c = doorWall.at(u + du);
    const mark = open([P(a[0], a[1], 0), P(a[0], a[1], DOOR.height), P(c[0], c[1], DOOR.height), P(c[0], c[1], 0)]);
    door = { face: name, point: pt(P(dx, dy, 0)), ...path(mark) };
  }

  const sil = path(solid.sil);
  const crease = path(solid.crease);
  const length = r2(sil.length + crease.length + floors.reduce((s, f) => s + f.length, 0) + (door ? door.length : 0));

  return {
    id: b.id,
    footprint: b.footprint,
    height: b.height,
    floorCount: b.floors,
    /** Paint key: x + y of the footprint centre (larger is nearer the viewer). */
    depth: cx + cy,
    sil,
    crease,
    floors,
    door,
    roof: pt(P(cx, cy, b.height)),
    base: pt(P(cx, cy, 0)),
    length,
  };
}

function buildRoute(route, P) {
  const points = route.points.map(([x, y]) => P(x, y, 0));
  const total = polylineLength(points);
  const stops = route.stops.map((stop) => ({
    id: stop.id,
    t: round4(polylineLength(points.slice(0, stop.vertex + 1)) / total),
    point: pt(points[stop.vertex]),
  }));
  const d = open(points);
  return { d, length: pathLength(d), points: points.map(pt), stops };
}

/** Builds one view (hero-desktop or hero-mobile). */
function buildView(id, view, geometry) {
  const buildingsById = new Map(geometry.buildings.map((b) => [b.id, b]));
  const C = cameraFor(view, buildingsById);
  const P = proj(C);
  const front = facing(C);
  const [width, height] = view.viewBox;

  const buildings = geometry.buildings
    .map((b) => buildBuilding(b, P, front, geometry))
    .sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id))
    .map((b, order) => ({ order, ...b }));

  const line = ([a, b]) => path(open([P(a[0], a[1], 0), P(b[0], b[1], 0)]));
  const stream = geometry.stream.map(line);
  const roads = Object.entries(geometry.roads).map(([name, seg2]) => ({ name, ...line(seg2) }));

  const focusBuilding = buildings.find((b) => b.id === view.focus.building);
  const [ux, uy, uz] = geometry.anchors.uncle;
  const uncle = pt(P(ux, uy, uz));

  const allCorners = buildings.flatMap((b) => boxCorners(b.footprint, b.height));
  const bounds = screenBounds(P, allCorners);
  const hullPoints = hull(allCorners.map(([x, y, z]) => P(x, y, z)));

  return {
    id,
    viewBox: { width, height },
    camera: { az: view.camera.az, k: view.camera.k, S: C.S, ox: C.ox, oy: C.oy },
    buildings,
    faint: { stream, roads },
    route: buildRoute(geometry.route, P),
    anchors: { uncle },
    focus: {
      building: focusBuilding.id,
      point: focusBuilding.roof,
      percent: { x: r2((focusBuilding.roof[0] / width) * 100), y: r2((focusBuilding.roof[1] / height) * 100) },
    },
    buildingBounds: {
      minX: r2(bounds.minX),
      maxX: r2(bounds.maxX),
      minY: r2(bounds.minY),
      maxY: r2(bounds.maxY),
      hull: poly(hullPoints),
    },
  };
}

/** Pure: geometry in, views out. */
export function buildMapViews(geometry) {
  const views = {};
  for (const [id, view] of Object.entries(geometry.views)) views[id] = buildView(id, view, geometry);
  return { source: "src/components/map/geometry.json", generator: "scripts/map/build-map.mjs", views };
}

/** The JSON text written to OUTPUT_PATH (stable key order, trailing newline). */
export function serialize(result) {
  return `${JSON.stringify(result, null, 2)}\n`;
}

/**
 * Markup equivalent to <MarketMap layer="base" route="round"> (faint group,
 * route and its mask, buildings), for the gzip and path budgets.
 */
export function budgetMarkup(view) {
  const p = (d, length, cls) =>
    `<path class="${cls}" d="${d}" style="--len:${length}" vector-effect="non-scaling-stroke" data-drawable=""></path>`;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${view.viewBox.width} ${view.viewBox.height}" class="market-map" data-map-layer="base" aria-hidden="true" focusable="false">`,
    `<g class="map-faint">`,
    ...view.faint.stream.map((s) => p(s.d, s.length, "map-stream")),
    ...view.faint.roads.map((r) => p(r.d, r.length, "map-road")),
    `</g>`,
    `<defs><mask id="hero-route-mask" maskUnits="userSpaceOnUse">`,
    p(view.route.d, view.route.length, "map-route-mask"),
    `</mask></defs>`,
    `<g class="map-route-group">${p(view.route.d, view.route.length, "map-route")}</g>`,
    `<g class="map-buildings">`,
    ...view.buildings.map(
      (b) =>
        `<g class="map-building" data-building="${b.id}">` +
        p(b.sil.d, b.sil.length, "map-sil") +
        p(b.crease.d, b.crease.length, "map-crease") +
        b.floors.map((f) => p(f.d, f.length, "map-floor")).join("") +
        (b.door ? p(b.door.d, b.door.length, "map-door") : "") +
        `</g>`,
    ),
    `</g></svg>`,
  ];
  const markup = parts.join("");
  return { markup, gzipBytes: gzipSync(markup).length, paths: (markup.match(/<path /g) ?? []).length };
}

function main() {
  const check = process.argv.includes("--check");
  const geometry = JSON.parse(readFileSync(GEOMETRY_PATH, "utf8"));
  const result = buildMapViews(geometry);
  const text = serialize(result);

  for (const view of Object.values(result.views)) {
    const { gzipBytes, paths } = budgetMarkup(view);
    const { width } = view.viewBox;
    const b = view.buildingBounds;
    console.log(
      `${view.id}: S ${view.camera.S}, buildings x ${r2((b.minX / width) * 100)}%..${r2((b.maxX / width) * 100)}%, ` +
        `y ${r2(b.minY)}..${r2(b.maxY)}, focus ${view.focus.percent.x}% ${view.focus.percent.y}%, ` +
        `${paths} paths, ${gzipBytes} B gzip`,
    );
    if (view.id === "hero-desktop" && (gzipBytes > BUDGET.gzipBytes || paths > BUDGET.paths)) {
      console.error(`hero-desktop is over budget (${BUDGET.gzipBytes} B gzip, ${BUDGET.paths} paths)`);
      process.exit(1);
    }
  }

  if (check) {
    let current = "";
    try {
      current = readFileSync(OUTPUT_PATH, "utf8");
    } catch {
      current = "";
    }
    if (current !== text) {
      console.error("map-views.json is stale: run npm run map");
      process.exit(1);
    }
    console.log("map-views.json is up to date");
    return;
  }

  writeFileSync(OUTPUT_PATH, text);
  console.log(`wrote ${OUTPUT_PATH.slice(ROOT.length + 1)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
