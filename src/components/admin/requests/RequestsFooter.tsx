import type { RequestList } from "@/lib/admin/rpc/schemas";

import { footerText } from "./request-model";

/** "{total}건 · 요청 {q}장 · 확보 {a}장 · 전달 {d}장 · 수령 {r}장 · 남은 미송 {b}장" over every filtered row, not just this page. */
export function RequestsFooter({ total, totals }: { total: number; totals: RequestList["totals"] }) {
  return (
    <p data-testid="requests-footer" className="num">
      {footerText(total, totals)}
    </p>
  );
}
