"use client";

import { useCallback, type ComponentProps, type Ref } from "react";

import { cn } from "@/lib/cn";

import { fieldControlClass } from "./input";

/**
 * Multi-line field in the same style as Input. It grows with its content where
 * the browser supports field-sizing (between 144px and 320px) and scrolls past
 * that; data-lenis-prevent lets that inner scroll win over Lenis only while
 * there is something inside the field to scroll.
 *
 * No unconditional overscroll-behavior: contain on a field with nothing to
 * scroll swallows the page scroll of a thumb that started on it (phones,
 * where the field spans the screen).
 */
type WritableRef<T> = { current: T | null };

function setRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref) (ref as WritableRef<T>).current = value;
}

function syncScrollState(box: HTMLTextAreaElement): void {
  const scrolls = box.scrollHeight > box.clientHeight + 1;
  box.toggleAttribute("data-scrolls", scrolls);
  box.toggleAttribute("data-lenis-prevent", scrolls);
}

export function Textarea({ className, rows = 4, ref, onInput, ...props }: ComponentProps<"textarea">) {
  const measuredRef = useCallback(
    (box: HTMLTextAreaElement | null) => {
      setRef(ref, box);
      if (!box) return;

      syncScrollState(box);
      const observer = new ResizeObserver(() => syncScrollState(box));
      observer.observe(box);
      return () => {
        observer.disconnect();
        setRef(ref, null);
      };
    },
    [ref],
  );

  return (
    <textarea
      ref={measuredRef}
      rows={rows}
      data-slot="textarea"
      className={cn(
        fieldControlClass,
        "field-sizing-content max-h-80 min-h-36 resize-none overscroll-auto py-4 leading-[1.65] data-scrolls:overscroll-contain",
        className,
      )}
      onInput={(event) => {
        syncScrollState(event.currentTarget);
        onInput?.(event);
      }}
      {...props}
    />
  );
}
