import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { AccountLink } from "@/components/admin/common/AccountLink";
import { ErrorState } from "@/components/admin/states/ErrorState";
import { RecordFields } from "@/components/admin/workflows/RecordFields";
import {
  PaymentForm,
  RevealForm,
} from "@/components/admin/workflows/WorkflowForms";
import { verifyAdmin } from "@/lib/admin/dal";
import { hasRole } from "@/lib/admin/roles";
import { workflowRpc } from "@/lib/admin/rpc/workflows";
import {
  PAYOUT_BLOCKERS,
  WORKFLOWS,
  type WorkflowCollection,
} from "@/lib/admin/workflows";
export const metadata = { title: "청구서 상세" };
export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await verifyAdmin();
  const { id: segment } = await params;
  // App-generated invoice IDs contain a colon; routing can preserve its URL encoding.
  let id: string;
  try {
    id = decodeURIComponent(segment);
  } catch {
    notFound();
  }
  const result = await workflowRpc.invoice(id);
  if (!result.ok) return <ErrorState message={result.error.message} />;
  const data = result.data;
  const invoice = data.invoice;
  const canWrite = hasRole(session.role, "operator");
  const payoutAllowed =
    data.payout.blockers.length === 0 &&
    typeof invoice.version === "number" &&
    typeof invoice.adjustedTotalAmount === "number";
  return (
    <div className="space-y-6">
      <PageHeader
        title={String(invoice.label || "청구서 상세")}
        description="입금 신고와 실제 은행 거래를 대조하고 지급 기록을 확인하세요."
        meta={id}
        actions={
          <Link className="text-sm underline" href="/admin/billing">
            청구·정산 목록
          </Link>
        }
      />
      <div className="flex flex-wrap gap-5 text-sm">
        <span>
          소매처 <AccountLink account={data.retailer} />
        </span>
        <span>
          수취인 <AccountLink account={data.payee} />
        </span>
      </div>
      <section className="rounded-xl border bg-card p-5">
        <RecordFields data={invoice} fields={WORKFLOWS.invoices.fields} />
      </section>
      {invoice.requiresReconciliation ? (
        <p role="alert" className="rounded-lg border p-4 text-status-attention">
          재정산이 필요해요. 지급 전에 청구 금액과 환불·문의 상태를 확인하세요.
        </p>
      ) : null}
      <section className="space-y-3">
        <h2 className="font-semibold">연결 요청</h2>
        {data.requests.length ? (
          data.requests.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap justify-between gap-3 rounded-lg border p-4"
            >
              <Link
                className="text-primary underline"
                href={`/admin/requests/${encodeURIComponent(r.id)}`}
              >
                {r.title}
              </Link>
              <span className="text-sm">
                {r.label} · {r.received ? "수령 완료" : "수령 미완료"}
              </span>
            </div>
          ))
        ) : (
          <p className="text-muted-foreground">연결 요청이 없어요.</p>
        )}
      </section>
      <section className="space-y-3 rounded-xl border bg-card p-5">
        <h2 className="font-semibold">지급 준비 상태</h2>
        <p className="text-sm">
          운영 계좌 확인 입금액:{" "}
          {data.payout.confirmedPlatformAmount.toLocaleString("ko-KR")}원
        </p>
        {data.payout.blockers.length ? (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {data.payout.blockers.map((reason) => (
              <li key={reason}>
                {PAYOUT_BLOCKERS[reason] ?? "청구 상태를 확인해 주세요."}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm">
            수령·청구·입금 조건이 충족됐어요. 은행 지급 내역과 수취 계좌를
            대조하세요.
          </p>
        )}
      </section>
      {canWrite && data.payee.id ? (
        <RevealForm kind="bank" id={data.payee.id} operationId={randomUUID()} />
      ) : null}
      {canWrite && payoutAllowed ? (
        <PaymentForm
          key={`payout-${invoice.version}`}
          action="pay_uncle"
          recordId={id}
          version={invoice.version as number}
          amount={invoice.adjustedTotalAmount as number}
          operationId={randomUUID()}
        />
      ) : null}
      <section className="space-y-4">
        <h2 className="font-semibold">결제·조정·문의 기록</h2>
        {data.records.map((r) => (
          <article
            className="space-y-4 rounded-xl border bg-card p-5"
            key={`${r.collection}:${r.id}`}
          >
            <h3 className="font-medium">
              {WORKFLOWS[r.collection as WorkflowCollection]?.label ??
                "관련 기록"}
            </h3>
            <p className="break-all font-mono text-xs text-muted-foreground">
              {r.id}
            </p>
            <RecordFields data={r.data} />
            {canWrite ? (
              <details>
                <summary className="cursor-pointer text-sm text-primary">
                  내용 열람 · 사유 기록
                </summary>
                <RevealForm
                  kind="detail"
                  id={r.id}
                  collection={r.collection}
                  operationId={randomUUID()}
                />
              </details>
            ) : null}
            {canWrite &&
            !invoice.requiresReconciliation &&
            !invoice.platformPayoutComplete &&
            r.collection === "invoiceReceipts" &&
            r.data.status === "reported" &&
            r.data.paidToId === "platform" &&
            typeof r.data.version === "number" &&
            typeof r.data.amount === "number" ? (
              <div className="grid gap-4 md:grid-cols-2">
                {(["confirm_receipt", "reject_receipt"] as const).map(
                  (action) => (
                    <PaymentForm
                      key={`${action}-${r.data.version}`}
                      action={action}
                      recordId={r.id}
                      version={r.data.version as number}
                      amount={r.data.amount as number}
                      operationId={randomUUID()}
                    />
                  ),
                )}
              </div>
            ) : null}
          </article>
        ))}
      </section>
    </div>
  );
}
