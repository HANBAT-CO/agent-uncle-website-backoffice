import { TableSkeleton } from "@/components/admin/states/TableSkeleton";
import { Skeleton } from "@/components/admin/ui/skeleton";

/** 운영 계정 while the rows load. */
export default function AdminsLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="flex flex-col gap-2" aria-hidden>
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-80" />
      </div>
      <TableSkeleton columns={["10rem", "auto", "6rem", "9rem", "9rem", "6rem", "10rem"]} rows={4} label="운영 계정을 불러오는 중…" />
    </div>
  );
}
