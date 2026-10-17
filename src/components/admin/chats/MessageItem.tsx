"use client";

import { ArrowClockwiseIcon, CaretRightIcon, ImageIcon, WarningCircleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { Button } from "@/components/admin/ui/button";
import { openAttachmentAction, type OpenAttachmentResult } from "@/lib/admin/shared-actions";
import { cn } from "@/lib/admin/utils";

import { CHAT_COPY, type TimelineItem } from "./transcript";

type MessageEntry = Extract<TimelineItem, { type: "message" }>;
type Opened = Extract<OpenAttachmentResult, { ok: true }> & { id: string };

/**
 * One transcript entry, as in the app (screens 10.13, product brief 4.12):
 * - 업무 기록: a card with "업무 기록 · 21:02", the action title and the request link;
 * - messages: bubbles, the 사입삼촌 on the right in deep green, the retailer on
 *   the left in grey, with "21:02 · 읽음" / "안 읽음" under them.
 * Bodies are plain text (masked by the SQL); never rendered as HTML.
 */
export function MessageItem({ entry, senderName, reason }: { entry: MessageEntry; senderName: string; reason: string }) {
  const { message } = entry;
  if (entry.side === "card") {
    return (
      <li data-kind="system" className="flex justify-center">
        <div className="flex w-full max-w-xl items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="num text-xs text-muted-foreground">
              {CHAT_COPY.systemLabel} · {entry.time}{message.editedAt && !message.deleted ? " · 수정됨" : ""} · {senderName}
            </p>
            <p className="text-sm font-semibold break-words whitespace-pre-wrap text-foreground">{message.body || "-"}</p>
          </div>
          {message.invoiceId && !message.deleted ? <Link className="text-xs text-primary underline" href={`/admin/billing/${encodeURIComponent(message.invoiceId)}`}>관련 청구서 열기</Link> : null}
      {message.requestId ? (
            <Link
              href={`/admin/requests/${encodeURIComponent(message.requestId)}`}
              scroll={false}
              className="inline-flex shrink-0 items-center gap-0.5 rounded-md text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              관련 요청 열기
              <CaretRightIcon aria-hidden weight="bold" className="size-3" />
            </Link>
          ) : null}
        </div>
      </li>
    );
  }

  const end = entry.side === "end";
  const attachments = message.deleted ? [] : (message.attachments ?? []).filter(Boolean);
  return (
    <li data-kind="message" className={cn("flex flex-col gap-1", end ? "items-end" : "items-start")}>
      {entry.showSender ? <span className="px-1 text-xs font-medium text-muted-foreground">{senderName}</span> : null}
      <div
        className={cn(
          "max-w-[min(32rem,80%)] rounded-2xl px-3.5 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap",
          end ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted text-foreground",
        )}
      >
        {message.deleted ? "삭제된 메시지" : message.body ? message.body : attachments.length > 0 ? "사진" : "-"}
      </div>
      {attachments.length > 0 ? <ChatAttachments ids={attachments} reason={reason} alignEnd={end} /> : null}
      <span className="num px-1 text-[0.6875rem] text-muted-foreground">
        {entry.time}{message.editedAt && !message.deleted ? " · 수정됨" : ""} · {message.read ? "읽음" : "안 읽음"}
      </span>
      {message.invoiceId && !message.deleted ? <Link className="text-xs text-primary underline" href={`/admin/billing/${encodeURIComponent(message.invoiceId)}`}>관련 청구서 열기</Link> : null}
      {message.requestId ? (
        <Link
          href={`/admin/requests/${encodeURIComponent(message.requestId)}`}
          scroll={false}
          className="px-1 text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          관련 요청 열기
        </Link>
      ) : null}
    </li>
  );
}

/**
 * Photos in a message open through backoffice_attachment_access with the
 * reason already given for the transcript (one audited attachment.view per
 * file), then a 60-second signed URL kept in client state only.
 */
function ChatAttachments({ ids, reason, alignEnd }: { ids: string[]; reason: string; alignEnd: boolean }) {
  const [opened, setOpened] = useState<Opened[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const open = () =>
    startTransition(async () => {
      const results: Opened[] = [];
      for (const id of ids) {
        const result = await openAttachmentAction(id, reason);
        if (!result.ok) {
          setError(result.message);
          setOpened(results);
          return;
        }
        results.push({ ...result, id });
      }
      setError(null);
      setOpened(results);
    });

  return (
    <div className={cn("flex max-w-[min(32rem,80%)] flex-col gap-2", alignEnd ? "items-end" : "items-start")}>
      {opened.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {opened.map((file) => (
            // eslint-disable-next-line @next/next/no-img-element -- a 60-second signed URL: never through the image optimizer
            <img
              key={file.id}
              src={file.url}
              alt={file.name ?? "채팅 사진"}
              referrerPolicy="no-referrer"
              className="max-h-56 w-auto rounded-xl border bg-card object-contain"
            />
          ))}
        </div>
      ) : null}
      <Button type="button" variant="outline" size="sm" onClick={open} disabled={pending} className="bg-card">
        {opened.length > 0 ? <ArrowClockwiseIcon aria-hidden data-icon="inline-start" /> : <ImageIcon aria-hidden data-icon="inline-start" />}
        {pending ? "여는 중…" : opened.length > 0 ? "다시 열기" : `사진 ${ids.length}장 보기`}
      </Button>
      {opened.length > 0 ? <span className="text-[0.6875rem] text-muted-foreground">링크는 60초 동안만 열려요</span> : null}
      {error ? (
        <p role="alert" className="flex items-start gap-1.5 text-xs text-status-attention">
          <WarningCircleIcon aria-hidden weight="bold" className="mt-[0.15em] size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
