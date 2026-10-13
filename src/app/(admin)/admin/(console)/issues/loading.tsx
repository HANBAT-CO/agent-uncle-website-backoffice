import { TableSkeleton } from "@/components/admin/states/TableSkeleton";
import { Skeleton } from "@/components/admin/ui/skeleton";

/** 문제·정정 loading: header, note, view tabs, and the three triage panes. */
export default function IssuesLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <div className="flex items-end justify-between" aria-hidden>
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-10 w-56 rounded-lg" />
      </div>
      <Skeleton className="h-8 w-full rounded-lg" aria-hidden />
      <div className="flex gap-2 border-b pb-2" aria-hidden>
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-6 w-28 rounded-full" />
        ))}
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] xl:grid-cols-[minmax(0,1fr)_17.5rem_13.5rem]">
        <TableSkeleton columns={["9rem", "6rem", "4rem", "3rem", "4rem", "8rem"]} label="문제 목록을 불러오는 중…" />
        <Skeleton className="h-80 rounded-xl" aria-hidden />
        <Skeleton className="hidden h-64 rounded-xl xl:block" aria-hidden />
      </div>
    </div>
  );
}
