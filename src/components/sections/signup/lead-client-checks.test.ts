import { describe, expect, it } from "vitest";

import { LEAD_MESSAGES } from "@/lib/lead/constants";

import { checkLead, checkLeadField, codePointLength, firstInvalidField, type LeadCheckInput } from "./lead-client-checks";

const VALID: LeadCheckInput = {
  role: "retailer",
  name: "김하늘",
  business_name: "망원 셀렉트샵",
  contact: "010-2847-1928",
  market: "동대문",
  message: "",
  consent: true,
};

const EMOJI = "\u{1F600}";

function withField(patch: Partial<LeadCheckInput>): LeadCheckInput {
  return { ...VALID, ...patch };
}

describe("codePointLength", () => {
  it("counts an astral emoji as one code point, not two UTF-16 units", () => {
    expect(`a${EMOJI}${EMOJI}`.length).toBe(5);
    expect(codePointLength(`a${EMOJI}${EMOJI}`)).toBe(3);
  });

  it("counts precomposed Hangul syllables one each", () => {
    expect(codePointLength("사입삼춘")).toBe(4);
  });
});

describe("checkLeadField: role", () => {
  it("requires a role", () => {
    expect(checkLeadField("role", withField({ role: "" }))).toBe(LEAD_MESSAGES.role);
  });

  it("rejects a value outside retailer, uncle and other", () => {
    expect(checkLeadField("role", withField({ role: "admin" }))).toBe(LEAD_MESSAGES.role);
  });

  it.each(["retailer", "uncle", "other"])("accepts %s", (role) => {
    expect(checkLeadField("role", withField({ role }))).toBeUndefined();
  });
});

describe("checkLeadField: name", () => {
  it("requires a name", () => {
    expect(checkLeadField("name", withField({ name: "" }))).toBe(LEAD_MESSAGES.nameRequired);
  });

  it("treats whitespace and control characters as empty", () => {
    expect(checkLeadField("name", withField({ name: "   " }))).toBe(LEAD_MESSAGES.nameRequired);
    expect(checkLeadField("name", withField({ name: "\u0000\u0007 " }))).toBe(LEAD_MESSAGES.nameRequired);
  });

  it("accepts 60 code points and rejects 61", () => {
    expect(checkLeadField("name", withField({ name: "가".repeat(60) }))).toBeUndefined();
    expect(checkLeadField("name", withField({ name: "가".repeat(61) }))).toBe(LEAD_MESSAGES.nameTooLong);
  });

  it("counts emoji as code points (60 emoji are 120 UTF-16 units but still fit)", () => {
    expect(checkLeadField("name", withField({ name: EMOJI.repeat(60) }))).toBeUndefined();
    expect(checkLeadField("name", withField({ name: EMOJI.repeat(61) }))).toBe(LEAD_MESSAGES.nameTooLong);
  });

  it("trims before counting", () => {
    expect(checkLeadField("name", withField({ name: `  ${"가".repeat(60)}  ` }))).toBeUndefined();
  });
});

describe("checkLeadField: business_name", () => {
  it("is optional", () => {
    expect(checkLeadField("business_name", withField({ business_name: "" }))).toBeUndefined();
  });

  it("accepts 80 code points and rejects 81", () => {
    expect(checkLeadField("business_name", withField({ business_name: "a".repeat(80) }))).toBeUndefined();
    expect(checkLeadField("business_name", withField({ business_name: "a".repeat(81) }))).toBe(
      LEAD_MESSAGES.businessNameTooLong,
    );
  });

  it("counts emoji as code points", () => {
    expect(checkLeadField("business_name", withField({ business_name: EMOJI.repeat(80) }))).toBeUndefined();
  });
});

