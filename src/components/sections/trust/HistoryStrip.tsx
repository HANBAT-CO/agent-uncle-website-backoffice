import { trust } from "@/content/copy";
import { RECORDS } from "@/content/story";
import { cn } from "@/lib/cn";

/**
 * 처리 이력 strip (spec S8 row 3), a Server Component. Named the way the app
 * names it: the request detail's section title 처리 이력 over the app-format
 * product line, so the five records read as the denim's history, not more
 * chat footage. Then the denim's five verified records (table 0.6), oldest
 * left, as blocks on one dashed rule: date and time above, the app's title
 * below, no dots between blocks. Below 768px the rule turns vertical and the
 * blocks become a tight list: each record one two-line block (time over
 * title), 16px apart.
 */
export function HistoryStrip({ className }: { className?: string }) {
  const labelId = "trust-history-label";
  const captionId = "trust-history-caption";
  return (
    <div className={cn("flex flex-col gap-6 md:gap-8 lg:gap-10", className)}>
      <div className="flex flex-col gap-4 md:gap-6">
        <div className="flex flex-col gap-1">
          <p id={labelId} className="text-[15px] leading-[1.4] font-bold text-ink lg:text-body-lg lg:leading-[1.4]">
            {trust.history.label}
          </p>
          <p className="text-caption text-grey-600">{trust.history.item}</p>
        </div>
        <ol className="trust-history" aria-labelledby={labelId} aria-describedby={captionId} data-history="">
          {trust.history.records.map((id) => {
            const record = RECORDS[id];
            return (
              <li key={id} className="trust-history-item" data-history-record={id}>
                <p className="trust-history-time text-caption text-grey-600 tabular-nums">
                  {record.day} {record.time}
                </p>
                <p className="trust-history-title text-[15px] leading-[1.45] font-bold text-ink lg:text-body">{record.title}</p>
              </li>
            );
          })}
        </ol>
      </div>
      <p id={captionId} className="max-w-(--container-prose) text-body text-grey-800 lg:text-body-lg">
        {trust.history.caption}
      </p>
    </div>
  );
}
