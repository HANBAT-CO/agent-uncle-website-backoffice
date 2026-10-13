import { TZDate } from "@date-fns/tz";

import { bytes, KST, kstToday, qty, type QtyUnit } from "@/lib/admin/format";
import type { Overview } from "@/lib/admin/rpc/schemas";

/*
 * 대시보드 view model (screens 10.5): range, KPI tiles with their filtered
 * list links, the side summary lines, the "{HH:mm} 기준" stamp and the chart
 * series. Client-safe and pure, so the copy is unit-tested.
 */

export const RANGES = [1, 7, 30] as const;
export type Range = (typeof RANGES)[number];

export const RANGE_LABEL: Record<Range, string> = { 1: "오늘", 7: "7일", 30: "30일" };

/** `?range=1|7|30`; anything else is 오늘. */
export function parseRange(value: string | string[] | undefined | null): Range {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^\d+$/.test(raw)) return 1;
  const number = Number(raw);
  return (RANGES as readonly number[]).includes(number) ? (number as Range) : 1;
}

/** The dashboard URL for another range; other params (demo) stay, 오늘 keeps the URL clean. */
export function rangeHref(search: string, range: Range): string {
  const params = new URLSearchParams(search);
  if (range === 1) params.delete("range");
  else params.set("range", String(range));
  const query = params.toString();
  return query ? `/admin?${query}` : "/admin";
}

export type KpiTile = {
  key: string;
  label: string;
  value: number;
  unit: QtyUnit;
  href: string;
  /** Needs a human: shown with the attention icon while above 0. */
  attention: boolean;
};

function withDemo(href: string, includeDemo: boolean): string {
  if (!includeDemo) return href;
  return `${href}${href.includes("?") ? "&" : "?"}demo=1`;
}

/** The six KPI tiles (screens 10.5), each linking to its filtered list. */
export function kpiTiles(overview: Pick<Overview, "kpi" | "since">, opts: { includeDemo: boolean }): KpiTile[] {
  const { kpi } = overview;
  const from = kstToday(new Date(overview.since));
  const tiles: Array<Omit<KpiTile, "href"> & { path: string }> = [
    { key: "newRequests", label: "새 사입 요청", value: kpi.newRequests, unit: "건", path: `/admin/requests?from=${from}`, attention: false },
    { key: "attention", label: "확인이 필요한 요청", value: kpi.attention, unit: "건", path: "/admin/requests?view=attention", attention: kpi.attention > 0 },
    {
      key: "overdueRechecks",
      label: "기한 지난 미송 재확인",
      value: kpi.overdueRechecks,
      unit: "건",
      path: "/admin/backorders?view=due",
      attention: kpi.overdueRechecks > 0,
    },
    {
      key: "deliveriesAwaitingReceipt",
      label: "수령 대기",
      value: kpi.deliveriesAwaitingReceipt,
      unit: "회차",
      path: "/admin/deliveries?view=awaiting",
      attention: false,
    },
    { key: "incompleteSignups", label: "가입 미완료", value: kpi.incompleteSignups, unit: "명", path: "/admin/accounts?view=signup", attention: false },
    { key: "newLeads", label: "새 랜딩 문의", value: kpi.newLeads, unit: "건", path: "/admin/leads?status=new", attention: false },
  ];
  return tiles.map(({ path, ...tile }) => ({ ...tile, href: withDemo(path, opts.includeDemo) }));
}

type SummarySource = Pick<Overview, "accounts" | "connections" | "userMessages24h" | "attachments" | "openCases" | "liveNotices" | "maintenance">;

/** The side summary (screens 10.5), one line each. */
export function summaryLines(overview: SummarySource): string[] {
  const { accounts, connections, attachments, maintenance } = overview;
  const maintenanceLine = maintenance?.active ? `점검 모드 켜짐${maintenance.blockWrites ? " · 쓰기 차단" : ""}` : "점검 모드 꺼짐";
  return [
    `소매업자 ${qty(accounts.retailer, "명")} · 사입삼촌 ${qty(accounts.uncle, "명")} · 업무 중 ${qty(accounts.unclesWorking, "명")}`,
    `연결 완료 ${qty(connections.accepted ?? 0, "곳")} · 수락 대기 ${qty(connections.pending ?? 0, "건")}`,
    `채팅 24시간 ${qty(overview.userMessages24h, "건")}`,
    `첨부 ${qty(attachments.count, "개")} · ${bytes(attachments.bytes)}`,
    `열린 케이스 ${qty(overview.openCases, "건")}`,
    `게시 중 공지 ${qty(overview.liveNotices, "건")}`,
    maintenanceLine,
  ];
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "{HH:mm} 기준" in KST. */
export function stampLabel(generatedAt: string): string {
  const local = new TZDate(new Date(generatedAt).getTime(), KST);
  return `${pad(local.getHours())}:${pad(local.getMinutes())} 기준`;
}

export type DayBar = { day: string; tick: string; label: string; count: number };

/** 새 사입 요청 · 14일: one bar per KST day, oldest first. */
export function dayBars(series: Overview["newRequestsByDay"]): DayBar[] {
  return (series ?? []).map(({ day, count }) => {
    const [, month, date] = day.split("-").map(Number);
    return { day, tick: `${month}.${date}`, label: `${month}월 ${date}일`, count };
  });
}

export const AGING_BUCKETS = [
  { key: "0-1", label: "0-1일" },
  { key: "2-3", label: "2-3일" },
  { key: "4-7", label: "4-7일" },
  { key: "8+", label: "8일 이상" },
] as const;

export type AgingBar = { key: (typeof AGING_BUCKETS)[number]["key"]; label: string; count: number };

/** 미송 경과 buckets (screens 10.5, 10.11). */
export function agingBars(aging: Overview["backorderAging"]): AgingBar[] {
  return AGING_BUCKETS.map(({ key, label }) => ({ key, label, count: aging[key] }));
}
