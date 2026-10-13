"use client";

import { NotePencilIcon } from "@phosphor-icons/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useId, useRef } from "react";

import { CopyButton } from "@/components/admin/common/CopyButton";
import { DefinitionList } from "@/components/admin/common/DefinitionList";
import { KstTime } from "@/components/admin/common/KstTime";
import { StatusChip } from "@/components/admin/common/StatusChip";
import { useListHref } from "@/components/admin/data-table/use-list-href";
import { ActionForm, useActionForm } from "@/components/admin/forms/ActionForm";
import { NativeSelect } from "@/components/admin/forms/NativeSelect";
import { SubmitButton } from "@/components/admin/forms/SubmitButton";
import { MiniAuditList, type MiniAuditRow } from "@/components/admin/panels/MiniAuditList";
import { EmptyState } from "@/components/admin/states/EmptyState";
import { Label } from "@/components/admin/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/admin/ui/sheet";
import { Textarea } from "@/components/admin/ui/textarea";
import { setLeadStatusAction } from "@/app/(admin)/admin/(console)/leads/actions";
import { qty } from "@/lib/admin/format";
import { LEAD_ROLE_LABEL, LEAD_STATUS_LABEL } from "@/lib/admin/labels";
import { LEAD_STATUSES } from "@/lib/admin/rpc/enums";
import type { LeadRow } from "@/lib/admin/rpc/schemas";

import { LEAD_COPY, sourceSummary } from "./lead-view";
import { SuspectBadges } from "./LeadsTable";

export type StaffOption = { userId: string; displayName: string };

/**
 * Lead Sheet (screens 10.16): the full lead, then 처리 상태, 담당 and
 * "메모 남기기" for operators in one audited backoffice_set_lead_status call.
 * Viewers see the masked lead only. The form is keyed by the stored status,
 * assignee and note count, so it remounts with the saved values after the
 * revalidated page arrives.
 */
