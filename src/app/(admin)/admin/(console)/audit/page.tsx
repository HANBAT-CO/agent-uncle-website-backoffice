import { InfoIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { createLoader, parseAsString } from "nuqs/server";

import { AuditTable } from "@/components/admin/audit/AuditTable";
import { ChainVerifyButton } from "@/components/admin/audit/ChainVerifyButton";
import { ChoiceChips } from "@/components/admin/audit/ChoiceChips";
import { OperationsTable } from "@/components/admin/audit/OperationsTable";
import { AUDIT_GROUPS, TARGET_TYPES, auditActionsFor, mergeAuditPages, targetTypeLabel } from "@/components/admin/audit/audit-format";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { DataTableToolbar } from "@/components/admin/data-table/DataTableToolbar";
import { DateRangeFilter } from "@/components/admin/data-table/DateRangeFilter";
import { FilterChips, type FilterChip } from "@/components/admin/data-table/FilterChips";
import { SortSelect } from "@/components/admin/data-table/SortSelect";
import { ViewTabs } from "@/components/admin/data-table/ViewTabs";
import { EmptyState } from "@/components/admin/states/EmptyState";
import { ErrorState, LIST_ERROR_MESSAGE } from "@/components/admin/states/ErrorState";
import { ForbiddenState } from "@/components/admin/states/ForbiddenState";
import { requireRole } from "@/lib/admin/dal";
import { formatKst, kstDayRange } from "@/lib/admin/format";
import { hasRole } from "@/lib/admin/roles";
import { rpc, type AuditList, type RpcResult } from "@/lib/admin/rpc";
import { dateRangeParsers, pageParsers, toOffset } from "@/lib/admin/search-params";

export const metadata: Metadata = { title: "감사 로그" };

const loadParams = createLoader({
  page: pageParsers.page,
  size: pageParsers.size,
  ...dateRangeParsers,
  tab: parseAsString.withDefault(""),
  action: parseAsString.withDefault(""),
  actor: parseAsString.withDefault(""),
  target: parseAsString.withDefault(""),
  command: parseAsString.withDefault(""),
  account: parseAsString.withDefault(""),
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** list_audit pages at most 200 rows. */
const RPC_PAGE = 200;

type AuditFilter = { actorId?: string; targetType?: string; from?: string; to?: string };

/**
 * One page of the 작업 group filter. list_audit takes one action (or one
 * prefix), so a group of several is the union of per-action lists: each
 * contributes its newest offset+size rows, then the union is sorted by id
 * and sliced. Exact for any page; the audit log stays small.
 */
async function listAuditGroup(actions: string[], filter: AuditFilter, offset: number, size: number): Promise<RpcResult<AuditList>> {
  if (actions.length === 1) return rpc.listAudit({ ...filter, action: actions[0], limit: size, offset });
  const need = offset + size;
  const pages = await Promise.all(
    actions.map(async (action): Promise<RpcResult<{ total: number; rows: AuditList["rows"] }>> => {
      const rows: AuditList["rows"] = [];
      let total = 0;
      do {
        const result = await rpc.listAudit({ ...filter, action, limit: Math.min(RPC_PAGE, need - rows.length), offset: rows.length });
        if (!result.ok) return result;
        total = result.data.total;
        rows.push(...result.data.rows);
        if (result.data.rows.length === 0) break;
      } while (rows.length < need && rows.length < total);
      return { ok: true, data: { total, rows } };
    }),
  );
  const failed = pages.find((page) => !page.ok);
  if (failed && !failed.ok) return failed;
  const merged = mergeAuditPages(
    pages.flatMap((page) => (page.ok ? [page.data] : [])),
    offset,
    size,
  );
  return { ok: true, data: { total: merged.total, limit: size, offset, rows: merged.rows } };
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <InfoIcon aria-hidden weight="bold" className="size-3.5 shrink-0" />
      {children}
    </p>
  );
}

/**
 * 감사 로그 /admin/audit (spec 6, 7; screens appendix 10.17), operator+.
 * Tab 감사 로그 (list_audit) with 작업, 운영자, 대상 종류 and 기간 filters;
 * tab 앱 작업 기록 (list_operations) with command names only; and, for the
 * owner, 무결성 확인. Auto-refresh stays off here (spec 4).
 */
export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireRole("operator");
  if (!session) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="감사 로그" />
        <ForbiddenState min="operator" />
      </div>
    );
  }

  const p = await loadParams(searchParams);
  const tab = p.tab === "operations" ? "operations" : "audit";
  const offset = toOffset(p.page, p.size);
  const isOwner = hasRole(session.role, "owner");

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="감사 로그" description="운영 화면에서 누가 무엇을 열람하고 바꿨는지, 앱이 어떤 명령을 보냈는지 확인해요." />
      {isOwner ? <ChainVerifyButton /> : null}
      <ViewTabs
        param="tab"
        label="기록 종류"
        tabs={[
          { key: "audit", label: "감사 로그" },
          { key: "operations", label: "앱 작업 기록" },
        ]}
      />
      {tab === "audit" ? <AuditTab p={p} offset={offset} /> : <OperationsTab p={p} offset={offset} />}
    </div>
  );
}

type Params = Awaited<ReturnType<typeof loadParams>>;

