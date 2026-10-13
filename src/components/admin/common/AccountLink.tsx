import { StorefrontIcon, TruckIcon, UserIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { roleKindLabel } from "@/lib/admin/labels";
import { cn } from "@/lib/admin/utils";

type AccountLike = { id: string; name?: string | null; role?: string | null };

const ROLE_ICON = { retailer: StorefrontIcon, uncle: TruckIcon } as const;

/** Name linking to the account dossier, with a role icon (소매업자 storefront, 사입삼촌 truck). */
export function AccountLink({
  account,
  showRole = true,
  className,
}: {
  account: AccountLike | null | undefined;
  showRole?: boolean;
  className?: string;
}) {
  if (!account?.id) return <span className="text-muted-foreground">-</span>;
  const Icon = account.role === "retailer" || account.role === "uncle" ? ROLE_ICON[account.role] : UserIcon;
  const name = account.name?.trim() || "이름 없음";
  return (
    <Link
      href={`/admin/accounts/${account.id}`}
      className={cn("inline-flex max-w-full items-center gap-1 font-medium text-foreground hover:text-primary hover:underline", className)}
    >
      {showRole ? (
        <Icon aria-label={roleKindLabel(account.role)} role="img" weight="bold" className="size-3.5 shrink-0 text-muted-foreground" />
      ) : null}
      <span className="truncate">{name}</span>
    </Link>
  );
}
