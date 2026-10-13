import type { CSSProperties, ReactNode } from "react";

import { QuantityDot } from "@/components/dot/QuantityDot";
import { MapLabels, MarketMap } from "@/components/map/MarketMap";
import { getMapBuilding, getMapView, mapAspectRatio, toPercent, type MapBuildingId, type MapView } from "@/components/map/views";
import { SectionHeading } from "@/components/section/SectionHeading";
import { SectionShell } from "@/components/section/SectionShell";
import { map, route } from "@/content/copy";

import { RouteMotionIsland } from "./RouteMotionIsland";
import { RouteStops } from "./RouteStops";
import { RouteTrail } from "./RouteTrail";
import "./route.css";

/**
 * S3 route, 02:16 to 03:07 (spec S3): the uncle's round from the avenue
 * junction to APM (the cardigan, 확보 5 · 미송 3) and on to 청평화 (the denim,
 * 확보 2 · 미송 4). The ledger moves only on the 03:06 record, never on the
 * 03:07 message.
 *
 * Server Component: every string is here in reading order (heading, the four
 * captions with their records), and the map is rendered in its end state
 * (route fully drawn, the dot at 청평화's door, both arrival ticks lit, both
 * tags shown), which is the no-JS and reduced-motion layout.
 *
 * RouteMotion (client) turns it into the pinned route film on desktop motion
 * (data-route-mode="pinned", see route.css), and reports beats from the stop
 * blocks on phones and under reduced motion.
 */

const VIEW_ID = "hero-desktop";

/** The two stops of the round and the floor each record happens on (APM 럭스 4층, 청평화 1층). */
const ARRIVAL_TICKS = [
  ["apm", 4],
  ["cheongpyeonghwa", 1],
] as const satisfies ReadonlyArray<readonly [MapBuildingId, number]>;

const [, stopB, stopC] = route.stops;

type CSSVars = CSSProperties & Record<`--${string}`, string | number>;

