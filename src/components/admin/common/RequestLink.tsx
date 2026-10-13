import Link from "next/link";

import { cn } from "@/lib/admin/utils";

/**
 * Link to a request. From a console list it opens the intercepted Sheet
 * (soft navigation); a direct visit renders the full page.
 */
export function RequestLink({
  id,
  children,
  className,
}: {
  id: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <Link href={`/admin/requests/${encodeURIComponent(id)}`} scroll={false} className={cn("font-medium hover:text-primary hover:underline", className)}>
      {children ?? id}
    </Link>
  );
}
