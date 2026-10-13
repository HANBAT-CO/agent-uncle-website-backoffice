import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AccountHeader, type HeaderPermissions } from "@/components/admin/accounts/AccountHeader";
import { AttachmentsTab } from "@/components/admin/accounts/AttachmentsTab";
import { ConnectionsTab } from "@/components/admin/accounts/ConnectionsTab";
import { DocumentDetails, ReviewHistory } from "@/components/admin/accounts/DocumentDetails";
import { DocumentTab } from "@/components/admin/accounts/DocumentTab";
import { DossierTabs } from "@/components/admin/accounts/DossierTabs";
import { ProfileTab } from "@/components/admin/accounts/ProfileTab";
import { RequestHistoryTab } from "@/components/admin/accounts/RequestHistoryTab";
import { MiniAuditList } from "@/components/admin/panels/MiniAuditList";
import { CasePanel } from "@/components/admin/panels/CasePanel";
import { NotesPanel } from "@/components/admin/panels/NotesPanel";
import { ErrorState } from "@/components/admin/states/ErrorState";
import { verifyAdmin } from "@/lib/admin/dal";
import { newOperationId } from "@/lib/admin/operation-id";
import { hasRole } from "@/lib/admin/roles";
import { rpc } from "@/lib/admin/rpc";

export const metadata: Metadata = { title: "계정" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Account dossier (screens 10.7): header with the operator actions, then
 * 프로필, 서류, 연결, 요청 이력, 첨부, 처리 이력 and 운영 메모 · 케이스.
 * backoffice_get_account masks contact data for viewers and audits the
 * unmasked view (account.view) for operators and owners.
 */
export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await verifyAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const [result, admins] = await Promise.all([rpc.getAccount(id), rpc.listAdmins()]);
  if (!result.ok) {
    if (result.error.kind === "invalid") notFound();
    return (
      <div className="flex flex-col gap-4">
        <Link href="/admin/accounts" className="text-sm text-muted-foreground hover:text-foreground">
          계정·가입 목록으로
        </Link>
        <ErrorState message="계정 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." retryHref={`/admin/accounts/${id}`} />
      </div>
    );
  }

  const dossier = result.data;
  const account = dossier.account;
  const canWrite = hasRole(session.role, "operator");
  const masked = !canWrite || account?.masked === true;
  const self = session.userId === id;
  const staffTarget = dossier.auth.isStaff;
  const canModerate = canWrite && !self && (!staffTarget || session.role === "owner");
  const permissions: HeaderPermissions = {
    canWrite,
    canModerate,
    moderationNote: !canWrite
      ? null
      : self
        ? "본인 계정은 처리할 수 없어요."
        : staffTarget && session.role !== "owner"
          ? "운영 계정은 관리자만 처리할 수 있어요."
          : null,
  };

  const staff = admins.ok ? admins.data : [];
  const names = Object.fromEntries(staff.map((admin) => [admin.userId, admin.displayName]));
  const assignees = staff
    .filter((admin) => !admin.revokedAt && (admin.role === "operator" || admin.role === "owner"))
    .map((admin) => ({ userId: admin.userId, displayName: admin.displayName }));

  const documentId = account?.documentId?.trim() || null;
  const document = documentId ? (dossier.attachments.find((file) => file.id === documentId) ?? { id: documentId, name: null, mime: null, size: 0, createdAt: null, usage: ["businessDocument"] }) : null;

  const ops = { review: newOperationId(), status: newOperationId(), note: newOperationId(), case: newOperationId() };

  return (
    <div className="flex flex-col gap-6">
      <AccountHeader accountId={id} dossier={dossier} permissions={permissions} operationId={ops.status} />
      <div id="dossier-tabs" className="scroll-mt-20">
        <DossierTabs
          counts={{
            connections: dossier.connections.length,
            requests: dossier.recentRequests.length,
            attachments: dossier.attachments.length,
            notes: dossier.notes.length + dossier.cases.length,
          }}
          panels={{
            profile: <ProfileTab dossier={dossier} masked={masked} />,
            documents: (
              <DocumentTab
                accountId={id}
                document={document ? { id: document.id, mime: document.mime ?? null, name: document.name ?? null } : null}
                canOpen={canWrite}
                canReview={canWrite && !self}
                operationId={ops.review}
                details={<DocumentDetails dossier={dossier} document={document} masked={masked} />}
                history={<ReviewHistory reviews={dossier.reviews} names={names} />}
              />
            ),
            connections: <ConnectionsTab connections={dossier.connections} />,
            requests: <RequestHistoryTab stats={dossier.requestStats} requests={dossier.recentRequests} />,
            attachments: <AttachmentsTab attachments={dossier.attachments} masked={masked} />,
            history: <MiniAuditList rows={dossier.recentAudit} />,
            notes: (
              <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
                <NotesPanel targetType="account" targetId={id} notes={dossier.notes} canWrite={canWrite} operationId={ops.note} authors={names} />
                <CasePanel targetType="account" targetId={id} cases={dossier.cases} assignees={assignees} canWrite={canWrite} operationId={ops.case} />
              </div>
            ),
          }}
        />
      </div>
    </div>
  );
}
