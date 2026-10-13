"use client";

import { lazy, Suspense, type ComponentProps, type ReactNode } from "react";

import { useInView } from "@/hooks/use-in-view";

const RouteMotion = lazy(() => import("./RouteMotion").then((module) => ({ default: module.RouteMotion })));

const NEAR = { rootMargin: "100%", once: true } as const;

type RouteMotionProps = Omit<ComponentProps<typeof RouteMotion>, "children"> & {
  children: ReactNode;
};

export function RouteMotionIsland({ children, ...props }: RouteMotionProps) {
  const [ref, near] = useInView<HTMLDivElement>(NEAR);
  if (near) {
    return (
      <Suspense fallback={<RouteFallback viewRef={ref}>{children}</RouteFallback>}>
        <RouteMotion {...props}>{children}</RouteMotion>
      </Suspense>
    );
  }
  return <RouteFallback viewRef={ref}>{children}</RouteFallback>;
}

function RouteFallback({ children, viewRef }: { children: ReactNode; viewRef?: (node: HTMLDivElement | null) => void }) {
  return (
    <div ref={viewRef} className="route-root">
      {children}
    </div>
  );
}