/** Screen bounding box of a building's silhouette (its path is absolute M/L coordinates). */
function silhouetteBounds(view: MapView, id: MapBuildingId): [number, number, number, number] {
  const numbers = (getMapBuilding(view, id).sil.d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const xs = numbers.filter((_, index) => index % 2 === 0);
  const ys = numbers.filter((_, index) => index % 2 === 1);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/**
 * How far a door tag reaches from its door in the static figure, in viewBox
 * units (route.css hangs each tag below-right of its door, about 200 x 56 px
 * in that frame). The pinned film budgets its tags in pixels (RouteMotion).
 */
const TAG_REACH = { x: 250, y: 100 } as const;

type Region = [number, number, number, number];

/** The drawing on the round: APM, 청평화 and the whole route between them. */
function roundShapes(view: MapView): Region {
  const boxes = [silhouetteBounds(view, "apm"), silhouetteBounds(view, "cheongpyeonghwa")];
  const xs = [...boxes.flatMap(([x0, , x1]) => [x0, x1]), ...view.route.points.map(([x]) => x)];
  const ys = [...boxes.flatMap(([, y0, , y1]) => [y0, y1]), ...view.route.points.map(([, y]) => y)];
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** What the static figure frames: the round and the two door tags below-right of their doors. */
function roundRegion(view: MapView): Region {
  const [x0, y0, x1, y1] = roundShapes(view);
  const doors = (["apm", "cheongpyeonghwa"] as const).flatMap((id) => {
    const door = getMapBuilding(view, id).door;
    return door ? [door.point] : [];
  });
  return [
    x0,
    y0,
    Math.max(x1, ...doors.map(([x]) => x + TAG_REACH.x)),
    Math.max(y1, ...doors.map(([, y]) => y + TAG_REACH.y)),
  ];
}

/** Share of the static frame's width and height the region fills. */
const STATIC_FILL = { x: 0.86, y: 0.8 } as const;

/**
 * The static desktop figure (no JS, reduced motion) is a framed crop of the
 * round: the map box is sized and offset in container widths (cqw) so the
 * region fills the frame. Layout only, so strokes stay 1px.
 */
function staticCrop(view: MapView, [x0, y0, x1, y1]: readonly [number, number, number, number]): CSSVars {
  const width = x1 - x0;
  const height = y1 - y0;
  const k = STATIC_FILL.x / width; // map px per unit, per 1px of frame width
  const frameHeight = (height * k) / STATIC_FILL.y; // frame height per 1px of frame width
  return {
    "--route-static-ratio": `${Math.round((1 / frameHeight) * 1e4) / 1e4}`,
    "--route-static-w": Math.round(view.viewBox.width * k * 1e5) / 1e5,
    "--route-static-x": Math.round(((1 - STATIC_FILL.x) / 2 - x0 * k) * 1e5) / 1e5,
    "--route-static-y": Math.round(((frameHeight - height * k) / 2 - y0 * k) * 1e5) / 1e5,
  };
}

function stopFraction(view: MapView, id: "apm" | "cheongpyeonghwa"): number {
  const stop = view.route.stops.find((candidate) => candidate.id === id);
  if (!stop) throw new Error(`route: the ${view.id} view has no ${id} stop`);
  return stop.t;
}

function MapTag({ place, count }: { place: string; count: string }) {
  return (
    <span className="route-tag" data-route-tag>
      <span className="route-tag-place">{place}</span>
      <span className="route-tag-count">{count}</span>
    </span>
  );
}

/** Buildings off the round: dimmed to 35%, as at the end of the hero's dive. */
const OFF_ROUTE: ReadonlyArray<MapBuildingId> = ["diot", "nampyeonghwa"];

function nameSlots(): Partial<Record<MapBuildingId, ReactNode>> {
  const slots: Partial<Record<MapBuildingId, ReactNode>> = {};
  for (const id of map.order) {
    slots[id] = <span data-off-route={OFF_ROUTE.includes(id) ? "" : undefined}>{map.buildings[id]}</span>;
  }
  return slots;
}

export function RouteSection() {
  const view = getMapView(VIEW_ID);
  const start = toPercent(view, view.route.stops[0].point);
  const end = toPercent(view, view.route.stops[view.route.stops.length - 1].point);
  const shapes = roundShapes(view);
  const mapCaption = [route.mapCaption, `${stopB.place}, ${stopB.item}, ${stopB.tag}.`, `${stopC.place}, ${stopC.item}, ${stopC.tag}.`].join(" ");

  const cameraStyle: CSSVars = {
    aspectRatio: mapAspectRatio(view),
    "--route-ratio": view.viewBox.height / view.viewBox.width,
    "--route-fx": view.focus.percent.x / 100,
    "--route-fy": view.focus.percent.y / 100,
  };
  const dotStyle: CSSVars = {
    "--dot-from-x": `${start.x}%`,
    "--dot-from-y": `${start.y}%`,
    "--dot-to-x": `${end.x}%`,
    "--dot-to-y": `${end.y}%`,
  };

  return (
    <SectionShell id="route" titleId="route-title" tone="night" pad="none" className="route">
      <RouteMotionIsland
        apmFraction={stopFraction(view, "apm")}
        shapes={shapes}
        viewBox={view.viewBox}
        focus={view.focus.percent}
      >
        <div className="route-pin-spacer" data-route-pin-spacer>
          <div className="route-scene" data-route-scene>
            <div className="route-frame">
              <div className="route-stage">
                <div className="route-head" data-route-head>
                  <SectionHeading id="route-title" lines={route.h2} className="text-night-ink" />
                </div>

                <figure className="route-figure" data-route-figure style={staticCrop(view, roundRegion(view))}>
                  <div className="route-camera" data-route-camera style={cameraStyle} aria-hidden="true">
                    <RouteTrail view={view} idPrefix="route" />
                    <MarketMap view={VIEW_ID} layer="base" route="round" idPrefix="route" lit={ARRIVAL_TICKS} />
                    <MapLabels view={VIEW_ID} className="route-labels" slotClassName="route-label" slots={nameSlots()} />
                    <MapLabels
                      view={VIEW_ID}
                      anchor="door"
                      className="route-tags"
                      slotClassName="route-tag-slot"
                      slots={{
                        apm: <MapTag place={stopB.place} count={stopB.tag} />,
                        cheongpyeonghwa: <MapTag place={stopC.place} count={stopC.tag} />,
                      }}
                    />
                    <span className="route-dot" data-route-dot style={dotStyle}>
                      <QuantityDot tone="lamp" />
                    </span>
                  </div>
                  <figcaption className="sr-only">{mapCaption}</figcaption>
                </figure>

                <RouteStops />
              </div>
            </div>
          </div>
        </div>
      </RouteMotionIsland>
    </SectionShell>
  );
}
