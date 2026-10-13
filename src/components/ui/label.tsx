"use client";

import * as LabelPrimitive from "@radix-ui/react-label";
import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

/** Field label above its control (spec 10): 15px Paperlogy 700, #2D2D2D. Never a placeholder. */
export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn("block text-[15px] leading-[1.4] font-bold text-grey-800 select-none", className)}
      {...props}
    />
  );
}
