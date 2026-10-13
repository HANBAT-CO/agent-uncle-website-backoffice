"use client";

import { ArrowClockwiseIcon, EyeIcon, ImageIcon, LockKeyIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useState, useTransition } from "react";

import { ReasonDialog } from "@/components/admin/forms/ReasonDialog";
import { Button } from "@/components/admin/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/admin/ui/tooltip";
import { bytes } from "@/lib/admin/format";
import { openAttachmentAction, type OpenAttachmentResult } from "@/lib/admin/shared-actions";

type Photo = { id: string; name?: string | null; mime?: string | null; size: number };
type Opened = Extract<OpenAttachmentResult, { ok: true }>;

const DEFAULT_REASON = "요청 사진 확인";

/**
 * 첨부 사진 (screens 10.9, spec 7): thumbnails stay locked until an operator
 * gives a reason. One reason opens every photo of the request: each file is
 * audited (attachment.view) and signed for 60 seconds, and the URLs live only
 * in this component's state, rendered without a referrer.
 */
export function PhotosTab({ photos, canOpen }: { photos: Photo[]; canOpen: boolean }) {
  const [opened, setOpened] = useState<Record<string, Opened>>({});
  const [reason, setReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (photos.length === 0) {
    return <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">첨부한 사진이 없어요</p>;
  }

  const openAll = async (why: string): Promise<string | void> => {
    const results = await Promise.all(photos.map((photo) => openAttachmentAction(photo.id, why)));
    const next: Record<string, Opened> = {};
    let failure: string | null = null;
    results.forEach((result, index) => {
      if (result.ok) next[photos[index].id] = result;
      else failure ??= result.message;
    });
    if (Object.keys(next).length === 0) return failure ?? "파일을 열지 못했어요. 잠시 후 다시 시도해 주세요.";
    setReason(why);
    setOpened(next);
    setError(failure);
  };

  const reopen = () => {
    if (!reason) return;
    startTransition(async () => {
      const failure = await openAll(reason);
      if (failure) setError(failure);
    });
  };

  const isOpen = Object.keys(opened).length > 0;

  return (
    <div className="flex flex-col gap-3">
      <ul data-testid="request-photos" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((photo, index) => {
          const file = opened[photo.id];
          const label = file?.name ?? photo.name ?? `요청 사진 ${index + 1}`;
          return (
            <li key={photo.id} className="flex flex-col gap-1.5">
              <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border bg-muted/60">
                {file ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a 60-second signed URL: never through the image optimizer
                  <img src={file.url} alt={label} referrerPolicy="no-referrer" className="size-full object-cover" />
                ) : (
                  <ImageIcon aria-hidden weight="duotone" className="size-8 text-muted-foreground" />
                )}
              </div>
              <p className="num truncate text-xs text-muted-foreground">
                {photo.name ? `${photo.name} · ` : ""}
                {bytes(photo.size)}
              </p>
            </li>
          );
        })}
      </ul>

      {!canOpen ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="inline-flex w-fit">
              <Button type="button" variant="outline" size="lg" disabled aria-disabled>
                <LockKeyIcon aria-hidden data-icon="inline-start" />
                사유와 함께 열람
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>운영자 이상만 파일을 열람할 수 있어요.</TooltipContent>
        </Tooltip>
      ) : isOpen ? (
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>링크는 60초 동안만 열려요</span>
          <Button type="button" variant="outline" size="sm" onClick={reopen} disabled={pending}>
            <ArrowClockwiseIcon aria-hidden data-icon="inline-start" />
            {pending ? "여는 중…" : "다시 열기"}
          </Button>
        </div>
      ) : (
        <ReasonDialog
          title="요청 사진을 열람할까요?"
          defaultReason={DEFAULT_REASON}
          confirmLabel="열람하기"
          onConfirm={openAll}
          trigger={
            <Button type="button" variant="outline" size="lg" className="w-fit">
              <EyeIcon aria-hidden data-icon="inline-start" />
              사유와 함께 열람
            </Button>
          }
        />
      )}
      {error ? (
        <p role="alert" className="flex items-start gap-1.5 text-sm text-status-attention">
          <WarningCircleIcon aria-hidden weight="bold" className="mt-[0.2em] size-4 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
