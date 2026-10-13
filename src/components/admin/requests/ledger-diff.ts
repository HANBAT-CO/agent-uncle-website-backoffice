/*
 * 처리 이력 quantity diffs (screens 10.9). Operators and owners get the app's
 * before and after snapshots of each event and see "확보 1 → 2"; viewers get
 * the after-ledger only. Pure and client-safe.
 */

export type LedgerKey = "요청" | "확보" | "전달" | "수령" | "취소" | "보류";
export type LedgerChange<K extends string = LedgerKey> = { key: K; from: number; to: number };

/** Anything shaped like a request snapshot or a ledger: counters may be missing or null. */
type Counters = { [field: string]: unknown } | null | undefined;

const LEDGER_FIELDS: readonly [field: string, key: LedgerKey][] = [
  ["quantity", "요청"],
  ["acquired", "확보"],
  ["delivered", "전달"],
  ["received", "수령"],
  ["cancelled", "취소"],
  ["held", "보류"],
];

export type DeliveryKey = "전달" | "수령" | "실제 받은 수량";

/** A delivery snapshot: this round's quantity (전달), the confirmed count (수령) and the receipt's actual count. */
const DELIVERY_FIELDS: readonly [field: string, key: DeliveryKey][] = [
  ["quantity", "전달"],
  ["received", "수령"],
  ["actual", "실제 받은 수량"],
];

function counter(snapshot: Counters, field: string): number | null {
  const value = snapshot?.[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function hasAny(snapshot: Counters, fields: readonly (readonly [string, string])[]): boolean {
  return fields.some(([field]) => counter(snapshot, field) !== null);
}

function diff<K extends string>(before: Counters, after: Counters, fields: readonly (readonly [string, K])[]): LedgerChange<K>[] {
  // No before (or the empty before of a new record): nothing changed, it began.
  if (!hasAny(before, fields) || !hasAny(after, fields)) return [];
  const changes: LedgerChange<K>[] = [];
  for (const [field, key] of fields) {
    const from = counter(before, field);
    const to = counter(after, field);
    if (from === null && to === null) continue;
    const a = from ?? 0;
    const b = to ?? 0;
    if (a !== b) changes.push({ key, from: a, to: b });
  }
  return changes;
}

/** Changed request counters only, in 요청 확보 전달 수령 취소 보류 order (tasks WP-07). */
export function ledgerDiff(before: Counters, after: Counters): LedgerChange[] {
  return diff(before, after, LEDGER_FIELDS);
}

/** Changed counters of a 전달 회차 event, whose snapshots are the delivery record. */
export function deliveryDiff(before: Counters, after: Counters): LedgerChange<DeliveryKey>[] {
  return diff(before, after, DELIVERY_FIELDS);
}

/** The six request counters after an event, missing ones as 0 (the viewer timeline). */
export function ledgerAfter(after: Counters): { key: LedgerKey; value: number }[] {
  if (!after) return [];
  return LEDGER_FIELDS.map(([field, key]) => ({ key, value: counter(after, field) ?? 0 }));
}
