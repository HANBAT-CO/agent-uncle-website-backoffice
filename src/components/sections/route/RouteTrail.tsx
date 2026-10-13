import type { MapView } from "@/components/map/views";

/**
 * The walked trail under the dashed round (Server Component): the same route
 * path as a faint solid mint line, revealed through the MarketMap's own route
 * mask (<mask id="{idPrefix}-route-mask">, scrubbed by DrawSVG in the film),
 * so the walked part reads as one continuous line with the 2/6 dashes over
 * it. It sits under the map's SVG, so the building plates occlude it exactly
 * as they occlude the dashes. Same viewBox and box as the map; aria-hidden.
 */
export function RouteTrail({ view, idPrefix }: { view: MapView; idPrefix: string }) {
  const { width, height } = view.viewBox;
  return (
    <svg
      className="route-trail"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <path d={view.route.d} vectorEffect="non-scaling-stroke" mask={`url(#${idPrefix}-route-mask)`} />
    </svg>
  );
}
