"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, type ReactNode, type RefCallback } from "react";

import { useInView } from "@/hooks/use-in-view";

const LoadedReceiptMotion = dynamic(() => import("./ReceiptMotion").then((module) => module.ReceiptMotion), { ssr: false });

export function ReceiptMotionIsland({ children, className }: { children: ReactNode; className?: string }) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [inViewRef, near] = useInView<HTMLDivElement>({ rootMargin: "100%", once: true });
  const setAnchor = useCallback<RefCallback<HTMLDivElement>>(
    (node) => {
      anchorRef.current = node;
      return inViewRef(node);
    },
    [inViewRef],
  );

  return (
    <div ref={setAnchor} data-receipt-anchor="" className={className}>
      <div className="receipt-tilt">{children}</div>
      {near ? <LoadedReceiptMotion anchorRef={anchorRef} /> : null}
    </div>
  );
}
