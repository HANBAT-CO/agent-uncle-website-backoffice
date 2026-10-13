import { AppIcon } from "@/components/icons/AppIcon";
import { fill, plate } from "@/content/copy";
import { RECORDS, type RecordId } from "@/content/story";

import { RecordProxiesSpringIsland } from "./RecordProxiesSpringIsland";

/**
 * The 22:00 record cards r2005 and r2031 (spec S1), floating above-right of
 * 청평화's roof: proxies of the rail's own entries, drawn exactly like the
 * rail's record cards (paper, radius 24, 업무 기록 · HH:MM, title, chevron;
 * spec 5.2) so the hand-off shows no jump.
 *
 * From 1024px only (phones have them in the record pill and sheet); at
 * 1280px and up under reduced motion the rail already shows them, so the
 * proxies stay hidden there (hero.css). While they show, they are the only
 * copy of these two records (the rail hides its own entries then), so they
 * are a real list, 업무 기록, for assistive technology; once they hand over
 * (data-proxy-done) they are hidden and the rail's entries take over.
 *
 * Here: the spring-in. On idle after hydration, when the draw-in runs
 * (html.js-draw), the cards rise from y+16 over 700ms on the snap curve,
 * 120ms apart, after the strokes (`at`, seconds). Without the draw-in they are
 * simply there. HeroMotion flies the outer [data-rail-proxy] elements to the
 * rail slots during the dive; the spring only moves the inner cards.
 *
 * Hand-off contract with the record column (WP-02), through attributes only:
 * the rail hides its r2005 and r2031 entries while this section holds
 * [data-rail-proxy] elements and no data-proxy-done; it renders
 * [data-rail-slot=<id>] on those entries for HeroMotion to measure.
 */

const PROXIES: readonly RecordId[] = ["r2005", "r2031"];

export function RecordProxies({ at }: { at: number }) {
  return (
    <>
      <ol className="hero-proxies" data-hero-proxies data-readout-obstacle aria-label={plate.label}>
        {PROXIES.map((id) => {
          const record = RECORDS[id];
          return (
            <li key={id} className="hero-proxy" data-rail-proxy={id}>
              <div className="hero-proxy-card" data-proxy-card>
                <span className="hero-proxy-body">
                  <span className="hero-proxy-meta">{fill(plate.recordMeta, { time: record.time })}</span>
                  <span className="hero-proxy-title">{record.title}</span>
                </span>
                <AppIcon name="chevron" size={16} className="hero-proxy-chevron" />
              </div>
            </li>
          );
        })}
      </ol>
      <RecordProxiesSpringIsland at={at} />
    </>
  );
}
