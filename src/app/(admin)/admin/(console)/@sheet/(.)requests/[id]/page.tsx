import { RequestDetail, requestTitle } from "@/components/admin/requests/RequestDetail";
import { RequestDetailState } from "@/components/admin/requests/RequestDetailState";
import { RequestSheet } from "@/components/admin/requests/RequestSheet";
import { loadRequestDetail } from "@/components/admin/requests/load-request";
import { verifyAdmin } from "@/lib/admin/dal";

/**
 * The request Sheet (screens 10.9): /admin/requests/[id] intercepted on a
 * soft navigation from any console screen, rendered in the layout's @sheet
 * slot over the list, which keeps its scroll and selection. Closing goes
 * back. Same RequestDetail as the full page.
 */
export default async function RequestSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await verifyAdmin();
  const { id } = await params;
  const loaded = await loadRequestDetail(id);

  if (loaded.state !== "ok") {
    return (
      <RequestSheet title="사입 요청" description="요청 상세">
        <RequestDetailState state={loaded.state} error={loaded.state === "error" ? loaded.error : undefined} />
      </RequestSheet>
    );
  }

  return (
    <RequestSheet title={requestTitle(loaded.data.request)} description={`${loaded.data.request.label} · 사입 요청 상세`}>
      <RequestDetail data={loaded.data} session={session} operationIds={loaded.operationIds} staff={loaded.staff} variant="sheet" />
    </RequestSheet>
  );
}
