import type { RecordFilter } from "@/lib/admin/rpc/enums";
import type { AccountBrief, RecordFacets } from "@/lib/admin/rpc/schemas";

/*
 * 전달·수령 (screens appendix 10.10): views, counts and the wait time of a
 * delivery round. Client-safe and pure. The view keys are the ones the
 * dashboard tile (`view=awaiting`) and ⌘K (`view=awaiting_48h`) link to.
 */

type FacetKey = "awaitingReceipt" | "awaitingReceipt48h" | "mismatch" | "corrected";

export type DeliveryView = { key: string; label: string; filter?: RecordFilter; facet?: FacetKey };

export const DELIVERY_VIEWS: readonly DeliveryView[] = [
  { key: "", label: "전체" },
  { key: "awaiting", label: "수령 대기", filter: "awaiting_receipt", facet: "awaitingReceipt" },
  { key: "awaiting_48h", label: "48시간 넘음", filter: "awaiting_receipt_48h", facet: "awaitingReceipt48h" },
  { key: "mismatch", label: "수량 차이", filter: "mismatch", facet: "mismatch" },
  { key: "corrected", label: "정정된 회차", filter: "corrected", facet: "corrected" },
];

export function deliveryView(key: string | null | undefined): DeliveryView {
  return DELIVERY_VIEWS.find((view) => view.key === (key ?? "")) ?? DELIVERY_VIEWS[0];
}

/** View counts from list_records facets (computed over every delivery, before the view filter). */
export function deliveryViewCounts(facets: RecordFacets): Record<string, number> {
  const all = Object.values(facets.status).reduce((sum, n) => sum + n, 0);
  return Object.fromEntries(DELIVERY_VIEWS.map((view) => [view.key, view.facet ? facets[view.facet] : all]));
}

const HOUR = 3_600_000;

/** 대기 시간: '{n}시간째' (whole hours, at least 1) until the retailer records the receipt. */
export function deliveryWait(
  delivery: { createdAt?: string | null; receiptRecorded?: boolean | null },
  now: Date = new Date(),
): string | null {
  if (delivery.receiptRecorded || !delivery.createdAt) return null;
  const start = new Date(delivery.createdAt).getTime();
  if (Number.isNaN(start)) return null;
  return `${Math.max(Math.floor((now.getTime() - start) / HOUR), 1)}시간째`;
}

/** 사입삼촌 → 소매업자 of a round, from the record's readers. */
export function deliveryParties(row: { uncleId?: string | null; retailerId?: string | null; parties: AccountBrief[] }): {
  uncle: AccountBrief | null;
  retailer: AccountBrief | null;
} {
  const find = (id: string | null | undefined) => (id ? (row.parties.find((party) => party.id === id) ?? null) : null);
  return { uncle: find(row.uncleId), retailer: find(row.retailerId) };
}
