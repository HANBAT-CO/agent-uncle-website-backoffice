import Link from "next/link";
import { randomUUID } from "node:crypto";
import { verifyAdmin } from "@/lib/admin/dal";
import { hasRole } from "@/lib/admin/roles";
import { workflowRpc } from "@/lib/admin/rpc/workflows";
import {
  GROUPS,
  WORKFLOWS,
  WORKFLOW_STATUSES,
  workflowHref,
  type WorkflowCollection,
  type WorkflowGroup,
} from "@/lib/admin/workflows";
import { ErrorState } from "../states/ErrorState";
import { RecordFields } from "./RecordFields";
import { WorkflowFilterFields } from "./WorkflowFilterFields";
import { RevealForm } from "./WorkflowForms";
export type WorkflowParams = Record<string, string | string[] | undefined>;
export function param(params: WorkflowParams, key: string) {
  const value = params[key];
  return typeof value === "string" ? value : "";
}
export function pageNumber(params: WorkflowParams) {
  const n = Number(param(params, "page"));
  return Number.isSafeInteger(n) && n > 0 && n <= 40000 ? n : 1;
}
export function WorkflowPager({
  path,
  params,
  page,
  total,
  pageKey = "page",
}: {
  path: string;
  params: WorkflowParams;
  page: number;
  total: number;
  pageKey?: string;
}) {
  const href = (n: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params))
      if (typeof v === "string") q.set(k, v);
    q.set(pageKey, String(n));
    return `${path}?${q}`;
  };
  return (
    <nav aria-label="페이지" className="flex items-center gap-5 text-sm">
      <span>
        총 {total.toLocaleString("ko-KR")}건 · {page}페이지
      </span>
      {page > 1 ? (
        <Link className="underline" href={href(page - 1)}>
          이전
        </Link>
      ) : null}
      {page * 25 < total ? (
        <Link className="underline" href={href(page + 1)}>
          다음
        </Link>
      ) : null}
    </nav>
  );
}
export async function WorkflowExplorer({
  group,
  params,
}: {
  group: WorkflowGroup;
  params: WorkflowParams;
}) {
  const session = await verifyAdmin();
  const canWrite = hasRole(session.role, "operator");
  const allowed = GROUPS[group];
  const requested = param(params, "collection");
  const collection = allowed.includes(requested as WorkflowCollection)
    ? (requested as WorkflowCollection)
    : allowed[0];
  const requestedStatus = param(params, "status");
  const status = WORKFLOW_STATUSES[collection]?.includes(requestedStatus)
    ? requestedStatus
    : "";
  const page = pageNumber(params);
  const result = await workflowRpc.list(collection, {
    query: param(params, "q"),
    status,
    related: param(params, "related"),
    demo: session.target === "live" && param(params, "demo") === "1",
    offset: (page - 1) * 25,
  });
  return (
    <section className="space-y-5">
      <form
        className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4"
        action={`/admin/${group}`}
      >
        <WorkflowFilterFields
          key={`${collection}:${status}`}
          group={group}
          collection={collection}
          status={status}
        />
        <label className="flex flex-col gap-1 text-xs">
          검색
          <input
            className="h-9 rounded-md border bg-background px-3"
            name="q"
            defaultValue={param(params, "q")}
            placeholder="제목·도매처·기록 ID"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          관련 계정·요청·업무 ID
          <input
            className="h-9 rounded-md border bg-background px-3"
            name="related"
            defaultValue={param(params, "related")}
          />
        </label>
        {session.target === "live" ? (
          <label className="text-sm">
            <input
              type="checkbox"
              name="demo"
              value="1"
              defaultChecked={param(params, "demo") === "1"}
            />{" "}
            데모 포함
          </label>
        ) : null}
        <button className="h-9 rounded-md bg-primary px-4 text-sm text-primary-foreground">
          조회
        </button>
        <Link
          className="text-sm underline"
          href={`/admin/${group}?collection=${collection}`}
        >
          초기화
        </Link>
      </form>
      {!result.ok ? (
        <ErrorState message={result.error.message} />
      ) : (
        <>
          <WorkflowPager
            path={`/admin/${group}`}
            params={params}
            page={page}
            total={result.data.total}
          />
          {result.data.rows.length === 0 ? (
            <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
              조건에 맞는 기록이 없어요.
            </p>
          ) : null}
          {result.data.rows.map((row) => (
            <article
              key={row.id}
              className="space-y-4 rounded-xl border bg-card p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">
                  {String(
                    row.data.label ||
                      row.data.packageLabel ||
                      row.data.name ||
                      WORKFLOWS[collection].label,
                  )}
                </h2>
                {collection === "invoices" ? (
                  <Link
                    className="text-sm text-primary underline"
                    href={workflowHref(collection, row.id)}
                  >
                    청구서 상세·입금 처리
                  </Link>
                ) : null}
              </div>
              <p className="break-all font-mono text-xs text-muted-foreground">
                {row.id}
              </p>
              <RecordFields
                data={row.data}
                fields={[
                  "status",
                  "adjustedTotalAmount",
                  "remainingDueAmount",
                  "platformPayoutComplete",
                  "requestId",
                  "invoiceId",
                  "teamId",
                  "updatedAt",
                ]}
              />
              <details>
                <summary className="cursor-pointer text-sm">
                  전체 업무 정보
                </summary>
                <div className="mt-4">
                  <RecordFields
                    data={row.data}
                    fields={WORKFLOWS[collection].fields}
                  />
                </div>
              </details>
              {canWrite ? (
                <details>
                  <summary className="cursor-pointer text-sm text-primary">
                    내용 열람 · 사유 기록
                  </summary>
                  <div className="mt-3">
                    <RevealForm
                      kind={
                        collection === "teams" ||
                        collection === "colleagueConnections"
                          ? "chat"
                          : "detail"
                      }
                      id={row.id}
                      collection={collection}
                      operationId={randomUUID()}
                    />
                  </div>
                </details>
              ) : null}
            </article>
          ))}
          <WorkflowPager
            path={`/admin/${group}`}
            params={params}
            page={page}
            total={result.data.total}
          />
        </>
      )}
    </section>
  );
}
