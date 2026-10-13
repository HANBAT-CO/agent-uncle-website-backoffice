/**
 * Typed access to the generated market map (spec 4.8).
 *
 * scripts/map/build-map.mjs projects src/components/map/geometry.json through
 * the hairline kernel's camera and writes ./generated/map-views.json; this
 * module narrows that JSON into MapView objects. Run `npm run map` after any
 * geometry change (views.test.ts fails while the JSON is stale).
 *
 * Server-side data: the JSON holds every path string of both views, so import
 * this module from Server Components (MarketMap, MapLabels, section wrappers)
 * and tests. A client leaf that needs to hit-test the pointer gets the slim
 * `toPickView(view)` object as a prop and calls ./camera.ts with it.
 *
 * Coordinates: every screen point is in viewBox units of its view; `toPercent`
 * turns one into left/top percentages for DOM overlays laid over the SVG box.
 */
import raw from "./generated/map-views.json";

export type MapViewId = "hero-desktop" | "hero-mobile";
export type MapBuildingId = "diot" | "cheongpyeonghwa" | "nampyeonghwa" | "apm";
export type MapRouteStopId = "start" | "apm" | "cheongpyeonghwa";
export type MapFace = "east" | "west" | "south" | "north";

/** [x, y] in viewBox units. */
export type ScreenPoint = readonly [number, number];
/** World footprint [x0, y0, x1, y1] on the ground plane. */
export type Footprint = readonly [number, number, number, number];

/** An SVG path and its measured length (the --len custom property for draw-in). */
export type MapPath = { readonly d: string; readonly length: number };

/** One storey's tick on a visible wall, at mid-storey height. */
export type MapFloor = MapPath & {
  /** 1-based storey number (1 = 1층). */
  readonly floor: number;
  /** World height of the tick. */
  readonly z: number;
  /** The tick's centre: where a floor tag or the S1 dot sits. */
  readonly anchor: ScreenPoint;
};

export type MapDoor = MapPath & { readonly face: MapFace; readonly point: ScreenPoint };

export type MapBuilding = {
  /** Paint order, back to front (ascending x + y of the footprint centre). */
  readonly order: number;
  readonly id: MapBuildingId;
  readonly footprint: Footprint;
  readonly height: number;
  readonly floorCount: number;
  readonly sil: MapPath;
  readonly crease: MapPath;
  readonly floors: readonly MapFloor[];
  readonly door: MapDoor | null;
  /** Roof centre (label slot). */
  readonly roof: ScreenPoint;
  /** Footprint centre on the ground. */
  readonly base: ScreenPoint;
  /** Sum of every path length of the building. */
  readonly length: number;
};

/** The kernel camera: az in degrees, k = sin(elevation), S scale, ox/oy offset. */
export type MapCamera = {
  readonly az: number;
  readonly k: number;
  readonly S: number;
  readonly ox: number;
  readonly oy: number;
};

export type MapRouteStop = {
  readonly id: MapRouteStopId;
  /** Fraction of the route's length (MotionPath progress) at the stop. */
  readonly t: number;
  readonly point: ScreenPoint;
};

export type MapRoute = MapPath & { readonly points: readonly ScreenPoint[]; readonly stops: readonly MapRouteStop[] };

export type MapView = {
  readonly id: MapViewId;
  readonly viewBox: { readonly width: number; readonly height: number };
  readonly camera: MapCamera;
  /** Back to front. */
  readonly buildings: readonly MapBuilding[];
  readonly faint: {
    /** 청계천: two thin parallel lines. */
    readonly stream: readonly MapPath[];
    readonly roads: readonly (MapPath & { readonly name: string })[];
  };
  /** The round 02:16 APM, 03:06 청평화 (S3). */
  readonly route: MapRoute;
  readonly anchors: {
    /** North end of the avenue: the 동대문 박삼촌 chip (S1) and the route start. */
    readonly uncle: ScreenPoint;
  };
  /** 청평화's roof: the dive's transform-origin. */
  readonly focus: {
    readonly building: MapBuildingId;
    readonly point: ScreenPoint;
    readonly percent: { readonly x: number; readonly y: number };
  };
  /** Screen box of all buildings (and their hull as a path). */
  readonly buildingBounds: {
    readonly minX: number;
    readonly maxX: number;
    readonly minY: number;
    readonly maxY: number;
    readonly hull: string;
  };
};

