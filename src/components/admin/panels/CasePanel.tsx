"use client";

import { FolderOpenIcon } from "@phosphor-icons/react";
import { usePathname } from "next/navigation";
import { useId } from "react";

import { KstTime } from "@/components/admin/common/KstTime";
import { StatusChip } from "@/components/admin/common/StatusChip";
import { ActionForm, useActionForm } from "@/components/admin/forms/ActionForm";
import { NativeSelect } from "@/components/admin/forms/NativeSelect";
import { SubmitButton } from "@/components/admin/forms/SubmitButton";
import { Input } from "@/components/admin/ui/input";
import { Label } from "@/components/admin/ui/label";
import { Textarea } from "@/components/admin/ui/textarea";
import { CASE_SEVERITY_LABEL, CASE_STATUS_LABEL } from "@/lib/admin/labels";
import { CASE_SEVERITIES, CASE_STATUSES, OPEN_CASE_STATUSES, type CaseTarget } from "@/lib/admin/rpc/enums";
import type { Case } from "@/lib/admin/rpc/schemas";
import { openCaseAction, updateCaseAction } from "@/lib/admin/shared-actions";

export type CaseAssignee = { userId: string; displayName: string };

const isOpen = (c: Case) => (OPEN_CASE_STATUSES as readonly string[]).includes(c.status);

/**
 * 케이스 (spec D6): one open case per record, versioned. Closing a case never
 * changes the in-app issue or proposal. `assignees` are active operators and
 * owners; the form field is "담당 운영자".
 */
export function CasePanel({
  targetType,
  targetId,
  cases,
  assignees,
  canWrite,
  operationId,
}: {
  targetType: CaseTarget;
  targetId: string;
  cases: Case[];
  assignees: CaseAssignee[];
  canWrite: boolean;
  operationId: string;
}) {
  const open = cases.find(isOpen) ?? null;
  const closed = cases.filter((c) => !isOpen(c));
  const names = Object.fromEntries(assignees.map((a) => [a.userId, a.displayName]));

  return (
    <section aria-label="케이스" className="flex flex-col gap-4">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold">
        <FolderOpenIcon aria-hidden weight="bold" className="size-4 text-muted-foreground" />
        케이스
      </h2>
      {open ? (
        <div className="flex flex-col gap-3 rounded-md border bg-card p-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{open.title}</p>
            <StatusChip label={CASE_STATUS_LABEL[open.status]} />
            <span className="text-xs text-muted-foreground">중요도 {CASE_SEVERITY_LABEL[open.severity]}</span>
          </div>
          <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            <span>담당 운영자 {open.assigneeId ? (names[open.assigneeId] ?? "운영 계정") : "지정 안 함"}</span>
            <span>
              열린 시각 <KstTime iso={open.createdAt} />
            </span>
            <span className="num">v{open.version}</span>
          </p>
          {canWrite ? <UpdateCaseForm current={open} assignees={assignees} operationId={operationId} /> : null}
        </div>
      ) : canWrite ? (
        <OpenCaseForm targetType={targetType} targetId={targetId} assignees={assignees} operationId={operationId} />
      ) : (
        <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">진행 중인 케이스가 없어요</p>
      )}
      {closed.length > 0 ? (
        <ol className="flex flex-col divide-y rounded-md border bg-card text-sm">
          {closed.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <StatusChip label={CASE_STATUS_LABEL[c.status]} />
              <span className="min-w-0 flex-1 truncate">{c.title}</span>
              <KstTime iso={c.resolvedAt ?? c.updatedAt} className="text-xs text-muted-foreground" />
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function AssigneeSelect({ id, assignees, defaultValue }: { id: string; assignees: CaseAssignee[]; defaultValue?: string }) {
  return (
    <NativeSelect id={id} name="assigneeId" defaultValue={defaultValue ?? ""}>
      <option value="">지정 안 함</option>
      {assignees.map((a) => (
        <option key={a.userId} value={a.userId}>
          {a.displayName}
        </option>
      ))}
    </NativeSelect>
  );
}

function OpenCaseForm({
  targetType,
  targetId,
  assignees,
  operationId,
}: {
  targetType: CaseTarget;
  targetId: string;
  assignees: CaseAssignee[];
  operationId: string;
}) {
  const pathname = usePathname();
  return (
    <ActionForm action={openCaseAction} operationId={operationId} aria-label="케이스 열기" className="gap-3 rounded-md border bg-card p-3">
      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="targetId" value={targetId} />
      <input type="hidden" name="path" value={pathname} />
      <OpenCaseFields assignees={assignees} />
    </ActionForm>
  );
}

function OpenCaseFields({ assignees }: { assignees: CaseAssignee[] }) {
  const id = useId();
  const { fieldError } = useActionForm();
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-title`} className="text-sm">
          케이스 제목
        </Label>
        <Input
          id={`${id}-title`}
          name="title"
          required
          maxLength={120}
          aria-invalid={fieldError("title") ? true : undefined}
          className="h-9 text-sm"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-severity`} className="text-sm">
            중요도
          </Label>
          <NativeSelect id={`${id}-severity`} name="severity" defaultValue="normal">
            {CASE_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {CASE_SEVERITY_LABEL[s]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-assignee`} className="text-sm">
            담당 운영자
          </Label>
          <AssigneeSelect id={`${id}-assignee`} assignees={assignees} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-note`} className="text-sm">
          메모
        </Label>
        <Textarea id={`${id}-note`} name="note" maxLength={4000} rows={2} className="text-sm" />
      </div>
      <SubmitButton className="self-end">케이스 열기</SubmitButton>
    </>
  );
}

function UpdateCaseForm({ current, assignees, operationId }: { current: Case; assignees: CaseAssignee[]; operationId: string }) {
  const pathname = usePathname();
  return (
    // key: a new version re-mounts the form with the saved values as defaults.
    <ActionForm key={`${current.id}-${current.version}`} action={updateCaseAction} operationId={operationId} aria-label="케이스 변경" className="gap-3">
      <input type="hidden" name="caseId" value={current.id} />
      <input type="hidden" name="version" value={current.version} />
      <input type="hidden" name="path" value={pathname} />
      <UpdateCaseFields current={current} assignees={assignees} />
    </ActionForm>
  );
}

function UpdateCaseFields({ current, assignees }: { current: Case; assignees: CaseAssignee[] }) {
  const id = useId();
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-status`} className="text-sm">
            상태
          </Label>
          <NativeSelect id={`${id}-status`} name="status" defaultValue={current.status}>
            {CASE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CASE_STATUS_LABEL[s]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-severity`} className="text-sm">
            중요도
          </Label>
          <NativeSelect id={`${id}-severity`} name="severity" defaultValue={current.severity}>
            {CASE_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {CASE_SEVERITY_LABEL[s]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-assignee`} className="text-sm">
            담당 운영자
          </Label>
          <AssigneeSelect id={`${id}-assignee`} assignees={assignees} defaultValue={current.assigneeId ?? ""} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-note`} className="text-sm">
          메모
        </Label>
        <Textarea id={`${id}-note`} name="note" maxLength={4000} rows={2} className="text-sm" />
      </div>
      <SubmitButton className="self-end">케이스 변경</SubmitButton>
    </>
  );
}
