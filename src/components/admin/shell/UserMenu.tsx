"use client";

import { CaretDownIcon, SignOutIcon, UserCircleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRef } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/admin/ui/dropdown-menu";
import { signOutAction } from "@/lib/admin/auth/actions";
import { ROLE_LABEL, type AdminRole } from "@/lib/admin/roles";

/** First visible character of a name, for the avatar. */
function initial(name: string): string {
  return Array.from(name.trim())[0] ?? "운";
}

/**
 * Top-bar account menu: who is signed in, 내 계정, and 로그아웃 (this
 * browser, WP-02 signOutAction). The sign-out form lives outside the menu
 * content, which unmounts when the menu closes.
 */
export function UserMenu({ name, email, role }: { name: string; email: string | null; role: AdminRole }) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <form ref={formRef} action={signOutAction} className="hidden">
        <input type="hidden" name="scope" value="local" />
      </form>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex h-8 max-w-56 shrink-0 items-center gap-2 rounded-full py-0.5 pr-2.5 pl-0.5 text-left text-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30 aria-expanded:bg-muted"
        >
          <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            {initial(name)}
          </span>
          {/* The accessible name is the visible name and role plus a hidden hint (WCAG 2.5.3). */}
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate font-semibold text-foreground">{name}</span>
            <span className="text-[0.6875rem] text-muted-foreground">
              {ROLE_LABEL[role]}
              <span className="sr-only"> 계정 메뉴</span>
            </span>
          </span>
          <CaretDownIcon aria-hidden className="size-3 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="truncate text-xs font-semibold text-foreground">{name}</span>
            {email ? <span className="truncate text-[0.6875rem] font-normal text-muted-foreground">{email}</span> : null}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <Link href="/admin/account">
                <UserCircleIcon aria-hidden />내 계정
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => formRef.current?.requestSubmit()}>
              <SignOutIcon aria-hidden />
              로그아웃
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
