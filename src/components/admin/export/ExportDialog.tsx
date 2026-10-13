"use client";

import { DownloadSimpleIcon, LockKeyIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { parseAsString, useQueryStates } from "nuqs";
import { useId, useState } from "react";

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
import { Input } from "@/components/admin/ui/input";
import { Label } from "@/components/admin/ui/label";
import { Textarea } from "@/components/admin/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/admin/ui/tooltip";
import { hasRole, ROLE_LABEL, type AdminRole } from "@/lib/admin/roles";
import type { ExportKind } from "@/lib/admin/rpc/enums";

const KIND_LABEL: Record<ExportKind, string> = {
  requests: "사입 요청",
  deliveries: "전달 회차",
  receipts: "수령 기록",
  issues: "문제",
  proposals: "변경·취소·정정",
  accounts: "계정",
  leads: "랜딩 문의",
};

const PII_KINDS: ReadonlySet<ExportKind> = new Set(["accounts", "leads"]);

/**
 * "CSV 내보내기" (spec 6, screens 10.9, 10.16): 기간 and 사유, then a plain
 * form POST to /admin/export/{kind}, so the browser downloads the file and the
 * page stays. The route checks Origin, the session and the role again, and
 * the export is audited with the reason. A failure comes back as
 * `?exportError=`, which reopens this dialog with the message.
 */
export function ExportDialog({
  kind,
  minRole,
  role,
  includeDemo = false,
  label = "CSV 내보내기",
}: {
  kind: ExportKind;
  minRole: AdminRole;
  /** The signed-in role; below `minRole` the button is disabled with a hint. */
  role?: AdminRole;
  includeDemo?: boolean;
  label?: string;
}) {
  const id = useId();
  const [failure, setFailure] = useQueryStates(
    { exportError: parseAsString, exportKind: parseAsString },
    { shallow: true, scroll: false, history: "replace" },
  );
  // A failed export returns to the list with the message and its kind; only that dialog reopens.
  const error = failure.exportKind === kind ? failure.exportError : null;
  const [open, setOpen] = useState(Boolean(error));
  const [reason, setReason] = useState("");
  const pii = PII_KINDS.has(kind);
  const allowed = !role || hasRole(role, minRole);

  if (!allowed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex">
            <Button type="button" variant="outline" size="lg" disabled aria-disabled>
              <LockKeyIcon aria-hidden data-icon="inline-start" />
              {label}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{ROLE_LABEL[minRole]} 이상만 내려받을 수 있어요.</TooltipContent>
      </Tooltip>
    );
  }

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next && error) void setFailure({ exportError: null, exportKind: null });
  };

  /** The list this export starts from (without a previous error), for the way back on failure. */
  const currentList = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("exportError");
    url.searchParams.delete("exportKind");
    return `${url.pathname}${url.search}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="lg">
          <DownloadSimpleIcon aria-hidden data-icon="inline-start" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{KIND_LABEL[kind]} CSV 내보내기</DialogTitle>
          <DialogDescription className="text-sm">
            {pii ? "개인정보가 담긴 파일이에요. 사유를 남기고 내려받아요." : "내려받은 기록과 사유는 감사 로그에 남아요. 연락처는 포함되지 않아요."}
          </DialogDescription>
        </DialogHeader>
        <form
          id={`${id}-form`}
          method="post"
          action={`/admin/export/${kind}`}
          onSubmit={(event) => {
            if (reason.trim().length < 5) {
              event.preventDefault();
              return;
            }
            const field = event.currentTarget.elements.namedItem("returnTo");
            if (field instanceof HTMLInputElement) field.value = currentList();
            // The download keeps this page; close the dialog once the browser takes over.
            window.setTimeout(() => setOpen(false), 300);
          }}
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="returnTo" defaultValue="" />
          <input type="hidden" name="demo" value={includeDemo ? "1" : ""} />
          <fieldset className={kind === "accounts" ? "hidden" : "flex flex-col gap-1.5"} disabled={kind === "accounts"}>
            <legend className="mb-1.5 text-sm font-medium">기간 (한국 시간)</legend>
            <div className="flex items-center gap-2">
              <Label htmlFor={`${id}-from`} className="sr-only">
                시작일
              </Label>
              <Input id={`${id}-from`} name="from" type="date" className="num h-9 text-sm" />
              <span aria-hidden className="text-muted-foreground">
                ~
              </span>
              <Label htmlFor={`${id}-to`} className="sr-only">
                종료일
              </Label>
              <Input id={`${id}-to`} name="to" type="date" className="num h-9 text-sm" />
            </div>
            <p className="text-xs text-muted-foreground">비워 두면 전체 기간이에요. 한 번에 5,000행까지 내려받아요.</p>
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-reason`} className="text-sm">
              사유
            </Label>
            <Textarea
              id={`${id}-reason`}
              name="reason"
              required
              minLength={5}
              maxLength={2000}
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">5자 이상 적어 주세요.</p>
          </div>
          {error ? (
            <p role="alert" className="flex items-start gap-1.5 rounded-md bg-status-attention-bg px-3 py-2 text-sm text-status-attention">
              <WarningCircleIcon aria-hidden weight="bold" className="mt-[0.2em] size-4 shrink-0" />
              {error}
            </p>
          ) : null}
        </form>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" size="lg">
              닫기
            </Button>
          </DialogClose>
          <Button type="submit" form={`${id}-form`} size="lg" disabled={reason.trim().length < 5}>
            <DownloadSimpleIcon aria-hidden data-icon="inline-start" />
            내려받기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
