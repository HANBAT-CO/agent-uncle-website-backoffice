"use client";

import { MagnifyingGlassIcon, PlusIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useId, useState, useTransition } from "react";

import { grantAdminAction, lookupUserAction, type LookupResult } from "@/app/(admin)/admin/(console)/admins/actions";
import { DefinitionList } from "@/components/admin/common/DefinitionList";
import { KstTime } from "@/components/admin/common/KstTime";
import { ActionForm, useActionForm } from "@/components/admin/forms/ActionForm";
import { NativeSelect } from "@/components/admin/forms/NativeSelect";
import { SubmitButton } from "@/components/admin/forms/SubmitButton";
import { Button } from "@/components/admin/ui/button";
import { Input } from "@/components/admin/ui/input";
import { Label } from "@/components/admin/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/admin/ui/sheet";
import { Switch } from "@/components/admin/ui/switch";
import { PROVIDER_LABEL } from "@/lib/admin/labels";
import { ROLE_LABEL } from "@/lib/admin/roles";
import type { LookupUser } from "@/lib/admin/rpc/schemas";

import { ROLE_OPTIONS } from "./RoleChangeDialog";

/**
 * "운영 계정 추가" (spec 5 staff onboarding; screens 10.18):
 * 1. look the email up (audited): providers, email confirmation, app account;
 * 2. grant 역할, 이름 and "2단계 인증 필수" (on). Refusals come from
 *    Postgres verbatim (unconfirmed email, app account, your own row).
 */
export function GrantAdminSheet({ operationId }: { operationId: string }) {
  const [open, setOpen] = useState(false);
  const [lookup, setLookup] = useState<LookupResult | null>(null);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setLookup(null);
      }}
    >
      <SheetTrigger asChild>
        <Button type="button" size="lg">
          <PlusIcon aria-hidden data-icon="inline-start" />
          운영 계정 추가
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 data-[side=right]:sm:max-w-md">
        <SheetHeader className="border-b pb-4">
          <SheetTitle className="text-base">운영 계정 추가</SheetTitle>
          <SheetDescription className="text-sm">새 운영자가 운영 화면에 한 번 로그인한 뒤, 그 이메일을 조회해 권한을 부여해요.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
          <LookupStep onResult={setLookup} />
          {lookup && !lookup.ok ? (
            <p role="alert" className="flex items-start gap-1.5 rounded-md bg-status-attention-bg px-3 py-2 text-sm text-status-attention">
              <WarningCircleIcon aria-hidden weight="bold" className="mt-[0.2em] size-4 shrink-0" />
              {lookup.message}
            </p>
          ) : null}
          {lookup?.ok ? (
            <>
              <LookupSummary user={lookup.user} />
              <GrantStep key={lookup.user.userId} user={lookup.user} operationId={operationId} onGranted={() => setOpen(false)} />
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function LookupStep({ onResult }: { onResult: (result: LookupResult) => void }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <form
      role="search"
      aria-label="운영 계정 조회"
      className="flex flex-col gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          try {
            onResult(await lookupUserAction(email));
          } catch {
            onResult({ ok: false, message: "잠시 후 다시 시도해 주세요." });
          }
        });
      }}
    >
      <Label htmlFor={id} className="text-sm">
        이메일
      </Label>
      <div className="flex gap-2">
        <Input
          id={id}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          required
          className="h-9 flex-1 text-sm"
        />
        <Button type="submit" variant="outline" size="lg" disabled={pending || email.trim() === ""}>
          <MagnifyingGlassIcon aria-hidden data-icon="inline-start" />
          {pending ? "조회하는 중…" : "조회"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">조회한 기록도 감사 로그에 남아요.</p>
    </form>
  );
}

function LookupSummary({ user }: { user: LookupUser }) {
  const staff = user.staff ? (user.staff.revokedAt ? `${ROLE_LABEL[user.staff.role]} (해제됨)` : ROLE_LABEL[user.staff.role]) : "없음";
  return (
    <section aria-label="조회 결과" data-testid="lookup-result" className="flex flex-col gap-3 rounded-lg border bg-background/50 p-3">
      <p className="text-sm font-semibold break-words text-foreground">{user.email}</p>
      <DefinitionList
        columns={2}
        items={[
          { term: "로그인 수단", value: user.providers.map((provider) => PROVIDER_LABEL[provider] ?? provider).join(" · ") || "-" },
          { term: "이메일 인증", value: user.emailConfirmed ? "확인함" : "확인 전" },
          { term: "앱 계정", value: user.hasAppAccount ? "있음" : "없음" },
          { term: "운영 권한", value: staff },
          { term: "최근 로그인", value: <KstTime iso={user.lastSignInAt} /> },
        ]}
      />
      {user.hasAppAccount ? (
        <p className="text-xs text-status-attention">앱에서 쓰는 계정은 운영 계정으로 쓸 수 없어요. 운영용 아이디로 만든 계정을 등록해 주세요.</p>
      ) : null}
      {!user.emailConfirmed ? <p className="text-xs text-status-attention">이메일 인증을 마친 계정만 운영 계정으로 등록할 수 있어요.</p> : null}
    </section>
  );
}

function GrantStep({ user, operationId, onGranted }: { user: LookupUser; operationId: string; onGranted: () => void }) {
  const id = useId();
  const [requireMfa, setRequireMfa] = useState(true);
  return (
    <ActionForm action={grantAdminAction} operationId={operationId} onSuccess={onGranted} aria-label="권한 부여">
      <input type="hidden" name="userId" value={user.userId} />
      <input type="hidden" name="requireMfa" value={requireMfa ? "true" : "false"} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-role`} className="text-sm">
          역할
        </Label>
        <NativeSelect id={`${id}-role`} name="role" defaultValue={user.staff?.role ?? "viewer"}>
          {ROLE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {ROLE_LABEL[option]}
            </option>
          ))}
        </NativeSelect>
      </div>
      <NameField id={`${id}-name`} />
      <div className="flex items-start justify-between gap-4 rounded-lg border bg-background/50 px-3 py-2.5">
        <div className="flex flex-col gap-0.5">
          <Label htmlFor={`${id}-mfa`} className="text-sm font-medium">
            2단계 인증 필수
          </Label>
          <p className="text-xs text-muted-foreground">켜 두면 다음 로그인부터 인증 앱 코드를 확인해요.</p>
        </div>
        <Switch id={`${id}-mfa`} checked={requireMfa} onCheckedChange={setRequireMfa} className="mt-0.5" />
      </div>
      <div className="flex justify-end">
        <SubmitButton>권한 부여</SubmitButton>
      </div>
    </ActionForm>
  );
}

function NameField({ id }: { id: string }) {
  const { fieldError } = useActionForm();
  const error = fieldError("displayName");
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-sm">
        이름
      </Label>
      <Input id={id} name="displayName" maxLength={60} required aria-invalid={error ? true : undefined} className="h-9 text-sm" />
      <p className={error ? "text-xs text-status-attention" : "text-xs text-muted-foreground"}>{error ?? "운영 화면과 감사 로그에 보이는 이름이에요."}</p>
    </div>
  );
}
