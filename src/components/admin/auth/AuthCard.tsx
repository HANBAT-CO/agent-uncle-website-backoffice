import { ArrowUpRightIcon, LockKeyIcon } from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";

import { ParcelFigure } from "@/components/admin/dashboard/ParcelFigure";
import { ADMIN_PANEL_NAME } from "@/lib/admin/brand";
import { cn } from "@/lib/admin/utils";

/*
 * Shared access-screen frame. The parcel is decorative; the form remains
 * the only task, with no operational data exposed before authentication.
 */
export function AuthCard({
  title,
  description,
  children,
  footer,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="auth-canvas">
      <main id="main" className="auth-layout">
        <aside className="auth-story" aria-label={ADMIN_PANEL_NAME}>
          <div className="flex items-center gap-3">
            <Image src="/brand/samchun-app-icon.png" alt="" width={40} height={40} priority className="rounded-[11px]" />
            <div>
              <p className="text-sm font-semibold tracking-tight break-keep">{ADMIN_PANEL_NAME}</p>
              <p className="mt-1 text-[9px] tracking-[0.15em] text-[#bed2c4]">OPERATIONS CONSOLE</p>
            </div>
          </div>
          <div className="auth-story-center">
            <p className="auth-story-kicker">사입의 모든 연결</p>
            <p className="auth-story-title">한 벌의 시작부터,<br />마지막 전달까지.</p>
            <div className="auth-parcel"><ParcelFigure stage={1} /></div>
            <p className="auth-story-description">매장의 요청과 삼춘의 발걸음이<br />끊김 없이 이어지도록.</p>
          </div>
          <div className="auth-story-footer" aria-hidden="true">
            <span>01 요청</span><span className="auth-route-line" /><span>02 사입</span><span className="auth-route-line" /><span>03 전달</span>
            <ArrowUpRightIcon className="size-4" />
          </div>
        </aside>
        <div className="auth-form-panel">
          <div className="auth-form-index"><span>STAFF ACCESS</span><LockKeyIcon aria-hidden className="size-4" /></div>
          <section
            aria-labelledby="auth-title"
            className={cn("auth-form-content w-full text-sm text-card-foreground", className)}
          >
            <span className="console-eyebrow mb-5">사입삼춘·소매상 통합 관리</span>
            <h1 id="auth-title" className="text-[1.75rem]/snug font-semibold tracking-[-0.055em] break-keep text-foreground sm:text-[2rem]">
              {title}
            </h1>
            {description ? <div className="mt-3 text-sm/relaxed text-muted-foreground">{description}</div> : null}
            {children ? <div className="mt-9">{children}</div> : null}
            {footer ? <div className="mt-8 border-t border-[var(--console-line)] pt-5 text-xs/relaxed text-muted-foreground">{footer}</div> : null}
          </section>
          <p className="auth-form-footnote">사입삼춘 · 매일의 사입을 잇다</p>
        </div>
      </main>
    </div>
  );
}
