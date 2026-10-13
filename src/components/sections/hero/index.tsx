import type { CSSProperties } from "react";

import { CtaButton } from "@/components/cta/CtaButton";
import { QuantityDot } from "@/components/dot/QuantityDot";
import { MapLabels, MarketMap } from "@/components/map/MarketMap";
import {
  getMapBuilding,
  getMapView,
  toPercent,
  toPickView,
  type MapBuildingId,
  type MapView,
  type ScreenPoint,
} from "@/components/map/views";
import { SectionShell } from "@/components/section/SectionShell";
import { hero, map } from "@/content/copy";

import { drawPlan, drawTotal, introSchedule } from "./draw-plan";
import { LENS_RADIUS, type HeroMapVariant } from "./hero-config";
import { HeroChips } from "./HeroChips";
import { HeroLensIsland } from "./HeroLensIsland";
import { HeroMotionIsland } from "./HeroMotionIsland";
import { LensReadout } from "./LensReadout";
import { RecordProxies } from "./RecordProxies";
import "./hero.css";

/**
 * S1 hero, 22:00 청평화의 밤 (spec S1): one night of the market, framed, with
 * a real record above the fold.
 *
 * Server Component. Everything paints from the server: the H1, sub and CTAs
 * with no entrance animation (the H1 is the LCP element), the map fully drawn
 * (the inline head script hides the strokes only when the desktop draw-in will
 * run), the lens resting on 청평화 with its readout, the building buttons, the
 * uncle chip, the dot on 청평화 1층 and the honesty line. The no-JS page reads
 * like the reduced-motion page.
 *
 * Desktop (768px up): a frame inset 20px (radius 24, 1px mint 12% line) holds
 * the hero-desktop map, cover-fitted and pinned to the left so 청평화 sits near
 * 44% / 46% and the record column (min 1280px) stays clear of buildings. The
 * text block sits bottom-left over it. Phones: the frame (inset 12px, radius
 * 20) holds the hero-mobile map at 46dvh, the chips sit under it, then the H1
 * on three lines at 30px, the sub and a full-width CTA, all above the fold.
 *
 * Client leaves: HeroMotion (pin and draw-in, wraps the pinned element),
 * HeroLens (lens follow and building buttons), LensReadout, HeroChips and
 * RecordProxies. DOM order is reading order: the text block first, then the
 * map with its buttons.
 */

type CSSVars = CSSProperties & Record<`--${string}`, string | number>;

const BUILDINGS: readonly MapBuildingId[] = map.order;

function roofTargets(view: MapView): Record<MapBuildingId, ScreenPoint> {
  return Object.fromEntries(BUILDINGS.map((id) => [id, getMapBuilding(view, id).roof])) as Record<MapBuildingId, ScreenPoint>;
}

function percent(point: { x: number; y: number }): CSSProperties {
  return { left: `${point.x}%`, top: `${point.y}%` };
}

/**
 * Buildings whose label the desktop map shows (every one in hero-desktop).
 * The phone map labels all four: 디오트 sits east of the hero-mobile view, out
 * of the frame until its chip pans the map there (HeroLens).
 */
function labelledBuildings(view: MapView, variant: HeroMapVariant): MapBuildingId[] {
  if (variant === "mobile") return [...BUILDINGS];
  return BUILDINGS.filter((id) => {
    const { x, y } = toPercent(view, getMapBuilding(view, id).roof);
    return x > 4 && x < 96 && y > 4 && y < 100;
  });
}

const fraction = (value: number) => Math.round(value * 1e4) / 1e4;