async function AuditTab({ p, offset }: { p: Params; offset: number }) {
  const groupActions = auditActionsFor(p.action);
  const actorId = UUID.test(p.actor) ? p.actor : undefined;
  const targetType = TARGET_TYPES.includes(p.target) ? p.target : undefined;
  const filter: AuditFilter = {
    actorId,
    targetType,
    from: p.from ? kstDayRange(p.from).from : undefined,
    to: p.to ? kstDayRange(p.to).to : undefined,
  };

  const [list, admins] = await Promise.all([
    groupActions ? listAuditGroup(groupActions, filter, offset, p.size) : rpc.listAudit({ ...filter, limit: p.size, offset }),
    rpc.listAdmins(),
  ]);
  const staff = admins.ok ? admins.data : [];
  const adminNames = Object.fromEntries(staff.map((admin) => [admin.userId, admin.displayName]));

  const chips: FilterChip[] = [];
  const group = AUDIT_GROUPS.find((item) => item.key === p.action);
  if (group) chips.push({ param: "action", label: `작업: ${group.label}` });
  if (actorId) chips.push({ param: "actor", label: `운영자: ${adminNames[actorId] ?? "선택한 운영자"}` });
  if (targetType) chips.push({ param: "target", label: `대상: ${targetTypeLabel(targetType)}` });
  if (p.from) chips.push({ param: "from", label: `${formatKst(p.from, { time: false })}부터` });
  if (p.to) chips.push({ param: "to", label: `${formatKst(p.to, { time: false })}까지` });
  const filtered = chips.length > 0;

  return (
    <section aria-label="감사 로그" className="flex flex-col gap-3">
      <DataTableToolbar>
        <ChoiceChips param="action" label="작업" options={AUDIT_GROUPS.map((item) => ({ value: item.key, label: item.label }))} />
      </DataTableToolbar>
      <DataTableToolbar>
        <SortSelect
          param="actor"
          label="운영자"
          options={[{ value: "all", label: "운영자 전체" }, ...staff.map((admin) => ({ value: admin.userId, label: admin.displayName || "이름 없는 운영자" }))]}
        />
        <SortSelect
          param="target"
          label="대상 종류"
          options={[{ value: "all", label: "대상 전체" }, ...TARGET_TYPES.map((type) => ({ value: type, label: targetTypeLabel(type) }))]}
        />
        <DateRangeFilter />
      </DataTableToolbar>
      <FilterChips chips={chips} />
      <Note>감사 기록은 수정하거나 지울 수 없어요.</Note>
      {list.ok ? (
        <AuditTable
          rows={list.data.rows}
          total={list.data.total}
          page={p.page}
          size={p.size}
          adminNames={adminNames}
          empty={
            <EmptyState
              title="조건에 맞는 감사 기록이 없어요"
              description={filtered ? "필터를 바꿔 보세요." : "운영 화면에서 열람하거나 바꾸면 여기에 남아요."}
              resetHref={filtered ? "/admin/audit" : undefined}
            />
          }
        />
      ) : (
        <ErrorState message={list.error.kind === "forbidden" ? list.error.message : LIST_ERROR_MESSAGE} />
      )}
    </section>
  );
}

async function OperationsTab({ p, offset }: { p: Params; offset: number }) {
  const accountId = UUID.test(p.account) ? p.account : undefined;
  const command = p.command && p.command !== "all" ? p.command.slice(0, 64) : undefined;
  const [list, facets] = await Promise.all([
    rpc.listOperations({ accountId, command, limit: p.size, offset }),
    // The command counts of the account scope, so the 명령 filter keeps every option.
    command ? rpc.listOperations({ accountId, limit: 1, offset: 0 }) : Promise.resolve(null),
  ]);
  const commands = Object.entries((facets?.ok ? facets.data : list.ok ? list.data : null)?.commands ?? {}).sort((a, b) => b[1] - a[1]);
  const accountName = accountId && list.ok ? (list.data.rows[0]?.actor.name ?? null) : null;

  const chips: FilterChip[] = [];
  if (command) chips.push({ param: "command", label: `명령: ${command}` });
  if (accountId) chips.push({ param: "account", label: `계정: ${accountName ?? "선택한 계정"}` });
  const filtered = chips.length > 0;

  return (
    <section aria-label="앱 작업 기록" className="flex flex-col gap-3">
      <DataTableToolbar>
        <SortSelect
          param="command"
          label="명령"
          options={[
            { value: "all", label: "명령 전체" },
            ...commands.map(([name, count]) => ({ value: name, label: `${name} (${count.toLocaleString("ko-KR")})` })),
          ]}
        />
        <span className="text-xs text-muted-foreground">계정 이름을 누르면 그 계정의 기록만 보여요.</span>
      </DataTableToolbar>
      <FilterChips chips={chips} resetParams={["page"]} />
      <Note>앱이 보낸 명령 이름과 결과만 보여요. 내용은 보이지 않아요.</Note>
      {list.ok ? (
        <OperationsTable
          rows={list.data.rows}
          total={list.data.total}
          page={p.page}
          size={p.size}
          empty={
            <EmptyState
              title="조건에 맞는 앱 작업 기록이 없어요"
              description={filtered ? "필터를 바꿔 보세요." : "앱이 명령을 보내면 여기에 남아요."}
              resetHref={filtered ? "/admin/audit?tab=operations" : undefined}
            />
          }
        />
      ) : (
        <ErrorState message={list.error.kind === "forbidden" ? list.error.message : LIST_ERROR_MESSAGE} />
      )}
    </section>
  );
}
