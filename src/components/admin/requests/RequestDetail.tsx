import { InfoIcon } from "@phosphor-icons/react/dist/ssr";

import { AccountLink } from "@/components/admin/common/AccountLink";
import { DdayChip } from "@/components/admin/common/DdayChip";
import { DefinitionList } from "@/components/admin/common/DefinitionList";
import { KstTime } from "@/components/admin/common/KstTime";
import { StatusChip } from "@/components/admin/common/StatusChip";
import { CasePanel, type CaseAssignee } from "@/components/admin/panels/CasePanel";
import { NotesPanel } from "@/components/admin/panels/NotesPanel";
import type { AdminSession } from "@/lib/admin/dal";
import { formatKst, kstToday } from "@/lib/admin/format";
import { hasRole } from "@/lib/admin/roles";
import { OPEN_CASE_STATUSES } from "@/lib/admin/rpc/enums";
import type { AdminRow, RequestDossier } from "@/lib/admin/rpc/schemas";
import { cn } from "@/lib/admin/utils";

import { ChatLinkTab } from "./ChatLinkTab";
import { DeliveriesTab } from "./DeliveriesTab";
import { EventTimeline } from "./EventTimeline";
import { IssuesTab } from "./IssuesTab";
import { LedgerTiles } from "./LedgerTiles";
import { PhotosTab } from "./PhotosTab";
import { ProposalsTab } from "./ProposalsTab";
import { RequestDetailTabs, type DetailTab } from "./RequestDetailTabs";
import { recheckDays } from "./request-model";
import { ViolationBanner } from "./ViolationBanner";

export const TWO_PARTY_NOTE = "기록을 고치려면 두 거래처가 앱에서 정정을 제안하고 확정해야 해요.";

export type RequestOperationIds = { note: string; case: string };

/** "{상품} · {옵션}" (screens 10.9 header). */
export function requestTitle(request: { product?: string | null; option?: string | null }): string {
  return [request.product?.trim() || "상품 정보 없음", request.option?.trim()].filter(Boolean).join(" · ");
}

/**
 * The request detail (screens 10.9), shared by the intercepted Sheet over
 * the list and the full page at /admin/requests/[id]. Staff only read the
 * trade record here; notes and cases are the only writes, and each form
 * carries an operation id rendered on this request (a fresh one after every
 * revalidated save).
 */
