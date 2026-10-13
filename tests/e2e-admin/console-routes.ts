import type { Page } from "@playwright/test";

import { psql } from "./helpers/rest";

/*
 * Every console route with its minimum role (spec 10, screens appendix 9),
 * shared by smoke.spec.ts and a11y.spec.ts. Detail routes take a seeded id
 * from the local stack. `h1` is the exact heading, or null when it is the
 * record's own name (dossier, request page).
 */

export type ConsoleRole = "viewer" | "operator" | "owner";

export type ConsoleRoute = {
  path: string;
  h1: string | null;
  min: ConsoleRole;
};

const RANK: Record<ConsoleRole, number> = { viewer: 1, operator: 2, owner: 3 };

export function allows(role: ConsoleRole, min: ConsoleRole): boolean {
  return RANK[role] >= RANK[min];
}

/** The ForbiddenState copy for a screen above the visitor's role (screens appendix 9). */
export const FORBIDDEN: Record<Exclude<ConsoleRole, "viewer">, string> = {
  operator: "이 화면은 운영자 이상만 볼 수 있어요.",
  owner: "이 화면은 관리자 이상만 볼 수 있어요.",
};

/** One seeded record id per collection, newest first. */
function newestId(collection: "accounts" | "requests"): string {
  const id = psql(`select id from public.saip_records where collection = '${collection}' order by updated_at desc limit 1`);
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error(`no seeded ${collection} row (run supabase-local/scripts/reset.sh)`);
  return id;
}

export function consoleRoutes(): ConsoleRoute[] {
  return [
    { path: "/admin", h1: "대시보드", min: "viewer" },
    { path: "/admin/checks", h1: "운영 점검", min: "viewer" },
    { path: "/admin/accounts", h1: "계정·가입", min: "viewer" },
    { path: `/admin/accounts/${newestId("accounts")}`, h1: null, min: "viewer" },
    { path: "/admin/connections", h1: "거래처 연결", min: "viewer" },
    { path: "/admin/requests", h1: "사입 요청", min: "viewer" },
    { path: `/admin/requests/${newestId("requests")}`, h1: null, min: "viewer" },
    { path: "/admin/deliveries", h1: "전달·수령", min: "viewer" },
    { path: "/admin/backorders", h1: "미송 재확인", min: "viewer" },
    { path: "/admin/issues", h1: "문제·정정", min: "viewer" },
    { path: "/admin/chats", h1: "채팅 열람", min: "viewer" },
    { path: "/admin/notices", h1: "알림·공지", min: "viewer" },
    { path: "/admin/remote-config", h1: "원격 설정", min: "viewer" },
    { path: "/admin/leads", h1: "랜딩 문의", min: "viewer" },
    { path: "/admin/audit", h1: "감사 로그", min: "operator" },
    { path: "/admin/admins", h1: "운영 계정", min: "owner" },
    { path: "/admin/account", h1: "내 계정", min: "viewer" },
    { path: "/admin/search", h1: "검색", min: "viewer" },
  ];
}

/**
 * Waits until React has hydrated the page heading, so hydration errors and
 * effects that log have had their chance before the caller checks the
 * console. React tags every hydrated host node with a `__reactFiber$` key.
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const heading = document.querySelector("main h1, h1");
    return heading !== null && Object.keys(heading).some((key) => key.startsWith("__reactFiber$"));
  });
}
