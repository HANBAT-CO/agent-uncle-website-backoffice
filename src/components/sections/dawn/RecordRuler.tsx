import type { CSSProperties } from "react";

import { dawn, plate } from "@/content/copy";

import { RULER_HOURS, eventMarks, hourTicks, rulerHours } from "./ruler-scale";

/**
 * The record ruler (spec S5; reference THE LOOKBACK's tick ruler with a fixed
 * playhead): the night from 20:00 to 11:00 as hour ticks, the records of the
 * denim as event marks, the 1차 · 05:53 slot holding 2장, and a dashed
 * 다음 회차 slot after 11:00 for the 남은 미송 4장. A caption names the item
 * the ruler belongs to (the plate's product line), so the 7 on the confirm
 * card landing as 2장 reads as the denim's share of the batch.
 *
 * Server Component. Everything sits at `left: calc(var(--at) * var(--ruler-hour))`
 * on one track; the track is translated so the hour in `--ruler-at` stands
 * under the fixed centre playhead. Its default is 05:53 (the composed state);
 * DawnMotion scrubs --ruler-at from 03:07 and scales the active slot.
 *
 * Rows, top to bottom: slots, hour labels, the axis (ticks, event marks and
 * the playhead), event times. Text takes the light on its own line
 * (data-dawn-lit): the hour row, each event time (they sit on two rows) and
 * each line of the 다음 회차 slot, so a label never waits for the ruler's
 * middle or for a line above or below it.
 *
 * At 1024px and wider: the full ruler. Below: a two-slot horizontal
 * scroll-snap row (ticks, marks and playhead hidden). Ticks and marks are
 * decorative; the two slots are a list a screen reader reads.
 */

const TICKS = hourTicks(dawn.ruler.labels);
const MARKS = eventMarks(dawn.ruler.marks);

/** The active slot's time, read from its label (1차 · 05:53). The phone route stamps it where the dot inks. */
export const ACTIVE_TIME = /\d\d:\d\d/.exec(dawn.ruler.active.label)?.[0] ?? "05:53";
const ACTIVE_AT = rulerHours(ACTIVE_TIME);

function at(value: number): CSSProperties {
  return { "--at": value } as CSSProperties;
}

export function RecordRuler() {
  return (
    <div className="dawn-ruler" data-dawn-ruler style={{ "--ruler-at": ACTIVE_AT } as CSSProperties}>
      <p className="dawn-ruler-item" data-dawn-lit="night">
        {plate.item}
      </p>
      <div className="dawn-ruler-window" data-dawn-window>
        <div className="dawn-ruler-track">
          <div className="dawn-ruler-scale" aria-hidden="true">
            <div className="dawn-ruler-row dawn-ruler-hours" data-dawn-lit="night">
              {TICKS.filter((tick) => tick.label !== null).map((tick) => (
                <span key={tick.time} className="dawn-tick-label" style={at(tick.at)}>
                  {tick.label}
                </span>
              ))}
            </div>
            <div className="dawn-ruler-row dawn-ruler-axis" data-dawn-lit="night">
              {TICKS.map((tick) => (
                <span key={tick.time} className="dawn-tick" data-major={tick.label === null ? undefined : ""} style={at(tick.at)} />
              ))}
              {MARKS.map((mark) => (
                <span key={mark.time} className="dawn-mark" style={at(mark.at)} />
              ))}
            </div>
            <div className="dawn-ruler-row dawn-ruler-times">
              {MARKS.map((mark) => (
                <span
                  key={mark.time}
                  className="dawn-mark-label"
                  data-row={mark.row}
                  data-time={mark.time}
                  data-dawn-lit="night"
                  style={at(mark.at)}
                >
                  {mark.time}
                </span>
              ))}
            </div>
          </div>
          {/* Below 1024px this row scrolls sideways; DawnMotion makes it a tab stop only while it overflows. */}
          <ol className="dawn-slots" data-dawn-slots aria-label={dawn.ruler.slotsLabel}>
            <li className="dawn-slot dawn-slot-active" data-dawn-slot="active" data-dawn-lit="night" style={at(ACTIVE_AT)}>
              <span className="dawn-slot-outline" aria-hidden="true" />
              <span className="dawn-slot-fill" data-dawn-slot-fill>
                <span className="dawn-slot-meta">{dawn.ruler.active.label}</span>
                <span className="dawn-slot-value">{dawn.ruler.active.quantity}</span>
              </span>
            </li>
            <li className="dawn-slot dawn-slot-next" data-dawn-slot="next" data-dawn-lit="night" style={at(RULER_HOURS)}>
              <span className="dawn-slot-meta" data-dawn-lit="night">
                {dawn.ruler.next.label}
              </span>
              <span className="dawn-slot-value" data-dawn-lit="night">
                {dawn.ruler.next.quantity}
              </span>
            </li>
          </ol>
        </div>
        <span className="dawn-playhead" data-dawn-lit="night" aria-hidden="true" />
      </div>
    </div>
  );
}
