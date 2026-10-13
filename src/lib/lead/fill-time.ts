/**
 * The fill time a lead form reports for the bot check (LEAD_MIN_FILL_MS):
 * the longer of
 * - the time since the form mounted (performance.now based), and
 * - the time since the visitor's first edit of the draft (Date.now based,
 *   kept with the draft in sessionStorage, so it survives a reload).
 *
 * Why both: a restored draft remounts the form, so a returning visitor who
 * only ticks consent and sends would otherwise read as a 1s bot and be
 * dropped silently. The mount clock stays the floor because browser autofill
 * stamps the first edit late, after the visitor has been reading the form.
 *
 * Both stamps come from the visitor's own device, so clock skew against the
 * server never matters; a stamp from the future (the device clock moved back)
 * is ignored. Zod-free and DOM-free: client code imports it.
 */
export function leadFillMs({
  sinceMount,
  firstEditAt,
  now,
}: {
  /** Milliseconds since the form mounted. */
  sinceMount: number;
  /** Epoch ms of the first edit of this draft, or null when there is none. */
  firstEditAt: number | null;
  /** Epoch ms now, on the same clock as firstEditAt. */
  now: number;
}): number {
  const sinceEdit =
    firstEditAt !== null && Number.isFinite(firstEditAt) && firstEditAt > 0 && firstEditAt <= now
      ? now - firstEditAt
      : 0;
  return Math.round(Math.max(sinceMount, sinceEdit, 0));
}
