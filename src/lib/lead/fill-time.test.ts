import { describe, expect, it } from "vitest";

import { LEAD_MIN_FILL_MS } from "./constants";
import { leadFillMs } from "./fill-time";

const NOW = 1_760_000_000_000;

describe("leadFillMs", () => {
  it("uses the time since mount when there is no first edit stamp", () => {
    expect(leadFillMs({ sinceMount: 4321.4, firstEditAt: null, now: NOW })).toBe(4321);
  });

  it("counts from the first edit of a restored draft, so a quick send after a reload is not a bot", () => {
    // Filled two minutes ago, reloaded, consent ticked and sent 0.9s after the form appeared.
    const ms = leadFillMs({ sinceMount: 900, firstEditAt: NOW - 120_000, now: NOW });
    expect(ms).toBe(120_000);
    expect(ms).toBeGreaterThanOrEqual(LEAD_MIN_FILL_MS);
  });

  it("is never shorter than the time since mount (browser autofill sets the stamp late)", () => {
    expect(leadFillMs({ sinceMount: 8000, firstEditAt: NOW - 1200, now: NOW })).toBe(8000);
  });

  it("still flags a form filled and sent at machine speed", () => {
    expect(leadFillMs({ sinceMount: 300, firstEditAt: NOW - 250, now: NOW })).toBeLessThan(LEAD_MIN_FILL_MS);
  });

  it("ignores a stamp from the future (the device clock moved back)", () => {
    expect(leadFillMs({ sinceMount: 700, firstEditAt: NOW + 60_000, now: NOW })).toBe(700);
  });
});
