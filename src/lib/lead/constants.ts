/**
 * Lead form constants and state types, zod-free so client components (the
 * form, LeadFormGuards) can import them without pulling the schema into the
 * browser bundle. src/lib/lead/schema.ts re-exports everything here unchanged
 * and adds the zod schema used by the server action.
 *
 * Field names are the <input name> values and match the landing_leads
 * columns. Messages follow the app's 해요체.
 */

export const LEAD_FIELDS = [
  "role",
  "name",
  "business_name",
  "contact",
  "market",
  "message",
  "consent",
] as const;
export type LeadField = (typeof LEAD_FIELDS)[number];

/** Hidden inputs the form must render (see LeadFormGuards in the form UI). */
export const LEAD_HIDDEN_FIELDS = {
  /** Honeypot. Must stay empty; real users never see it. */
  honeypot: "homepage_url",
  /**
   * Milliseconds the visitor has spent on the form at submit: since it
   * mounted, or since the first edit of a draft restored after a reload when
   * that is longer (src/lib/lead/fill-time.ts). Measured on the client's own
   * clock (added in the `formdata` event). Never compare a client timestamp
   * with the server clock: device clock skew would drop real leads.
   */
  fillMs: "form_fill_ms",
  /** Where the form sits on the page, e.g. "hero" (max 120 chars). */
  source: "source",
} as const;

export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;

/** Fill times below this are tagged as timing suspects; honeypot catches are still silently dropped. */
export const LEAD_MIN_FILL_MS = 2500;

export const LEAD_MESSAGES = {
  role: "어떤 일을 하고 계신지 선택해 주세요.",
  nameRequired: "이름을 입력해 주세요.",
  nameTooLong: "이름은 60자까지 입력할 수 있어요.",
  businessNameTooLong: "매장명·업체명은 80자까지 입력할 수 있어요.",
  contact: "연락처를 확인해 주세요.",
  market: "사입 시장을 다시 선택해 주세요.",
  messageTooLong: "문의 내용은 1,000자까지 입력할 수 있어요.",
  consent: "개인정보 수집·이용에 동의해 주세요.",
  invalid: "입력 내용을 확인해 주세요.",
  retry: "잠시 후 다시 시도해 주세요.",
  success: "보내 주신 내용을 받았어요.",
} as const;

/** Raw string values echoed back on error so the form can refill itself. */
export type LeadFormValues = Partial<Record<LeadField, string>>;

export type LeadFormState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | {
      status: "error";
      message: string;
      fieldErrors: Partial<Record<LeadField, string>>;
      values: LeadFormValues;
    };

export const initialLeadFormState: LeadFormState = { status: "idle" };
