"use client";

import { useId, useState } from "react";

import { grantAdminAction } from "@/app/(admin)/admin/(console)/admins/actions";
import { ActionForm } from "@/components/admin/forms/ActionForm";
import { NativeSelect } from "@/components/admin/forms/NativeSelect";
import { SubmitButton } from "@/components/admin/forms/SubmitButton";
import { Button } from "@/components/admin/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/admin/ui/dialog";
import { Label } from "@/components/admin/ui/label";
import { ADMIN_ROLES, ROLE_LABEL, type AdminRole } from "@/lib/admin/roles";

/** Roles from the highest down, as the role select lists them. */
export const ROLE_OPTIONS = [...ADMIN_ROLES].reverse();

/**
 * "역할 변경" (screens 10.18): the same grant RPC with the current name and
 * 2단계 인증 setting. Postgres keeps the last owner and refuses your own row.
 */
export function RoleChangeDialog({
  userId,
  name,
  role,
  requireMfa,
  operationId,
}: {
  userId: string;
  name: string;
  role: AdminRole;
  requireMfa: boolean;
  operationId: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" aria-label={`${name} 역할 변경`}>
          역할 변경
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <ActionForm
          action={grantAdminAction}
          operationId={operationId}
          successMessage="역할을 바꿨어요"
          resetOnSuccess={false}
          onSuccess={() => setOpen(false)}
          aria-label="역할 변경"
        >
          <DialogHeader>
            <DialogTitle className="text-base">역할 변경</DialogTitle>
            <DialogDescription className="text-sm">{name}의 역할을 바꿔요. 바뀐 권한은 다음 화면부터 바로 적용돼요.</DialogDescription>
          </DialogHeader>
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="displayName" value={name} />
          <input type="hidden" name="requireMfa" value={requireMfa ? "true" : "false"} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-role`} className="text-sm">
              역할
            </Label>
            <NativeSelect id={`${id}-role`} name="role" defaultValue={role}>
              {ROLE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {ROLE_LABEL[option]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" size="lg">
                닫기
              </Button>
            </DialogClose>
            <SubmitButton>역할 변경</SubmitButton>
          </DialogFooter>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
