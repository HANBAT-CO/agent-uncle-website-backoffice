/**
 * The hero map draw-in plan (spec S1): when each stroke starts and where the
 * long ground lines start growing from. Computed on the server from the map
 * view and handed to HeroMotion as plain data.
 *
 * - The market lights up from 청평화: every building starts after a delay of
 *   40ms per 10 world units between its footprint centre and 청평화's.
 * - The stream and road lines grow outward from their point nearest to
 *   청평화 (a fraction `from` along the path as drawn), after a delay for that
 *   distance.
 * - Every stroke then draws over DRAW_DURATION_S.
 */
import { unproject } from "@/components/map/camera";
import type { Footprint, MapBuildingId, MapView } from "@/components/map/views";

/** 40ms per 10 world units. */
export const SECONDS_PER_WORLD_UNIT = 0.004;
/** Each stroke draws over 900ms on the snap curve. */
export const DRAW_DURATION_S = 0.9;

export type BuildingDrawStep = { id: MapBuildingId; delay: number };

export type LineDrawStep =
  | { kind: "stream"; index: number; delay: number; from: number }
  | { kind: "road"; name: string; delay: number; from: number };

export type DrawPlan = {
  buildings: BuildingDrawStep[];
  lines: LineDrawStep[];
};

type Vec = readonly [number, number];

function centre([x0, y0, x1, y1]: Footprint): Vec {
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}

const round = (value: number, digits = 4) => Math.round(value * 10 ** digits) / 10 ** digits;

/** The two end points of a straight "M x y L x y" path. */
function endpoints(d: string): [Vec, Vec] {
  const numbers = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (numbers.length !== 4) throw new Error(`draw-plan: expected a straight line, got "${d}"`);
  return [
    [numbers[0], numbers[1]],
    [numbers[2], numbers[3]],
  ];
}

/** Distance from p to segment a-b and the fraction along a-b of the nearest point. */
function nearestOnSegment(p: Vec, a: Vec, b: Vec): { distance: number; t: number } {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const lengthSquared = vx * vx + vy * vy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / lengthSquared));
  return { distance: Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy)), t };
}

export function drawPlan(view: MapView): DrawPlan {
  const focus = view.buildings.find((building) => building.id === view.focus.building);
  if (!focus) throw new Error(`draw-plan: view ${view.id} has no focus building`);
  const origin = centre(focus.footprint);

  const buildings = view.buildings.map((building) => {
    const [x, y] = centre(building.footprint);
    return { id: building.id, delay: round(Math.hypot(x - origin[0], y - origin[1]) * SECONDS_PER_WORLD_UNIT) };
  });

  const line = (d: string) => {
    // Ground lines: unproject both screen end points onto the ground plane.
    const [a, b] = endpoints(d).map(([sx, sy]) => unproject(view, sx, sy, 0));
    const { distance, t } = nearestOnSegment(origin, a, b);
    return { delay: round(distance * SECONDS_PER_WORLD_UNIT), from: round(t) };
  };

  const lines: LineDrawStep[] = [
    ...view.faint.stream.map((stream, index) => ({ kind: "stream" as const, index, ...line(stream.d) })),
    ...view.faint.roads.map((road) => ({ kind: "road" as const, name: road.name, ...line(road.d) })),
  ];

  return { buildings, lines };
}

/** Seconds from the first stroke to the last stroke finishing. */
export function drawTotal(plan: DrawPlan): number {
  const latest = Math.max(0, ...plan.buildings.map((step) => step.delay), ...plan.lines.map((step) => step.delay));
  return latest + DRAW_DURATION_S;
}

/** Durations (seconds) of what follows the strokes (spec S1 draw-in, 6.2 tokens). */
export const INTRO = {
  /** Floor ticks fade in last. */
  tickFade: 0.3,
  /** Building labels and the uncle chip, with the ticks. */
  labelFade: 0.3,
  /** The dot scales 0 to 1. */
  dotScale: 0.4,
  /** The lens, its record layer and the readout: the record token. */
  lensFade: 0.7,
  /** Record cards spring in from y+16 on the record token, 120ms apart. */
  cardSpring: 0.7,
  cardStagger: 0.12,
} as const;

export type IntroSchedule = {
  /** Start times in seconds from the first stroke. */
  ticks: number;
  labels: number;
  dot: number;
  lens: number;
  cards: number;
  /** Everything has landed. */
  end: number;
};

/** When each part of the draw-in starts, given drawTotal(plan). */
export function introSchedule(total: number): IntroSchedule {
  const ticks = Math.max(0, total - 0.15);
  const dot = total;
  const lens = dot + 0.1;
  const cards = dot + 0.1;
  return {
    ticks,
    labels: ticks,
    dot,
    lens,
    cards,
    end: Math.max(lens + INTRO.lensFade, cards + INTRO.cardSpring + INTRO.cardStagger),
  };
}
