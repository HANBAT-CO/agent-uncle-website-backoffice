import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { budgetMarkup, BUDGET, buildMapViews, GEOMETRY_PATH, OUTPUT_PATH, serialize } from "../../../scripts/map/build-map.mjs";

import { getMapBuilding, getMapView, MAP_VIEW_IDS, mapAspectRatio, toPercent } from "./views";

const geometry = JSON.parse(readFileSync(GEOMETRY_PATH, "utf8"));

describe("generated map views", () => {
  it("matches a fresh build of geometry.json (run npm run map after editing it)", () => {
    expect(readFileSync(OUTPUT_PATH, "utf8")).toBe(serialize(buildMapViews(geometry)));
  });

  it("builds deterministically", () => {
    expect(serialize(buildMapViews(geometry))).toBe(serialize(buildMapViews(geometry)));
  });

  it("keeps the hero-desktop SVG within 30 KB gzip and 600 paths", () => {
    const { gzipBytes, paths } = budgetMarkup(getMapView("hero-desktop"));
    expect(gzipBytes).toBeLessThanOrEqual(BUDGET.gzipBytes);
    expect(paths).toBeLessThanOrEqual(BUDGET.paths);
  });
});

describe.each(MAP_VIEW_IDS)("%s", (id) => {
  const view = getMapView(id);

  it("has the four buildings, painted back to front", () => {
    expect(view.buildings.map((b) => b.id).sort()).toEqual(["apm", "cheongpyeonghwa", "diot", "nampyeonghwa"]);
    view.buildings.forEach((b, index) => {
      expect(b.order).toBe(index);
      if (index === 0) return;
      const [px0, py0, px1, py1] = view.buildings[index - 1].footprint;
      const [x0, y0, x1, y1] = b.footprint;
      expect(x0 + x1 + y0 + y1).toBeGreaterThanOrEqual(px0 + px1 + py0 + py1);
    });
  });

  it("draws each building as one silhouette and one crease with at most four floor ticks", () => {
    for (const b of view.buildings) {
      expect(b.sil.d).toMatch(/^M[^M]+Z$/);
      expect(b.crease.d.match(/M/g)).toHaveLength(1);
      expect(b.floors.length).toBe(b.floorCount);
      expect(b.floors.length).toBeLessThanOrEqual(4);
      expect(b.sil.length).toBeGreaterThan(0);
    }
    expect(getMapBuilding(view, "apm").floorCount).toBe(4);
    expect(getMapBuilding(view, "cheongpyeonghwa").floorCount).toBe(2);
  });

  it("runs the round from the avenue to APM, then to 청평화", () => {
    const [start, apm, cheongpyeonghwa] = view.route.stops;
    expect([start.id, apm.id, cheongpyeonghwa.id]).toEqual(["start", "apm", "cheongpyeonghwa"]);
    expect(start.t).toBe(0);
    expect(apm.t).toBeGreaterThan(0.2);
    expect(apm.t).toBeLessThan(0.8);
    expect(cheongpyeonghwa.t).toBe(1);
    expect(apm.point).toEqual(getMapBuilding(view, "apm").door?.point);
    expect(cheongpyeonghwa.point).toEqual(getMapBuilding(view, "cheongpyeonghwa").door?.point);
    expect(start.point).toEqual(view.anchors.uncle);
  });

  it("aims the focus at 청평화's roof", () => {
    expect(view.focus.building).toBe("cheongpyeonghwa");
    expect(view.focus.point).toEqual(getMapBuilding(view, "cheongpyeonghwa").roof);
    expect(view.focus.percent).toEqual(toPercent(view, view.focus.point));
  });
});

describe("composition", () => {
  it("hero-desktop puts 청평화 at about 44% x, 46% y and leaves the record column free", () => {
    const view = getMapView("hero-desktop");
    expect(view.focus.percent.x).toBeCloseTo(44, 0);
    expect(view.focus.percent.y).toBeCloseTo(46, 0);
    const { minX, maxX, minY, maxY } = view.buildingBounds;
    expect(minX).toBeGreaterThan(0);
    expect(maxX / view.viewBox.width).toBeLessThanOrEqual(0.75);
    expect((maxX - minX) / view.viewBox.width).toBeCloseTo(0.7, 1);
    expect(minY).toBeGreaterThan(0);
    expect(maxY).toBeLessThan(view.viewBox.height);
    expect(mapAspectRatio(view)).toBe("1200 / 760");
  });

  it("hero-mobile frames APM and 청평화 whole", () => {
    const view = getMapView("hero-mobile");
    expect(mapAspectRatio(view)).toBe("400 / 360");
    for (const id of ["apm", "cheongpyeonghwa"] as const) {
      const b = getMapBuilding(view, id);
      const xs = b.sil.d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
      const points = xs.filter((_, index) => index % 2 === 0);
      expect(Math.min(...points)).toBeGreaterThan(0);
      expect(Math.max(...points)).toBeLessThan(view.viewBox.width);
      expect(b.roof[1]).toBeGreaterThan(0);
      expect(b.base[1]).toBeLessThan(view.viewBox.height);
    }
  });
});
