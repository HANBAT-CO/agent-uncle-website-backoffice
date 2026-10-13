import { StatusChip } from "@/components/admin/common/StatusChip";
import { RequestLink } from "@/components/admin/common/RequestLink";

export type TriageRequest = { id: string; product: string | null; option: string | null; label: string };

export type TriageProperties = {
  status: string;
  held: number | null;
  span: string;
  spanLabel: "열린 기간" | "대기 시간";
  request: TriageRequest | null;
  round: number | null;
};

function Item({ term, children, testId }: { term: string; children: React.ReactNode; testId: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border/70 pb-2.5 last:border-b-0 last:pb-0">
      <dt className="text-xs text-muted-foreground">{term}</dt>
      <dd data-testid={testId} className="min-w-0 text-sm break-words text-foreground">
        {children}
      </dd>
    </div>
  );
}

/**
 * 속성 pane of the triage (screens 10.12): 상태, 보류 수량, 열린 기간,
 * 관련 요청 and 관련 회차 of the selected issue or proposal. 관련 요청 opens
 * the request Sheet.
 */
export function PropertiesPanel({ properties }: { properties: TriageProperties }) {
  const { request } = properties;
  return (
    <aside aria-labelledby="triage-properties" className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <h2 id="triage-properties" className="text-sm font-semibold text-foreground">
        속성
      </h2>
      <dl className="flex flex-col gap-2.5">
        <Item term="상태" testId="prop-status">
          <StatusChip label={properties.status} />
        </Item>
        <Item term="보류 수량" testId="prop-held">
          <span className="num">{properties.held ?? 0}개</span>
        </Item>
        <Item term={properties.spanLabel} testId="prop-span">
          <span className="num">{properties.span}</span>
        </Item>
        <Item term="관련 요청" testId="prop-request">
          {request ? (
            <span className="flex flex-col items-start gap-1">
              <RequestLink id={request.id}>{[request.product, request.option].filter(Boolean).join(" · ") || "요청 보기"}</RequestLink>
              <StatusChip label={request.label} />
            </span>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </Item>
        <Item term="관련 회차" testId="prop-round">
          {properties.round ? <span className="num">{properties.round}차</span> : <span className="text-muted-foreground">-</span>}
        </Item>
      </dl>
    </aside>
  );
}