describe("checkLeadField: contact", () => {
  it("requires a contact", () => {
    expect(checkLeadField("contact", withField({ contact: "" }))).toBe(LEAD_MESSAGES.contact);
  });

  it("needs at least 5 code points after trimming", () => {
    expect(checkLeadField("contact", withField({ contact: "1234" }))).toBe(LEAD_MESSAGES.contact);
    expect(checkLeadField("contact", withField({ contact: "  1234  " }))).toBe(LEAD_MESSAGES.contact);
    expect(checkLeadField("contact", withField({ contact: "12345" }))).toBeUndefined();
    expect(checkLeadField("contact", withField({ contact: "a@b.c" }))).toBeUndefined();
  });

  it("counts code points, not UTF-16 units, for the minimum", () => {
    // 4 code points, 7 UTF-16 units: short for the DB CHECK (char_length >= 5).
    expect(checkLeadField("contact", withField({ contact: `${EMOJI}${EMOJI}${EMOJI}1` }))).toBe(LEAD_MESSAGES.contact);
    expect(checkLeadField("contact", withField({ contact: `${EMOJI}${EMOJI}${EMOJI}${EMOJI}1` }))).toBeUndefined();
  });

  it("needs at least one Latin letter, digit or @", () => {
    expect(checkLeadField("contact", withField({ contact: "가나다라마" }))).toBe(LEAD_MESSAGES.contact);
    expect(checkLeadField("contact", withField({ contact: "카톡 id7" }))).toBeUndefined();
  });

  it("accepts 120 code points and rejects 121", () => {
    expect(checkLeadField("contact", withField({ contact: "1".repeat(120) }))).toBeUndefined();
    expect(checkLeadField("contact", withField({ contact: "1".repeat(121) }))).toBe(LEAD_MESSAGES.contact);
  });
});

describe("checkLeadField: market", () => {
  it("is optional", () => {
    expect(checkLeadField("market", withField({ market: "" }))).toBeUndefined();
  });

  it.each(["동대문", "남대문", "기타"])("accepts %s", (market) => {
    expect(checkLeadField("market", withField({ market }))).toBeUndefined();
  });

  it("rejects a market the form does not offer", () => {
    expect(checkLeadField("market", withField({ market: "부산" }))).toBe(LEAD_MESSAGES.market);
  });
});

describe("checkLeadField: message", () => {
  it("is optional", () => {
    expect(checkLeadField("message", withField({ message: "" }))).toBeUndefined();
  });

  it("accepts 1000 code points and rejects 1001", () => {
    expect(checkLeadField("message", withField({ message: "가".repeat(1000) }))).toBeUndefined();
    expect(checkLeadField("message", withField({ message: "가".repeat(1001) }))).toBe(LEAD_MESSAGES.messageTooLong);
  });

  it("counts emoji as code points", () => {
    expect(checkLeadField("message", withField({ message: EMOJI.repeat(1000) }))).toBeUndefined();
  });
});

describe("checkLeadField: consent", () => {
  it("requires consent", () => {
    expect(checkLeadField("consent", withField({ consent: false }))).toBe(LEAD_MESSAGES.consent);
    expect(checkLeadField("consent", withField({ consent: true }))).toBeUndefined();
  });
});

describe("checkLead", () => {
  it("returns no errors for a complete, valid lead", () => {
    expect(checkLead(VALID)).toEqual({});
  });

  it("returns one message per failing field, keyed by field name", () => {
    const errors = checkLead({ role: "", name: "", business_name: "", contact: "12", market: "", message: "", consent: false });
    expect(errors).toEqual({
      role: LEAD_MESSAGES.role,
      name: LEAD_MESSAGES.nameRequired,
      contact: LEAD_MESSAGES.contact,
      consent: LEAD_MESSAGES.consent,
    });
  });
});

describe("firstInvalidField", () => {
  it("follows the form order, not the object's key order", () => {
    expect(firstInvalidField({ consent: LEAD_MESSAGES.consent, contact: LEAD_MESSAGES.contact })).toBe("contact");
  });

  it("is undefined when nothing failed", () => {
    expect(firstInvalidField({})).toBeUndefined();
  });
});
