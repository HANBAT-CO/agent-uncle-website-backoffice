"use client";

import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import { cn } from "@/lib/admin/utils";

const DEBOUNCE_MS = 250;

/**
 * List search in `?q=` (screens 9, Review Focus 5). Debounced 250 ms and
 * Hangul-safe: nothing is sent while an IME composition is open, the final
 * value goes out after compositionend, and the value is read from the input
 * itself when the timer fires, so the last syllable is never dropped.
 */
export function SearchInput({
  param = "q",
  placeholder,
  label,
  className,
}: {
  param?: string;
  placeholder: string;
  label?: string;
  className?: string;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<number | null>(null);
  const composing = useRef(false);
  const [pending, startTransition] = useTransition();
  const [params, setParams] = useQueryStates(
    { [param]: parseAsString.withDefault(""), page: parseAsInteger },
    { shallow: false, scroll: false, startTransition },
  );
  const urlValue = String(params[param] ?? "");
  const [value, setValue] = useState(urlValue);
  // What this input last sent, and the URL value last seen. When the URL
  // changes to something this input did not send (필터 초기화, back button),
  // the input shows it; its own echo never overwrites what is being typed.
  const [committed, setCommitted] = useState(urlValue);
  const [seenUrl, setSeenUrl] = useState(urlValue);
  if (urlValue !== seenUrl) {
    setSeenUrl(urlValue);
    if (urlValue !== committed) {
      setCommitted(urlValue);
      setValue(urlValue);
    }
  }

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const commit = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    if (composing.current) return;
    const next = (inputRef.current?.value ?? "").trim();
    if (next === committed) return;
    setCommitted(next);
    void setParams({ [param]: next || null, page: null });
  };

  const schedule = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(commit, DEBOUNCE_MS);
  };

  return (
    <div role="search" className={cn("relative w-full max-w-sm", className)}>
      <label htmlFor={id} className="sr-only">
        {label ?? placeholder}
      </label>
      <MagnifyingGlassIcon aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        id={id}
        type="search"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        aria-busy={pending || undefined}
        onChange={(event) => {
          setValue(event.target.value);
          if ((event.nativeEvent as InputEvent).isComposing || composing.current) return;
          schedule();
        }}
        onCompositionStart={() => {
          composing.current = true;
          if (timer.current) window.clearTimeout(timer.current);
        }}
        onCompositionEnd={(event) => {
          composing.current = false;
          setValue(event.currentTarget.value);
          schedule();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            commit();
          }
        }}
        className="h-9 w-full rounded-md border border-input bg-card pr-8 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          aria-label="검색어 지우기"
          onClick={() => {
            setValue("");
            if (inputRef.current) inputRef.current.value = "";
            commit();
            inputRef.current?.focus();
          }}
          className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <XIcon aria-hidden className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
