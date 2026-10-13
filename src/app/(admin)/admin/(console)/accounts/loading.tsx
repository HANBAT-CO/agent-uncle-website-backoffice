import { TableSkeleton } from "@/components/admin/states/TableSkeleton";
import { Skeleton } from "@/components/admin/ui/skeleton";

/** 계정·가입 loading (screens 9): the header, the facet rail and rows matching the columns. */
export default function AccountsLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <div className="flex flex-col gap-2" aria-hidden>
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid grid-cols-1 items-start gap-4 min-[90rem]:grid-cols-[11rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-2 rounded-xl border bg-card p-3" aria-hidden>
          {Array.from({ length: 12 }, (_, index) => (
            <Skeleton key={index} className="h-6 w-full" />
          ))}
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex gap-2" aria-hidden>
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-8 w-24" />
            ))}
          </div>
          <Skeleton className="h-9 w-full max-w-sm" aria-hidden />
          <TableSkeleton columns={["13rem", "6rem", "8rem", "9.5rem", "5rem", "4rem", "6rem", "6rem", "7.5rem", "7.5rem"]} rows={10} label="계정 목록을 불러오는 중…" />
        </div>
      </div>
    </div>
  );
}
