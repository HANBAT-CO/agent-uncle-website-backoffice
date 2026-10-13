import { TableSkeleton } from "@/components/admin/states/TableSkeleton";
import { Skeleton } from "@/components/admin/ui/skeleton";

/** 랜딩 문의 while loading: the header, the views and skeleton rows. */
export default function LeadsLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <div className="flex flex-col gap-2" aria-hidden>
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="flex gap-2" aria-hidden>
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-8 w-20" />
        ))}
      </div>
      <TableSkeleton columns={["7rem", "5rem", "12rem", "8rem", "5rem", "auto", "6rem", "6rem", "5rem", "4rem"]} rows={8} label="랜딩 문의를 불러오는 중…" />
    </div>
  );
}
