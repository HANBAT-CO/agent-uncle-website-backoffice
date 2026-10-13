"use client";

import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react";

import { KstTime } from "@/components/admin/common/KstTime";
import { Button } from "@/components/admin/ui/button";
import { CONFIG_KEY_LABEL } from "@/lib/admin/labels";
import { ROLE_LABEL, isAdminRole } from "@/lib/admin/roles";
import type { AuditRow } from "@/lib/admin/rpc/schemas";
import { cn } from "@/lib/admin/utils";

import { ConfigDiff } from "./ConfigDiff";
import { configDiff } from "./config-forms";

/** The stored before / after of a config.set audit row ({ value, isPublic, version }). */
export function historyValues(entry: AuditRow): { before: unknown; after: unknown; fromVersion: number | null; toVersion: number | null } {
  const version = (side: Record<string, unknown> | null) => (typeof side?.version === "number" ? side.version : null);
  return { before: entry.before?.value ?? null, after: entry.after?.value ?? null, fromVersion: version(entry.before), toVersion: version(entry.after) };
}

/**
 * 변경 기록 (screens 10.15): list_audit(target config) with before → after.
 * "되돌리기" only prefills the editor with the old value; saving stays a
 * separate, reasoned step.
 */
export function ConfigHistory({
  entries,
  showKey = false,
  canRevert,
  onRevert,
  className,
}: {
  entries: AuditRow[];
  showKey?: boolean;
  canRevert: (key: string) => boolean;
  onRevert: (entry: AuditRow) => void;
  className?: string;
}) {
  if (entries.length === 0) {
    return <p className={cn("rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground", className)}>아직 변경 기록이 없어요.</p>;
  }

  return (
    <ol className={cn("flex flex-col gap-2", className)} aria-label="변경 기록">
      {entries.map((entry) => {
        const { before, after, fromVersion, toVersion } = historyValues(entry);
        const diff = configDiff(entry.targetId, before, after);
        const revertable = entry.before !== null && canRevert(entry.targetId);
        const actor = entry.actorName ?? "이름 없는 운영자";
        const role = isAdminRole(entry.actorRole) ? ROLE_LABEL[entry.actorRole] : entry.actorRole;
        return (
          <li key={entry.id} data-testid="config-history-entry" className="flex flex-col gap-2 rounded-lg border bg-card px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                {showKey ? <span className="font-semibold text-foreground">{CONFIG_KEY_LABEL[entry.targetId] ?? entry.targetId}</span> : null}
                {showKey ? <span aria-hidden>·</span> : null}
                <span className="num">{fromVersion === null ? `새 키 v${toVersion ?? 0}` : `v${fromVersion} → v${toVersion ?? "?"}`}</span>
                <span aria-hidden>·</span>
                <span>
                  {actor} ({role})
                </span>
                <span aria-hidden>·</span>
                <KstTime iso={entry.at} />
              </p>
              {revertable ? (
                <Button type="button" variant="outline" size="sm" onClick={() => onRevert(entry)}>
                  <ArrowCounterClockwiseIcon aria-hidden data-icon="inline-start" />
                  되돌리기
                </Button>
              ) : null}
            </div>
            {entry.reason ? <p className="text-xs text-foreground">사유: {entry.reason}</p> : null}
            <ConfigDiff entries={diff} beforeLabel="변경 전" afterLabel="변경 후" emptyText="값은 그대로예요." />
          </li>
        );
      })}
    </ol>
  );
}
