"use client";

import { CasePanel, type CaseAssignee } from "@/components/admin/panels/CasePanel";
import { NotesPanel } from "@/components/admin/panels/NotesPanel";
import type { Case, Note } from "@/lib/admin/rpc/schemas";

export type TriageMemoData = {
  requestId: string;
  notes: Note[];
  cases: Case[];
  canWrite: boolean;
  noteOperationId: string;
  caseOperationId: string;
  authors: Record<string, string>;
  assignees: CaseAssignee[];
};

/**
 * 운영 메모 · 케이스 under the triage detail (spec 10.12 staff actions). They
 * sit on the related request, the record backoffice_get_request reads them
 * back from, so the same notes show in the request Sheet. Viewers read only.
 */
export function TriageMemo({ memo }: { memo: TriageMemoData }) {
  return (
    <section aria-label="운영 메모 · 케이스" className="flex min-w-0 flex-col gap-6 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <NotesPanel
        targetType="request"
        targetId={memo.requestId}
        notes={memo.notes}
        canWrite={memo.canWrite}
        operationId={memo.noteOperationId}
        authors={memo.authors}
      />
      <CasePanel
        targetType="request"
        targetId={memo.requestId}
        cases={memo.cases}
        assignees={memo.assignees}
        canWrite={memo.canWrite}
        operationId={memo.caseOperationId}
      />
    </section>
  );
}
