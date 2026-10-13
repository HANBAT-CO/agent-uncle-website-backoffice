"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

import { useInView } from "@/hooks/use-in-view";
import { cx } from "@/lib/cx";

/**
 * Lazy islands of S10 (spec 13: the form leaf, Radix and LDRS stay out of the
 * initial bundle). Each island mounts when its placeholder comes within one
 * viewport (IntersectionObserver, rootMargin 100%) and then loads its chunk
 * with next/dynamic. LeadForm asks ScrollTrigger to re-measure once it is in
 * place and whenever its height changes (errors, the sent state), so the
 * footer's triggers below keep their positions.
 *
 * - LazyLeadForm: the form and, with it, the mobile sticky submit bar. Until
 *   the chunk arrives the sheet shows a static skeleton in the form's shape
 *   (no shimmer: nothing idles on this page).
 * - LazyLiveRecordCard: the side card (1024-1279px) and the mobile success card.
 */

const LeadForm = dynamic(() => import("./LeadForm").then((module) => module.LeadForm), {
  ssr: false,
  loading: () => <FormSkeleton />,
});

const StickySubmit = dynamic(() => import("./StickySubmit").then((module) => module.StickySubmit), { ssr: false });

const LiveRecordCard = dynamic(() => import("./LiveRecordCard").then((module) => module.LiveRecordCard), {
  ssr: false,
});

const NEAR = { rootMargin: "100%", once: true } as const;

/** A skeleton line. `maxWidth` replaces the default cap (plain class joining, so the two must not both be set). */
function Bar({ className, maxWidth = "max-w-full" }: { className: string; maxWidth?: string }) {
  return <span className={cx("block rounded-pill bg-grey-100", maxWidth, className)} />;
}

function FieldSkeleton({
  tall = false,
  helper = false,
  className,
}: {
  tall?: boolean;
  helper?: boolean;
  className?: string;
}) {
  return (
    <span className={cx("flex flex-col gap-2", className)}>
      <Bar className="h-[21px] w-28" />
      <span className={cx("block rounded-input bg-grey-100", tall ? "h-36" : "h-14")} />
      {helper ? <Bar className="h-[21px] w-56" /> : null}
    </span>
  );
}

/**
 * The form's shape at the same spacing (fields paired from 1280px too), so
 * swapping in the real form barely moves anything.
 */
function FormSkeleton() {
  return (
    <div aria-hidden="true" data-lead-skeleton="" className="flex flex-col gap-10">
      <span className="flex flex-col gap-4">
        <Bar className="h-[31px] w-64" />
        {/* Rows below 1280px, three tiles side by side from 1280px (RoleCards). */}
        <span className="grid gap-3 xl:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <span key={index} className="block min-h-[80px] rounded-card border-[1.5px] border-grey-200 xl:min-h-[137px]" />
          ))}
        </span>
      </span>
      <span className="flex flex-col gap-7 xl:grid xl:grid-cols-2 xl:gap-x-6">
        <FieldSkeleton />
        <FieldSkeleton />
        <FieldSkeleton helper />
        <span className="flex flex-col gap-3">
          <Bar className="h-[21px] w-28" />
          <span className="flex flex-wrap gap-2">
            {[0, 1, 2].map((index) => (
              <span key={index} className="block h-11 w-20 rounded-pill border border-grey-200 xl:w-16" />
            ))}
          </span>
        </span>
        <FieldSkeleton tall helper className="xl:col-span-2" />
      </span>
      <span className="flex flex-col gap-3 border-t border-grey-200 pt-7">
        <Bar className="h-11 w-72" />
        <Bar className="ml-9 h-7 w-20" maxWidth="max-w-[calc(100%-2.25rem)]" />
      </span>
      {/* The form's own 사전 신청: full width below 768px, like the fixed bar it hands over to. */}
      <span className="block h-[52px] w-full max-w-full rounded-pill bg-grey-100 md:w-[10.5rem]" />
    </div>
  );
}

export function LazyLeadForm({ disclosure }: { disclosure: ReactNode }) {
  const [ref, near] = useInView<HTMLDivElement>(NEAR);
  return (
    <div ref={ref} data-lead-island="">
      {near ? (
        <>
          <LeadForm disclosure={disclosure} />
          <StickySubmit />
        </>
      ) : (
        <FormSkeleton />
      )}
    </div>
  );
}

export function LazyLiveRecordCard({ className }: { className?: string }) {
  const [ref, near] = useInView<HTMLDivElement>(NEAR);
  return (
    <div ref={ref} className={cx("lg:sticky lg:top-[120px] lg:self-start", className)}>
      {near ? <LiveRecordCard /> : null}
    </div>
  );
}
