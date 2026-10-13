import { CompassIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { Button } from "@/components/admin/ui/button";
import { ADMIN_PANEL_NAME } from "@/lib/admin/brand";

/** Unknown console paths and notFound() inside the shell (tasks appendix WP-04). */
export default function ConsoleNotFound() {
  return (
    <section
      aria-labelledby="not-found-title"
      data-testid="admin-not-found"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4 rounded-xl border border-dashed bg-card/60 px-6 py-12 text-center"
    >
      <title>{`찾는 화면이 없어요 | ${ADMIN_PANEL_NAME}`}</title>
      <span className="grid size-10 place-items-center rounded-lg bg-secondary text-secondary-foreground">
        <CompassIcon aria-hidden weight="bold" className="size-5" />
      </span>
      <div className="flex flex-col gap-1.5">
        <h1 id="not-found-title" className="text-lg font-bold tracking-tight text-foreground">
          찾는 화면이 없어요
        </h1>
        <p className="text-sm text-muted-foreground">주소를 다시 확인해 주세요.</p>
      </div>
      <Button asChild size="lg" className="h-9 px-4 text-sm">
        <Link href="/admin">대시보드로 가기</Link>
      </Button>
    </section>
  );
}
