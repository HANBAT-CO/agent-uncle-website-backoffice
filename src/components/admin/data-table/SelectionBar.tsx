"use client";

import { XIcon } from "@phosphor-icons/react";

import { CopyButton } from "@/components/admin/common/CopyButton";
import { Button } from "@/components/admin/ui/button";

/** "{n}건 선택" with "ID 복사" (one id per line) and "선택 해제" (screens 9). */
export function SelectionBar({ ids, onClear }: { ids: string[]; onClear: () => void }) {
  return (
    <div role="region" aria-label="선택한 행" className="flex flex-wrap items-center gap-2 rounded-lg border bg-secondary px-3 py-2 text-sm">
      <span className="num font-semibold text-secondary-foreground">{ids.length.toLocaleString("ko-KR")}건 선택</span>
      <CopyButton value={() => ids.join("\n")} label="ID 복사" copiedLabel="ID를 복사했어요" size="sm" className="bg-card" />
      <Button type="button" variant="ghost" size="sm" onClick={onClear}>
        <XIcon aria-hidden data-icon="inline-start" />
        선택 해제
      </Button>
    </div>
  );
}
