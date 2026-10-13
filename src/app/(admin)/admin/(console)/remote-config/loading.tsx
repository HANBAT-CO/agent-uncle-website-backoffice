import { TableSkeleton } from "@/components/admin/states/TableSkeleton";
import { Skeleton } from "@/components/admin/ui/skeleton";

/** 원격 설정 while the keys load. */
export default function RemoteConfigLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="flex flex-col gap-2" aria-hidden>
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-80" />
      </div>
      <Skeleton className="h-10 w-full" aria-hidden />
      <TableSkeleton columns={["12rem", "auto", "6.5rem", "6rem", "13rem", "4.5rem"]} rows={4} label="설정을 불러오는 중…" />
    </div>
  );
}
