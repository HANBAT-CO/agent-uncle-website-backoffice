import { AccountLink } from "@/components/admin/common/AccountLink";
import { KstTime } from "@/components/admin/common/KstTime";
import { StatusChip } from "@/components/admin/common/StatusChip";
import { CONNECTION_DIRECTION_LABEL, CONNECTION_STATUS_LABEL } from "@/lib/admin/labels";
import type { AccountDossier } from "@/lib/admin/rpc/schemas";

/** 연결 (screens 10.7): partner, direction (보낸 요청 / 받은 요청), status, date. Read-only. */
export function ConnectionsTab({ connections }: { connections: AccountDossier["connections"] }) {
  if (connections.length === 0) {
    return <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">아직 연결한 거래처가 없어요</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full border-separate border-spacing-0 text-[0.8125rem]">
          <caption className="sr-only">연결한 거래처</caption>
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th scope="col" className="h-10 border-b px-3 font-medium">거래처</th>
              <th scope="col" className="h-10 border-b px-3 font-medium">방향</th>
              <th scope="col" className="h-10 border-b px-3 font-medium">상태</th>
              <th scope="col" className="h-10 border-b px-3 font-medium">요청 일시</th>
            </tr>
          </thead>
          <tbody>
            {connections.map((connection) => (
              <tr key={connection.id} className="h-12">
                <td className="border-b px-3">
                  <AccountLink account={connection.partner} />
                </td>
                <td className="border-b px-3">{CONNECTION_DIRECTION_LABEL[connection.direction]}</td>
                <td className="border-b px-3">
                  <StatusChip label={CONNECTION_STATUS_LABEL[connection.status ?? ""] ?? (connection.status || "-")} />
                </td>
                <td className="border-b px-3 text-muted-foreground">
                  <KstTime iso={connection.createdAt} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">연결 수락과 해제는 두 거래처만 할 수 있어요.</p>
    </div>
  );
}
