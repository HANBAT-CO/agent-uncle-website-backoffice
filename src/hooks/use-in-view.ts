import { useCallback, useState, type RefCallback } from "react";

/**
 * IntersectionObserver as a hook. Client components only.
 *
 *   const [ref, inView] = useInView<HTMLDivElement>({ rootMargin: "100%", once: true });
 *   return <div ref={ref}>{inView ? <HeavyIsland /> : null}</div>;
 *
 * Returns [ref, inView, ratio]. `ratio` is the intersection ratio at the last
 * crossed threshold (discrete, so it is fine in React state); pass thresholds
 * like [0, 0.25, 0.5] to get the steps you need. With `once`, the observer
 * disconnects after the first time the element is in view and stays true.
 * Server render and the hydration pass report [ref, false, 0].
 */

export type InViewOptions = {
  /** CSS margin around the viewport, e.g. "100%" to start one viewport early. */
  rootMargin?: string;
  threshold?: number | readonly number[];
  once?: boolean;
};

type Visibility = { inView: boolean; ratio: number };

const HIDDEN: Visibility = { inView: false, ratio: 0 };

function marginPartToPx(value: string, axis: "x" | "y"): number {
  const trimmed = value.trim();
  if (trimmed.endsWith("%")) {
    const basis = axis === "y" ? window.innerHeight : window.innerWidth;
    return (Number.parseFloat(trimmed) / 100) * basis;
  }
  return Number.parseFloat(trimmed) || 0;
}

function initialVisibility(node: Element, rootMargin: string): Visibility {
  const parts = rootMargin.trim().split(/\s+/);
  const [top, right = top, bottom = top, left = right] = parts;
  const marginTop = marginPartToPx(top, "y");
  const marginRight = marginPartToPx(right, "x");
  const marginBottom = marginPartToPx(bottom, "y");
  const marginLeft = marginPartToPx(left, "x");
  const box = node.getBoundingClientRect();
  const inView = box.bottom >= -marginTop && box.top <= window.innerHeight + marginBottom && box.right >= -marginLeft && box.left <= window.innerWidth + marginRight;
  return { inView, ratio: inView ? 1 : 0 };
}

export function useInView<T extends Element = HTMLElement>({
  rootMargin = "0px",
  threshold = 0,
  once = false,
}: InViewOptions = {}): [RefCallback<T>, boolean, number] {
  const [visibility, setVisibility] = useState<Visibility>(HIDDEN);
  const thresholdKey = Array.isArray(threshold) ? threshold.join(",") : String(threshold);

  const ref = useCallback<RefCallback<T>>(
    (node) => {
      if (!node) return;
      const thresholds = thresholdKey.split(",").map(Number);
      const initial = initialVisibility(node, rootMargin);
      setVisibility((current) => (current.inView === initial.inView && current.ratio === initial.ratio ? current : initial));
      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries.at(-1);
          if (!entry) return;
          const next = { inView: entry.isIntersecting, ratio: entry.intersectionRatio };
          setVisibility((current) => (current.inView === next.inView && current.ratio === next.ratio ? current : next));
          if (once && entry.isIntersecting) observer.disconnect();
        },
        { rootMargin, threshold: thresholds },
      );
      observer.observe(node);
      return () => observer.disconnect();
    },
    [rootMargin, thresholdKey, once],
  );

  return [ref, visibility.inView, visibility.ratio];
}
