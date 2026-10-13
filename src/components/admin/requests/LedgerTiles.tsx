import type { Ledger } from "@/lib/admin/rpc/schemas";
import { cn } from "@/lib/admin/utils";

type Tile = { label: string; value: number; attention?: boolean };

/**
 * The request ledger laid out like the app (screens 10.9): 누적 확보 /
 * 전달 대기 / 누적 전달 / 남은 미송, then 요청 / 수령 / 취소 / 처리 보류,
 * all in 장.
 */
export function LedgerTiles({ ledger }: { ledger: Ledger }) {
  const main: Tile[] = [
    { label: "누적 확보", value: ledger.acquired },
    { label: "전달 대기", value: ledger.available },
    { label: "누적 전달", value: ledger.delivered },
    { label: "남은 미송", value: ledger.backorder, attention: ledger.backorder > 0 },
  ];
  const minor: Tile[] = [
    { label: "요청", value: ledger.quantity },
    { label: "수령", value: ledger.received },
    { label: "취소", value: ledger.cancelled },
    { label: "처리 보류", value: ledger.held },
  ];

  return (
    <section aria-label="수량" data-testid="ledger-tiles" className="flex flex-col gap-2">
      <dl className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {main.map((tile) => (
          <div key={tile.label} data-testid="ledger-tile" className="flex flex-col gap-1 rounded-xl border bg-card px-4 py-3">
            <dt className="text-xs text-muted-foreground">{tile.label}</dt>
            <dd className={cn("num text-2xl font-bold tracking-tight", tile.attention && "text-primary")}>
              {tile.value.toLocaleString("ko-KR")}
              <span className="ml-0.5 text-sm font-medium text-muted-foreground">장</span>
            </dd>
          </div>
        ))}
      </dl>
      <dl className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {minor.map((tile) => (
          <div key={tile.label} data-testid="ledger-tile" className="flex items-baseline justify-between gap-2 rounded-lg bg-muted/60 px-4 py-2">
            <dt className="text-xs text-muted-foreground">{tile.label}</dt>
            <dd className="num text-sm font-semibold">
              {tile.value.toLocaleString("ko-KR")}
              <span className="ml-0.5 text-xs font-medium text-muted-foreground">장</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
