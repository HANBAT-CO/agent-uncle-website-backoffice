"use client";

import { lazy, Suspense, useEffect, useState } from "react";

import { useInView } from "@/hooks/use-in-view";

import { useReceipt } from "./receipt-context";

/** Motion leaf, warmed once the slip is a viewport away and mounted on first open. */
const WhatIfPanel = lazy(() => import("./WhatIfPanel"));

/**
 * Host of the what-if sample: always in the DOM (the issue row's
 * aria-controls target), empty until the reader first opens the sample. The
 * panel stays mounted afterwards so AnimatePresence can play its exit.
 */
export function WhatIfSlot({ className }: { className?: string }) {
  const { state, panelId } = useReceipt();
  const [inViewRef, near] = useInView<HTMLDivElement>({ rootMargin: "100%", once: true });
  const [mounted, setMounted] = useState(false);
  // Latch on first open, adjusted during render rather than in an effect.
  if (state.whatIf.open && !mounted) setMounted(true);

  useEffect(() => {
    if (near) void import("./WhatIfPanel");
  }, [near]);

  return (
    <div ref={inViewRef} id={panelId} className={className}>
      {mounted ? (
        <Suspense fallback={null}>
          <WhatIfPanel />
        </Suspense>
      ) : null}
    </div>
  );
}
