import { TZDate } from "@date-fns/tz";
import { z } from "zod";

import { formatKst, isKstDay, KST } from "@/lib/admin/format";
import { NOTICE_AUDIENCE_LABEL } from "@/lib/admin/labels";
import type { AdminRole } from "@/lib/admin/roles";
import { NOTICE_AUDIENCES, NOTICE_SEVERITIES, type NoticeAudience, type NoticeSeverity } from "@/lib/admin/rpc/enums";

/*
 * 알림·공지 editor contract (screens 10.14, tasks WP-09). Client-safe and
 * pure: the editor validates with it as you type, and saveNoticeAction parses
 * the submitted FormData with the same schema before backoffice_save_notice,
 * whose own checks (and messages) it mirrors.
 */

export const NOTICE_LIMITS = { title: 80, body: 2000, link: 500 } as const;

export const NOTICE_COPY = {
  pushBanner: "원격 푸시는 아직 연결하지 않았어요. 공지는 앱이 이 기능을 지원하도록 업데이트된 뒤부터, 앱을 열 때 보여요.",
  criticalOwnerOnly: "긴급 공지는 관리자만 게시할 수 있어요.",
  publishTitle: "공지를 게시할까요?",
  endTitle: "공지를 내릴까요?",
  endDescription: "앱에서 바로 보이지 않게 돼요. 기록은 지우지 않아요.",
  saveDraft: "초안 저장",
  publish: "공지 게시",
  end: "공지 내리기",
  savedDraft: "초안을 저장했어요",
  published: "공지를 게시했어요",
  ended: "공지를 내렸어요",
} as const;

export const NOTICE_MESSAGES = {
  title: "공지 제목은 1~80자로 입력해 주세요.",
  body: "공지 내용은 1~2,000자로 입력해 주세요.",
  audience: "공지 대상을 선택해 주세요.",
  severity: "공지 중요도를 선택해 주세요.",
  linkHttps: "링크는 https 주소만 넣을 수 있어요.",
  linkLength: "링크는 500자 이하로 입력해 주세요.",
  startsAt: "시작 시각을 다시 입력해 주세요.",
  endsAt: "종료 시각을 다시 입력해 주세요.",
  window: "종료 시각은 시작 시각보다 늦어야 해요.",
} as const;

export const NOTICE_INTENTS = ["draft", "publish", "end"] as const;
export type NoticeIntent = (typeof NOTICE_INTENTS)[number];

const LOCAL = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
const pad = (n: number) => String(n).padStart(2, "0");

/** A `<input type="datetime-local">` value read as Korean time, as ISO UTC; null when empty or not a real time. */
export function kstLocalToIso(value: string | null | undefined): string | null {
  const match = LOCAL.exec(value?.trim() ?? "");
  if (!match || !isKstDay(match[1])) return null;
  const [year, month, day] = match[1].split("-").map(Number);
  const [hour, minute, second] = [Number(match[2]), Number(match[3]), Number(match[4] ?? 0)];
  if (hour > 23 || minute > 59 || second > 59) return null;
  return new Date(new TZDate(year, month - 1, day, hour, minute, second, KST).getTime()).toISOString();
}

/** An ISO time as a KST datetime-local value 'YYYY-MM-DDTHH:mm'; '' when empty or invalid. */
export function isoToKstLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const k = new TZDate(date.getTime(), KST);
  return `${k.getFullYear()}-${pad(k.getMonth() + 1)}-${pad(k.getDate())}T${pad(k.getHours())}:${pad(k.getMinutes())}`;
}

const trimmed = (max: number, message: string) =>
  z
    .string({ error: message })
    .transform((value) => value.trim())
    .pipe(z.string().min(1, message).max(max, message));

const optionalText = z
  .string()
  .optional()
  .transform((value) => value?.trim() ?? "");

const localTime = (message: string) =>
  optionalText.transform((value, ctx) => {
    if (!value) return null;
    const iso = kstLocalToIso(value);
    if (!iso) {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    return iso;
  });

const linkUrl = optionalText.transform((value, ctx) => {
  if (!value) return null;
  let url: URL | null = null;
  try {
    url = new URL(value);
  } catch {
    url = null;
  }
  if (!url || url.protocol !== "https:" || !url.hostname || !value.toLowerCase().startsWith("https://")) {
    ctx.addIssue({ code: "custom", message: NOTICE_MESSAGES.linkHttps });
    return z.NEVER;
  }
  if (value.length > NOTICE_LIMITS.link) {
    ctx.addIssue({ code: "custom", message: NOTICE_MESSAGES.linkLength });
    return z.NEVER;
  }
  return value;
});

export const noticeFormSchema = z
  .object({
    noticeId: optionalText.pipe(z.union([z.literal(""), z.uuid()])).transform((value) => value || null),
    version: optionalText
      .pipe(z.union([z.literal(""), z.string().regex(/^\d+$/)]))
      .transform((value) => (value === "" ? null : Number(value))),
    title: trimmed(NOTICE_LIMITS.title, NOTICE_MESSAGES.title),
    body: trimmed(NOTICE_LIMITS.body, NOTICE_MESSAGES.body),
    audience: z.enum(NOTICE_AUDIENCES, { error: NOTICE_MESSAGES.audience }),
    severity: z.enum(NOTICE_SEVERITIES, { error: NOTICE_MESSAGES.severity }),
    linkUrl,
    startsAt: localTime(NOTICE_MESSAGES.startsAt),
    endsAt: localTime(NOTICE_MESSAGES.endsAt),
    dismissible: optionalText.transform((value) => value === "1" || value === "on" || value === "true"),
    intent: z.enum(NOTICE_INTENTS),
  })
  .superRefine((value, ctx) => {
    if (value.startsAt && value.endsAt && Date.parse(value.endsAt) <= Date.parse(value.startsAt)) {
      ctx.addIssue({ code: "custom", message: NOTICE_MESSAGES.window, path: ["endsAt"] });
    }
  });

export type NoticeFormValues = z.infer<typeof noticeFormSchema>;

/** Arguments of rpc.saveNotice (without operationId): publish sets active, draft and end clear it. */
export function noticeInputFromForm(values: NoticeFormValues): {
  noticeId: string | null;
  version: number | null;
  title: string;
  body: string;
  audience: NoticeAudience;
  severity: NoticeSeverity;
  linkUrl: string | null;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  dismissible: boolean;
} {
  return {
    noticeId: values.noticeId,
    version: values.version,
    title: values.title,
    body: values.body,
    audience: values.audience,
    severity: values.severity,
    linkUrl: values.linkUrl,
    startsAt: values.startsAt,
    endsAt: values.endsAt,
    active: values.intent === "publish",
    dismissible: values.dismissible,
  };
}

/** Info and important need an operator; critical needs the owner (spec 6). */
export function canSaveSeverity(role: AdminRole, severity: NoticeSeverity): boolean {
  if (role === "viewer") return false;
  return severity !== "critical" || role === "owner";
}

/** Publish dialog consequence: "{대상}에게 앱을 열 때 보여요." */
export function publishDescription(audience: NoticeAudience): string {
  return `${NOTICE_AUDIENCE_LABEL[audience]}에게 앱을 열 때 보여요.`;
}

/** 노출 기간: '10월 13일 15:40부터' or '10월 13일 15:40 ~ 10월 20일 18:00' (KST). */
export function noticeWindowLabel(startsAt: string, endsAt: string | null, now: Date = new Date()): string {
  const start = formatKst(startsAt, { now });
  return endsAt ? `${start} ~ ${formatKst(endsAt, { now })}` : `${start}부터`;
}
