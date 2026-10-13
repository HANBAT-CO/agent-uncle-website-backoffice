"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CheckCircleIcon, InfoIcon, WarningCircleIcon, XCircleIcon, SpinnerIcon } from "@phosphor-icons/react"

/**
 * Toasts for the console. Light theme only (spec D12): the theme is fixed,
 * there is no theme provider. Colours come from the admin tokens: success in
 * the deep green, errors and warnings in the attention red (always with their
 * icon and text, spec D13), the description muted. Sonner's own
 * `[data-description]` colour is more specific than a utility, hence `!`.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={{
        success: (
          <CheckCircleIcon weight="fill" className="size-4 text-primary" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <WarningCircleIcon className="size-4 text-status-attention" />
        ),
        error: (
          <XCircleIcon className="size-4 text-status-attention" />
        ),
        loading: (
          <SpinnerIcon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "font-sans",
          description: "text-muted-foreground!",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
