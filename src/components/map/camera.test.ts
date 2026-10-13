import { describe, expect, it } from "vitest";

import { pickBuilding, PICK_RADIUS, project, unproject } from "./camera";
import { getMapBuilding, getMapView, MAP_VIEW_IDS, toPickView, type MapView } from "./views";

/** The world point at the middle of a footprint. */
function footprintCentre(view: MapView, id: Parameters<typeof getMapBuilding>[1]): [number, number] {
  const [x0, y0, x1, y1] = getMapBuilding(view, id).footprint;
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}

describe.each(MAP_VIEW_IDS)("camera math in %s", (viewId) => {
  const view = getMapView(viewId);

  it("round-trips project then unproject on the ground within 1e-6", () => {
    const samples: Array<[number, number]> = [
      [0, 0],
      [46, 75],
      [72, 40],
      [-30, 120],
      [160.5, -12.25],
    ];
    for (const [x, y] of samples) {
      const [sx, sy] = project(view, x, y);
      const [ux, uy] = unproject(view, sx, sy);
      expect(Math.abs(ux - x)).toBeLessThan(1e-6);
      expect(Math.abs(uy - y)).toBeLessThan(1e-6);
    }
  });

  it("round-trips on a raised plane when given its height", () => {
    const [sx, sy] = project(view, 22, 70, 36);
    const [ux, uy] = unproject(view, sx, sy, 36);
    expect(Math.abs(ux - 22)).toBeLessThan(1e-6);
    expect(Math.abs(uy - 70)).toBeLessThan(1e-6);
  });

  it("projects a footprint centre onto the generated base point", () => {
    for (const building of view.buildings) {
      const [cx, cy] = footprintCentre(view, building.id);
      const [sx, sy] = project(view, cx, cy);
      // The JSON stores points rounded to two decimals.
      expect(Math.abs(sx - building.base[0])).toBeLessThanOrEqual(0.005 + 1e-9);
      expect(Math.abs(sy - building.base[1])).toBeLessThanOrEqual(0.005 + 1e-9);
    }
  });

  it("picks each building at the projected centre of its footprint", () => {
    for (const building of view.buildings) {
      const [cx, cy] = footprintCentre(view, building.id);
      const [sx, sy] = project(view, cx, cy);
      expect(pickBuilding(view, sx, sy)).toBe(building.id);
    }
  });

  it("picks a building by its rest roof, not only its footprint (rule 01)", () => {
    for (const building of view.buildings) {
      expect(pickBuilding(view, building.roof[0], building.roof[1])).toBe(building.id);
    }
  });

  it("returns null for a point far from every building", () => {
    const [sx, sy] = project(view, -400, 400);
    expect(pickBuilding(view, sx, sy)).toBeNull();
    expect(pickBuilding(view, -5000, -5000)).toBeNull();
  });

  it("falls back to the nearest building within the pick radius on open ground", () => {
    const apm = getMapBuilding(view, "apm");
    const [, y0, , y1] = apm.footprint;
    const x0 = apm.footprint[0];
    // West of APM, on the ground: inside the radius picks APM, beyond it nothing.
    const near = project(view, x0 - (PICK_RADIUS - 2), (y0 + y1) / 2);
    const far = project(view, x0 - (PICK_RADIUS + 30), (y0 + y1) / 2 + 30);
    expect(pickBuilding(view, near[0], near[1])).toBe("apm");
    expect(pickBuilding(view, far[0], far[1])).toBeNull();
  });

  it("gives the same answers from the slim pick view a client leaf receives", () => {
    const slim = toPickView(view);
    for (const building of view.buildings) {
      expect(pickBuilding(slim, building.roof[0], building.roof[1])).toBe(building.id);
    }
    expect(unproject(slim, ...project(slim, 12, 34))).toEqual(unproject(view, ...project(view, 12, 34)));
  });
});

describe("pick radius", () => {
  it("is 12 world units (spec S1 lens)", () => {
    expect(PICK_RADIUS).toBe(12);
  });
});
