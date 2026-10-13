import Image from "next/image";

import { cn } from "@/lib/admin/utils";

/*
 * Frame for the access screens (screens appendix 10.1 to 10.4): the canvas,
 * the 4px deep-green rule across the top, the app mark, and one card. No
 * console chrome, because none of these screens has a verified staff session.
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
    <div className="relative min-h-dvh bg-background">
      <div aria-hidden className="fixed inset-x-0 top-0 h-1 bg-primary" />
      <main id="main" className="grid min-h-dvh place-items-center px-6 py-16">
        <div className={cn("w-full max-w-[400px]", className)}>
          <Image
            src="/brand/samchun-app-icon.png"
            alt=""
            width={44}
            height={44}
            priority
            className="mb-6 rounded-[0.75rem] ring-1 ring-foreground/10"
          />
          <section
            aria-labelledby="auth-title"
            className="rounded-lg bg-card px-7 py-8 text-sm text-card-foreground ring-1 ring-foreground/10"
          >
            <h1 id="auth-title" className="text-xl/snug font-bold tracking-tight text-foreground">
              {title}
            </h1>
            {description ? <div className="mt-2 text-sm/relaxed text-muted-foreground">{description}</div> : null}
            {children ? <div className="mt-7">{children}</div> : null}
          </section>
          {footer ? <div className="mt-5 text-xs/relaxed text-muted-foreground">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}
