"use client";

import { ShieldCheckIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { MfaEnrollForm } from "@/components/admin/auth/MfaEnrollForm";
import { Button } from "@/components/admin/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/admin/ui/dialog";

/**
 * 내 계정 → "등록하기" (screens appendix 10.19): the WP-02 TOTP enrolment in
 * a dialog. The factor is only created once the dialog opens; a verified
 * code returns to /admin/account, and the page remounts this component with
 * the new factor count, which closes the dialog.
 */
export function AccountMfaEnroll() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" size="lg" className="h-9 px-3.5 text-sm" onClick={() => setOpen(true)}>
        <ShieldCheckIcon aria-hidden data-icon="inline-start" />
        등록하기
      </Button>
      <DialogContent className="max-h-[90dvh] overflow-y-auto p-6 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">2단계 인증</DialogTitle>
          <DialogDescription className="text-sm">2단계 인증을 등록해 주세요.</DialogDescription>
        </DialogHeader>
        {open ? <MfaEnrollForm next="/admin/account" /> : null}
      </DialogContent>
    </Dialog>
  );
}
