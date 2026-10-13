import { TableSkeleton } from "@/components/admin/states/TableSkeleton";
import { Skeleton } from "@/components/admin/ui/skeleton";

/** 알림·공지 while loading: the header, the banner, the tabs and skeleton rows. */
export default function NoticesLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <div className="flex flex-col gap-2" aria-hidden>
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-4 w-96" />
      </div>
      <Skeleton className="h-12 w-full rounded-xl" />
      <div className="flex gap-2" aria-hidden>
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-14" />
      </div>
      <TableSkeleton columns={["14rem", "4rem", "20rem", "4rem", "8rem", "auto"]} rows={8} label="알림·공지를 불러오는 중…" />
    </div>
  );
}
