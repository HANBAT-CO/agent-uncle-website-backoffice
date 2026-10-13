"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType, type FocusEvent, type ReactNode } from "react";

import { useInView } from "@/hooks/use-in-view";
import { cx } from "@/lib/cx";
import { requestScrollRefresh } from "@/lib/scroll-refresh";

/**
 * Host of the S8 proposal leaf (spec 13: Motion + StatusMark load lazily, one
 * viewport before the block arrives). Until then the server's static sheet
 * (the ask state, identical markup) is the first paint and the no-JS
 * baseline. The swap happens in one commit once the chunk is in, and focus
 * inside the static sheet moves to the same control in the live one. After a
 * reload that follows a 기다리기 answer, the live sheet opens on that answer
 * instead (ProposalBlock), usually one viewport before it scrolls into view.
 *
 * It also keeps the pins below S8 (the film) measured: see watchSectionHeight.
 */

type BlockProps = { takeFocusKey: () => string | null };

/**
 * One debounced ScrollTrigger refresh whenever the section's height changes
 * at an unchanged viewport width: a proposal phase that outgrows the device
 * column, an error or refusal line on stacked layouts. Nothing else in S8
 * changes height. Resizes are ScrollTrigger's own refresh, and the swap from
 * the static sheet to the live one costs no refresh at all (same height),
 * except when it reopens a restored answer.
 */
function watchSectionHeight(node: Element): () => void {
  const section = node.closest("section");
  if (!section) return () => {};
  let height: number | null = null;
  let width = window.innerWidth;
  const observer = new ResizeObserver((entries) => {
    const entry = entries.at(-1);
    if (!entry) return;
    const next = entry.contentRect.height;
    const sameWidth = window.innerWidth === width;
    const changed = height !== null && Math.abs(next - height) >= 1;
    height = next;
    width = window.innerWidth;
    if (changed && sameWidth) requestScrollRefresh();
  });
  observer.observe(section);
  return () => observer.disconnect();
}

export function ProposalSlot({ children, className }: { children: ReactNode; className?: string }) {
  const [viewRef, near] = useInView<HTMLDivElement>({ rootMargin: "100%", once: true });
  const [Block, setBlock] = useState<ComponentType<BlockProps> | null>(null);
  const focusKey = useRef<string | null>(null);

  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      const stopView = viewRef(node);
      const stopWatch = watchSectionHeight(node);
      return () => {
        if (typeof stopView === "function") stopView();
        stopWatch();
      };
    },
    [viewRef],
  );

  useEffect(() => {
    if (!near) return;
    let live = true;
    void import("./ProposalBlock").then((module) => {
      if (live) setBlock(() => module.default);
    });
    return () => {
      live = false;
    };
  }, [near]);

  const takeFocusKey = useCallback(() => {
    const key = focusKey.current;
    focusKey.current = null;
    return key;
  }, []);

  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    focusKey.current = (event.target as HTMLElement).dataset.focusKey ?? null;
  };

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    if (next && !event.currentTarget.contains(next)) focusKey.current = null;
  };

  return (
    <div
      ref={ref}
      className={cx("min-w-0", className)}
      onFocus={onFocus}
      onBlur={onBlur}
      data-proposal-ready={Block ? "" : undefined}
    >
      {Block ? <Block takeFocusKey={takeFocusKey} /> : children}
    </div>
  );
}
