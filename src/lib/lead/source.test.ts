import { describe, expect, it } from "vitest";

import { E2E_SOURCE, leadSource } from "./source";

describe("leadSource", () => {
  it("keeps the form's placement for real contacts, clipped to 120 characters", () => {
    expect(leadSource("010-2847-1928", "landing-signup")).toBe("landing-signup");
    expect(leadSource("hello@samchun.kr", "x".repeat(130))).toBe("x".repeat(120));
    expect(leadSource("010-2847-1928", undefined)).toBeNull();
  });

  it("tags timing-only suspects without exceeding the source column", () => {
    expect(leadSource("010-2847-1928", "landing-signup", { timingSuspect: true })).toBe(
      "landing-signup:timing-suspect",
    );
    expect(leadSource("010-2847-1928", undefined, { timingSuspect: true })).toBe("timing-suspect");
    expect(leadSource("010-2847-1928", "x".repeat(130), { timingSuspect: true })).toHaveLength(120);
    expect(leadSource("010-2847-1928", "x".repeat(130), { timingSuspect: true })).toMatch(/:timing-suspect$/);
  });

  it("tags the reserved test contacts (.invalid never delivers) so live checks never pass for leads", () => {
    expect(leadSource("e2e-check@invalid", "landing-signup")).toBe(E2E_SOURCE);
    expect(leadSource("e2e-check@invalid", "landing-signup", { timingSuspect: true })).toBe(E2E_SOURCE);
    expect(leadSource("QA@Example.INVALID", "landing-signup")).toBe(E2E_SOURCE);
    expect(leadSource("someone@invalid.kr", "landing-signup")).toBe("landing-signup");
  });
});
