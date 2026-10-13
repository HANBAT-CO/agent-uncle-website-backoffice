"use client";

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

/**
 * Radix radio group, unstyled except for focus: callers shape the items (role
 * cards, market chips). Inside a <form> each item renders a hidden native
 * radio named after the group, so FormData carries the value.
 */
export function RadioGroup({ className, ...props }: ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return <RadioGroupPrimitive.Root data-slot="radio-group" className={cn("grid gap-3", className)} {...props} />;
}

export function RadioGroupItem({ className, ...props }: ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-800 focus-visible:outline-solid",
        "disabled:cursor-not-allowed",
        className,
      )}
      {...props}
    />
  );
}

export function RadioGroupIndicator({ className, ...props }: ComponentProps<typeof RadioGroupPrimitive.Indicator>) {
  return <RadioGroupPrimitive.Indicator data-slot="radio-group-indicator" className={className} {...props} />;
}
