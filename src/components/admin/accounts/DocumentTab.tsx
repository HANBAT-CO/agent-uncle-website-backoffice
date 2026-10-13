"use client";

import { InfoIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { AttachmentViewer } from "@/components/admin/panels/AttachmentViewer";

import { DocumentReviewForm } from "./DocumentReviewForm";

const NTS_NOTE = "국세청 사업자 상태 조회는 아직 연결되지 않았어요. 서류 이미지를 확인한 결과만 기록돼요.";

/**
 * 서류 (screens 10.7): document metadata, "사유와 함께 열람" (ReasonDialog,
 * audited attachment.view, a 60-second signed URL), then the review form.
 * Opening the file here unlocks "확인함" for this page session.
 */
export function DocumentTab({
  accountId,
  document,
  canOpen,
  canReview,
  operationId,
  details,
  history,
}: {
  accountId: string;
  document: { id: string; mime: string | null; name: string | null } | null;
  canOpen: boolean;
  canReview: boolean;
  operationId: string;
  details: React.ReactNode;
  history: React.ReactNode;
}) {
  const [opened, setOpened] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <section aria-label="사업자등록증" className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold">사업자등록증</h3>
          {details}
          {document ? (
            <AttachmentViewer
              key={document.id}
              attachment={document}
              canOpen={canOpen}
              dialogTitle="서류를 열람할까요?"
              onOpened={(id) => setOpened(id)}
            />
          ) : (
            <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">제출된 사업자등록증이 없어요.</p>
          )}
        </section>
        {document && canReview ? (
          <DocumentReviewForm
            key={document.id}
            accountId={accountId}
            documentId={document.id}
            operationId={operationId}
            documentOpened={opened === document.id}
          />
        ) : null}
      </div>
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <InfoIcon aria-hidden weight="bold" className="mt-[0.15em] size-3.5 shrink-0" />
        {NTS_NOTE}
      </p>
      {history}
    </div>
  );
}
