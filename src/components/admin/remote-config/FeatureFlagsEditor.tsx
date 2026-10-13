"use client";

import { PlusIcon, XIcon } from "@phosphor-icons/react";
import { useId, useState } from "react";

import { Button } from "@/components/admin/ui/button";
import { Input } from "@/components/admin/ui/input";
import { Label } from "@/components/admin/ui/label";
import { Switch } from "@/components/admin/ui/switch";
import type { ConfigRow } from "@/lib/admin/rpc/schemas";

import { ConfigEditorForm } from "./ConfigEditorForm";
import { featureFlagsSchema, flagKeySchema, normalizeFeatureFlags, type FeatureFlagsValue } from "./config-forms";
import { FieldError } from "./editor-fields";

/** 기능 스위치 (operator): name → on/off rows and "스위치 추가" for an English camelCase key. */
export function FeatureFlagsEditor({
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
  const [draft, setDraft] = useState<FeatureFlagsValue>(() => normalizeFeatureFlags(initial));
  const [newKey, setNewKey] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const result = featureFlagsSchema.safeParse(draft);
  const entries = Object.entries(draft);

  const add = () => {
    const key = newKey.trim();
    const parsed = flagKeySchema.safeParse(key);
    if (!parsed.success) {
      setAddError(parsed.error.issues[0]?.message ?? null);
      return;
    }
    if (key in draft) {
      setAddError("이미 있는 스위치예요.");
      return;
    }
    setDraft((current) => ({ ...current, [key]: false }));
    setNewKey("");
    setAddError(null);
  };

  const remove = (key: string) =>
    setDraft((current) => Object.fromEntries(Object.entries(current).filter(([name]) => name !== key)));

  return (
    <ConfigEditorForm row={row} draft={draft} invalid={!result.success} confirmation={null} operationId={operationId} onSaved={onSaved}>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">스위치</legend>
        {entries.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">아직 스위치가 없어요.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border bg-background/50">
            {entries.map(([name, on]) => {
              const switchId = `${id}-${name}`;
              return (
                <li key={name} className="flex items-center gap-3 px-3 py-2">
                  <Label htmlFor={switchId} className="min-w-0 flex-1 truncate font-mono text-sm">
                    {name}
                  </Label>
                  <span className="w-8 text-right text-xs text-muted-foreground" aria-hidden>
                    {on ? "켜짐" : "꺼짐"}
                  </span>
                  <Switch id={switchId} checked={on} onCheckedChange={(checked) => setDraft((current) => ({ ...current, [name]: checked }))} />
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`${name} 스위치 빼기`} onClick={() => remove(name)}>
                    <XIcon aria-hidden />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">앱은 키가 없으면 기본값을 써요.</p>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-new`} className="text-sm">
          새 스위치 이름
        </Label>
        <div className="flex gap-2">
          <Input
            id={`${id}-new`}
            value={newKey}
            placeholder="newRequest"
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => {
              setNewKey(event.target.value);
              setAddError(null);
            }}
            onKeyDown={(event) => {
              // Enter adds the switch instead of submitting the whole form.
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                add();
              }
            }}
            aria-invalid={addError ? true : undefined}
            aria-describedby={`${id}-new-hint`}
            className="h-9 flex-1 font-mono text-sm"
          />
          <Button type="button" variant="outline" size="lg" onClick={add}>
            <PlusIcon aria-hidden data-icon="inline-start" />
            스위치 추가
          </Button>
        </div>
        {addError ? (
          <FieldError id={`${id}-new-hint`} message={addError} />
        ) : (
          <p id={`${id}-new-hint`} className="text-xs text-muted-foreground">
            영문 camelCase로 적어 주세요. 새 스위치는 꺼짐으로 추가돼요.
          </p>
        )}
      </div>
    </ConfigEditorForm>
  );
}
