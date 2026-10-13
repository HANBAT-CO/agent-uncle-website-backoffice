/**
 * The receipt slip's paper geometry (spec S6). Pure; shared by the TearTicket
 * leaf (ReceiptTear) and mirrored by the static slip in receipt.css (the
 * --slip-* custom properties and the 420px container query use these numbers).
 *
 * - Wide slips (the desktop column, tablets): the stub stands on the right of
 *   the body, a vertical perforation between them (TearTicket horizontal).
 * - Phone-width slips: the stub runs under the body, so the body keeps the
 *   full width and the 전달 회차 row keeps its two columns (TearTicket
 *   vertical). The stub still holds the button and tears by a sideways swipe.
 */

export const SLIP = {
  /** Widest slip in px; wider columns leave paper on the right. */
  maxWidth: 560,
  /** Container width from which the stub stands on the right. */
  wideFrom: 420,
  /** Stub width of a wide slip (the grip dot and the vertical button). */
  stubWide: 120,
  /** Stub height of a phone-width slip (the grip dot and a full-width button). */
  stubNarrow: 96,
  /** Shortest wide slip: the stub must hold the grip and the button. */
  minStubLength: 320,
  /** Perforation: hole diameter, target bridge between holes, end notch radius. */
  hole: 5,
  bridge: 7,
  notch: 7,
} as const;

export type SlipOrientation = "horizontal" | "vertical";

export type SlipGeometry = {
  orientation: SlipOrientation;
  /** Ticket width and height in px (TearTicket width and height). */
  width: number;
  height: number;
  /** Stub depth along the ticket's main axis (TearTicket stubSize). */
  stubSize: number;
  /** Perforation holes along the cut (TearTicket holes). */
  holes: number;
};

/**
 * @param containerWidth the slip column's inner width in px
 * @param bodyHeight the natural height of the slip body laid out at its final width
 */
export function slipGeometry(containerWidth: number, bodyHeight: number): SlipGeometry {
  const width = Math.max(0, Math.min(SLIP.maxWidth, Math.floor(containerWidth)));
  const wide = width >= SLIP.wideFrom;
  const stubSize = wide ? SLIP.stubWide : SLIP.stubNarrow;
  const body = Math.max(0, Math.ceil(bodyHeight));
  const height = wide ? Math.max(body, SLIP.minStubLength) : body + stubSize;
  const cut = wide ? height : width;
  const holes = Math.max(1, Math.round((cut - 2 * SLIP.notch - SLIP.bridge) / (SLIP.hole + SLIP.bridge)));
  return { orientation: wide ? "horizontal" : "vertical", width, height, stubSize, holes };
}
