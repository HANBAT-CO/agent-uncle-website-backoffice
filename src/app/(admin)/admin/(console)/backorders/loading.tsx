import { TableSkeleton } from "@/components/admin/states/TableSkeleton";
import { Skeleton } from "@/components/admin/ui/skeleton";

/** 미송 재확인 loading: header, note, chart card, view tabs and table rows in the column widths. */
export default function BackordersLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <Skeleton className="h-7 w-32" aria-hidden />
      <Skeleton className="h-8 w-full rounded-lg" aria-hidden />
      <Skeleton className="h-52 w-full rounded-xl" aria-hidden />
      <div className="flex gap-2 border-b pb-2" aria-hidden>
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-6 w-24 rounded-full" />
        ))}
      </div>
      <TableSkeleton columns={["9rem", "5rem", "7rem", "8rem", "7rem", "11rem", "14rem", "9rem"]} label="미송 목록을 불러오는 중…" />
    </div>
  );
}
