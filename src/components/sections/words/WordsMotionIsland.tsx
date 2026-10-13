"use client";

import { lazy, Suspense, type ReactNode } from "react";

import { useInView } from "@/hooks/use-in-view";

const WordsMotion = lazy(() => import("./WordsMotion").then((module) => ({ default: module.WordsMotion })));

const NEAR = { rootMargin: "100%", once: true } as const;

export function WordsMotionIsland({ children }: { children: ReactNode }) {
  const [ref, near] = useInView<HTMLDivElement>(NEAR);
  if (near) {
    return (
      <Suspense fallback={<WordsFallback viewRef={ref}>{children}</WordsFallback>}>
        <WordsMotion>{children}</WordsMotion>
      </Suspense>
    );
  }
  return <WordsFallback viewRef={ref}>{children}</WordsFallback>;
}

function WordsFallback({ children, viewRef }: { children: ReactNode; viewRef?: (node: HTMLDivElement | null) => void }) {
  return (
    <div ref={viewRef} className="words-root">
      {children}
    </div>
  );
}
