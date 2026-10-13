export type LeadInsertFailureCategory = "table-missing" | "insert-error" | "exception";

/**
 * Insert errors can include rejected row values in details or hints. Keep logs
 * to a stable, non-PII shape: the database code plus a coarse category.
 */
export function leadInsertFailureLog(code: string | null | undefined, category: LeadInsertFailureCategory) {
  return {
    code: code || "unknown",
    category,
  };
}
