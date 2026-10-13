"use client";

import { ArrowClockwiseIcon, EyeIcon, FileIcon, LockKeyIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useState, useTransition } from "react";

import { ReasonDialog } from "@/components/admin/forms/ReasonDialog";
import { Button } from "@/components/admin/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/admin/ui/tooltip";
import { openAttachmentAction, type OpenAttachmentResult } from "@/lib/admin/shared-actions";
import { cn } from "@/lib/admin/utils";

type Opened = Extract<OpenAttachmentResult, { ok: true }>;

/**
 * Audited file preview (spec 7, screens 10.7 서류, 10.9 첨부 사진):
 * "사유와 함께 열람" asks for a reason, the server writes the attachment.view
 * audit row and signs the object for 60 seconds. The URL lives only in client
 * state, renders with no referrer, and "다시 열기" signs again with the same
 * reason. Viewers see a disabled button.
 */
export function AttachmentViewer({
  attachment,
  canOpen,
  defaultReason = "",
  dialogTitle = "파일을 열람할까요?",
  onOpened,
  className,
}: {
  attachment: { id: string; mime?: string | null; name?: string | null };
  canOpen: boolean;
  defaultReason?: string;
  dialogTitle?: string;
  onOpened?: (attachmentId: string) => void;
  className?: string;
}) {
  const [opened, setOpened] = useState<Opened | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const open = async (why: string): Promise<string | void> => {
    const result = await openAttachmentAction(attachment.id, why);
    if (!result.ok) return result.message;
    setReason(why);
    setError(null);
    setOpened(result);
    onOpened?.(attachment.id);
  };

  const reopen = () => {
    if (!reason) return;
    startTransition(async () => {
      const failure = await open(reason);
      if (failure) setError(failure);
    });
  };

  if (!canOpen) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className={cn("inline-flex w-fit", className)}>
            <Button type="button" variant="outline" size="lg" disabled aria-disabled>
              <LockKeyIcon aria-hidden data-icon="inline-start" />
              사유와 함께 열람
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>운영자 이상만 파일을 열람할 수 있어요.</TooltipContent>
      </Tooltip>
    );
  }

  const isPdf = (opened?.mime ?? attachment.mime ?? "").includes("pdf");
  const label = opened?.name ?? attachment.name ?? "첨부파일";

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {opened ? (
        <>
          <div className="overflow-hidden rounded-md border bg-muted/40">
            {isPdf ? (
              <iframe src={opened.url} title={label} referrerPolicy="no-referrer" className="h-[70vh] w-full bg-card" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- a 60-second signed URL: never through the image optimizer
              <img src={opened.url} alt={label} referrerPolicy="no-referrer" className="mx-auto max-h-[70vh] w-auto object-contain" />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <FileIcon aria-hidden className="size-3.5" />
              링크는 60초 동안만 열려요
            </span>
            <Button type="button" variant="outline" size="sm" onClick={reopen} disabled={pending}>
              <ArrowClockwiseIcon aria-hidden data-icon="inline-start" />
              {pending ? "여는 중…" : "다시 열기"}
            </Button>
          </div>
          {error ? (
            <p role="alert" className="flex items-start gap-1.5 text-sm text-status-attention">
              <WarningCircleIcon aria-hidden weight="bold" className="mt-[0.2em] size-4 shrink-0" />
              {error}
            </p>
          ) : null}
        </>
      ) : (
        <ReasonDialog
          title={dialogTitle}
          defaultReason={defaultReason}
          confirmLabel="열람하기"
          onConfirm={open}
          trigger={
            <Button type="button" variant="outline" size="lg" className="w-fit">
              <EyeIcon aria-hidden data-icon="inline-start" />
              사유와 함께 열람
            </Button>
          }
        />
      )}
    </div>
  );
}