function HeroMap({ variant, view, cardsAt }: { variant: HeroMapVariant; view: MapView; cardsAt: number }) {
  const focus = view.focus.percent;
  const dot = toPercent(view, getMapBuilding(view, view.focus.building).floors[0].anchor);
  const uncle = toPercent(view, view.anchors.uncle);
  const labels = labelledBuildings(view, variant);
  const roofs = labels.map((id) => toPercent(view, getMapBuilding(view, id).roof));
  const east = roofs.reduce((most, roof) => (roof.x > most.x ? roof : most));
  const boxStyle: CSSVars = {
    "--ratio": view.viewBox.width / view.viewBox.height,
    "--focus-x": focus.x / 100,
    "--focus-y": focus.y / 100,
    // How far the dot sits below the roof, as a share of the box height (hero.css keeps both above the text).
    "--dot-drop": fraction((dot.y - focus.y) / 100),
    // The dot's height in the box (phones keep it above the docked readout).
    "--dot-y": fraction(dot.y / 100),
    // The highest label's roof (APM): hero.css keeps it below the nav pill when it can.
    "--top-y": fraction(Math.min(...roofs.map((roof) => roof.y)) / 100),
    // The lowest roof (남평화): on tall frames hero.css lifts it clear of the H1.
    "--south-y": fraction(Math.max(...roofs.map((roof) => roof.y)) / 100),
    // The westmost and eastmost roofs (APM, 디오트) and the east edge of all buildings (디오트's wall).
    "--west-x": fraction(Math.min(...roofs.map((roof) => roof.x)) / 100),
    "--east-x": fraction(east.x / 100),
    "--east-y": fraction(east.y / 100),
    "--east-edge": fraction(view.buildingBounds.maxX / view.viewBox.width),
    "--lens-r": `${LENS_RADIUS[variant]}px`,
  };

  return (
    <div className="hero-map-box" data-hero-map-box={variant} data-readout-side="left" style={boxStyle}>
      {/*
       * The dive pans the outer layer and scales and tilts the inner one: the pan then sits
       * outside the perspective, as S2's copy places its map (the words box's translate),
       * so the vanishing point stays on 청평화's roof and the two end frames match.
       */}
      <div className="hero-map-shift" data-hero-map-shift>
        <div className="hero-map" data-hero-map style={{ transformOrigin: `${focus.x}% ${focus.y}%` }}>
          <MarketMap view={view.id} layer="base" idPrefix={`hero-${variant}`} draw={variant === "desktop"} />
          <div className="hero-record" data-hero-record>
            <MarketMap view={view.id} layer="record" idPrefix={`hero-${variant}-rec`} />
          </div>

          <span className="hero-dot" data-hero-dot data-readout-obstacle style={percent(dot)}>
            <QuantityDot tone="lamp" />
          </span>

          <div className="hero-uncle" data-hero-uncle data-variant={variant} style={percent(uncle)}>
            <span className="hero-uncle-mark" aria-hidden="true" />
            <span className="hero-uncle-label" data-readout-soft>
              <span className="hero-uncle-name">{hero.uncle.name}</span>
              <span className="hero-uncle-chip">{hero.uncle.chip}</span>
            </span>
          </div>

          {variant === "desktop" ? (
            <div role="group" aria-label={hero.chipsLabel} className="hero-labels">
              <MapLabels
                view={view.id}
                slots={Object.fromEntries(
                  labels.map((id) => [
                    id,
                    <button
                      key={id}
                      type="button"
                      className="hero-building"
                      data-building-button={id}
                      data-active={id === view.focus.building ? "" : undefined}
                      aria-pressed={id === view.focus.building}
                    >
                      {map.buildings[id]}
                    </button>,
                  ]),
                )}
              />
            </div>
          ) : (
            <div className="hero-labels" aria-hidden="true">
              <MapLabels
                view={view.id}
                slots={Object.fromEntries(
                  labels.map((id) => [
                    id,
                    <span key={id} className="hero-building" data-active={id === view.focus.building ? "" : undefined} data-building-label={id}>
                      {map.buildings[id]}
                    </span>,
                  ]),
                )}
              />
            </div>
          )}
        </div>
      </div>

      <HeroLensIsland variant={variant} pick={toPickView(view)} viewBox={view.viewBox} targets={roofTargets(view)} focus={view.focus.building} />

      {variant === "desktop" ? (
        <>
          <LensReadout variant="float" />
          <RecordProxies at={cardsAt} />
        </>
      ) : null}
    </div>
  );
}

export function HeroSection() {
  const desktop = getMapView("hero-desktop");
  const mobile = getMapView("hero-mobile");
  const plan = drawPlan(desktop);
  const schedule = introSchedule(drawTotal(plan));
  const [first, second, third] = hero.h1Mobile;

  return (
    <SectionShell id="hero" titleId="hero-title" tone="night" pad="none" className="hero">
      <HeroMotionIsland plan={plan} schedule={schedule} focus={desktop.focus.building}>
        <div className="hero-copy" data-hero-copy>
          {/*
           * Desktop: 사입 요청부터 상품 수령까지 / 함께 기록해요. Phones: one phrase per line.
           * Lines break with <br> inside inline spans, so the H1 stays one text block (the LCP element).
           */}
          <h1 id="hero-title" className="hero-h1 hangul-display">
            <span className="hero-h1-line" data-readout-obstacle>
              {first} <br className="hero-h1-break-phone" />
              {second}
            </span>{" "}
            <br />
            <span className="hero-h1-line" data-readout-obstacle>
              {third}
            </span>
          </h1>
          <p className="hero-sub" data-readout-obstacle>
            {hero.sub}
          </p>
          <div data-hero-ctas data-readout-obstacle className="hero-ctas">
            <CtaButton href={hero.ctaPrimary.href} tone="night" size="lg" className="hero-cta-primary">
              {hero.ctaPrimary.label}
            </CtaButton>
            <CtaButton href={hero.ctaSecondary.href} tone="night" variant="secondary" className="self-start md:self-auto">
              {hero.ctaSecondary.label}
            </CtaButton>
          </div>
        </div>

        <div className="hero-frame" data-hero-frame>
          <div className="hero-viewport" data-hero-viewport>
            <figure className="hero-figure">
              <HeroMap variant="desktop" view={desktop} cardsAt={schedule.cards} />
              <HeroMap variant="mobile" view={mobile} cardsAt={schedule.cards} />
              <figcaption className="sr-only">{map.caption}</figcaption>
            </figure>
            <LensReadout variant="dock" />
            <div className="hero-stage" data-hero-stage>
              <p className="hero-honesty" data-hero-honesty>
                {hero.honesty}
              </p>
            </div>
          </div>
          <span className="hero-frame-line" data-hero-frame-line aria-hidden="true" />
          {/* The dive's last 40% fades the frame's bottom edge to the ground (HeroMotion): no seam into S2. */}
          <span className="hero-frame-fade" data-hero-frame-fade aria-hidden="true" />
        </div>

        <HeroChips />
      </HeroMotionIsland>
    </SectionShell>
  );
}
