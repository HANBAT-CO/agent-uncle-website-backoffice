"use client";

import { useEffect, useRef } from "react";

/** Decorative only: the adjacent tabs provide the full keyboard and touch experience. */
export function ParcelFigure({ stage }: { stage: number }) {
  const node = useRef<HTMLDivElement>(null);
  const controller = useRef<{ set(value: number): void; destroy(): void } | null>(null);
  const phase = useRef(stage);

  useEffect(() => {
    phase.current = stage;
    controller.current?.set(stage);
  }, [stage]);

  useEffect(() => {
    const element = node.current;
    if (!element) return;
    let live = true;
    import("./parcel-stage")
      .then(({ mountParcel }) => mountParcel(element, phase.current, () => live))
      .then((instance) => {
        if (!instance) return;
        if (!live) { instance.destroy(); return; }
        controller.current = instance;
        instance.set(phase.current);
      })
      .catch(() => { /* A decorative asset failing must never block operational data. */ });
    return () => { live = false; controller.current?.destroy(); controller.current = null; };
  }, []);

  return <div ref={node} data-hairline="parcel" className="flow-figure" aria-hidden="true" />;
}
