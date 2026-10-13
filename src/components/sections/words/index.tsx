import type { CSSProperties } from "react";

import { MarketMap } from "@/components/map/MarketMap";
import { getMapView, mapAspectRatio } from "@/components/map/views";
import { SectionHeading } from "@/components/section/SectionHeading";
import { SectionShell } from "@/components/section/SectionShell";
import { words } from "@/content/copy";

import { HEAP, PIT_ITEMS, type PitItem } from "./pit-heap";
import { WordsMotionIsland } from "./WordsMotionIsland";
import "./words.css";

/**
 * S2 words, 23:30 (spec S2): loose chat is not a record; every ambiguous
 * phrase has one explicit action in the app.
 *
 * Server Component, every string in reading order: heading, body, the pit
 * (six phrase bubbles, aria-hidden duplicates of the ledger phrases, and six
 * vocabulary pills, toggletip buttons described by their glossary line), the
 * caption, the ledger (an ordered list: phrase, hidden text standing in for
 * the connector that says whether the token is a button you press or a
 * record the app keeps, then the app's real control or record) and the
 * closing line. The ledger repeats the caption under its phrase column for
 * the desktop end state (aria-hidden, so screen readers hear it once).
 *
 * Without JS, and under reduced motion, this is the final layout: the pills
 * rest in a hand-composed heap and the ledger sits under it. WordsMotion
 * switches it per gsap.matchMedia branch: desktop pins the stage +=120% and
 * re-cuts the fallen pills into the ledger; phones run the pit once and
 * reveal the list.
 *
 * Behind the stage (desktop only): the hero map at 25%, transformed like the
 * hero's end state (scale 1.6, rotateX 10deg about 청평화), so the cut from S1
 * is continuous. The stage sits in its own pin spacer, so ScrollTrigger
 * refreshes never move it in the DOM and a focused pill keeps its focus.
 */

type CSSVars = CSSProperties & Record<`--${string}`, string | number>;

const MAP_VIEW = getMapView("hero-desktop");

const MAP_STYLE: CSSVars = {
  aspectRatio: mapAspectRatio(MAP_VIEW),
  "--map-aspect": MAP_VIEW.viewBox.width / MAP_VIEW.viewBox.height,
  "--focus-x": `${MAP_VIEW.focus.percent.x}%`,
  "--focus-y": `${MAP_VIEW.focus.percent.y}%`,
  "--map-scale": 1.6,
};

function heapVars(item: PitItem): CSSVars {
  const desktop = HEAP.desktop[item.id];
  const mobile = HEAP.mobile[item.id];
  const bin = HEAP.bin[item.id];
  const vars: CSSVars = {};
  if (bin) {
    vars["--bx"] = bin.x;
    vars["--by"] = bin.y;
    vars["--br"] = bin.r;
  }
  if (desktop) {
    vars["--hx"] = desktop.x;
    vars["--hy"] = desktop.y;
    vars["--hr"] = desktop.r;
  }
  if (mobile) {
    vars["--mhx"] = mobile.x;
    vars["--mhy"] = mobile.y;
    vars["--mhr"] = mobile.r;
  }
  return vars;
}

function PitBody({ item }: { item: PitItem }) {
  const isBubble = item.kind === "bubble";
  const glossId = `words-gloss-${item.id}`;
  return (
    <div
      className="pit-body"
      data-body={item.id}
      data-kind={item.kind}
      data-ledger-index={item.ledgerIndex}
      data-desktop-only={item.desktopOnly ? "" : undefined}
      aria-hidden={isBubble ? true : undefined}
      style={heapVars(item)}
    >
      <div className="pit-lift" data-lift>
        <div className="pit-rotor" data-rotor>
          {isBubble ? (
            <span className="pit-skin pit-bubble" data-skin data-skin-state="bubble">
              <span data-skin-text>{item.label}</span>
            </span>
          ) : (
            <button type="button" className="pit-skin pit-vocab" data-skin data-vocab aria-describedby={glossId}>
              {item.label}
            </button>
          )}
        </div>
        {item.gloss ? (
          <span id={glossId} role="tooltip" className="pit-gloss" data-gloss>
            {item.gloss}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function WordsSection() {
  return (
    <SectionShell id="words" titleId="words-title" tone="night" pad="none" className="words">
      <WordsMotionIsland>
        <div className="words-pin-spacer" data-words-pin-spacer>
          <div className="words-stage" data-words-stage>
            <div className="words-map" data-words-map aria-hidden="true">
              <div className="words-map-stage">
                <div className="words-map-box" style={MAP_STYLE}>
                  <MarketMap view="hero-desktop" layer="base" idPrefix="words" />
                </div>
              </div>
            </div>

            <div className="words-frame">
              <div className="words-inner stage-night">
                <div className="words-copy" data-words-copy>
                  <SectionHeading id="words-title" lines={words.h2} className="words-h2" />
                  <p className="words-lede" data-words-lede>
                    {words.body}
                  </p>
                </div>

                <div className="words-pit" data-words-pit data-pit-mode="heap" data-pit-state="idle" data-pit-runner="stopped">
                  <div className="words-pit-frame" data-pit-frame aria-hidden="true" />
                  <div className="words-pit-floor" data-pit-floor aria-hidden="true" />
                  {PIT_ITEMS.map((item) => (
                    <PitBody key={item.id} item={item} />
                  ))}
                </div>

                <p className="words-caption" data-words-caption>
                  {words.caption}
                </p>

                <div className="words-recut" data-words-recut>
                  <div className="words-ledger-wrap">
                    <ol className="words-ledger" data-words-ledger>
                      {words.ledger.map((row, index) => (
                        <li key={row.token} className="words-row" data-ledger-row={index}>
                          <span className="words-phrase-cell">
                            <span
                              className="words-phrase"
                              data-ledger-phrase
                              aria-hidden={"srPhrase" in row ? true : undefined}
                            >
                              {row.phrase}
                            </span>
                            {"srPhrase" in row ? <span className="sr-only">{row.srPhrase}</span> : null}
                            <span className="words-connector" data-ledger-connector aria-hidden="true" />
                          </span>
                          <span className="sr-only" data-ledger-arrow>
                            {row.kind === "action" ? words.arrowAction : words.arrowRecord}
                          </span>
                          <span className="words-token-cell">
                            <span className="words-token-mask">
                              <span className="words-token" data-kind={row.kind} data-ledger-token>
                                {row.token}
                              </span>
                            </span>
                            {"note" in row ? (
                              <span className="words-note" data-ledger-note>
                                {row.note}
                              </span>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ol>
                    <p className="words-caption-echo" data-words-caption-echo aria-hidden="true">
                      <span data-caption-echo-text>{words.caption}</span>
                    </p>
                  </div>
                  <div className="words-outro" data-words-outro>
                    <p className="words-closing" data-words-closing>
                      {words.closing}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </WordsMotionIsland>
    </SectionShell>
  );
}
