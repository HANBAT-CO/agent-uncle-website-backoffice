import { Skeleton } from "@/components/admin/ui/skeleton";

/** Account dossier loading: header chips, tab row and the profile list. */
export default function AccountLoading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6" aria-busy="true">
      <span className="sr-only">계정 정보를 불러오는 중…</span>
      <div className="flex flex-col gap-3" aria-hidden>
        <Skeleton className="h-7 w-56" />
        <div className="flex gap-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-6 w-24 rounded-full" />
          ))}
        </div>
      </div>
      <div className="flex gap-2" aria-hidden>
        {Array.from({ length: 7 }, (_, index) => (
          <Skeleton key={index} className="h-8 w-20" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 rounded-xl border bg-card p-5 md:grid-cols-2" aria-hidden>
        {Array.from({ length: 12 }, (_, index) => (
          <div key={index} className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-40" />
          </div>
        ))}
      </div>
    </div>
  );
}
