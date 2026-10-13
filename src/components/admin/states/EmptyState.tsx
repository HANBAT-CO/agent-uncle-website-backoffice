import { TrayIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { Button } from "@/components/admin/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/admin/ui/empty";

/**
 * Empty list (screens 9): a title and a hint, plus "필터 초기화" when filters
 * are active (pass the list URL without its filters as `resetHref`).
 */
export function EmptyState({
  title,
  description,
  resetHref,
  className,
}: {
  title: string;
  description?: string;
  resetHref?: string;
  className?: string;
}) {
  return (
    <Empty className={className ?? "min-h-56 border border-dashed bg-card/60"}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <TrayIcon aria-hidden weight="duotone" />
        </EmptyMedia>
        <EmptyTitle className="text-sm font-semibold">{title}</EmptyTitle>
        {description ? <EmptyDescription className="text-xs">{description}</EmptyDescription> : null}
      </EmptyHeader>
      {resetHref ? (
        <EmptyContent>
          <Button asChild variant="outline" size="lg">
            <Link href={resetHref} scroll={false}>
              필터 초기화
            </Link>
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}
