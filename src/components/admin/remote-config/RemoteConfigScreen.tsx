"use client";

import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/admin/ui/sheet";
import { formatKst } from "@/lib/admin/format";
import { CONFIG_KEY_LABEL } from "@/lib/admin/labels";
import { hasRole, type AdminRole } from "@/lib/admin/roles";
import type { AuditRow, ConfigRow } from "@/lib/admin/rpc/schemas";

import { ConfigHistory, historyValues } from "./ConfigHistory";
import { ConfigTable } from "./ConfigTable";
import { FeatureFlagsEditor } from "./FeatureFlagsEditor";
import { MaintenanceEditor } from "./MaintenanceEditor";
import { MinVersionEditor } from "./MinVersionEditor";
import { SupportEditor } from "./SupportEditor";
import { isKnownConfigKey, type KnownConfigKey } from "./config-forms";

const SHEET_DESCRIPTION: Record<KnownConfigKey, string> = {
  maintenance: "켜면 앱이 점검 안내를 보여 줘요. 쓰기 차단은 서버에서 바로 적용돼요.",
  min_app_version: "이 버전보다 낮은 앱은 업데이트 안내를 보게 돼요.",
  feature_flags: "앱 기능을 켜거나 꺼요.",
  support: "앱의 내 정보 화면에 보이는 고객센터 안내예요.",
};

const EDITORS = {
  maintenance: MaintenanceEditor,
  min_app_version: MinVersionEditor,
  feature_flags: FeatureFlagsEditor,
  support: SupportEditor,
} as const;

const PAGE_HISTORY = 20;
const SHEET_HISTORY = 10;

type Editing = { key: KnownConfigKey; prefill: AuditRow | null; nonce: number };

/** Owner keys need the owner; operator keys need an operator (viewers never write). */
export function canEditConfig(role: AdminRole, row: Pick<ConfigRow, "writeRole">): boolean {
  return hasRole(role, "operator") && hasRole(role, row.writeRole);
}

/**
 * 원격 설정 (screens 10.15): the key table, one editor Sheet per key with
 * its own 변경 기록, and the page-wide 변경 기록. "되돌리기" reopens the
 * editor prefilled with the value before that change; nothing saves until
 * the operator writes a 사유 and saves.
 */
export function RemoteConfigScreen({
  rows,
  history,
  historyError,
  role,
  operationId,
}: {
  rows: ConfigRow[];
  /** null for viewers: list_audit needs an operator. */
  history: AuditRow[] | null;
  historyError: string | null;
  role: AdminRole;
  operationId: string;
}) {
  const [editing, setEditing] = useState<Editing | null>(null);

  const open = (key: string, prefill: AuditRow | null) => {
    if (!isKnownConfigKey(key)) return;
    // A new nonce remounts the editor, so a 되돌리기 always starts from its own value.
    setEditing((previous) => ({ key, prefill, nonce: (previous?.nonce ?? 0) + 1 }));
  };

  const rowFor = (key: string) => rows.find((row) => row.key === key) ?? null;
  const canRevert = (key: string) => {
    const row = rowFor(key);
    return Boolean(row && isKnownConfigKey(key) && canEditConfig(role, row));
  };

  const current = editing ? rowFor(editing.key) : null;
  const Editor = editing ? EDITORS[editing.key] : null;
  const keyHistory = editing && history ? history.filter((entry) => entry.targetId === editing.key).slice(0, SHEET_HISTORY) : null;

  return (
    <>
      <ConfigTable
        rows={rows}
        showActions={hasRole(role, "operator")}
        canEdit={(row) => canEditConfig(role, row)}
        onEdit={(row) => open(row.key, null)}
      />

      <section aria-labelledby="config-history" className="flex flex-col gap-3">
        <h2 id="config-history" className="text-sm font-semibold text-foreground">
          변경 기록
        </h2>
        {history === null ? (
          <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
            {historyError ?? "변경 기록은 운영자 이상만 볼 수 있어요."}
          </p>
        ) : (
          <ConfigHistory
            entries={history.slice(0, PAGE_HISTORY)}
            showKey
            canRevert={canRevert}
            onRevert={(entry) => open(entry.targetId, entry)}
          />
        )}
      </section>

      <Sheet open={editing !== null && current !== null} onOpenChange={(next) => (next ? undefined : setEditing(null))}>
        <SheetContent side="right" className="w-full gap-0 data-[side=right]:sm:max-w-xl">
          {editing && current && Editor ? (
            <>
              <SheetHeader className="border-b pb-4">
                <SheetTitle className="text-base">{CONFIG_KEY_LABEL[editing.key]}</SheetTitle>
                <SheetDescription className="text-sm">{SHEET_DESCRIPTION[editing.key]}</SheetDescription>
              </SheetHeader>
              <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
                {editing.prefill ? <RevertNotice entry={editing.prefill} /> : null}
                <Editor
                  key={editing.nonce}
                  row={current}
                  initial={editing.prefill ? historyValues(editing.prefill).before : current.value}
                  operationId={operationId}
                  onSaved={() => setEditing(null)}
                />
                {keyHistory ? (
                  <section aria-labelledby="config-key-history" className="flex flex-col gap-2 border-t pt-5">
                    <h3 id="config-key-history" className="text-xs font-semibold text-foreground">
                      이 항목의 변경 기록
                    </h3>
                    <ConfigHistory entries={keyHistory} canRevert={canRevert} onRevert={(entry) => open(entry.targetId, entry)} />
                  </section>
                ) : null}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

function RevertNotice({ entry }: { entry: AuditRow }) {
  return (
    <p role="status" className="flex items-start gap-2 rounded-md bg-secondary px-3 py-2.5 text-sm/relaxed text-secondary-foreground">
      <ArrowCounterClockwiseIcon aria-hidden weight="bold" className="mt-[0.2em] size-4 shrink-0" />
      <span>
        {formatKst(entry.at)} 변경 전 값을 불러왔어요. 저장하기 전에는 바뀌지 않아요. 확인한 뒤 사유를 적고 저장해 주세요.
      </span>
    </p>
  );
}
