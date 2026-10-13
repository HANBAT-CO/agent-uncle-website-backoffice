import { LEAD_FIELDS, LEAD_MESSAGES, type LeadField } from "@/lib/lead/constants";
import { LEAD_MARKETS, LEAD_ROLES } from "@/lib/supabase/types";

/**
 * Client-side mirror of the lead schema (src/lib/lead/schema.ts) without zod,
 * so the form can check on blur and on submit with no validation library in
 * the browser bundle. The server action stays the authority: its fieldErrors
 * override these.
 *
 * Lengths count Unicode code points, the unit of Postgres char_length() in the
 * landing_leads CHECKs (an emoji is one, not two). Values are cleaned the way
 * the action cleans FormData: C0 control characters (except tab, LF, CR) are
 * stripped, then the value is trimmed.
 */

export type LeadCheckInput = {
  role: string;
  name: string;
  business_name: string;
  contact: string;
  market: string;
  message: string;
  consent: boolean;
};

export type LeadFieldErrors = Partial<Record<LeadField, string>>;

// Same set the action strips (src/app/actions/lead.ts).
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Phone, email or KakaoTalk ID: at least one Latin letter, digit or @. */
const CONTACT_SIGNAL = /[0-9A-Za-z@]/;

export const LEAD_LIMITS = {
  name: 60,
  business_name: 80,
  contactMin: 5,
  contactMax: 120,
  message: 1000,
} as const;

export function codePointLength(value: string): number {
  return Array.from(value).length;
}

function clean(value: string): string {
  return value.replace(CONTROL_CHARS, "").trim();
}

function oneOf<T extends string>(options: readonly T[], value: string): value is T {
  return (options as readonly string[]).includes(value);
}

/** The message for one field, or undefined when it passes. */
export function checkLeadField(field: LeadField, input: LeadCheckInput): string | undefined {
  switch (field) {
    case "role":
      return oneOf(LEAD_ROLES, input.role) ? undefined : LEAD_MESSAGES.role;

    case "name": {
      const length = codePointLength(clean(input.name));
      if (length === 0) return LEAD_MESSAGES.nameRequired;
      return length > LEAD_LIMITS.name ? LEAD_MESSAGES.nameTooLong : undefined;
    }

    case "business_name":
      return codePointLength(clean(input.business_name)) > LEAD_LIMITS.business_name
        ? LEAD_MESSAGES.businessNameTooLong
        : undefined;

    case "contact": {
      const value = clean(input.contact);
      const length = codePointLength(value);
      const fits = length >= LEAD_LIMITS.contactMin && length <= LEAD_LIMITS.contactMax;
      return fits && CONTACT_SIGNAL.test(value) ? undefined : LEAD_MESSAGES.contact;
    }

    case "market": {
      const value = clean(input.market);
      return value === "" || oneOf(LEAD_MARKETS, value) ? undefined : LEAD_MESSAGES.market;
    }

    case "message":
      return codePointLength(clean(input.message)) > LEAD_LIMITS.message ? LEAD_MESSAGES.messageTooLong : undefined;

    case "consent":
      return input.consent ? undefined : LEAD_MESSAGES.consent;
  }
}

/** Every failing field with its message. An empty object means the lead can be sent. */
export function checkLead(input: LeadCheckInput): LeadFieldErrors {
  const errors: LeadFieldErrors = {};
  for (const field of LEAD_FIELDS) {
    const message = checkLeadField(field, input);
    if (message) errors[field] = message;
  }
  return errors;
}

/** The first failing field in form order (where focus goes after a blocked submit). */
export function firstInvalidField(errors: LeadFieldErrors): LeadField | undefined {
  return LEAD_FIELDS.find((field) => errors[field] !== undefined);
}
