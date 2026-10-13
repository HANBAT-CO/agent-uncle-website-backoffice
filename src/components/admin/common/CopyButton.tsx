"use client";

import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import { Button } from "@/components/admin/ui/button";

/** Copies text to the clipboard ("링크 복사", "ID 복사"); confirms for two seconds. */
export function CopyButton({
  value,
  label = "복사",
  copiedLabel = "복사했어요",
  variant = "outline",
  size = "lg",
  className,
}: {
  value: string | (() => string);
  label?: string;
  copiedLabel?: string;
  variant?: "outline" | "ghost" | "secondary";
  size?: "sm" | "lg" | "default";
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(typeof value === "function" ? value() : value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Button type="button" variant={variant} size={size} onClick={copy} className={className}>
      {copied ? <CheckIcon aria-hidden data-icon="inline-start" /> : <CopyIcon aria-hidden data-icon="inline-start" />}
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </Button>
  );
}
