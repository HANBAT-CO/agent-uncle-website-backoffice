/**
 * When the outlines' entry draw starts (spec S7), shared by the desktop seam
 * and the mobile toggle: once 90% of a card's height is above the viewport's
 * bottom. The 10% slack keeps a card whose bottom lands on the fold (the nav
 * jump at 1280x720) from showing undrawn.
 */
export const ENTRY_SHARE = 0.9;

/** The ScrollTrigger start for a card: ENTRY_SHARE of the card at the viewport's bottom. */
export const ENTRY_START = `${ENTRY_SHARE * 100}% bottom`;

/**
 * Whether a card is already past its entry point (on screen, or scrolled
 * above). Plugins that arrive then leave the server-drawn outline alone:
 * hiding it to draw it again would flash on screen.
 */
export function pastEntry(card: Element): boolean {
  const box = card.getBoundingClientRect();
  if (box.height <= 0) return false;
  return box.top + box.height * ENTRY_SHARE <= window.innerHeight;
}
