/*
 * Operation ids (backoffice spec D6, 7). Every staff write carries a UUID the
 * Server Component renders into the form. Postgres replays a retried id with
 * the stored result and refuses the same id with different input, so a form
 * must get a fresh id after each success. Client-safe.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function newOperationId(): string {
  return globalThis.crypto.randomUUID();
}

export function isOperationId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
