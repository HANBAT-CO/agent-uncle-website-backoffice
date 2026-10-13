import { FileMagnifyingGlassIcon, FolderPlusIcon, InfoIcon, NotePencilIcon, StorefrontIcon, TruckIcon, UserIcon } from "@phosphor-icons/react/dist/ssr";

import { KstTime } from "@/components/admin/common/KstTime";
import { StatusChip } from "@/components/admin/common/StatusChip";
import { MODERATION_LABEL, roleKindLabel, verificationLabel } from "@/lib/admin/labels";
import type { AccountDossier } from "@/lib/admin/rpc/schemas";

import { DossierTabButton } from "./DossierTabs";
import { RestoreDialog } from "./RestoreDialog";
import { SuspendDialog } from "./SuspendDialog";

const ROLE_ICON = { retailer: StorefrontIcon, uncle: TruckIcon } as const;

export type HeaderPermissions = {
  /** operator+ (메모, 케이스, 서류 확인). */
  canWrite: boolean;
  /** operator+ on a non-staff account, owner on staff; never the caller's own account. */
  canModerate: boolean;
  /** Why moderation is not offered, when canWrite is true. */
  moderationNote: string | null;
};

/** True while auth.users.banned_until lies in the future. */
export function isLoginBanned(bannedUntil: string | null, now: number = Date.now()): boolean {
  return Boolean(bannedUntil && new Date(bannedUntil).getTime() > now);
}

/** Dossier name: the app name, the business name, then the login email. */
export function dossierName(dossier: AccountDossier): string {
  const account = dossier.account;
  return account?.name?.trim() || account?.label?.trim() || account?.businessName?.trim() || dossier.auth.email || "이름 없음";
}

/**
 * Dossier header (screens 10.7): name, role chip, verification chip,
 * moderation chip and "가입일 …", then the operator actions. There is no
 * role change, profile edit or deletion, and the fixed note says so.
 */
export function AccountHeader({
  accountId,
  dossier,
  permissions,
  operationId,
}: {
  accountId: string;
  dossier: AccountDossier;
  permissions: HeaderPermissions;
  operationId: string;
}) {
  const account = dossier.account;
  const role = account?.role;
  const RoleIcon = role === "retailer" || role === "uncle" ? ROLE_ICON[role] : UserIcon;
  const status = dossier.moderation?.status ?? "active";
  const banned = isLoginBanned(dossier.auth.bannedUntil);

  return (
    <header className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-xl font-bold tracking-tight">{dossierName(dossier)}</h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" data-testid="account-chips">
            <span className="inline-flex h-6 items-center gap-1 rounded-full border bg-card px-2 font-medium text-foreground">
              <RoleIcon aria-hidden weight="bold" className="size-3.5 text-muted-foreground" />
              {account ? roleKindLabel(role) : dossier.auth.isStaff ? "운영 계정" : "앱 계정 없음"}
            </span>
            <StatusChip label={verificationLabel(account?.verification ?? "none")} />
            <StatusChip label={MODERATION_LABEL[status]} />
            {banned && status !== "suspended" ? <StatusChip label="로그인 차단" /> : null}
            <span>
              가입일 <KstTime iso={dossier.auth.createdAt} withYear="always" time={false} />
            </span>
          </div>
        </div>
        {permissions.canWrite ? (
          <div className="flex flex-wrap items-center gap-2" aria-label="계정 작업" role="group">
            <DossierTabButton tab="documents" icon={<FileMagnifyingGlassIcon aria-hidden data-icon="inline-start" />}>
              서류 확인
            </DossierTabButton>
            {permissions.canModerate ? (
              status === "suspended" ? (
                <RestoreDialog accountId={accountId} operationId={operationId} />
              ) : (
                <SuspendDialog accountId={accountId} operationId={operationId} />
              )
            ) : null}
            <DossierTabButton tab="notes" icon={<NotePencilIcon aria-hidden data-icon="inline-start" />}>
              메모 남기기
            </DossierTabButton>
            <DossierTabButton tab="notes" icon={<FolderPlusIcon aria-hidden data-icon="inline-start" />}>
              케이스 열기
            </DossierTabButton>
          </div>
        ) : null}
      </div>
      {status === "suspended" && dossier.moderation ? (
        <p className="flex items-start gap-1.5 rounded-md bg-status-attention-bg px-3 py-2 text-sm text-status-attention">
          <span>
            <KstTime iso={dossier.moderation.updatedAt} />에 이용을 제한했어요. 사유: {dossier.moderation.reason}
            {dossier.moderation.loginBanned ? " · 로그인도 막았어요." : ""}
          </span>
        </p>
      ) : null}
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <InfoIcon aria-hidden weight="bold" className="mt-[0.15em] size-3.5 shrink-0" />
        <span>
          역할 변경과 탈퇴 처리는 제공하지 않아요.
          {permissions.moderationNote ? ` ${permissions.moderationNote}` : ""}
        </span>
      </p>
    </header>
  );
}
