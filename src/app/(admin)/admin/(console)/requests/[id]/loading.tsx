import { Skeleton } from "@/components/admin/ui/skeleton";

/** Request detail loading: header, the eight ledger tiles and the timeline. */
export default function RequestLoading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-5">
      <span className="sr-only">요청을 불러오는 중…</span>
      <div className="flex flex-col gap-2" aria-hidden>
        <Skeleton className="h-7 w-80" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4" aria-hidden>
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-20 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4" aria-hidden>
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-9 rounded-lg" />
        ))}
      </div>
      <div className="flex flex-col gap-2" aria-hidden>
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-16 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
