import type { CSSProperties } from "react";

import { MessageBubble } from "@/components/chrome/MessageBubble";
import { RecordCard } from "@/components/chrome/RecordCard";
import { QuantityDot } from "@/components/dot/QuantityDot";
import { MapLabels, MarketMap } from "@/components/map/MarketMap";
import { getMapView, mapAspectRatio, toPercent, type MapBuildingId, type MapRouteStopId } from "@/components/map/views";
import { fill, map, plate, route } from "@/content/copy";
import { RECORDS, type BeatId, type RecordId } from "@/content/story";

import { RouteTrail } from "./RouteTrail";

/**
 * The four S3 captions (spec S3) as one ordered list, all in the DOM in
 * reading order. Server Component.
 *
 * - A: the uncle's profile line (no time, no record)
 * - B 02:16 APM, the cardigan: 확보 5 · 미송 3 (r0216, the ledger does not move)
 * - C 03:06 청평화, the denim: 확보 2 · 미송 4 (r0306, the ledger moves)
 * - D 03:07: the uncle's message (m0307, the ledger does not move)
 *
 * Each timed stop also carries what phones show as its own block (spec S3
 * mobile): a static crop of the round (hero-mobile view, route drawn up to the
 * stop, the dot at the stop) and its record card or bubble. The 03:07 block
 * has no crop: the message changes nothing on the map (its caption's point),
 * so its bubble sits right under the 03:06 block. B and C also name the
 * request their record belongs to (the item line), so 확보 5 · 미송 3 never
 * reads as the denim's numbers. On desktop the crops are hidden and the
 * records live in the record column from 1280px; between 1024 and 1279px (no
 * column) they stay with their caption.
 *
 * Hooks: [data-route-stop=A|B|C|D], [data-stop-beat] (the beat a block
 * reports when its centre crosses the viewport centre), [data-route-text]
 * (the caption block) and [data-ghost-end] (the last line a previous caption
 * keeps in the film, RouteMotion).
 */

type CSSVars = CSSProperties & Record<`--${string}`, string | number>;

const MOBILE_VIEW = "hero-mobile";
const STORY_YEAR = "2026";

type TimedStop = {
  key: "B" | "C" | "D";
  beat: BeatId;
  record: RecordId;
  /** Where the dot stands on the block's crop; null: no crop (the 03:07 message moves nothing on the map). */
  at: Exclude<MapRouteStopId, "start"> | null;
  /** Floor ticks lit by then: APM 럭스 4층 from 02:16, 청평화 1층 from 03:06. */
  lit: ReadonlyArray<readonly [MapBuildingId, number]>;
};

const TIMED: readonly TimedStop[] = [
  { key: "B", beat: "b0216", record: "r0216", at: "apm", lit: [["apm", 4]] },
  {
    key: "C",
    beat: "b0306",
    record: "r0306",
    at: "cheongpyeonghwa",
    lit: [
      ["apm", 4],
      ["cheongpyeonghwa", 1],
    ],
  },
  { key: "D", beat: "b0307", record: "m0307", at: null, lit: [] },
];

/** 10월 11일 02:16 as a machine-readable date-time. */
function isoTime(record: RecordId): string {
  const { day, time } = RECORDS[record];
  const [month, date] = day.match(/\d+/g) ?? [];
  if (month === undefined || date === undefined) throw new Error(`route: cannot read the day of ${record} (${day})`);
  return `${STORY_YEAR}-${month.padStart(2, "0")}-${date.padStart(2, "0")}T${time}`;
}

function StopMap({ stop, at }: { stop: TimedStop; at: Exclude<MapRouteStopId, "start"> }) {
  const view = getMapView(MOBILE_VIEW);
  const point = view.route.stops.find((candidate) => candidate.id === at);
  if (!point) throw new Error(`route: the ${MOBILE_VIEW} view has no ${at} stop`);
  const idPrefix = `route-${stop.key.toLowerCase()}`;
  const dot = toPercent(view, point.point);
  const style: CSSVars = { aspectRatio: mapAspectRatio(view), "--route-drawn": point.t };

  return (
    <div className="route-crop" aria-hidden="true" style={style}>
      <RouteTrail view={view} idPrefix={idPrefix} />
      <MarketMap view={MOBILE_VIEW} layer="base" route="round" idPrefix={idPrefix} lit={stop.lit} />
      <MapLabels
        view={MOBILE_VIEW}
        slotClassName="route-label"
        slots={{ apm: map.buildings.apm, cheongpyeonghwa: map.buildings.cheongpyeonghwa }}
      />
      <span className="route-crop-dot" style={{ left: `${dot.x}%`, top: `${dot.y}%` }}>
        <QuantityDot tone="lamp" />
      </span>
    </div>
  );
}

function StopRecord({ id }: { id: RecordId }) {
  const record = RECORDS[id];
  return (
    <div className="route-record">
      {record.kind === "message" ? (
        <MessageBubble text={record.title} time={record.time} ground="night" />
      ) : (
        <RecordCard meta={fill(plate.recordMeta, { time: record.time })} title={record.title} detail={record.detail} />
      )}
    </div>
  );
}

export function RouteStops() {
  const [a, b, c, d] = route.stops;
  const copyFor = { B: b, C: c, D: d } as const;

  return (
    <ol className="route-stops" data-route-stops>
      <li className="route-stop" data-route-stop="A">
        <div className="route-stop-text" data-route-text>
          <blockquote className="route-quote" data-ghost-end>
            <p>{a.quote}</p>
          </blockquote>
          <p className="route-attribution">{a.attribution}</p>
          <p className="route-sub">{a.caption}</p>
        </div>
      </li>

      {TIMED.map((stop) => {
        const copy = copyFor[stop.key];
        return (
          <li key={stop.key} className="route-stop" data-route-stop={stop.key} data-stop-beat={stop.beat}>
            {stop.at ? <StopMap stop={stop} at={stop.at} /> : null}
            <div className="route-stop-text" data-route-text>
              <p className="route-meta">
                <time className="route-time" dateTime={isoTime(stop.record)}>
                  {copy.time}
                </time>
                {"place" in copy ? <span className="route-place">{copy.place}</span> : null}
              </p>
              <p className="route-caption" data-ghost-end>
                {copy.caption}
              </p>
              {"item" in copy ? <p className="route-item">{copy.item}</p> : null}
            </div>
            <StopRecord id={stop.record} />
          </li>
        );
      })}
    </ol>
  );
}
