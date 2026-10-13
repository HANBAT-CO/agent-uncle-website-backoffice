import type { Metadata } from "next";

import { ConversationRail, ConversationTable } from "@/components/admin/chats/ConversationList";
import type { ChatPropertiesData } from "@/components/admin/chats/ChatProperties";
import { TranscriptPane } from "@/components/admin/chats/TranscriptPane";
import { isPairId, pairKey, pairSides, samePair } from "@/components/admin/chats/transcript";
import { PageHeader } from "@/components/admin/common/PageHeader";
import { ErrorState, LIST_ERROR_MESSAGE } from "@/components/admin/states/ErrorState";
import { verifyAdmin } from "@/lib/admin/dal";
import { CONNECTION_STATUS_LABEL } from "@/lib/admin/labels";
import { hasRole } from "@/lib/admin/roles";
import { rpc, type AccountBrief, type ConversationRow } from "@/lib/admin/rpc";
import { toOffset } from "@/lib/admin/search-params";

import { loadChatParams } from "./search-params";

export const metadata: Metadata = { title: "채팅 열람" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Requests of the pair shown in 속성 (backoffice_list_requests is capped at 200 rows). */
const PAIR_REQUEST_LIMIT = 200;

function unknownAccount(id: string): AccountBrief {
  return { id, name: null, role: null, complete: false, demo: false };
}

/**
 * 채팅 열람 (screens 10.13; list: viewer, transcript: operator). The list is
 * list_conversations metadata only. `?a=&b=` opens the three panes: pairs,
 * the thread and 속성. The transcript is fetched by the client through the
 * audited openConversationAction, never here, so no page payload carries it.
 * No AutoRefresh (spec 4).
 */
export default async function ChatsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await verifyAdmin();
  const params = await loadChatParams(searchParams);
  const includeDemo = session.target === "live" && params.demo;
  const list = await rpc.listConversations({ includeDemo, limit: params.size, offset: toOffset(params.page, params.size) });

  const header = (
    <PageHeader
      title="채팅 열람"
      description="거래처 쌍의 1:1 대화 기록이에요. 목록에는 메시지 내용이 보이지 않아요."
      meta={<span>대화 열람은 운영자 이상이 사유를 남긴 뒤에 할 수 있고, 감사 로그에 남아요.</span>}
    />
  );

  if (!list.ok) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <ErrorState message={LIST_ERROR_MESSAGE} />
      </div>
    );
  }

  const { a, b } = params;
  const pair = isPairId(a) && isPairId(b) && a !== b ? { a, b } : null;

  if (!pair) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <ConversationTable rows={list.data.rows} total={list.data.total} page={params.page} size={params.size} />
      </div>
    );
  }

  const matches = (row: ConversationRow) => samePair(pair, { a: row.accountA.id, b: row.accountB.id });
  const [fallback, requests] = await Promise.all([
    list.data.rows.some(matches) ? null : rpc.listConversations({ accountId: pair.a, includeDemo, limit: 200, offset: 0 }),
    rpc.listRequests({ accountId: pair.a, includeDemo, limit: PAIR_REQUEST_LIMIT, offset: 0 }),
  ]);
  const row = list.data.rows.find(matches) ?? (fallback?.ok ? fallback.data.rows.find(matches) : undefined) ?? null;
  const sides = row ? pairSides(row.accountA, row.accountB) : { left: unknownAccount(pair.a), right: unknownAccount(pair.b) };

  const pairRequests = requests.ok
    ? requests.data.rows.filter((request) => samePair(pair, { a: request.retailer.id, b: request.uncle.id }))
    : [];
  const properties: ChatPropertiesData = {
    connectionLabel: row?.connection ? (CONNECTION_STATUS_LABEL[row.connection] ?? row.connection) : null,
    counts: row
      ? {
          userMessages: row.userMessages,
          systemMessages: row.systemMessages,
          linkedRequests: row.linkedRequests,
          unread: row.unread,
          withAttachments: row.withAttachments,
        }
      : null,
    requests: pairRequests.map((request) => ({ id: request.id, product: request.product, option: request.option, label: request.label })),
    requestTotal: pairRequests.length,
  };
  const key = pairKey(pair.a, pair.b);

  return (
    <div className="flex flex-col gap-5">
      {header}
      <div className="grid items-start gap-4 lg:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)_16rem]">
        <ConversationRail rows={list.data.rows} total={list.data.total} page={params.page} size={params.size} selected={key} />
        <TranscriptPane key={key} left={sides.left} right={sides.right} canRead={hasRole(session.role, "operator")} properties={properties} />
      </div>
    </div>
  );
}