export function LeadSheet({
  lead,
  canWrite,
  operationId,
  staff,
  history,
}: {
  lead: LeadRow | null;
  canWrite: boolean;
  operationId: string;
  staff: StaffOption[];
  history: MiniAuditRow[] | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hrefWith = useListHref();
  const close = () => router.push(hrefWith({ lead: null, page: searchParams.get("page") }), { scroll: false });
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <Sheet open onOpenChange={(open) => (open ? undefined : close())}>
      <SheetContent
        ref={contentRef}
        side="right"
        className="w-full gap-0 overflow-y-auto outline-none data-[side=right]:sm:max-w-xl"
        // Focus the sheet itself: the first focusable (a time with a tooltip) would pop its tooltip open.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          contentRef.current?.focus();
        }}
      >
        {lead ? (
          <>
            <SheetHeader className="gap-2 border-b pr-14">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="text-base font-semibold">{lead.businessName || lead.name || "랜딩 문의"}</SheetTitle>
                <StatusChip label={LEAD_STATUS_LABEL[lead.status]} />
              </div>
              <SheetDescription className="text-xs">
                <KstTime iso={lead.createdAt} /> 접수 · {LEAD_ROLE_LABEL[lead.role] ?? lead.role}
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-6 p-6">
              <LeadDetails lead={lead} canWrite={canWrite} />
              {canWrite ? (
                <LeadStatusForm key={`${lead.id}:${lead.status}:${lead.assignee?.userId ?? ""}:${lead.notes}`} lead={lead} operationId={operationId} staff={staff} />
              ) : (
                <p className="rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground">처리 상태와 메모는 운영자 이상이 바꿀 수 있어요.</p>
              )}
              {history ? <MiniAuditList rows={history} /> : null}
            </div>
          </>
        ) : (
          <>
            <SheetHeader className="border-b">
              <SheetTitle className="text-base font-semibold">랜딩 문의</SheetTitle>
              <SheetDescription className="sr-only">문의를 찾을 수 없어요</SheetDescription>
            </SheetHeader>
            <div className="p-6">
              <EmptyState title="문의를 찾을 수 없어요" description="보기나 검색 조건을 바꾸면 보일 수 있어요." />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function LeadDetails({ lead, canWrite }: { lead: LeadRow; canWrite: boolean }) {
  const source = sourceSummary(lead.source, lead.utm);
  const utm = Object.entries(lead.utm ?? {});
  return (
    <DefinitionList
      columns={2}
      items={[
        { term: "역할", value: LEAD_ROLE_LABEL[lead.role] ?? lead.role },
        { term: "이름", value: lead.name },
        { term: "매장", value: lead.businessName },
        {
          term: "연락처",
          value: lead.contact ? (
            <span className="inline-flex items-center gap-1">
              <span data-testid="lead-sheet-contact" className="num">
                {lead.contact}
              </span>
              {canWrite ? <CopyButton value={lead.contact} label="연락처 복사" /> : null}
            </span>
          ) : null,
        },
        { term: "사입 시장", value: lead.market },
        {
          term: "남긴 말",
          value: canWrite ? (lead.message ? <span className="whitespace-pre-wrap">{lead.message}</span> : null) : <span className="text-muted-foreground">{LEAD_COPY.messageHidden}</span>,
        },
        { term: "의심 표시", value: <SuspectBadges source={lead.source} /> },
        {
          term: "유입",
          value: source.primary === "-" ? null : source.primary,
          hint: utm.length > 0 ? utm.map(([key, value]) => `${key} ${value}`).join(" · ") : undefined,
        },
        { term: "담당", value: lead.assignee?.displayName },
        { term: "최근 상태 변경", value: lead.statusUpdatedAt ? <KstTime iso={lead.statusUpdatedAt} /> : null },
        { term: "메모", value: qty(lead.notes, "건"), hint: lead.notes > 0 ? "남긴 메모의 내용은 이 화면에서 다시 볼 수 없어요." : undefined },
      ]}
    />
  );
}

function LeadStatusForm({ lead, operationId, staff }: { lead: LeadRow; operationId: string; staff: StaffOption[] }) {
  return (
    <section aria-label="처리 상태 변경" className="flex flex-col gap-3 rounded-xl border bg-background/50 p-4">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold">
        <NotePencilIcon aria-hidden weight="bold" className="size-4 text-muted-foreground" />
        처리
      </h2>
      <ActionForm action={setLeadStatusAction} operationId={operationId} aria-label="처리 상태 변경" className="gap-3">
        <input type="hidden" name="leadId" value={lead.id} />
        <LeadFields lead={lead} staff={staff} />
      </ActionForm>
    </section>
  );
}

function LeadFields({ lead, staff }: { lead: LeadRow; staff: StaffOption[] }) {
  const id = useId();
  const { fieldError } = useActionForm();
  const noteError = fieldError("note");
  const assigned = lead.assignee?.userId ?? "";
  const options = assigned && !staff.some((member) => member.userId === assigned) ? [...staff, { userId: assigned, displayName: lead.assignee?.displayName ?? "운영 계정" }] : staff;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-status`} className="text-sm">
            처리 상태
          </Label>
          <NativeSelect id={`${id}-status`} name="status" defaultValue={lead.status}>
            {LEAD_STATUSES.map((status) => (
              <option key={status} value={status}>
                {LEAD_STATUS_LABEL[status]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-assignee`} className="text-sm">
            담당
          </Label>
          <NativeSelect id={`${id}-assignee`} name="assigneeId" defaultValue={assigned}>
            <option value="">담당 없음</option>
            {options.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.displayName}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-note`} className="text-sm">
          메모 남기기 <span className="font-normal text-muted-foreground">(선택)</span>
        </Label>
        <Textarea
          id={`${id}-note`}
          name="note"
          rows={3}
          maxLength={4000}
          placeholder="연락한 내용과 다음 할 일을 적어 주세요."
          aria-invalid={noteError ? true : undefined}
          aria-describedby={`${id}-note-hint`}
          className="text-sm"
        />
        <p id={`${id}-note-hint`} className="text-xs text-muted-foreground">
          {noteError ?? LEAD_COPY.notesHint}
        </p>
      </div>
      <div className="flex justify-end">
        <SubmitButton>저장하기</SubmitButton>
      </div>
    </>
  );
}
