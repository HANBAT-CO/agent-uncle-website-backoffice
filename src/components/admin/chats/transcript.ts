import { TZDate } from "@date-fns/tz";

import { formatKst, KST } from "@/lib/admin/format";
import type { AccountBrief, ChatMessage } from "@/lib/admin/rpc/schemas";

/*
 * 채팅 열람 transcript helpers (screens 10.13). Pure and client-safe: the
 * transcript itself only ever lives in client state (TranscriptPane), so
 * paging, ordering and the bubble/card layout are computed here.
 */

export const CHAT_COPY = {
  openButton: "사유와 함께 열람",
  dialogTitle: "대화를 열람할까요?",
  dialogDescription: "열람 사유와 운영자 이름이 감사 로그에 남아요.",
  viewerTooltip: "운영자 이상만 대화를 열람할 수 있어요.",
  loadOlder: "이전 대화 더 보기",
  loadingOlder: "이전 대화를 불러오는 중…",
  systemLabel: "업무 기록",
  empty: "아직 메시지가 없어요",
  closeTranscript: "대화 닫기",
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An account id from `?a=` / `?b=`. */
export function isPairId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export type PairIds = { a: string; b: string };

/** Same two accounts, in either order. */
export function samePair(x: PairIds, y: PairIds): boolean {
  if (x.a === x.b || y.a === y.b) return false;
  return (x.a === y.a && x.b === y.b) || (x.a === y.b && x.b === y.a);
}

/** Order-free key of a pair (React keys, highlighting). */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** The retailer on the left (grey bubbles), the 사입삼촌 on the right (green bubbles). */
export function pairSides(a: AccountBrief, b: AccountBrief): { left: AccountBrief; right: AccountBrief } {
  if (a.role === "uncle" && b.role !== "uncle") return { left: b, right: a };
  return { left: a, right: b };
}

// BigInt literals need ES2020; the project targets ES2017.
const MICROS_PER_MS = BigInt(1000);
const MICROS_PER_SECOND = BigInt(1_000_000);
const ONE_MICRO = BigInt(1);

const ISO = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:?\d{2})?$/i;

/** Microseconds since the epoch of a Postgres timestamptz in JSON, or null. */
function micros(iso: string | null | undefined): bigint | null {
  const match = ISO.exec(iso ?? "");
  if (!match) return null;
  const ms = Date.parse(`${match[1]}${match[3] ?? "Z"}`);
  if (Number.isNaN(ms)) return null;
  const fraction = `${match[2] ?? ""}000000`.slice(0, 6);
  return BigInt(ms) * MICROS_PER_MS + BigInt(fraction);
}

function microsToIso(value: bigint): string {
  const seconds = value / MICROS_PER_SECOND;
  const fraction = String(value % MICROS_PER_SECOND).padStart(6, "0");
  return `${new Date(Number(seconds) * 1000).toISOString().slice(0, 19)}.${fraction}Z`;
}

/**
 * `p_before` for the next older page: the oldest loaded time plus 1µs. The
 * SQL filter is strict (`createdAt < p_before`), so messages sharing the
 * boundary time come back once more and mergeOlder drops the duplicates
 * instead of skipping them.
 */
export function olderCursor(messages: readonly ChatMessage[]): string | null {
  let oldest: bigint | null = null;
  for (const message of messages) {
    const value = micros(message.createdAt);
    if (value !== null && (oldest === null || value < oldest)) oldest = value;
  }
  return oldest === null ? null : microsToIso(oldest + ONE_MICRO);
}

function compare(x: ChatMessage, y: ChatMessage): number {
  const a = micros(x.createdAt);
  const b = micros(y.createdAt);
  if (a !== b) {
    if (a === null) return 1;
    if (b === null) return -1;
    return a < b ? -1 : 1;
  }
  return x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
}

/** Older page + current transcript: unique by id, oldest first (ties by id, like the SQL). */
export function mergeOlder(current: readonly ChatMessage[], older: readonly ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const message of older) byId.set(message.id, message);
  for (const message of current) byId.set(message.id, message);
  return [...byId.values()].sort(compare);
}

export type TimelineItem =
  | { type: "day"; key: string; label: string }
  | {
      type: "message";
      key: string;
      message: ChatMessage;
      /** start: left bubble, end: right bubble, card: 업무 기록. */
      side: "start" | "end" | "card";
      time: string;
      showSender: boolean;
    };

const pad = (n: number) => String(n).padStart(2, "0");

function kstClock(iso: string | null | undefined): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  const k = new TZDate(date.getTime(), KST);
  return `${pad(k.getHours())}:${pad(k.getMinutes())}`;
}

/** Bubbles, 업무 기록 cards and KST day lines, in transcript order. */
export function buildTimeline(
  messages: readonly ChatMessage[],
  sides: { left: AccountBrief; right: AccountBrief },
  now: Date = new Date(),
): TimelineItem[] {
  const items: TimelineItem[] = [];
  let day: string | null = null;
  let previousSender: string | null = null;
  for (const message of messages) {
    if (message.createdAt) {
      const label = formatKst(message.createdAt, { time: false, now });
      if (label !== "-" && label !== day) {
        day = label;
        items.push({ type: "day", key: `day-${label}`, label });
        previousSender = null;
      }
    }
    const side = message.system ? "card" : message.senderId === sides.right.id ? "end" : "start";
    const sender = message.senderId ?? "";
    const showSender = side !== "card" && previousSender !== sender;
    previousSender = side === "card" ? null : sender;
    items.push({ type: "message", key: message.id, message, side, time: kstClock(message.createdAt), showSender });
  }
  return items;
}

/** Requests linked from the loaded messages, each once, most recent first. */
export function relatedRequestIds(messages: readonly ChatMessage[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const id = messages[index].requestId?.trim();
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}
