"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { leadInsertFailureLog } from "@/lib/lead/logging";
import { clientKey, createRateLimiter } from "@/lib/lead/rate-limit";
import {
  LEAD_FIELDS,
  LEAD_HIDDEN_FIELDS,
  LEAD_MESSAGES,
  LEAD_MIN_FILL_MS,
  leadSchema,
  UTM_KEYS,
  type LeadField,
  type LeadFormState,
  type LeadFormValues,
} from "@/lib/lead/schema";
import { leadSource } from "@/lib/lead/source";
import { getServerSupabase, isSupabaseConfigError } from "@/lib/supabase/client-server";
import type { Json, LandingLeadInsertRow } from "@/lib/supabase/types";

/**
 * Lead capture. Use with useActionState:
 *
 *   const [state, action, pending] = useActionState(submitLead, initialLeadFormState);
 *   <form action={action}>...</form>
 *
 * Inserts into public.landing_leads with the publishable key. anon cannot
 * SELECT, so the insert must not ask for the row back (no .select()).
 *
 * Order of checks: honeypot (silent success), timing-only suspect tagging,
 * validation (field errors), LEAD_DRY_RUN (e2e only: success without
 * inserting), the per-instance rate limit, then the insert. A "use server"
 * module may export async functions only, so the helpers below stay private
 * and the rate limit lives in src/lib/lead/rate-limit.ts (unit-tested).
 */

const TABLE_MISSING_CODES = new Set(["42P01", "PGRST205"]);
const INSERT_TIMEOUT_MS = 8000;

/** Per-instance token bucket (src/lib/lead/rate-limit.ts): 5 submissions per 10 minutes per client IP. */
const rateLimiter = createRateLimiter();

/** LEAD_DRY_RUN=1 (e2e runs only): validate, then report success without inserting. */
function isDryRun(): boolean {
  return process.env.LEAD_DRY_RUN === "1";
}

// C0 controls except tab, LF and CR. Postgres text/jsonb rejects NUL outright,
// and jsonb::text escapes the rest as 6-byte \uXXXX, which could push `utm`
// past its 2 KB CHECK. Either way the insert would fail; strip them instead.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function text(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(CONTROL_CHARS, "").trim();
  return trimmed === "" ? undefined : trimmed;
}

function clip(value: string | undefined, max: number): string | null {
  return value ? value.slice(0, max) : null;
}

function collectUtm(formData: FormData): Json | null {
  const entries = UTM_KEYS.flatMap((key) => {
    const value = clip(text(formData, key), 120);
    return value ? [[key, value] as const] : [];
  });
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function echoValues(formData: FormData): LeadFormValues {
  const values: LeadFormValues = {};
  for (const field of LEAD_FIELDS) {
    const value = formData.get(field);
    if (typeof value === "string") values[field] = value.slice(0, 2000);
  }
  return values;
}

type BotCheck = { check: "honeypot" } | { check: "timing"; fillMs: number };

/** Which bot check a submission fails, or null when it passes both. */
function automatedBy(formData: FormData): BotCheck | null {
  if (text(formData, LEAD_HIDDEN_FIELDS.honeypot)) return { check: "honeypot" };
  // Measured on the client's own clock (see LeadFormGuards; from the draft's
  // first edit when that is longer), so device clock skew cannot make a real
  // visitor look fast. Missing or malformed values are allowed: a submit
  // before hydration (no JS) sends none.
  const fillMs = Number(text(formData, LEAD_HIDDEN_FIELDS.fillMs));
  if (!Number.isFinite(fillMs) || fillMs < 0) return null;
  return fillMs < LEAD_MIN_FILL_MS ? { check: "timing", fillMs } : null;
}

function failure(formData: FormData, message: string, fieldErrors: Partial<Record<LeadField, string>> = {}): LeadFormState {
  return { status: "error", message, fieldErrors, values: echoValues(formData) };
}

export async function submitLead(_previous: LeadFormState, formData: FormData): Promise<LeadFormState> {
  const bot = automatedBy(formData);
  if (bot?.check === "honeypot") {
    // Look successful so bots do not learn which check caught them. The log
    // names the check, never field values.
    console.warn(`[lead] dropped a submission flagged by the ${bot.check} check`, bot);
    return { status: "success", message: LEAD_MESSAGES.success };
  }
  const timingSuspect = bot?.check === "timing";
  if (timingSuspect) {
    // Autofill, restored drafts and fast real users still get inserted. The
    // source tag lets the back office review them without losing the lead.
    console.warn("[lead] accepting a timing-suspect submission", {
      check: bot.check,
      fillMs: bot.fillMs,
      category: "timing-suspect",
    });
  }

  const parsed = leadSchema.safeParse({
    role: text(formData, "role"),
    name: text(formData, "name") ?? "",
    business_name: text(formData, "business_name"),
    contact: text(formData, "contact") ?? "",
    market: text(formData, "market"),
    message: text(formData, "message"),
    consent: ["on", "true", "1"].includes(text(formData, "consent") ?? ""),
  });

  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error);
    const firstErrors: Partial<Record<LeadField, string>> = {};
    for (const field of LEAD_FIELDS) {
      const message = fieldErrors[field]?.[0];
      if (message) firstErrors[field] = message;
    }
    return failure(formData, LEAD_MESSAGES.invalid, firstErrors);
  }

  if (isDryRun()) {
    // Loud on purpose: a production deploy with this flag would drop every lead.
    console.warn("[lead] LEAD_DRY_RUN=1: validated a submission and skipped the insert", {
      role: parsed.data.role,
      source: leadSource(parsed.data.contact, text(formData, LEAD_HIDDEN_FIELDS.source), { timingSuspect }),
    });
    return { status: "success", message: LEAD_MESSAGES.success };
  }

  const requestHeaders = await headers();
  const key = clientKey(requestHeaders);
  if (key !== null && !rateLimiter.take(key, Date.now())) {
    // No address or field values in the log: the count is what matters.
    console.warn("[lead] rate limit reached for a client (per-instance bucket)");
    return failure(formData, LEAD_MESSAGES.retry);
  }

  const supabase = getServerSupabase();
  if (isSupabaseConfigError(supabase)) {
    console.error("[lead] Supabase env missing:", supabase.missing.join(", "));
    return failure(formData, LEAD_MESSAGES.retry);
  }

  const row: LandingLeadInsertRow = {
    ...parsed.data,
    // The form's placement; reserved test contacts (@invalid) are tagged "e2e".
    source: leadSource(parsed.data.contact, text(formData, LEAD_HIDDEN_FIELDS.source), { timingSuspect }),
    utm: collectUtm(formData),
    user_agent: clip(requestHeaders.get("user-agent") ?? undefined, 400),
  };

  try {
    const { error } = await supabase
      .from("landing_leads")
      .insert(row)
      .abortSignal(AbortSignal.timeout(INSERT_TIMEOUT_MS));

    if (error) {
      if (TABLE_MISSING_CODES.has(error.code)) {
        console.error("[lead] insert failed", leadInsertFailureLog(error.code, "table-missing"));
      } else {
        console.error("[lead] insert failed", leadInsertFailureLog(error.code, "insert-error"));
      }
      return failure(formData, LEAD_MESSAGES.retry);
    }
  } catch {
    console.error("[lead] insert failed", leadInsertFailureLog(undefined, "exception"));
    return failure(formData, LEAD_MESSAGES.retry);
  }

  return { status: "success", message: LEAD_MESSAGES.success };
}
