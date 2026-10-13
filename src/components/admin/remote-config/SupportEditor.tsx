"use client";

import { useId, useState } from "react";

import { Input } from "@/components/admin/ui/input";
import { Label } from "@/components/admin/ui/label";
import type { ConfigRow } from "@/lib/admin/rpc/schemas";

import { ConfigEditorForm } from "./ConfigEditorForm";
import { SUPPORT_FIELDS, normalizeSupport, supportSchema, type SupportValue } from "./config-forms";
import { FieldError, issuesByPath } from "./editor-fields";

const PLACEHOLDER: Record<keyof SupportValue, string> = {
  kakaoChannel: "@사입삼춘",
  email: "help@example.com",
  phone: "02-000-0000",
  hours: "평일 10:00 ~ 18:00",
};

/** 고객센터 안내 (operator): 카카오톡 채널, 이메일, 전화, 운영 시간. */
export function SupportEditor({
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
  const [draft, setDraft] = useState<SupportValue>(() => normalizeSupport(initial));
  const result = supportSchema.safeParse(draft);
  const errors = issuesByPath(result);

  return (
    <ConfigEditorForm row={row} draft={draft} invalid={!result.success} confirmation={null} operationId={operationId} onSaved={onSaved}>
      <div className="flex flex-col gap-3">
        {SUPPORT_FIELDS.map((field) => {
          const fieldId = `${id}-${field.key}`;
          return (
            <div key={field.key} className="flex flex-col gap-1.5">
              <Label htmlFor={fieldId} className="text-sm">
                {field.label}
              </Label>
              <Input
                id={fieldId}
                value={draft[field.key]}
                maxLength={200}
                placeholder={PLACEHOLDER[field.key]}
                inputMode={field.key === "email" ? "email" : field.key === "phone" ? "tel" : undefined}
                onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}
                aria-invalid={errors[field.key] ? true : undefined}
                className="h-9 text-sm"
              />
              <FieldError id={`${fieldId}-error`} message={errors[field.key]} />
            </div>
          );
        })}
        <p className="text-xs text-muted-foreground">앱의 내 정보 화면에 그대로 보여요. 비워 둔 항목은 보이지 않아요.</p>
      </div>
    </ConfigEditorForm>
  );
}
