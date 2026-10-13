"use client";

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import type { ComponentProps } from "react";

import { AppIcon } from "@/components/icons/AppIcon";
import { cn } from "@/lib/cn";

/**
 * Radix checkbox as a 24px circle (tokens and pills are full radius, spec
 * 4.4): 1.5px #808080 ring when empty, #0C483E fill with the app's check when
 * checked. Pair it with a Label (htmlFor) so the whole row is the 44px target.
 * aria-invalid draws the deep-green ring heavier instead of turning red.
 */
export function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer grid size-6 shrink-0 place-items-center rounded-pill border-[1.5px] border-grey-500 bg-surface text-surface",
        "transition-[background-color,border-color] duration-200 ease-snap",
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-800 focus-visible:outline-solid",
        "data-[state=checked]:border-green-800 data-[state=checked]:bg-green-800",
        "aria-invalid:border-2 aria-invalid:border-green-800",
        "disabled:cursor-not-allowed",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator data-slot="checkbox-indicator" className="grid place-items-center">
        <AppIcon name="check" size={16} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
