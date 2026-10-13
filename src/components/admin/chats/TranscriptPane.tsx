"use client";

import { ChatsCircleIcon, EyeIcon, LockKeyIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import { useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";

import { openConversationAction } from "@/app/(admin)/admin/(console)/chats/actions";
import { AccountLink } from "@/components/admin/common/AccountLink";
import { ReasonDialog } from "@/components/admin/forms/ReasonDialog";
import { Button } from "@/components/admin/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/admin/ui/tooltip";
import type { AccountBrief, ChatMessage } from "@/lib/admin/rpc/schemas";

import { ChatProperties, type ChatPropertiesData } from "./ChatProperties";
import { MessageItem } from "./MessageItem";
import { CHAT_COPY, buildTimeline, mergeOlder, olderCursor } from "./transcript";

type Transcript = { messages: ChatMessage[]; hasMore: boolean };

/**
 * The thread and 속성 panes of 채팅 열람 (screens 10.13; spec D7). Operators
 * give a reason (5+ characters) in "대화를 열람할까요?"; the Server Action
 * audits it and returns the transcript straight into this component's state.
 * It is never put in a URL or a page payload, and it is dropped when the pane
 * unmounts or "대화 닫기" is pressed. Viewers get a disabled button with the
 * tooltip. Renders two grid items: the thread and the 속성 aside.
 */
export function TranscriptPane({
  left,
  right,
  canRead,
  properties,
}: {
  left: AccountBrief;
  right: AccountBrief;
  canRead: boolean;
  properties: ChatPropertiesData;
}) {
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [olderError, setOlderError] = useState<string | null>(null);
  const [loadingOlder, startOlder] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  // Where to put the scroll after a render: the bottom on first open, or the
  // same distance from the bottom after older messages were prepended.
  const pendingScroll = useRef<{ fromBottom: number } | null>(null);

  const names = useMemo(() => new Map([left, right].map((account) => [account.id, account.name?.trim() || "이름 없음"])), [left, right]);
  const timeline = useMemo(() => (transcript ? buildTimeline(transcript.messages, { left, right }) : []), [transcript, left, right]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const target = pendingScroll.current;
    if (!el || !target) return;
    el.scrollTop = el.scrollHeight - target.fromBottom;
    pendingScroll.current = null;
  }, [transcript]);

  // The transcript is personal data read for one purpose: never keep it around.
  useLayoutEffect(
    () => () => {
      setTranscript(null);
      setReason(null);
    },
    [],
  );

  const open = async (why: string): Promise<string | void> => {
    const result = await openConversationAction(left.id, right.id, why);
    if (!result.ok) return result.message;
    pendingScroll.current = { fromBottom: 0 };
    setReason(why);
    setOlderError(null);
    setTranscript({ messages: mergeOlder([], result.data.messages), hasMore: result.data.hasMore });
  };

  const loadOlder = () => {
    if (!transcript || !reason) return;
    const before = olderCursor(transcript.messages);
    if (!before) return;
    startOlder(async () => {
      const result = await openConversationAction(left.id, right.id, reason, before);
      if (!result.ok) {
        setOlderError(result.message);
        return;
      }
      const el = scrollRef.current;
      pendingScroll.current = { fromBottom: el ? el.scrollHeight - el.scrollTop : 0 };
      setOlderError(null);
      setTranscript((current) => {
        if (!current) return current;
        const merged = mergeOlder(current.messages, result.data.messages);
        // No progress means the rest shares one timestamp: stop offering more.
        return { messages: merged, hasMore: result.data.hasMore && merged.length > current.messages.length };
      });
    });
  };

  const close = () => {
    setTranscript(null);
    setReason(null);
    setOlderError(null);
  };

  return (
    <>
      <section aria-label="대화" className="flex min-h-[28rem] min-w-0 flex-col overflow-hidden rounded-xl border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
              <AccountLink account={left} />
              <span aria-hidden className="text-muted-foreground">
                ·
              </span>
              <AccountLink account={right} />
            </h2>
            <p className="text-xs text-muted-foreground">1:1 대화 · 읽기 전용</p>
          </div>
          {transcript ? (
            <Button type="button" variant="outline" size="lg" onClick={close}>
              <XIcon aria-hidden data-icon="inline-start" />
              {CHAT_COPY.closeTranscript}
            </Button>
          ) : (
            <OpenButton canRead={canRead} onConfirm={open} />
          )}
        </header>

        {transcript ? (
          <div ref={scrollRef} data-testid="chat-transcript" className="flex h-[calc(100dvh-17rem)] min-h-80 flex-col overflow-y-auto bg-background/60 px-4 py-4">
            {transcript.hasMore ? (
              <div className="flex flex-col items-center gap-1.5 pb-4">
                <Button type="button" variant="outline" size="sm" onClick={loadOlder} disabled={loadingOlder} className="bg-card">
                  {loadingOlder ? CHAT_COPY.loadingOlder : CHAT_COPY.loadOlder}
                </Button>
                {olderError ? (
                  <p role="alert" className="flex items-start gap-1.5 text-xs text-status-attention">
                    <WarningCircleIcon aria-hidden weight="bold" className="mt-[0.15em] size-3.5 shrink-0" />
                    {olderError}
                  </p>
                ) : null}
              </div>
            ) : null}
            {timeline.length === 0 ? (
              <p className="m-auto text-sm text-muted-foreground">{CHAT_COPY.empty}</p>
            ) : (
              <ol aria-label="대화 기록" className="flex flex-col gap-3">
                {timeline.map((item) =>
                  item.type === "day" ? (
                    <li key={item.key} role="separator" aria-label={item.label} className="flex items-center gap-3 py-1 text-xs text-muted-foreground">
                      <span aria-hidden className="h-px flex-1 bg-border" />
                      <span className="num">{item.label}</span>
                      <span aria-hidden className="h-px flex-1 bg-border" />
                    </li>
                  ) : (
                    <MessageItem key={item.key} entry={item} senderName={names.get(item.message.senderId ?? "") ?? "알 수 없는 계정"} reason={reason ?? ""} />
                  ),
                )}
              </ol>
            )}
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
            <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-primary">
              <ChatsCircleIcon aria-hidden weight="duotone" className="size-5" />
            </span>
            <p className="text-sm font-semibold">대화 내용은 열람 사유를 남긴 뒤에 보여요</p>
            <p className="max-w-sm text-xs text-muted-foreground">{canRead ? CHAT_COPY.dialogDescription : CHAT_COPY.viewerTooltip}</p>
          </div>
        )}
      </section>
      <ChatProperties left={left} right={right} data={properties} reason={reason} />
    </>
  );
}

function OpenButton({ canRead, onConfirm }: { canRead: boolean; onConfirm: (reason: string) => Promise<string | void> }) {
  if (!canRead) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
            <Button type="button" variant="outline" size="lg" disabled aria-disabled>
              <LockKeyIcon aria-hidden data-icon="inline-start" />
              {CHAT_COPY.openButton}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{CHAT_COPY.viewerTooltip}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <ReasonDialog
      title={CHAT_COPY.dialogTitle}
      description={CHAT_COPY.dialogDescription}
      confirmLabel="열람하기"
      pendingLabel="여는 중…"
      onConfirm={onConfirm}
      trigger={
        <Button type="button" size="lg">
          <EyeIcon aria-hidden data-icon="inline-start" />
          {CHAT_COPY.openButton}
        </Button>
      }
    />
  );
}
