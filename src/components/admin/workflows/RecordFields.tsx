import Link from "next/link";
import { DefinitionList } from "../common/DefinitionList";
import {
  FIELD_LABELS,
  workflowHref,
  workflowValue,
} from "@/lib/admin/workflows";

const collections: Record<string, string> = {
  invoiceId: "invoices",
  paymentId: "fieldPayments",
  fieldPaymentId: "fieldPayments",
  fieldPaymentIds: "fieldPayments",
  allocationIds: "supplierPaymentAllocations",
  reimbursementId: "reimbursements",
  teamId: "teams",
  roundId: "teamRounds",
  areaId: "teamAreas",
  jobId: "teamJobs",
  activeHandoffId: "teamHandoffs",
  packageIds: "teamPackages",
  pendingPackageIds: "teamPackages",
  acceptedPackageIds: "teamPackages",
};
const accounts = new Set([
  "retailerId",
  "uncleId",
  "payeeId",
  "payerId",
  "managerIds",
  "platformPayoutRecipientId",
  "reporterId",
  "paidToId",
  "confirmedBy",
  "actorId",
  "requesterId",
  "recipientId",
  "resolvedBy",
  "fromId",
  "toId",
  "actualRecipientId",
  "ownerId",
  "memberIds",
  "adminIds",
  "inviterId",
  "inviteeId",
  "senderId",
  "peerId",
  "createdBy",
  "primaryMemberId",
  "backupMemberId",
  "pickupAssigneeId",
  "finalAssigneeId",
  "requestUncleId",
  "currentHolderId",
  "accountId",
]);
function fieldValue(key: string, value: unknown) {
  if (Array.isArray(value))
    return value.length ? (
      <div className="flex flex-wrap gap-2">
        {value.map((v, i) => (
          <span key={i}>{fieldValue(key, v)}</span>
        ))}
      </div>
    ) : (
      "없음"
    );
  if (typeof value === "string" && value && value !== "platform") {
    const href =
      key === "requestId"
        ? `/admin/requests/${encodeURIComponent(value)}`
        : accounts.has(key)
          ? `/admin/accounts/${encodeURIComponent(value)}`
          : collections[key]
            ? workflowHref(collections[key], value)
            : null;
    if (href)
      return (
        <Link
          className="text-primary underline underline-offset-2 break-all"
          href={href}
        >
          {value}
        </Link>
      );
  }
  return workflowValue(key, value);
}
export function RecordFields({
  data,
  fields,
}: {
  data: Record<string, unknown>;
  fields?: readonly string[];
}) {
  const keys = fields ?? Object.keys(data).filter((k) => k in FIELD_LABELS);
  return (
    <DefinitionList
      items={keys
        .filter((k) => data[k] !== undefined)
        .map((key) => ({
          term: FIELD_LABELS[key] ?? key,
          value:
            data[`${key}Missing`] === true
              ? "미입력"
              : fieldValue(key, data[key]),
        }))}
    />
  );
}
