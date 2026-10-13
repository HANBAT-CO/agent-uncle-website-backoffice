import { TableSkeleton } from "@/components/admin/states/TableSkeleton";
import { Skeleton } from "@/components/admin/ui/skeleton";

/** 운영 점검 loading: the header, the kind chips and the table skeleton (screens 9 states). */
export default function ChecksLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="flex flex-col gap-2" aria-hidden>
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-3 w-16" />
      </div>
      <div className="flex flex-wrap gap-2" aria-hidden>
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-8 w-28 rounded-full" />
        ))}
      </div>
      <TableSkeleton columns={["6rem", "12rem", "16rem", "auto", "9rem"]} rows={8} />
    </div>
  );
}
