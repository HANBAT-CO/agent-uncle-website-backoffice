import { TableSkeleton } from "@/components/admin/states/TableSkeleton";
import { Skeleton } from "@/components/admin/ui/skeleton";

/** 전달·수령 loading: the header, the five view tabs and skeleton rows in the table's column widths. */
export default function DeliveriesLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <Skeleton className="h-7 w-28" aria-hidden />
      <div className="flex gap-2 border-b pb-2" aria-hidden>
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-6 w-24 rounded-full" />
        ))}
      </div>
      <TableSkeleton columns={["4rem", "7rem", "13rem", "12rem", "5rem", "5rem", "5rem", "6rem", "10rem", "5rem", "4rem"]} label="전달 회차를 불러오는 중…" />
    </div>
  );
}
