import { ClipboardTextIcon, PackageIcon } from "@phosphor-icons/react/dist/ssr";

import { KstTime } from "@/components/admin/common/KstTime";
import { formatRelative } from "@/lib/admin/format";
import { actorRoleLabel } from "@/lib/admin/labels";
import type { RequestDossier } from "@/lib/admin/rpc/schemas";

import { deliveryDiff, ledgerAfter, ledgerDiff } from "./ledger-diff";
import { splitTitle } from "./request-model";

/**
 * 처리 이력 (screens 10.9): the request's 업무 기록 as cards, oldest first.
 * Each shows the title (line 1 bold, the rest muted), who acted (소매업자 /
 * 사입삼촌), KST and relative time. Operators and owners see what changed
 * ("확보 1 → 2"); viewers get the after-ledger only. A 전달 회차 event diffs
 * the round, not the request.
 */
export function EventTimeline({ data, showDiff, now }: { data: RequestDossier; showDiff: boolean; now: Date }) {
  const { request, events, deliveries } = data;
  const rounds = new Map(deliveries.map((delivery) => [delivery.id, delivery.round]));

  if (events.length === 0) {
    return <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">아직 처리 이력이 없어요</p>;
  }

  return (
    <ol data-testid="event-timeline" className="relative flex flex-col gap-2 before:absolute before:top-3 before:bottom-3 before:left-[0.9375rem] before:w-px before:bg-border">
      {events.map((event) => {
        const { head, rest } = splitTitle(event.title);
        const round = event.deliveryId ? (rounds.get(event.deliveryId) ?? null) : null;
        const scopedToDelivery = Boolean(event.deliveryId);
        const Icon = scopedToDelivery ? PackageIcon : ClipboardTextIcon;
        const actor = actorRoleLabel(event.actorId, { retailerId: request.retailerId, uncleId: request.uncleId });
        const changes = showDiff ? (scopedToDelivery ? deliveryDiff(event.before, event.after) : ledgerDiff(event.before, event.after)) : [];

        return (
          <li key={event.id} data-testid="event" className="relative flex gap-3">
            <span className="z-10 mt-2 flex size-8 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground">
              <Icon aria-hidden weight="bold" className="size-4" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-xl border bg-card px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="min-w-0 text-sm font-semibold break-words text-foreground">{head}</p>
                <p className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  {round ? <span className="rounded-full bg-muted px-1.5 py-px font-medium text-foreground">{round}차</span> : null}
                  <span className="font-medium text-foreground">{actor}</span>
                  <KstTime iso={event.createdAt} />
                  <span aria-hidden>·</span>
                  <span>{formatRelative(event.createdAt, now)}</span>
                </p>
              </div>
              {rest ? <p className="text-xs whitespace-pre-wrap break-words text-muted-foreground">{rest}</p> : null}
              {showDiff ? (
                changes.length > 0 ? (
                  <ul data-testid="ledger-diff" aria-label="바뀐 수량" className="flex flex-wrap gap-1.5">
                    {changes.map((change) => (
                      <li key={change.key} className="num inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                        <span className="font-medium">{scopedToDelivery ? `회차 ${change.key}` : change.key}</span>
                        <span>
                          {change.from} → <span className="font-semibold">{change.to}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null
              ) : (
                <AfterLedger event={event} scopedToDelivery={scopedToDelivery} />
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Viewers: the counters after the event, no before (screens 10.9). */
function AfterLedger({ event, scopedToDelivery }: { event: RequestDossier["events"][number]; scopedToDelivery: boolean }) {
  if (!event.ledger) return null;
  const parts = scopedToDelivery
    ? [
        { key: "회차 전달", value: event.ledger.quantity },
        { key: "회차 수령", value: event.ledger.received },
      ]
    : ledgerAfter(event.ledger);
  return (
    <p data-testid="ledger-after" className="num flex flex-wrap gap-x-2 text-xs text-muted-foreground">
      <span className="font-medium">이후 수량</span>
      {parts.map((part) => (
        <span key={part.key}>
          {part.key} {part.value}
        </span>
      ))}
    </p>
  );
}
