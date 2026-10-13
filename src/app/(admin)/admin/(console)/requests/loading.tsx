import { TableSkeleton } from "@/components/admin/states/TableSkeleton";
import { Skeleton } from "@/components/admin/ui/skeleton";

/** 사입 요청 list loading: header, tabs, toolbar and skeleton rows matching the columns. */
export default function RequestsLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <Skeleton className="h-7 w-28" aria-hidden />
      <div className="flex gap-2 border-b pb-2" aria-hidden>
        {Array.from({ length: 10 }, (_, index) => (
          <Skeleton key={index} className="h-6 w-20 rounded-md" />
        ))}
      </div>
      <div className="flex gap-2" aria-hidden>
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-36" />
      </div>
      <TableSkeleton
        columns={["8.5rem", "6rem", "7rem", "7rem", "8rem", "10rem", "9rem", "4rem", "7rem", "11rem", "3rem"]}
        rows={10}
        label="요청 목록을 불러오는 중…"
      />
    </div>
  );
}
