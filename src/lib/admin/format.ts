import { TZDate } from "@date-fns/tz";

/*
 * Console formats (screens appendix 9). Every time is shown in KST, whatever
 * the server (Vercel runs in UTC) or the operator's machine uses. KST has no
 * daylight saving, but the conversion still goes through @date-fns/tz so the
 * rule lives in one place. Client-safe and pure.
 */

export const KST = "Asia/Seoul";

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY_MS = 24 * HOUR;

/** A Date for an ISO timestamp or a plain 'YYYY-MM-DD' (read as a KST day), or null. */
function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const day = DAY.exec(value);
  if (day) {
    if (!isKstDay(value)) return null;
    return new TZDate(Number(day[1]), Number(day[2]) - 1, Number(day[3]), KST);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function kstParts(date: Date) {
  const local = new TZDate(date.getTime(), KST);
  return {
    year: local.getFullYear(),
    month: local.getMonth() + 1,
    day: local.getDate(),
    hour: local.getHours(),
    minute: local.getMinutes(),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * '10월 13일 02:05' in KST; the year is added when it is not the current KST
 * year (or always). '-' for an empty or invalid value.
 */
export function formatKst(
  iso: string | null | undefined,
  opts: { withYear?: "auto" | "always"; time?: boolean; now?: Date } = {},
): string {
  const date = toDate(iso);
  if (!date) return "-";
  const parts = kstParts(date);
  const showYear = opts.withYear === "always" || parts.year !== kstParts(opts.now ?? new Date()).year;
  const datePart = `${showYear ? `${parts.year}년 ` : ""}${parts.month}월 ${parts.day}일`;
  // Plain days carry no time of their own.
  if (opts.time === false || DAY.test(iso ?? "")) return datePart;
  return `${datePart} ${pad(parts.hour)}:${pad(parts.minute)}`;
}

/** 'YYYY-MM-DD HH:mm' in KST for CSV cells (spreadsheets read it as a date); '' when empty. */
export function formatKstStamp(iso: string | null | undefined): string {
  const date = toDate(iso);
  if (!date) return "";
  const p = kstParts(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`;
}

/** '방금', '15분 전', '12시간 전', '3일 전', '2개월 전', '1년 전' (or '… 후' for the future). */
export function formatRelative(iso: string | null | undefined, now: Date = new Date()): string {
  const date = toDate(iso);
  if (!date) return "-";
  const diff = now.getTime() - date.getTime();
  const abs = Math.abs(diff);
  if (abs < MINUTE) return "방금";
  const suffix = diff >= 0 ? "전" : "후";
  if (abs < HOUR) return `${Math.floor(abs / MINUTE)}분 ${suffix}`;
  if (abs < DAY_MS) return `${Math.floor(abs / HOUR)}시간 ${suffix}`;
  if (abs < 30 * DAY_MS) return `${Math.floor(abs / DAY_MS)}일 ${suffix}`;
  if (abs < 365 * DAY_MS) return `${Math.floor(abs / (30 * DAY_MS))}개월 ${suffix}`;
  return `${Math.floor(abs / (365 * DAY_MS))}년 ${suffix}`;
}

/** Elapsed time as a duration: '5시간째' under a day, then '3일째'. At least '1시간째'. */
export function formatSince(iso: string | null | undefined, now: Date = new Date()): string {
  const date = toDate(iso);
  if (!date) return "-";
  const elapsed = Math.max(now.getTime() - date.getTime(), 0);
  if (elapsed < DAY_MS) return `${Math.max(Math.floor(elapsed / HOUR), 1)}시간째`;
  return `${Math.floor(elapsed / DAY_MS)}일째`;
}

/** True for a real calendar day written 'YYYY-MM-DD'. */
export function isKstDay(day: string): boolean {
  const match = DAY.exec(day);
  if (!match) return false;
  const [year, month, date] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || date < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return date <= daysInMonth;
}

/**
 * ISO UTC bounds [from, to) of a KST calendar day (Review Focus 3):
 * '2026-10-13' gives 2026-10-12T15:00:00.000Z to 2026-10-13T15:00:00.000Z.
 */
export function kstDayRange(day: string): { from: string; to: string } {
  if (!isKstDay(day)) throw new RangeError(`not a calendar day: ${day}`);
  const match = DAY.exec(day)!;
  const [year, month, date] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const start = new TZDate(year, month, date, KST);
  const end = new TZDate(year, month, date + 1, KST);
  return { from: new Date(start.getTime()).toISOString(), to: new Date(end.getTime()).toISOString() };
}

/** Today's KST date as 'YYYY-MM-DD'. */
export function kstToday(now: Date = new Date()): string {
  const parts = kstParts(now);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export type QtyUnit = "장" | "건" | "회차" | "곳" | "명" | "개";

/** Number first, then the unit: '2장', '12,345건'. */
export function qty(n: number, unit: QtyUnit): string {
  return `${n.toLocaleString("ko-KR")}${unit}`;
}

/** '512B', '2KB', '12.3MB'. */
export function bytes(n: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Math.max(n, 0);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const text = unit === 0 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, "");
  return `${text}${units[unit]}`;
}

export type DdayTone = "attention" | "normal" | "neutral";

/** Recheck D-day from `recheckDays` (date minus today): '오늘', '3일 지남' (attention), '2일 남음'. */
export function dday(days: number | null | undefined): { label: string; tone: DdayTone } | null {
  if (days === null || days === undefined || !Number.isFinite(days)) return null;
  if (days === 0) return { label: "오늘", tone: "normal" };
  if (days < 0) return { label: `${Math.abs(days)}일 지남`, tone: "attention" };
  return { label: `${days}일 남음`, tone: "neutral" };
}
