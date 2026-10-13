import { Skeleton } from "@/components/admin/ui/skeleton";

/** Dashboard loading: member directories, tiles, queue, summary and chart placeholders. */
export function DashboardSkeleton({ label = "대시보드를 불러오는 중…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" data-testid="dashboard-skeleton" className="flex flex-col gap-5">
      <span className="sr-only">{label}</span>
      <div className="console-panel" aria-hidden>
        <div className="console-panel-header"><Skeleton className="h-4 w-20" /></div>
        <div className="member-directory">
          {Array.from({ length: 2 }, (_, index) => (
            <div key={index} className="member-directory-link">
              <div className="flex flex-col gap-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-3 w-28" /></div>
              <Skeleton className="h-8 w-14" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6" aria-hidden>
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex min-h-28 flex-col justify-between rounded-lg border bg-card p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
      </div>
      <Skeleton className="h-[285px] w-full rounded-xl" aria-hidden />
      <div className="dashboard-workspace grid gap-5" aria-hidden>
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
          <Skeleton className="h-4 w-28" />
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
          {Array.from({ length: 7 }, (_, index) => (
            <Skeleton key={index} className="h-6 w-full" />
          ))}
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-2" aria-hidden>
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className="flex h-60 flex-col gap-3 rounded-lg border bg-card p-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="w-full flex-1" />
          </div>
        ))}
      </div>
    </div>
  );
}
