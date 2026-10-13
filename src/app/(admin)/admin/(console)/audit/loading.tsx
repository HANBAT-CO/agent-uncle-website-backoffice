import { TableSkeleton } from "@/components/admin/states/TableSkeleton";
import { Skeleton } from "@/components/admin/ui/skeleton";

/** 감사 로그 while the rows load. */
export default function AuditLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="flex flex-col gap-2" aria-hidden>
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-4 w-80" />
      </div>
      <Skeleton className="h-10 w-64" aria-hidden />
      <TableSkeleton columns={["8rem", "8rem", "8rem", "auto", "10rem", "auto", "9rem"]} rows={10} label="감사 기록을 불러오는 중…" />
    </div>
  );
}
