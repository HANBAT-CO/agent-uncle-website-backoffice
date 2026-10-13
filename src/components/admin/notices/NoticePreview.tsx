import { CaretRightIcon, XIcon } from "@phosphor-icons/react/dist/ssr";

import type { NoticeSeverity } from "@/lib/admin/rpc/enums";
import { cn } from "@/lib/admin/utils";

import { SeverityBadge } from "./SeverityBadge";

/**
 * 앱 미리보기 (screens 10.14): the notice as the app's Home card (product
 * brief 9.1, 9.2: canvas #EDECE3, card #F5F4EE, radius 24, Paperlogy, the
 * deep green accent). The app shows it once its RemoteConfig update ships.
 */
export function NoticePreview({
  title,
  body,
  severity,
  linkUrl,
  dismissible,
  audienceLabel,
}: {
  title: string;
  body: string;
  severity: NoticeSeverity;
  linkUrl: string;
  dismissible: boolean;
  audienceLabel: string;
}) {
  return (
    <figure aria-label="앱 미리보기" className="flex flex-col gap-2">
      <figcaption className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium text-foreground">앱 미리보기</span>
        <span>{audienceLabel} 홈 화면</span>
      </figcaption>
      <div className="rounded-[2rem] border bg-background p-3 shadow-sm">
        <div className="mb-3 flex items-center justify-between px-2 pt-1 text-[0.6875rem] font-semibold text-foreground">
          <span>사입삼춘</span>
          <span className="num text-muted-foreground">홈</span>
        </div>
        <div
          className={cn(
            "flex flex-col gap-2 rounded-[1.5rem] border border-white/80 bg-card p-4 shadow-[0_8px_24px_rgb(16_16_16/0.08)]",
            severity === "critical" && "border-status-attention/30",
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <SeverityBadge severity={severity} />
            {dismissible ? (
              <span aria-label="닫기" role="img" className="flex size-6 items-center justify-center rounded-full text-muted-foreground">
                <XIcon aria-hidden weight="bold" className="size-3.5" />
              </span>
            ) : null}
          </div>
          <p className={cn("text-[1.0625rem] leading-snug font-bold break-words text-foreground", !title.trim() && "text-muted-foreground")}>
            {title.trim() || "공지 제목"}
          </p>
          <p className={cn("text-[0.8125rem] leading-relaxed break-words whitespace-pre-wrap text-status-neutral", !body.trim() && "text-muted-foreground")}>
            {body.trim() || "공지 내용이 여기에 보여요."}
          </p>
          {linkUrl.trim() ? (
            <span className="mt-1 inline-flex items-center gap-0.5 self-start rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground">
              자세히 보기
              <CaretRightIcon aria-hidden weight="bold" className="size-3" />
            </span>
          ) : null}
        </div>
        <div aria-hidden className="mt-3 flex flex-col gap-2 px-1 pb-1">
          <div className="h-14 rounded-[1.25rem] bg-card/70" />
          <div className="h-10 rounded-[1.25rem] bg-card/50" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{dismissible ? "사용자가 닫으면 내용이 바뀔 때까지 다시 보이지 않아요." : "사용자가 닫을 수 없는 공지예요."}</p>
    </figure>
  );
}
