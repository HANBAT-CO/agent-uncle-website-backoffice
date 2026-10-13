import { QuantityDot } from "@/components/dot/QuantityDot";
import { AppIcon } from "@/components/icons/AppIcon";
import { SectionHeading } from "@/components/section/SectionHeading";
import { SectionShell } from "@/components/section/SectionShell";
import { dawn, map } from "@/content/copy";

import { DawnMotionIsland } from "./DawnMotionIsland";
import { ACTIVE_TIME, RecordRuler } from "./RecordRuler";
import "./dawn.css";

/**
 * S5 dawn, 05:53 (spec S5): delivery is recorded per 회차, and the night
 * turns into the morning, the page's one theme switch.
 *
 * Server Component: every string is here in reading order (heading, body,
 * the confirm card, the ruler's two slots, the destination), so the no-JS and
 * reduced-motion page reads the same. Two bands carry the content: the night
 * band (heading and the confirm card) and the day band (route, destination
 * and ruler). In desktop motion both bands overlay one pinned scene
 * (dawn.css); on phones they stack inside a 160vh gradient band; under
 * reduced motion they are two static bands split by a 1px horizon rule.
 *
 * DawnMotion (client) wraps it with the sky and the scroll motion.
 */
export function DawnSection() {
  return (
    <SectionShell id="dawn" titleId="dawn-title" tone="dawn" pad="none" reducedBeat="b0553" className="dawn">
      <DawnMotionIsland>
        <div className="dawn-band dawn-band-night" data-dawn-band="night">
          <div className="dawn-frame">
            <div className="dawn-stage stage-night">
              {/* Heading and body take the light separately: it reaches the body first, and the body's first line on its own. */}
              <div className="dawn-copy">
                <div className="dawn-title" data-dawn-lit="night">
                  <SectionHeading id="dawn-title" lines={dawn.h2} />
                </div>
                <p className="dawn-body" data-dawn-lit="night" data-dawn-lit-first="night">
                  {dawn.body}
                </p>
              </div>

              {/* Paper object in the app's dialog format; the buttons are inert. */}
              <div className="dawn-confirm" role="group" aria-label={dawn.confirm.groupLabel} data-dawn-card>
                <div className="dawn-confirm-content" data-dawn-card-content>
                  <p className="dawn-confirm-title">{dawn.confirm.title}</p>
                  <p className="dawn-confirm-body">{dawn.confirm.body}</p>
                  {/* Inert pills; the group name already marks the dialog as an example, so they are not read as a phrase. */}
                  <div className="dawn-confirm-actions" aria-hidden="true">
                    <span className="dawn-dialog-button" data-variant="weak">
                      {dawn.confirm.cancel}
                    </span>
                    <span className="dawn-dialog-button" data-variant="primary" data-dawn-confirm>
                      {dawn.confirm.confirm}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="dawn-horizon" aria-hidden="true" />

        <div className="dawn-band dawn-band-day" data-dawn-band="day">
          <div className="dawn-frame">
            <div className="dawn-stage stage-night">
              <div className="dawn-route" data-dawn-route data-dawn-lit="night" aria-hidden="true">
                <span className="dawn-route-origin" data-dawn-lit="night">
                  {map.buildings.cheongpyeonghwa}
                </span>
                <svg className="dawn-route-svg" width="100%" height="2" focusable="false">
                  <line className="dawn-route-base" x1="0" y1="1" x2="100%" y2="1" />
                  <line className="dawn-route-lit" data-dawn-lit-line x1="0" y1="1" x2="100%" y2="1" />
                </svg>
                <span className="dawn-route-node" />
                {/* Phones only: the ruler's hour scale is hidden there, so the route marks 05:53 where it turns from night to day. */}
                <span className="dawn-route-stamp">{ACTIVE_TIME}</span>
                <span className="dawn-route-steps">
                  <span data-dawn-step="1" />
                  <span data-dawn-step="2" />
                  <span data-dawn-step="3" />
                </span>
                <QuantityDot tone="lamp" className="dawn-dot" />
              </div>

              <RecordRuler />

              <div className="dawn-dest" data-dawn-dest data-dawn-lit="night">
                <div className="dawn-dest-card" role="group" aria-label={dawn.destination.groupLabel}>
                  <p className="dawn-dest-name">
                    <AppIcon name="store" size={20} className="dawn-dest-icon" />
                    {dawn.destination.name}
                  </p>
                  <p className="dawn-dest-address">{dawn.destination.address}</p>
                  <p className="dawn-dest-note">{dawn.destination.note}</p>
                </div>
                <span className="dawn-dest-connector" aria-hidden="true" />
                <p className="dawn-demo" data-dawn-lit="night">
                  {dawn.demo}
                </p>
              </div>
            </div>
          </div>
        </div>
      </DawnMotionIsland>
    </SectionShell>
  );
}