export function RequestDetail({
  data,
  session,
  operationIds,
  staff,
  variant,
}: {
  data: RequestDossier;
  session: AdminSession;
  operationIds: RequestOperationIds;
  staff: AdminRow[];
  variant: "sheet" | "page";
}) {
  const { request } = data;
  const canWrite = hasRole(session.role, "operator");
  const now = new Date();
  const Heading = variant === "page" ? "h1" : "h2";
  const authors = Object.fromEntries(staff.map((admin) => [admin.userId, admin.displayName]));
  const assignees: CaseAssignee[] = staff
    .filter((admin) => !admin.revokedAt && hasRole(admin.role, "operator"))
    .map((admin) => ({ userId: admin.userId, displayName: admin.displayName }));
  const hasOpenCase = data.cases.some((c) => (OPEN_CASE_STATUSES as readonly string[]).includes(c.status));
  const days = recheckDays(request.recheck, kstToday(now));
  const address = [request.address, request.addressDetail].filter((part) => part && part.trim()).join(" ");

  const tabs: DetailTab[] = [
    {
      key: "history",
      label: "처리 이력",
      count: data.events.length,
      content: <EventTimeline data={data} showDiff={canWrite} now={now} />,
    },
    {
      key: "deliveries",
      label: "전달 회차",
      count: data.deliveries.length,
      content: <DeliveriesTab deliveries={data.deliveries} />,
    },
    {
      key: "proposals",
      label: "변경·취소·정정",
      count: data.proposals.length,
      content: <ProposalsTab data={data} />,
    },
    {
      key: "issues",
      label: "문제",
      count: data.issues.length,
      content: <IssuesTab data={data} now={now} />,
    },
    {
      key: "photos",
      label: "첨부 사진",
      count: data.photos.length,
      content: <PhotosTab photos={data.photos} canOpen={canWrite} />,
    },
    {
      key: "chat",
      label: "관련 채팅",
      count: data.messages.system + data.messages.user,
      content: <ChatLinkTab data={data} />,
    },
    {
      key: "notes",
      label: "운영 메모 · 케이스",
      count: data.notes.length,
      content: (
        <div className={cn("grid gap-6", variant === "page" && "xl:grid-cols-2")}>
          <NotesPanel
            targetType="request"
            targetId={request.id}
            notes={data.notes}
            canWrite={canWrite}
            operationId={operationIds.note}
            authors={authors}
          />
          <CasePanel
            targetType="request"
            targetId={request.id}
            cases={data.cases}
            assignees={assignees}
            canWrite={canWrite}
            operationId={operationIds.case}
          />
        </div>
      ),
    },
  ];

  return (
    <article data-testid="request-detail" data-variant={variant} aria-labelledby={`request-${request.id}-title`} className="request-dossier flex min-w-0 flex-col gap-6">
      <RequestDetailTabs
        header={
          <header className="flex min-w-0 flex-col gap-3">
            <span className="console-eyebrow">REQUEST RECORD</span>
            <div className="flex flex-wrap items-center gap-2">
              <Heading
                id={`request-${request.id}-title`}
                className={cn("font-semibold tracking-[-0.045em] text-foreground", variant === "page" ? "text-2xl lg:text-3xl" : "text-xl sm:text-2xl")}
              >
                {requestTitle(request)}
              </Heading>
              <StatusChip label={request.label} />
            </div>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span>
                요청 <KstTime iso={request.createdAt} className="text-foreground" />
              </span>
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <AccountLink account={data.retailer} />
                <span className="shrink-0">→</span>
                <AccountLink account={data.uncle} />
              </span>
            </p>
          </header>
        }
        summary={
          <div className="request-summary flex flex-col gap-5">
            <ViolationBanner codes={data.checks.violations} />
            <LedgerTiles ledger={request.ledger} />
            <DefinitionList
              columns={variant === "page" ? 3 : 2}
              items={[
                {
                  term: "도매처",
                  value: request.wholesaler,
                  hint: request.location,
                },
                {
                  term: "재확인일",
                  value: request.recheck ? <RecheckValue day={request.recheck} days={days} /> : null,
                },
                {
                  term: "수령지",
                  value: address || null,
                  hint: request.masked ? "열람자 권한에서는 주소가 가려져요." : undefined,
                },
                {
                  term: "요청 메모",
                  value: request.note ? <span className="whitespace-pre-wrap">{request.note}</span> : null,
                },
                {
                  term: "최근 변경",
                  value: <KstTime iso={request.updatedAt} />,
                  hint: `v${request.version ?? 0}`,
                },
                {
                  term: "요청 ID",
                  value: <span className="font-mono text-xs break-all">{request.id}</span>,
                },
              ]}
            />
          </div>
        }
        tabs={tabs}
        requestPath={`/admin/requests/${encodeURIComponent(request.id)}`}
        canWrite={canWrite}
        hasOpenCase={hasOpenCase}
        inSheet={variant === "sheet"}
      />

      <p data-testid="two-party-note" className="flex items-start gap-2 rounded-lg bg-muted/70 px-3 py-2.5 text-xs text-muted-foreground">
        <InfoIcon aria-hidden weight="bold" className="mt-px size-4 shrink-0" />
        {TWO_PARTY_NOTE}
      </p>
    </article>
  );
}

function RecheckValue({ day, days }: { day: string; days: number | null }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="num">{formatKst(day, { time: false })}</span>
      <DdayChip days={days} />
    </span>
  );
}
