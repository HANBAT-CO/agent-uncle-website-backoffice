import Link from "next/link";

import { AccountLink } from "@/components/admin/common/AccountLink";
import { StatusChip } from "@/components/admin/common/StatusChip";
import { qty } from "@/lib/admin/format";
import type { AccountBrief } from "@/lib/admin/rpc/schemas";

/*
 * 속성 pane of 채팅 열람 (screens 10.13): 연결 상태, the pair, the metadata
 * counts, the pair's requests and the reason given for this reading. No
 * message content: the counts and requests come from metadata RPCs.
 */

export type ChatRequestSummary = { id: string; product: string | null; option: string | null; label: string };

export type ChatPropertiesData = {
  connectionLabel: string | null;
  counts: { userMessages: number; systemMessages: number; linkedRequests: number; unread: number; withAttachments: number } | null;
  requests: ChatRequestSummary[];
  requestTotal: number;
};

const SHOWN_REQUESTS = 6;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5 border-b border-border/70 pb-3 last:border-0 last:pb-0">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

export function ChatProperties({
  left,
  right,
  data,
  reason,
}: {
  left: AccountBrief;
  right: AccountBrief;
  data: ChatPropertiesData;
  reason: string | null;
}) {
  const { counts } = data;
  return (
    <aside aria-label="속성" className="flex flex-col gap-3 self-start rounded-xl border bg-card p-4 text-sm">
      <h2 className="text-sm font-semibold">속성</h2>
      <Section title="연결 상태">
        {data.connectionLabel ? <StatusChip label={data.connectionLabel} className="self-start" /> : <span className="text-muted-foreground">-</span>}
      </Section>
      <Section title="거래처">
        <AccountLink account={left} />
        <AccountLink account={right} />
      </Section>
      {counts ? (
        <Section title="대화 기록">
          <dl className="num grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[0.8125rem]">
            <dt className="text-muted-foreground">메시지</dt>
            <dd className="text-right">{qty(counts.userMessages, "건")}</dd>
            <dt className="text-muted-foreground">업무 기록</dt>
            <dd className="text-right">{qty(counts.systemMessages, "건")}</dd>
            <dt className="text-muted-foreground">연결된 요청</dt>
            <dd className="text-right">{qty(counts.linkedRequests, "건")}</dd>
            <dt className="text-muted-foreground">안 읽음</dt>
            <dd className="text-right">{qty(counts.unread, "건")}</dd>
            <dt className="text-muted-foreground">사진 포함</dt>
            <dd className="text-right">{qty(counts.withAttachments, "건")}</dd>
          </dl>
        </Section>
      ) : null}
      <Section title={`관련 요청 ${qty(data.requestTotal, "건")}`}>
        {data.requests.length === 0 ? (
          <span className="text-xs text-muted-foreground">이 거래처 쌍의 사입 요청이 없어요</span>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.requests.slice(0, SHOWN_REQUESTS).map((request) => (
              <li key={request.id} className="flex flex-col gap-1">
                <Link
                  href={`/admin/requests/${encodeURIComponent(request.id)}`}
                  scroll={false}
                  className="truncate text-[0.8125rem] font-medium text-foreground hover:text-primary hover:underline"
                >
                  {request.product?.trim() || "상품명 없음"}
                  {request.option ? <span className="font-normal text-muted-foreground"> · {request.option}</span> : null}
                </Link>
                <StatusChip label={request.label} className="self-start" />
              </li>
            ))}
          </ul>
        )}
        {data.requests.length > SHOWN_REQUESTS ? (
          <span className="text-xs text-muted-foreground">외 {qty(data.requests.length - SHOWN_REQUESTS, "건")}</span>
        ) : null}
      </Section>
      <Section title="열람 사유">
        {reason ? (
          <>
            <p className="text-[0.8125rem] break-words whitespace-pre-wrap">{reason}</p>
            <span className="text-xs text-muted-foreground">운영자 이름과 함께 감사 로그에 남았어요.</span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">아직 열람하지 않았어요</span>
        )}
      </Section>
    </aside>
  );
}
