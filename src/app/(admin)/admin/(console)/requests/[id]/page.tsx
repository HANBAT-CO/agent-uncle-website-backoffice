import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RequestDetail } from "@/components/admin/requests/RequestDetail";
import { RequestDetailState } from "@/components/admin/requests/RequestDetailState";
import { loadRequestDetail } from "@/components/admin/requests/load-request";
import { verifyAdmin } from "@/lib/admin/dal";

export const metadata: Metadata = { title: "사입 요청 상세" };

/**
 * /admin/requests/[id] as a full page (screens 10.9): a pasted link or a
 * reload. A click from a console list opens the same RequestDetail in the
 * intercepted Sheet instead (@sheet/(.)requests/[id]).
 */
export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await verifyAdmin();
  const { id } = await params;
  const loaded = await loadRequestDetail(id);
  if (loaded.state === "not_found") notFound();
  if (loaded.state === "error") return <RequestDetailState state="error" error={loaded.error} />;
  return <RequestDetail data={loaded.data} session={session} operationIds={loaded.operationIds} staff={loaded.staff} variant="page" />;
}
