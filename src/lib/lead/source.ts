/**
 * The `source` column of a lead: where the form sits on the page (sent as a
 * hidden input), decided on the server for test rows. Live checks against the
 * real table must use a reserved contact under the .invalid top-level domain
 * (RFC 2606, it can never deliver), e.g. e2e-check@invalid, and delete the row
 * afterwards. Such rows are tagged E2E_SOURCE, so one that is left behind
 * never reads as a real lead in the back office. Visitors cannot choose the
 * tag: it follows from the contact alone.
 */

export const E2E_SOURCE = "e2e";

const SOURCE_MAX = 120;
const TIMING_SUSPECT_SUFFIX = ":timing-suspect";
const TEST_CONTACT = /(?:@|\.)invalid$/i;

export function leadSource(
  contact: string,
  placement: string | undefined,
  options: { timingSuspect?: boolean } = {},
): string | null {
  if (TEST_CONTACT.test(contact.trim())) return E2E_SOURCE;
  if (!options.timingSuspect) return placement ? placement.slice(0, SOURCE_MAX) : null;

  if (!placement) return "timing-suspect";
  return `${placement.slice(0, SOURCE_MAX - TIMING_SUSPECT_SUFFIX.length)}${TIMING_SUSPECT_SUFFIX}`;
}
