"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, type ReactNode, type RefCallback } from "react";

import { useInView } from "@/hooks/use-in-view";

const LoadedFilmMotion = dynamic(() => import("./FilmMotion").then((module) => module.FilmMotion), { ssr: false });

const NEAR = { rootMargin: "100%", once: true } as const;

export function FilmMotionIsland({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [inViewRef, near] = useInView<HTMLDivElement>(NEAR);
  const setRoot = useCallback<RefCallback<HTMLDivElement>>(
    (node) => {
      rootRef.current = node;
      return inViewRef(node);
    },
    [inViewRef],
  );

  return (
    <div ref={setRoot} className="film-motion">
      {children}
      {near ? <LoadedFilmMotion rootRef={rootRef} /> : null}
    </div>
  );
}
