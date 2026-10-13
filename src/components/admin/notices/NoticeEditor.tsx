"use client";

import { LockKeyIcon, MegaphoneIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import { saveNoticeAction } from "@/app/(admin)/admin/(console)/notices/actions";
import { StatusChip } from "@/components/admin/common/StatusChip";
import { ActionForm, useActionForm } from "@/components/admin/forms/ActionForm";
import { NativeSelect } from "@/components/admin/forms/NativeSelect";
import { SubmitButton } from "@/components/admin/forms/SubmitButton";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/admin/ui/alert-dialog";
import { Button } from "@/components/admin/ui/button";
import { Input } from "@/components/admin/ui/input";
import { Label } from "@/components/admin/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/admin/ui/sheet";
import { Switch } from "@/components/admin/ui/switch";
import { Textarea } from "@/components/admin/ui/textarea";
import { NOTICE_AUDIENCE_LABEL, NOTICE_SEVERITY_LABEL, NOTICE_STATE_LABEL } from "@/lib/admin/labels";
import { hasRole, type AdminRole } from "@/lib/admin/roles";
import { NOTICE_AUDIENCES, NOTICE_SEVERITIES, type NoticeAudience, type NoticeSeverity } from "@/lib/admin/rpc/enums";
import type { NoticeRow } from "@/lib/admin/rpc/schemas";
import { cn } from "@/lib/admin/utils";

import { NOTICE_COPY, NOTICE_LIMITS, canSaveSeverity, isoToKstLocal, noticeFormSchema, publishDescription } from "./notice-form";
import { NoticePreview } from "./NoticePreview";

type Values = {
  title: string;
  body: string;
  audience: NoticeAudience;
  severity: NoticeSeverity;
  linkUrl: string;
  startsAt: string;
  endsAt: string;
  dismissible: boolean;
};

function initialValues(notice: NoticeRow | null): Values {
  return {
    title: notice?.title ?? "",
    body: notice?.body ?? "",
    audience: notice?.audience ?? "all",
    severity: notice?.severity ?? "info",
    linkUrl: notice?.linkUrl ?? "",
    startsAt: isoToKstLocal(notice?.startsAt),
    endsAt: isoToKstLocal(notice?.endsAt),
    dismissible: notice?.dismissible ?? true,
  };
}

/**
 * 공지 editor Sheet (screens 10.14). Opens from `?notice=new|{id}`; closing
 * goes back to the 공지 tab. Fields are controlled, so the preview follows
 * the typing and a failed save (validation, owner-only, a version conflict)
 * keeps every value. The parent keys this component by id and version: after
 * a save the revalidated page remounts it with the stored notice and a fresh
 * operationId; "최신 내용 불러오기" does the same after a conflict.
 */
export function NoticeEditor({
  notice,
  role,
  operationId,
  closeHref,
}: {
  notice: NoticeRow | null;
  role: AdminRole;
  operationId: string;
  closeHref: string;
}) {
  const router = useRouter();
  const formId = useId();
  const [values, setValues] = useState<Values>(() => initialValues(notice));
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [dialog, setDialog] = useState<"publish" | "end" | null>(null);
  const publishRef = useRef<HTMLButtonElement>(null);
  const endRef = useRef<HTMLButtonElement>(null);

  const canWrite = hasRole(role, "operator");
  const lockedCritical = notice?.severity === "critical" && role !== "owner";
  const readOnly = !canWrite || lockedCritical;
  const criticalBlocked = !canSaveSeverity(role, values.severity);
  const active = notice?.active ?? false;

  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    if (clientErrors[key]) {
      setClientErrors((current) => Object.fromEntries(Object.entries(current).filter(([field]) => field !== key)));
    }
  };

  /** Checks the form like the server does before the publish dialog opens. */
  const validate = (): boolean => {
    const result = noticeFormSchema.safeParse({
      noticeId: notice?.id ?? "",
      version: notice ? String(notice.version) : "",
      ...values,
      dismissible: values.dismissible ? "1" : "0",
      intent: "publish",
    });
    if (result.success) {
      setClientErrors({});
      return true;
    }
    const errors: Record<string, string> = {};
    for (const issue of result.error.issues) errors[String(issue.path[0] ?? "_")] ??= issue.message;
    setClientErrors(errors);
    return false;
  };

  const confirm = (intent: "publish" | "end") => {
    const button = intent === "publish" ? publishRef.current : endRef.current;
    button?.form?.requestSubmit(button);
    setDialog(null);
  };

  const close = () => router.push(closeHref, { scroll: false });
  const audienceLabel = NOTICE_AUDIENCE_LABEL[values.audience];

  return (
    <Sheet open onOpenChange={(open) => (open ? undefined : close())}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto data-[side=right]:sm:max-w-[min(60rem,94vw)]">
        <SheetHeader className="gap-2 border-b pr-14">
          <div className="flex flex-wrap items-center gap-2">
            <SheetTitle className="text-base font-semibold">{notice ? "공지 편집" : "새 공지"}</SheetTitle>
            {notice ? <StatusChip label={NOTICE_STATE_LABEL[notice.state]} /> : null}
            {notice ? <span className="num text-xs text-muted-foreground">버전 {notice.version}</span> : null}
          </div>
          <SheetDescription className="text-xs">
            {readOnly
              ? lockedCritical
                ? NOTICE_COPY.criticalOwnerOnly
                : "열람자는 공지를 볼 수만 있어요."
              : "게시한 공지는 대상 계정이 앱을 열 때 보여요. 내용을 바꾸면 버전이 올라가고, 닫았던 사용자에게도 다시 보여요."}
          </SheetDescription>
        </SheetHeader>

        <div className="grid gap-8 p-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <ActionForm
            id={formId}
            action={saveNoticeAction}
            operationId={operationId}
            resetOnSuccess={false}
            aria-label={notice ? "공지 편집" : "새 공지"}
            onSuccess={(state) => {
              const saved = state.data as { noticeId?: string } | undefined;
              if (!notice && saved?.noticeId) router.replace(`/admin/notices?tab=notices&notice=${saved.noticeId}`, { scroll: false });
            }}
          >
            <input type="hidden" name="noticeId" value={notice?.id ?? ""} />
            <input type="hidden" name="version" value={notice ? String(notice.version) : ""} />
            <input type="hidden" name="dismissible" value={values.dismissible ? "1" : "0"} />
            <fieldset disabled={readOnly} className="flex flex-col gap-4 disabled:opacity-80">
              <Field name="title" label="제목" count={`${Array.from(values.title).length}/${NOTICE_LIMITS.title}`} clientError={clientErrors.title}>
                {(props) => (
                  <Input {...props} value={values.title} maxLength={NOTICE_LIMITS.title} onChange={(event) => set("title", event.target.value)} className="h-9 text-sm" autoComplete="off" />
                )}
              </Field>
              <Field name="body" label="내용" count={`${Array.from(values.body).length.toLocaleString("ko-KR")}/2,000`} clientError={clientErrors.body}>
                {(props) => (
                  <Textarea {...props} value={values.body} maxLength={NOTICE_LIMITS.body} rows={6} onChange={(event) => set("body", event.target.value)} className="text-sm" />
                )}
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field name="audience" label="대상" clientError={clientErrors.audience}>
                  {(props) => (
                    <NativeSelect {...props} value={values.audience} onChange={(event) => set("audience", event.target.value as NoticeAudience)}>
                      {NOTICE_AUDIENCES.map((audience) => (
                        <option key={audience} value={audience}>
                          {NOTICE_AUDIENCE_LABEL[audience]}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </Field>
                <Field
                  name="severity"
                  label="중요도"
                  clientError={criticalBlocked && canWrite ? NOTICE_COPY.criticalOwnerOnly : clientErrors.severity}
                >
                  {(props) => (
                    <NativeSelect {...props} value={values.severity} onChange={(event) => set("severity", event.target.value as NoticeSeverity)}>
                      {NOTICE_SEVERITIES.map((severity) => (
                        <option key={severity} value={severity}>
                          {NOTICE_SEVERITY_LABEL[severity]}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </Field>
              </div>
              <Field name="linkUrl" label="링크" hint="https 주소만 넣을 수 있어요. 비워 두면 링크 없이 보여요." clientError={clientErrors.linkUrl}>
                {(props) => (
                  <Input
                    {...props}
                    value={values.linkUrl}
                    inputMode="url"
                    placeholder="https://"
                    maxLength={NOTICE_LIMITS.link}
                    onChange={(event) => set("linkUrl", event.target.value)}
                    className="h-9 text-sm"
                    autoComplete="off"
                  />
                )}
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field name="startsAt" label="시작 (한국 시간)" hint={notice ? "비워 두면 지금 시작 시각을 그대로 써요." : "비워 두면 저장하는 때부터 보여요."} clientError={clientErrors.startsAt}>
                  {(props) => (
                    <Input {...props} type="datetime-local" value={values.startsAt} onChange={(event) => set("startsAt", event.target.value)} className="num h-9 text-sm" />
                  )}
                </Field>
                <Field name="endsAt" label="종료 (한국 시간)" hint="비워 두면 내릴 때까지 보여요." clientError={clientErrors.endsAt}>
                  {(props) => (
                    <Input {...props} type="datetime-local" value={values.endsAt} onChange={(event) => set("endsAt", event.target.value)} className="num h-9 text-sm" />
                  )}
                </Field>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border bg-background/50 px-3 py-2.5">
                <Label htmlFor={`${formId}-dismissible`} className="flex flex-col items-start gap-0.5 text-sm">
                  닫기 허용
                  <span className="text-xs font-normal text-muted-foreground">켜면 사용자가 공지를 닫을 수 있어요.</span>
                </Label>
                <Switch id={`${formId}-dismissible`} checked={values.dismissible} onCheckedChange={(checked) => set("dismissible", checked)} />
              </div>
            </fieldset>

            {canWrite && !lockedCritical ? (
              <>
                <button ref={publishRef} type="submit" name="intent" value="publish" hidden tabIndex={-1} aria-hidden />
                <button ref={endRef} type="submit" name="intent" value="end" hidden tabIndex={-1} aria-hidden />
                <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                  {!active ? (
                    <SubmitButton name="intent" value="draft" variant="outline" disabled={criticalBlocked}>
                      {NOTICE_COPY.saveDraft}
                    </SubmitButton>
                  ) : null}
                  <PublishButton disabled={criticalBlocked} onClick={() => (validate() ? setDialog("publish") : undefined)} />
                  {notice && active ? (
                    <Button type="button" variant="outline" size="lg" className="ml-auto" onClick={() => setDialog("end")}>
                      {NOTICE_COPY.end}
                    </Button>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="flex items-center gap-1.5 border-t pt-4 text-xs text-muted-foreground">
                <LockKeyIcon aria-hidden weight="bold" className="size-3.5" />
                {lockedCritical ? NOTICE_COPY.criticalOwnerOnly : "운영자 이상만 공지를 바꿀 수 있어요."}
              </p>
            )}
          </ActionForm>

          <NoticePreview
            title={values.title}
            body={values.body}
            severity={values.severity}
            linkUrl={values.linkUrl}
            dismissible={values.dismissible}
            audienceLabel={audienceLabel}
          />
        </div>

        <AlertDialog open={dialog !== null} onOpenChange={(open) => (open ? undefined : setDialog(null))}>
          <AlertDialogContent className="sm:max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-base">{dialog === "end" ? NOTICE_COPY.endTitle : NOTICE_COPY.publishTitle}</AlertDialogTitle>
              <AlertDialogDescription className="text-sm">
                {dialog === "end" ? NOTICE_COPY.endDescription : publishDescription(values.audience)}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel size="lg">닫기</AlertDialogCancel>
              <Button type="button" size="lg" onClick={() => confirm(dialog === "end" ? "end" : "publish")}>
                {dialog === "end" ? NOTICE_COPY.end : NOTICE_COPY.publish}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}

function PublishButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  const { pending } = useActionForm();
  return (
    <Button type="button" size="lg" disabled={disabled || pending} onClick={onClick}>
      <MegaphoneIcon aria-hidden data-icon="inline-start" />
      {pending ? "저장하는 중…" : NOTICE_COPY.publish}
    </Button>
  );
}

type FieldProps = { id: string; name: string; "aria-invalid"?: true; "aria-describedby": string };

/** Label, control, hint or counter, and the field error (from the client check or the server). */
function Field({
  name,
  label,
  hint,
  count,
  clientError,
  children,
}: {
  name: string;
  label: string;
  hint?: string;
  count?: string;
  clientError?: string;
  children: (props: FieldProps) => React.ReactNode;
}) {
  const id = useId();
  const { fieldError } = useActionForm();
  const error = clientError ?? fieldError(name);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id} className="text-sm">
          {label}
        </Label>
        {count ? <span className="num text-xs text-muted-foreground">{count}</span> : null}
      </div>
      {children({ id, name, "aria-invalid": error ? true : undefined, "aria-describedby": `${id}-hint` })}
      <p id={`${id}-hint`} className={cn("text-xs", error ? "flex items-start gap-1.5 text-status-attention" : "text-muted-foreground", !error && !hint && "sr-only")}>
        {error ? <WarningCircleIcon aria-hidden weight="bold" className="mt-[0.15em] size-3.5 shrink-0" /> : null}
        {error ?? hint ?? label}
      </p>
    </div>
  );
}
