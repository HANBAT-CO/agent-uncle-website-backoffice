"use client";

import { lazy, Suspense, type ReactNode } from "react";

import { useInView } from "@/hooks/use-in-view";

const DawnMotion = lazy(() => import("./DawnMotion").then((module) => ({ default: module.DawnMotion })));

const NEAR = { rootMargin: "100%", once: true } as const;

export function DawnMotionIsland({ children }: { children: ReactNode }) {
  const [ref, near] = useInView<HTMLDivElement>(NEAR);
  if (near) {
    return (
      <Suspense fallback={<DawnFallback viewRef={ref}>{children}</DawnFallback>}>
        <DawnMotion>{children}</DawnMotion>
      </Suspense>
    );
  }
  return <DawnFallback viewRef={ref}>{children}</DawnFallback>;
}

function DawnFallback({ children, viewRef }: { children: ReactNode; viewRef?: (node: HTMLDivElement | null) => void }) {
  return (
    <div ref={viewRef} className="dawn-root">
      <div className="dawn-scene" data-dawn-scene>
        {children}
      </div>
    </div>
  );
}
