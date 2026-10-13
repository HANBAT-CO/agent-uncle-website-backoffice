import { describe, expect, it } from "vitest";

import { LEAD_MESSAGES, leadSchema } from "./schema";

/**
 * Length limits count Unicode code points, like the landing_leads CHECKs
 * (char_length) and the form's client checks, not UTF-16 units.
 */
const base = {
  role: "retailer",
  name: "연결 점검",
  contact: "e2e-check@invalid",
  consent: true,
} as const;

const emoji = "\u{1F600}";

function errorsOf(input: Record<string, unknown>) {
  const result = leadSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe("leadSchema length limits", () => {
  it("accepts a valid minimal lead", () => {
    expect(errorsOf(base)).toEqual([]);
  });

  it("counts a name of 31 emoji as 31 characters (62 UTF-16 units)", () => {
    expect(errorsOf({ ...base, name: emoji.repeat(31) })).toEqual([]);
  });

  it("refuses a name of 61 code points", () => {
    expect(errorsOf({ ...base, name: emoji.repeat(61) })).toEqual([LEAD_MESSAGES.nameTooLong]);
  });

  it("applies the 80 code point limit to business_name", () => {
    expect(errorsOf({ ...base, business_name: emoji.repeat(80) })).toEqual([]);
    expect(errorsOf({ ...base, business_name: "가".repeat(81) })).toEqual([LEAD_MESSAGES.businessNameTooLong]);
  });

  it("applies the 1000 code point limit to message", () => {
    expect(errorsOf({ ...base, message: emoji.repeat(1000) })).toEqual([]);
    expect(errorsOf({ ...base, message: "가".repeat(1001) })).toEqual([LEAD_MESSAGES.messageTooLong]);
  });

  it("bounds contact to 5-120 code points", () => {
    expect(errorsOf({ ...base, contact: `a${emoji.repeat(119)}` })).toEqual([]);
    expect(errorsOf({ ...base, contact: `a${emoji.repeat(120)}` })).toEqual([LEAD_MESSAGES.contact]);
    expect(errorsOf({ ...base, contact: `a${emoji.repeat(2)}` })).toEqual([LEAD_MESSAGES.contact]);
  });
});
