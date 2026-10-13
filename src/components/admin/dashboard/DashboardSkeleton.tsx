import { Skeleton } from "@/components/admin/ui/skeleton";

/** Dashboard loading (screens 9 states): tiles, queue, summary and chart placeholders. */
export function DashboardSkeleton({ label = "대시보드를 불러오는 중…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" data-testid="dashboard-skeleton" className="flex flex-col gap-4">
      <span className="sr-only">{label}</span>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6" aria-hidden>
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex min-h-28 flex-col justify-between rounded-lg border bg-card p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3" aria-hidden>
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 xl:col-span-2">
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
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3" aria-hidden>
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="flex h-60 flex-col gap-3 rounded-lg border bg-card p-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="w-full flex-1" />
          </div>
        ))}
      </div>
    </div>
  );
}
