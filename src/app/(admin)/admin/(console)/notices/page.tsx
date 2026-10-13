import { InfoIcon, PlusIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";

import { AutoRefresh } from "@/components/admin/common/AutoRefresh";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { ViewTabs } from "@/components/admin/data-table/ViewTabs";
import { NoticeEditor } from "@/components/admin/notices/NoticeEditor";
import { NoticeHistoryTable } from "@/components/admin/notices/NoticeHistoryTable";
import { NoticesTable } from "@/components/admin/notices/NoticesTable";
import { NoticeTabs } from "@/components/admin/notices/NoticeTabs";
import { NOTICE_COPY } from "@/components/admin/notices/notice-form";
import { EmptyState } from "@/components/admin/states/EmptyState";
import { ErrorState, LIST_ERROR_MESSAGE } from "@/components/admin/states/ErrorState";
import { Button } from "@/components/admin/ui/button";
import { verifyAdmin, type AdminSession } from "@/lib/admin/dal";
import { newOperationId } from "@/lib/admin/operation-id";
import { hasRole } from "@/lib/admin/roles";
import { rpc, type RecordRow } from "@/lib/admin/rpc";
import { toOffset } from "@/lib/admin/search-params";

import { loadNoticeParams } from "./search-params";

export const metadata: Metadata = { title: "알림·공지" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Params = Awaited<ReturnType<typeof loadNoticeParams>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOTICES_HREF = "/admin/notices?tab=notices";

/**
 * 알림·공지 (screens 10.14; viewer, writes: operator). Tab 알림 기록 lists the
 * app's in-app notifications (list_records('notices')); tab 공지 lists the
 * console's notices (list_notices) with the editor Sheet. The push banner is
 * always on: notices reach users only through app_bootstrap_config.
 */
export default async function NoticesPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await verifyAdmin();
  const params = await loadNoticeParams(searchParams);
  const canWrite = hasRole(session.role, "operator");

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="알림·공지"
        description="앱이 계정마다 남긴 알림과, 운영에서 앱 사용자에게 보여 줄 공지를 관리해요."
        actions={
          params.tab === "notices" && canWrite ? (
            <Button asChild size="lg">
              <Link href={`${NOTICES_HREF}&notice=new`} scroll={false}>
                <PlusIcon aria-hidden data-icon="inline-start" />새 공지
              </Link>
            </Button>
          ) : null
        }
      />
      <p role="note" className="flex items-start gap-2 rounded-xl border bg-card px-4 py-3 text-sm text-foreground">
        <InfoIcon aria-hidden weight="bold" className="mt-[0.2em] size-4 shrink-0 text-primary" />
        {NOTICE_COPY.pushBanner}
      </p>
      <NoticeTabs current={params.tab} />
      {params.tab === "history" ? <HistoryTab params={params} session={session} /> : <NoticesTab params={params} session={session} />}
    </div>
  );
}

async function HistoryTab({ params, session }: { params: Params; session: AdminSession }) {
  const includeDemo = session.target === "live" && params.demo;
  const list = await rpc.listRecords({
    collection: "notices",
    filter: params.view ?? undefined,
    includeDemo,
    limit: params.size,
    offset: toOffset(params.page, params.size),
  });
  if (!list.ok) return <ErrorState message={LIST_ERROR_MESSAGE} />;

  const { facets } = list.data;
  const all = Object.values(facets.status).reduce((sum, n) => sum + n, 0);
  return (
    <>
      <AutoRefresh />
      <ViewTabs
        tabs={[
          { key: "", label: "전체", count: all },
          { key: "unread", label: "안 읽음", count: facets.unread },
          { key: "today", label: "오늘", count: facets.today },
        ]}
      />
      <NoticeHistoryTable
        // Validated at runtime by recordListSchemas.notices; the generic RecordList type widens rows to unknown.
        rows={list.data.rows as RecordRow<"notices">[]}
        total={list.data.total}
        page={params.page}
        size={params.size}
        empty={
          params.view ? (
            <EmptyState title="조건에 맞는 알림이 없어요" description="다른 보기를 골라 보세요." resetHref="/admin/notices" />
          ) : (
            <EmptyState title="아직 알림 기록이 없어요" description="앱이 연결, 요청, 전달, 채팅 알림을 남기면 여기에 보여요." />
          )
        }
      />
    </>
  );
}

async function NoticesTab({ params, session }: { params: Params; session: AdminSession }) {
  const [notices, admins] = await Promise.all([rpc.listNotices(true), rpc.listAdmins()]);
  if (!notices.ok) return <ErrorState message={LIST_ERROR_MESSAGE} retryHref={NOTICES_HREF} />;

  const authors = Object.fromEntries((admins.ok ? admins.data : []).map((admin) => [admin.userId, admin.displayName]));
  const requested = params.notice;
  const editing = requested && UUID.test(requested) ? (notices.data.find((notice) => notice.id === requested) ?? null) : null;
  const creating = requested === "new" && hasRole(session.role, "operator");

  return (
    <>
      <NoticesTable
        rows={notices.data}
        authors={authors}
        empty={<EmptyState title="아직 공지가 없어요" description={hasRole(session.role, "operator") ? "새 공지를 만들어 초안으로 저장하거나 바로 게시할 수 있어요." : "운영자가 공지를 만들면 여기에 보여요."} />}
      />
      {editing || creating ? (
        <NoticeEditor
          key={editing ? `${editing.id}:${editing.version}` : "new"}
          notice={editing}
          role={session.role}
          operationId={newOperationId()}
          closeHref={NOTICES_HREF}
        />
      ) : null}
    </>
  );
}