/** What ./camera.ts needs: small enough to pass from a Server Component to a client leaf. */
export type MapPickView = {
  readonly camera: MapCamera;
  readonly buildings: readonly Pick<MapBuilding, "id" | "order" | "footprint" | "height">[];
};

/* ------------------------------------------------------------------ */
/* Narrowing the generated JSON                                        */
/* ------------------------------------------------------------------ */

type RawView = (typeof raw.views)["hero-desktop"];

const BUILDING_IDS: readonly MapBuildingId[] = ["diot", "cheongpyeonghwa", "nampyeonghwa", "apm"];
const STOP_IDS: readonly MapRouteStopId[] = ["start", "apm", "cheongpyeonghwa"];
const FACES: readonly MapFace[] = ["east", "west", "south", "north"];

function oneOf<T extends string>(allowed: readonly T[], value: string, what: string): T {
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined) throw new Error(`map-views.json: unknown ${what} "${value}"`);
  return match;
}

function point(value: readonly number[]): ScreenPoint {
  if (value.length !== 2) throw new Error(`map-views.json: expected [x, y], got ${value.length} numbers`);
  return [value[0], value[1]];
}

function footprint(value: readonly number[]): Footprint {
  if (value.length !== 4) throw new Error("map-views.json: a footprint is [x0, y0, x1, y1]");
  return [value[0], value[1], value[2], value[3]];
}

function narrowView(id: MapViewId, view: RawView): MapView {
  if (view.id !== id) throw new Error(`map-views.json: view ${id} is labelled ${view.id}`);
  return {
    id,
    viewBox: view.viewBox,
    camera: view.camera,
    buildings: view.buildings.map((b) => ({
      order: b.order,
      id: oneOf(BUILDING_IDS, b.id, "building"),
      footprint: footprint(b.footprint),
      height: b.height,
      floorCount: b.floorCount,
      sil: b.sil,
      crease: b.crease,
      floors: b.floors.map((f) => ({ ...f, anchor: point(f.anchor) })),
      door: b.door ? { ...b.door, face: oneOf(FACES, b.door.face, "face"), point: point(b.door.point) } : null,
      roof: point(b.roof),
      base: point(b.base),
      length: b.length,
    })),
    faint: view.faint,
    route: {
      d: view.route.d,
      length: view.route.length,
      points: view.route.points.map(point),
      stops: view.route.stops.map((s) => ({ id: oneOf(STOP_IDS, s.id, "route stop"), t: s.t, point: point(s.point) })),
    },
    anchors: { uncle: point(view.anchors.uncle) },
    focus: {
      building: oneOf(BUILDING_IDS, view.focus.building, "building"),
      point: point(view.focus.point),
      percent: view.focus.percent,
    },
    buildingBounds: view.buildingBounds,
  };
}

const VIEWS: Readonly<Record<MapViewId, MapView>> = {
  "hero-desktop": narrowView("hero-desktop", raw.views["hero-desktop"]),
  "hero-mobile": narrowView("hero-mobile", raw.views["hero-mobile"]),
};

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

export const MAP_VIEW_IDS: readonly MapViewId[] = ["hero-desktop", "hero-mobile"];

export function getMapView(id: MapViewId): MapView {
  return VIEWS[id];
}

export function getMapBuilding(view: MapView, id: MapBuildingId): MapBuilding {
  const building = view.buildings.find((b) => b.id === id);
  if (!building) throw new Error(`map view ${view.id} has no building ${id}`);
  return building;
}

/** A viewBox point as left/top percentages of the SVG box (DOM overlays, transform-origin). */
export function toPercent(view: MapView, [x, y]: ScreenPoint): { x: number; y: number } {
  return {
    x: Math.round((x / view.viewBox.width) * 1e4) / 100,
    y: Math.round((y / view.viewBox.height) * 1e4) / 100,
  };
}

/** CSS aspect-ratio of the view, e.g. "1200 / 760": give the map's wrapper this box. */
export function mapAspectRatio(view: MapView): string {
  return `${view.viewBox.width} / ${view.viewBox.height}`;
}

/** The camera and rest footprints only (a few hundred bytes), for client hit-testing. */
export function toPickView(view: MapView): MapPickView {
  return {
    camera: view.camera,
    buildings: view.buildings.map(({ id, order, footprint: fp, height }) => ({ id, order, footprint: fp, height })),
  };
}
