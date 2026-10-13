"use client";

import { useId, useState } from "react";

import { Input } from "@/components/admin/ui/input";
import { Label } from "@/components/admin/ui/label";
import { Textarea } from "@/components/admin/ui/textarea";
import type { ConfigRow } from "@/lib/admin/rpc/schemas";

import { ConfigEditorForm } from "./ConfigEditorForm";
import {
  PLATFORM_LABEL,
  PLATFORMS,
  minimumRaised,
  minVersionSchema,
  normalizeMinVersion,
  type MinVersionValue,
  type Platform,
  type PlatformVersion,
} from "./config-forms";
import { Counter, FieldError, issuesByPath } from "./editor-fields";

const CONFIRMATION = {
  title: "최소 버전을 올릴까요?",
  description: "이 버전보다 낮은 앱은 업데이트 전까지 쓸 수 없어요.",
  typed: "업데이트 강제",
};

const FIELDS = [
  { key: "minimum", label: "최소 버전", placeholder: "0.1.0" },
  { key: "recommended", label: "권장 버전", placeholder: "0.1.0" },
  { key: "storeUrl", label: "스토어 주소", placeholder: "https://" },
] as const satisfies readonly { key: keyof PlatformVersion; label: string; placeholder: string }[];

/** 최소 지원 버전 (owner): 최소 / 권장 / 스토어 주소 per platform, and 안내 문구. */
export function MinVersionEditor({
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
  const [draft, setDraft] = useState<MinVersionValue>(() => normalizeMinVersion(initial));
  const result = minVersionSchema.safeParse(draft);
  const errors = issuesByPath(result);

  const setPlatform = (platform: Platform, patch: Partial<PlatformVersion>) =>
    setDraft((current) => ({ ...current, [platform]: { ...current[platform], ...patch } }));

  return (
    <ConfigEditorForm
      row={row}
      draft={draft}
      invalid={!result.success}
      confirmation={minimumRaised(row.value, draft) ? CONFIRMATION : null}
      operationId={operationId}
      onSaved={onSaved}
    >
      <div className="flex flex-col gap-3">
        {PLATFORMS.map((platform) => (
          <fieldset key={platform} className="flex flex-col gap-2 rounded-lg border bg-background/50 p-3">
            <legend className="px-1 text-xs font-semibold text-foreground">{PLATFORM_LABEL[platform]}</legend>
            <div className="grid grid-cols-[7rem_7rem_1fr] gap-2">
              {FIELDS.map((field) => {
                const fieldId = `${id}-${platform}-${field.key}`;
                const error = errors[`${platform}.${field.key}`];
                return (
                  <div key={field.key} className="flex min-w-0 flex-col gap-1">
                    <Label htmlFor={fieldId} className="text-xs text-muted-foreground">
                      <span className="sr-only">{PLATFORM_LABEL[platform]} </span>
                      {field.label}
                    </Label>
                    <Input
                      id={fieldId}
                      value={draft[platform][field.key]}
                      placeholder={field.placeholder}
                      inputMode={field.key === "storeUrl" ? "url" : "decimal"}
                      spellCheck={false}
                      autoComplete="off"
                      onChange={(event) => setPlatform(platform, { [field.key]: event.target.value })}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? `${fieldId}-error` : undefined}
                      className="num h-9 text-sm"
                    />
                    <FieldError id={`${fieldId}-error`} message={error} />
                  </div>
                );
              })}
            </div>
          </fieldset>
        ))}
        <p className="text-xs text-muted-foreground">버전은 1.2.3 형식이에요. 최소 버전보다 낮은 앱은 업데이트 안내만 보게 돼요.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <Label htmlFor={`${id}-message`} className="text-sm">
            안내 문구
          </Label>
          <Counter value={draft.message} max={300} />
        </div>
        <Textarea
          id={`${id}-message`}
          value={draft.message}
          rows={2}
          maxLength={300}
          onChange={(event) => setDraft((current) => ({ ...current, message: event.target.value }))}
          aria-invalid={errors.message ? true : undefined}
          className="text-sm"
        />
        <FieldError id={`${id}-message-error`} message={errors.message} />
      </div>
    </ConfigEditorForm>
  );
}
