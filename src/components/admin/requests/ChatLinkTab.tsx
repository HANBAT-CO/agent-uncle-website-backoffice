import { ChatsCircleIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { Button } from "@/components/admin/ui/button";
import type { RequestDossier } from "@/lib/admin/rpc/schemas";

/**
 * 관련 채팅 (screens 10.9): counts only. Message bodies stay behind the
 * audited, reason-gated transcript in 채팅 열람, opened for this pair.
 */
export function ChatLinkTab({ data }: { data: RequestDossier }) {
  const a = data.request.retailerId ?? data.retailer.id;
  const b = data.request.uncleId ?? data.uncle.id;
  const href = `/admin/chats?${new URLSearchParams({ a, b }).toString()}`;
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border bg-card px-4 py-4">
      <p data-testid="chat-counts" className="num flex items-center gap-2 text-sm">
        <ChatsCircleIcon aria-hidden weight="bold" className="size-4 text-muted-foreground" />
        업무 기록 {data.messages.system.toLocaleString("ko-KR")} · 메시지 {data.messages.user.toLocaleString("ko-KR")}
      </p>
      <Button asChild variant="outline" size="lg">
        <Link href={href}>채팅 열람으로 이동</Link>
      </Button>
    </div>
  );
}
