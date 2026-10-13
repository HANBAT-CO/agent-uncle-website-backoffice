/**
 * Shared S1 hero constants (server wrapper and client leaves). Mirrors the
 * lens sizes in hero.css (--lens-r); change both together.
 */

/** Lens radius per map: 200px circle on desktop, 128px on phones. */
export const LENS_RADIUS = { desktop: 100, mobile: 64 } as const;

export type HeroMapVariant = keyof typeof LENS_RADIUS;

/** Space between the lens ring and the readout card. */
export const READOUT_GAP = 24;

/** Minimum space between the readout card and the stage's top and bottom. */
export const READOUT_MARGIN = 16;

/**
 * If the hero hydrates later than this (ms after navigation start), the
 * draw-in is skipped and the map is shown drawn: a draw that starts this late
 * would read as the page flickering, not the market lighting up. hero.css
 * reveals everything on its own at 8s in case JavaScript never runs.
 */
export const LATE_INTRO_MS = 5000;

/** Pin progress after which the rail's own r2005 and r2031 entries take over from the proxies. */
export const PROXY_DONE_AT = 0.98;
