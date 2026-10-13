"use client";

import { useId, useState } from "react";

import { Input } from "@/components/admin/ui/input";
import { Label } from "@/components/admin/ui/label";
import { Textarea } from "@/components/admin/ui/textarea";
import type { ConfigRow } from "@/lib/admin/rpc/schemas";

import { ConfigEditorForm } from "./ConfigEditorForm";
import {
  CONFIG_MESSAGES,
  isoToKstInput,
  kstInputToIso,
  maintenanceNeedsConfirmation,
  maintenanceSchema,
  normalizeMaintenance,
  type MaintenanceValue,
} from "./config-forms";
import { Counter, FieldError, SwitchRow, issuesByPath } from "./editor-fields";

const CONFIRMATION = {
  title: "점검 모드를 켤까요?",
  description: "켜면 모든 사용자가 점검 안내만 보게 돼요. 쓰기 차단을 켜면 앱의 모든 저장이 거부돼요.",
  typed: "점검 시작",
};

/** 점검 모드 (owner): the switches, 제목, 안내 and a KST window. */
export function MaintenanceEditor({
  row,
  initial,
  operationId,
  onSaved,
}: {
  row: ConfigRow;
  initial: unknown;
  operationId: string;
  onSaved: () => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<MaintenanceValue>(() => normalizeMaintenance(initial));
  const result = maintenanceSchema.safeParse(draft);
  const errors = issuesByPath(result);
  const set = (patch: Partial<MaintenanceValue>) => setDraft((current) => ({ ...current, ...patch }));

  return (
    <ConfigEditorForm
      row={row}
      draft={draft}
      invalid={!result.success}
      confirmation={maintenanceNeedsConfirmation(row.value, draft) ? CONFIRMATION : null}
      operationId={operationId}
      onSaved={onSaved}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">점검 스위치</legend>
        <SwitchRow
          id={`${id}-enabled`}
          label="점검 모드"
          hint="켜면 앱이 점검 안내 화면을 보여 줘요."
          checked={draft.enabled}
          onCheckedChange={(enabled) => set(enabled ? { enabled } : { enabled, blockWrites: false })}
        />
        <SwitchRow
          id={`${id}-block`}
          label="쓰기 차단 (점검 중 모든 앱 쓰기 거부)"
          hint={draft.enabled ? "서버가 바로 적용해요. 앱 업데이트를 기다리지 않아요." : CONFIG_MESSAGES.blockWritesNeedsEnabled}
          checked={draft.blockWrites}
          disabled={!draft.enabled}
          onCheckedChange={(blockWrites) => set({ blockWrites })}
        />
        <FieldError id={`${id}-block-error`} message={errors.blockWrites} />
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <Label htmlFor={`${id}-title`} className="text-sm">
            제목
          </Label>
          <Counter value={draft.title} max={60} />
        </div>
        <Input
          id={`${id}-title`}
          value={draft.title}
          maxLength={60}
          onChange={(event) => set({ title: event.target.value })}
          aria-invalid={errors.title ? true : undefined}
          className="h-9 text-sm"
        />
        <FieldError id={`${id}-title-error`} message={errors.title} />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <Label htmlFor={`${id}-message`} className="text-sm">
            안내
          </Label>
          <Counter value={draft.message} max={500} />
        </div>
        <Textarea
          id={`${id}-message`}
          value={draft.message}
          rows={3}
          maxLength={500}
          onChange={(event) => set({ message: event.target.value })}
          aria-invalid={errors.message ? true : undefined}
          className="text-sm"
        />
        <p className="text-xs text-muted-foreground">쓰기 차단 중 앱의 저장이 거부되면 이 안내가 그대로 보여요.</p>
        <FieldError id={`${id}-message-error`} message={errors.message} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TimeField id={`${id}-starts`} label="시작 (한국 시간)" value={draft.startsAt} onChange={(startsAt) => set({ startsAt })} error={errors.startsAt} />
        <TimeField id={`${id}-ends`} label="종료 (한국 시간)" value={draft.endsAt} onChange={(endsAt) => set({ endsAt })} error={errors.endsAt} />
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">비워 두면 시작은 바로, 종료는 직접 끌 때까지예요.</p>
    </ConfigEditorForm>
  );
}

function TimeField({
  id,
  label,
  value,
  onChange,
  error,
}: {
  id: string;
  label: string;
  value: string | null;
  onChange: (iso: string | null) => void;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
      <Input
        id={id}
        type="datetime-local"
        value={isoToKstInput(value)}
        onChange={(event) => onChange(kstInputToIso(event.target.value))}
        aria-invalid={error ? true : undefined}
        className="num h-9 text-sm"
      />
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}
