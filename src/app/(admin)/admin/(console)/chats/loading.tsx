import { TableSkeleton } from "@/components/admin/states/TableSkeleton";
import { Skeleton } from "@/components/admin/ui/skeleton";

/** 채팅 열람 while the pairs load: the header and 8 columns of skeleton rows. */
export default function ChatsLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <div className="flex flex-col gap-2" aria-hidden>
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-96" />
      </div>
      <TableSkeleton columns={["22rem", "6rem", "8rem", "auto", "auto", "auto", "auto", "auto"]} rows={8} label="대화 목록을 불러오는 중…" />
    </div>
  );
}
