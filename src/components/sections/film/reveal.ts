/**
 * The S9 reveal as a pure function of its scrub progress (spec S9: "Mask
 * from the dot: the film's hero object is the page's dot").
 *
 * The scrub starts before the pin (FilmMotion: from the scene's top at 55% of
 * the viewport, over 0.55 + 0.8 viewports), so the dot blooms while the scene
 * scrolls in and the pin itself is spent on the full-bleed loop and the card.
 *
 * The frame (the media box inside the double-bezel shell) never leaves its
 * layout position; only its transform and clip-path change, so the settled
 * card is the layout itself and nothing shifts.
 *
 *   0    the frame is scaled about its centre until it covers the scene, and
 *        clipped to a circle that measures 16px on screen: the ink dot
 *        (the frame's ground is the loop's #0C483E field). The shell's ring
 *        already shows at 30%: a faint slot that says a film lives here.
 *   0.20 the muted loop starts (FilmMotion asks the player)
 *   0.41 the pin engages (FilmMotion: 0.55 / 1.35)
 *   0.50 the circle covers the whole scaled frame: the loop fills the screen
 *   0.75 the frame has shrunk back to scale 1 and its corners have rounded to
 *        24px on screen, matching the shell's inner core; the card's chrome
 *        (ring, ticks, play mark) lands from 0.62
 *   1    hold
 *
 * The heading and the controls leave before the circle reaches them and come
 * back as the card lands (`chrome`), so the circle's edge never slices text.
 *
 * Every value is a function of progress alone, so scrubbing back replays the
 * same frames in reverse.
 */

export const REVEAL = {
  /** The muted loop starts here (only when muted autoplay is allowed). */
  loopAt: 0.2,
  /** The circle has opened over the whole scene. */
  open: 0.5,
  /** The card's chrome (the shell's ring, the ticks, the play mark) starts to land. */
  ringFrom: 0.62,
  /** The frame sits in the card. */
  settle: 0.75,
  /** The heading and the controls fade out over this span, before the circle reaches them. */
  chromeOut: [0.1, 0.24],
  /** They come back from here to `settle`, once the shrinking frame has cleared them. */
  chromeBack: 0.67,
} as const;

/** Opacity of the shell's ring before the card lands. */
export const RING_REST = 0.3;

/** Radius of the dot on screen (spec 4.6: a 16px circle). */
const DOT_RADIUS = 8;
/** Inner core radius of the double-bezel shell (spec 4.4). */
const CARD_RADIUS = 24;

export type RevealGeometry = {
  /** Frame size in CSS px at scale 1. */
  width: number;
  height: number;
  /** Scale about the frame's centre that covers the scene (coverScale). */
  scale: number;
};

export type RevealFrame = {
  /** In the frame's own (unscaled) coordinates. */
  clipPath: string;
  scale: number;
  /** Opacity of the shell's ring. */
  ring: number;
  /** How far the card has landed (0..1): the ticks and the play mark. */
  land: number;
  /** Opacity of the heading and the controls bar. */
  chrome: number;
  /** Half the height of the frame's visible shape on screen, about its centre (the circle's radius, then the card's half height). */
  reach: number;
};

type Box = { x: number; y: number; width: number; height: number };

/** The scale about the box's centre at which it covers the scene (never below 1). */
export function coverScale(box: Box, scene: { width: number; height: number }): number {
  if (box.width <= 0 || box.height <= 0) return 1;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const sx = (2 * Math.max(cx, scene.width - cx)) / box.width;
  const sy = (2 * Math.max(cy, scene.height - cy)) / box.height;
  const fit = Math.max(sx, sy);
  // A hair over the exact fit, so no sub-pixel seam shows at the scene's edges.
  return fit <= 1 ? 1 : fit * 1.002;
}

const round = (value: number) => Math.round(value * 100) / 100;
const lerp = (from: number, to: number, t: number) => from + (to - from) * t;
const segment = (p: number, from: number, to: number) => Math.min(1, Math.max(0, (p - from) / (to - from)));

export function revealFrame(progress: number, geo: RevealGeometry): RevealFrame {
  const p = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  const land = segment(p, REVEAL.ringFrom, REVEAL.settle);
  const ring = RING_REST + (1 - RING_REST) * land;
  const chrome = Math.min(1, Math.max(0, 1 - segment(p, REVEAL.chromeOut[0], REVEAL.chromeOut[1]) + segment(p, REVEAL.chromeBack, REVEAL.settle)));

  if (p <= REVEAL.open) {
    const t = segment(p, 0, REVEAL.open);
    // The circle covers the frame once its radius reaches the half diagonal.
    const cover = Math.ceil(Math.hypot(geo.width, geo.height) / 2) + 1;
    // Ease in: the dot stays a dot while it scrolls into view, then blooms.
    const radius = lerp(DOT_RADIUS / geo.scale, cover, t * t);
    return {
      clipPath: `circle(${round(radius)}px at 50% 50%)`,
      scale: geo.scale,
      ring,
      land,
      chrome,
      reach: Math.min(radius, geo.height / 2) * geo.scale,
    };
  }

  const t = segment(p, REVEAL.open, REVEAL.settle);
  const scale = t >= 1 ? 1 : lerp(geo.scale, 1, t);
  // Corner radius grows to 24px as measured on screen.
  const corner = t >= 1 ? CARD_RADIUS : (CARD_RADIUS * t) / scale;
  return { clipPath: `inset(0px round ${round(corner)}px)`, scale, ring, land, chrome, reach: (geo.height / 2) * scale };
}
