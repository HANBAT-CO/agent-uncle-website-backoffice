import { z } from "zod";

import { LEAD_MARKETS, LEAD_ROLES } from "@/lib/supabase/types";

import { LEAD_MESSAGES } from "./constants";

/**
 * Lead form contract for the server action (src/app/actions/lead.ts). The
 * constants and state types live in ./constants.ts (zod-free) and are
 * re-exported here unchanged. Client components import ./constants.ts, never
 * this file, so zod stays out of the browser bundle.
 */

export {
  initialLeadFormState,
  LEAD_FIELDS,
  LEAD_HIDDEN_FIELDS,
  LEAD_MESSAGES,
  LEAD_MIN_FILL_MS,
  UTM_KEYS,
  type LeadField,
  type LeadFormState,
  type LeadFormValues,
} from "./constants";

/**
 * Length in Unicode code points, the unit Postgres char_length() uses in the
 * landing_leads CHECKs. JS `.length` counts UTF-16 units, so "a😀😀" is 5 for
 * zod's .min(5) but 3 for the database.
 */
const codePoints = (value: string) => Array.from(value).length;

/** At most `max` code points (the DB CHECK unit; zod's .max counts UTF-16 units). */
const maxCodePoints = (max: number, message: string) =>
  [(value: string) => codePoints(value) <= max, { error: message }] as const;

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .refine(...maxCodePoints(max, message))
    .optional()
    .transform((value) => (value ? value : null));

export const leadSchema = z.object({
  role: z.enum(LEAD_ROLES, { error: LEAD_MESSAGES.role }),
  name: z
    .string({ error: LEAD_MESSAGES.nameRequired })
    .trim()
    .min(1, { error: LEAD_MESSAGES.nameRequired })
    .refine(...maxCodePoints(60, LEAD_MESSAGES.nameTooLong)),
  business_name: optionalText(80, LEAD_MESSAGES.businessNameTooLong),
  contact: z
    .string({ error: LEAD_MESSAGES.contact })
    .trim()
    .refine(...maxCodePoints(120, LEAD_MESSAGES.contact))
    // Phone, email or KakaoTalk ID: at least one letter, digit or @.
    .regex(/[0-9A-Za-z@]/, { error: LEAD_MESSAGES.contact })
    // Code points, matching the DB CHECK (char_length between 5 and 120).
    .refine((value) => codePoints(value) >= 5, { error: LEAD_MESSAGES.contact }),
  market: z
    .enum(LEAD_MARKETS, { error: LEAD_MESSAGES.market })
    .optional()
    .transform((value) => value ?? null),
  message: optionalText(1000, LEAD_MESSAGES.messageTooLong),
  consent: z.literal(true, { error: LEAD_MESSAGES.consent }),
});

export type LeadInput = z.input<typeof leadSchema>;
export type Lead = z.output<typeof leadSchema>;
