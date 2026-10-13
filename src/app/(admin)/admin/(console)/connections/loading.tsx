import { TableSkeleton } from "@/components/admin/states/TableSkeleton";
import { Skeleton } from "@/components/admin/ui/skeleton";

/** 거래처 연결 loading: header, banner, view tabs and rows matching the columns. */
export default function ConnectionsLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <div className="flex flex-col gap-2" aria-hidden>
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-9 w-full" aria-hidden />
      <div className="flex gap-2" aria-hidden>
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-8 w-28" />
        ))}
      </div>
      <TableSkeleton columns={["26rem", "8rem", "9rem", "7rem"]} rows={8} label="연결 목록을 불러오는 중…" />
    </div>
  );
}
