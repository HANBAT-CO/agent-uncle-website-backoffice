import "server-only";

import type { TriageMemoData } from "@/components/admin/issues/TriageMemo";
import type { TriageProperties, TriageRequest } from "@/components/admin/issues/PropertiesPanel";
import { recordRows } from "@/components/admin/issues/record-rows";
import { openSpan } from "@/components/admin/issues/triage-model";
import { ISSUE_STATUS_LABEL, PROPOSAL_STATUS_LABEL } from "@/lib/admin/labels";
import { newOperationId } from "@/lib/admin/operation-id";
import { hasRole, type AdminRole } from "@/lib/admin/roles";
import { rpc, type AdminRow, type Ledger, type RecordRow, type RequestDossier } from "@/lib/admin/rpc";

/*
 * Data for the 문제·정정 triage panes (screens 10.12). The list rows carry the
 * issue or proposal itself; the 속성 pane and the memo need the request
 * (backoffice_get_request: deliveries with their round, receipts, notes,
 * cases). The 관련 회차 and request-counter columns are looked up in one
 * page of deliveries or requests, then per request for the few misses.
 */

/** The most rows a list RPC returns at once (spec 8). */
const LOOKUP_LIMIT = 200;
/** At most this many per-request lookups for rows outside the first page. */
const FALLBACK_LOOKUPS = 10;

function requestOf(dossier: RequestDossier): TriageRequest {
  return { id: dossier.request.id, product: dossier.request.product ?? null, option: dossier.request.option ?? null, label: dossier.request.label };
}

function roundOf(dossier: RequestDossier, deliveryId: string | null | undefined): number | null {
  if (!deliveryId) return null;
  return dossier.deliveries.find((delivery) => delivery.id === deliveryId)?.round ?? null;
}

export function issueProperties(row: RecordRow<"issues">, dossier: RequestDossier | null, now: Date): TriageProperties {
  return {
    status: ISSUE_STATUS_LABEL[row.status ?? ""] ?? ISSUE_STATUS_LABEL.open,
    held: row.held ?? 0,
    span: openSpan(row.createdAt, row.status === "resolved" ? row.updatedAt : null, now),
    spanLabel: "열린 기간",
    request: dossier ? requestOf(dossier) : null,
    round: dossier ? roundOf(dossier, row.deliveryId) : null,
  };
}

export function proposalProperties(row: RecordRow<"proposals">, dossier: RequestDossier | null, now: Date): TriageProperties {
  // A correction is recorded against a delivery round through its receipt.
  const receipt = dossier?.receipts.find((r) => r.proposalId === row.id && r.deliveryId);
  return {
    status: PROPOSAL_STATUS_LABEL[row.status ?? ""] ?? PROPOSAL_STATUS_LABEL.pending,
    held: row.held ?? 0,
    span: row.status === "pending" ? openSpan(row.createdAt, null, now) : "-",
    spanLabel: "대기 시간",
    request: dossier ? requestOf(dossier) : null,
    round: dossier ? roundOf(dossier, receipt?.deliveryId) : null,
  };
}

export function memoData(dossier: RequestDossier | null, admins: AdminRow[], role: AdminRole): TriageMemoData | null {
  if (!dossier) return null;
  const active = admins.filter((admin) => !admin.revokedAt);
  return {
    requestId: dossier.request.id,
    notes: dossier.notes,
    cases: dossier.cases,
    canWrite: hasRole(role, "operator"),
    noteOperationId: newOperationId(),
    caseOperationId: newOperationId(),
    authors: Object.fromEntries(admins.map((admin) => [admin.userId, admin.displayName])),
    assignees: active.filter((admin) => admin.role !== "viewer").map((admin) => ({ userId: admin.userId, displayName: admin.displayName })),
  };
}

/** deliveryId → round for the issues on this page. */
export async function deliveryRounds(rows: RecordRow<"issues">[], includeDemo: boolean): Promise<Record<string, number>> {
  const wanted = rows.filter((row) => row.deliveryId);
  if (wanted.length === 0) return {};
  const rounds: Record<string, number> = {};
  const recent = await rpc.listRecords({ collection: "deliveries", includeDemo, limit: LOOKUP_LIMIT, offset: 0 });
  if (recent.ok) for (const d of recordRows("deliveries", recent.data)) if (d.round !== null) rounds[d.id] = d.round;

  const missing = [...new Set(wanted.filter((row) => !rounds[row.deliveryId!] && row.requestId).map((row) => row.requestId!))];
  const lookups = await Promise.all(
    missing
      .slice(0, FALLBACK_LOOKUPS)
      .map((requestId) => rpc.listRecords({ collection: "deliveries", requestId, includeDemo, limit: LOOKUP_LIMIT, offset: 0 })),
  );
  for (const lookup of lookups) if (lookup.ok) for (const d of recordRows("deliveries", lookup.data)) if (d.round !== null) rounds[d.id] = d.round;
  return rounds;
}

/** requestId → the request's counters for the proposals on this page. */
export async function requestLedgers(rows: RecordRow<"proposals">[], includeDemo: boolean): Promise<Record<string, Ledger>> {
  const ids = [...new Set(rows.map((row) => row.requestId).filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return {};
  const ledgers: Record<string, Ledger> = {};
  const recent = await rpc.listRequests({ includeDemo, sort: "updated_desc", limit: LOOKUP_LIMIT, offset: 0 });
  if (recent.ok) for (const r of recent.data.rows) ledgers[r.id] = r.ledger;

  const missing = ids.filter((id) => !ledgers[id]).slice(0, FALLBACK_LOOKUPS);
  const lookups = await Promise.all(missing.map((id) => rpc.listRequests({ search: id, includeDemo, limit: 1, offset: 0 })));
  for (const lookup of lookups) if (lookup.ok) for (const r of lookup.data.rows) ledgers[r.id] = r.ledger;
  return ledgers;
}
