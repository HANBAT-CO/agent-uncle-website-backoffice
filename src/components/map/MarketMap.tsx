import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/cn";

import "./map.css";
import {
  getMapBuilding,
  getMapView,
  toPercent,
  type MapBuildingId,
  type MapPath,
  type MapView,
  type MapViewId,
  type ScreenPoint,
} from "./views";

/**
 * The market map (spec 4.8), server-rendered and fully drawn.
 *
 *   <div className="relative" style={{ aspectRatio: mapAspectRatio(getMapView("hero-desktop")) }}>
 *     <MarketMap view="hero-desktop" layer="base" idPrefix="hero" draw />
 *     <MarketMap view="hero-desktop" layer="record" idPrefix="hero-rec" className="absolute inset-0" />
 *     <MapLabels view="hero-desktop" slots={{ cheongpyeonghwa: <button>청평화</button> }} />
 *   </div>
 *
 * Groups, back to front: faint (stream and roads, base layer only), the
 * optional round route (dashed path #{idPrefix}-route revealed through
 * <mask id="{idPrefix}-route-mask">, whose path .map-route-mask a section
 * scrubs with DrawSVG), then the buildings, each a <g data-building> holding
 * its silhouette, crease, floor ticks (data-floor="1".."4") and, on the record
 * layer, its door mark. Labels are never inside the SVG: see MapLabels.
 *
 * The SVG is decorative (aria-hidden); the section around it provides the
 * text equivalent (a figure caption naming the buildings and the record).
 */

type CSSVars = CSSProperties & Record<`--${string}`, string | number>;

export type MarketMapProps = {
  view: MapViewId;
  layer: "base" | "record";
  route?: "none" | "round";
  /** Unique per page: prefixes the route and mask ids. */
  idPrefix: string;
  className?: string;
  /**
   * Hero draw-in: marks strokes data-drawable (and floor ticks
   * data-draw-fade) so map.css hides them under html.js-draw until DrawSVG
   * draws them. Leave off everywhere else.
   */
  draw?: boolean;
  /** Floor ticks to render lit from the start (no-JS and reduced-motion end states). */
  lit?: ReadonlyArray<readonly [MapBuildingId, number]>;
};

function MapStroke({
  path,
  className,
  draw,
  fade,
  extra,
}: {
  path: MapPath;
  className: string;
  draw: boolean;
  fade?: boolean;
  extra?: Record<`data-${string}`, string | number | undefined>;
}) {
  const style: CSSVars = { "--len": path.length };
  return (
    <path
      className={className}
      d={path.d}
      vectorEffect="non-scaling-stroke"
      style={style}
      data-drawable={draw && !fade ? "" : undefined}
      data-draw-fade={draw && fade ? "" : undefined}
      {...extra}
    />
  );
}

export function MarketMap({ view: viewId, layer, route = "none", idPrefix, className, draw = false, lit = [] }: MarketMapProps) {
  const view = getMapView(viewId);
  const { width, height } = view.viewBox;
  const isLit = (id: MapBuildingId, floor: number) => lit.some(([b, f]) => b === id && f === floor);
  const routeId = `${idPrefix}-route`;
  const maskId = `${idPrefix}-route-mask`;
  const routeStyle: CSSVars = { "--len": view.route.length };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className={cn("market-map", className)}
      data-map-view={viewId}
      data-map-layer={layer}
      aria-hidden="true"
      focusable="false"
    >
      {route === "round" ? (
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
            <path id={`${maskId}-path`} className="map-route-mask" d={view.route.d} style={routeStyle} />
          </mask>
        </defs>
      ) : null}

      {layer === "base" ? (
        <g className="map-faint" data-map-group="faint">
          {view.faint.stream.map((stream, index) => (
            <MapStroke key={`stream-${index}`} path={stream} className="map-stream" draw={draw} />
          ))}
          {view.faint.roads.map((road) => (
            <MapStroke key={road.name} path={road} className="map-road" draw={draw} extra={{ "data-road": road.name }} />
          ))}
        </g>
      ) : null}

      {route === "round" ? (
        <g className="map-route-group" data-map-group="route">
          <path
            id={routeId}
            className="map-route"
            d={view.route.d}
            vectorEffect="non-scaling-stroke"
            mask={`url(#${maskId})`}
            style={routeStyle}
          />
        </g>
      ) : null}

      <g className="map-buildings" data-map-group="buildings">
        {view.buildings.map((building) => (
          <g key={building.id} className="map-building" data-building={building.id}>
            <MapStroke path={building.sil} className="map-sil" draw={draw} />
            <MapStroke path={building.crease} className="map-crease" draw={draw} />
            {building.floors.map((floor) => (
              <MapStroke
                key={floor.floor}
                path={floor}
                className="map-floor"
                draw={draw}
                fade
                extra={{ "data-floor": floor.floor, "data-lit": isLit(building.id, floor.floor) ? "" : undefined }}
              />
            ))}
            {layer === "record" && building.door ? (
              <MapStroke path={building.door} className="map-door" draw={draw} extra={{ "data-door": building.door.face }} />
            ) : null}
          </g>
        ))}
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

export type MapLabelAnchor = "roof" | "base" | "door" | "floor";

export type MapLabelsProps = {
  view: MapViewId;
  /** Content per building (buttons, text). Buildings without a slot get none. */
  slots: Partial<Record<MapBuildingId, ReactNode>>;
  /**
   * roof (default): the slot's bottom centre sits 12px above the roof centre.
   * base, door, floor (the first floor tick): the slot is centred on the point.
   */
  anchor?: MapLabelAnchor;
  className?: string;
  slotClassName?: string;
};

function anchorPoint(view: MapView, id: MapBuildingId, anchor: MapLabelAnchor): ScreenPoint {
  const building = getMapBuilding(view, id);
  if (anchor === "base") return building.base;
  if (anchor === "door") return building.door?.point ?? building.base;
  if (anchor === "floor") return building.floors[0]?.anchor ?? building.base;
  return building.roof;
}

/**
 * DOM label slots at building points, in percent of the map box (spec 4.8:
 * labels are DOM, never inside the SVG). Lay it over the same box as the
 * SVG (the wrapper takes the view's aspect ratio). Slots come in reading
 * order (left to right on screen), so Tab moves across the map.
 */
export function MapLabels({ view: viewId, slots, anchor = "roof", className, slotClassName }: MapLabelsProps) {
  const view = getMapView(viewId);
  const entries = view.buildings
    .filter((building) => slots[building.id] !== undefined && slots[building.id] !== null)
    .map((building) => ({ id: building.id, point: anchorPoint(view, building.id, anchor) }))
    .sort((a, b) => a.point[0] - b.point[0]);

  return (
    <div className={cn("map-labels", className)} data-map-labels={viewId}>
      {entries.map(({ id, point }) => {
        const { x, y } = toPercent(view, point);
        return (
          <div
            key={id}
            className={cn("map-label-slot", slotClassName)}
            data-building={id}
            data-anchor={anchor}
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            {slots[id]}
          </div>
        );
      })}
    </div>
  );
}
