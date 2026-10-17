import { hasRole, type AdminRole } from "./roles";
import type { Overview } from "./rpc/schemas";

/*
 * Console navigation (backoffice spec 9; screens appendix 9, sidebar and ⌘K).
 * Pure and client-safe: the sidebar, breadcrumbs, the palette and the search
 * page read it. Hiding an item is only convenience; every page re-checks the
 * role (requireRole) and Postgres decides on every RPC.
 */

export type AdminHref = "/admin" | `/admin/${string}`;

/** Phosphor icon names; the shell maps them to components. */
export type NavIcon =
  | "SquaresFour"
  | "Pulse"
  | "UsersThree"
  | "Handshake"
  | "Package"
  | "Truck"
  | "ClockCounterClockwise"
  | "WarningDiamond"
  | "ChatsCircle"
  | "Megaphone"
  | "SlidersHorizontal"
  | "EnvelopeSimple"
  | "ListMagnifyingGlass"
  | "UserGear"
  | "UserCircle";

export type NavItem = {
  key: string;
  label: string;
  href: AdminHref;
  icon: NavIcon;
  minRole: AdminRole;
  /** Sidebar count from backoffice_overview; null or 0 hides the badge. */
  badge?: (o: Overview) => number | null;
  /** Breadcrumb label for a detail page below this screen (`/admin/requests/[id]`). */
  detail?: string;
};

export type NavGroup = { label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "운영 현황",
    items: [
      { key: "dashboard", label: "대시보드", href: "/admin", icon: "SquaresFour", minRole: "viewer" },
      {
        key: "checks",
        label: "운영 점검",
        href: "/admin/checks",
        icon: "Pulse",
        minRole: "viewer",
        badge: (o) => o.queue.filter((item) => item.severity === "critical" || item.severity === "high").length,
      },
    ],
  },
  {
    label: "계정·관계",
    items: [
      {
        key: "accounts",
        label: "계정·가입",
        href: "/admin/accounts",
        icon: "UsersThree",
        minRole: "viewer",
        badge: (o) => o.accounts.awaitingReview,
        detail: "계정 상세",
      },
      { key: "lifecycle", label: "탈퇴·개인 설정", href: "/admin/lifecycle", icon: "UserGear", minRole: "viewer" },
      { key: "connections", label: "거래처 연결", href: "/admin/connections", icon: "Handshake", minRole: "viewer" },
    ],
  },
  {
    label: "거래 흐름",
    items: [
      { key: "billing", label: "청구·정산", href: "/admin/billing", icon: "ListMagnifyingGlass", minRole: "viewer", detail: "청구서 상세" },
      { key: "team-work", label: "팀·동료 업무", href: "/admin/team-work", icon: "UsersThree", minRole: "viewer" },
      {
        key: "requests",
        label: "사입 요청",
        href: "/admin/requests",
        icon: "Package",
        minRole: "viewer",
        badge: (o) => o.kpi.attention,
        detail: "요청 상세",
      },
      {
        key: "deliveries",
        label: "전달·수령",
        href: "/admin/deliveries",
        icon: "Truck",
        minRole: "viewer",
        badge: (o) => o.kpi.deliveriesAwaitingReceipt,
      },
      {
        key: "backorders",
        label: "미송 재확인",
        href: "/admin/backorders",
        icon: "ClockCounterClockwise",
        minRole: "viewer",
        badge: (o) => o.kpi.overdueRechecks,
      },
      {
        key: "issues",
        label: "문제·정정",
        href: "/admin/issues",
        icon: "WarningDiamond",
        minRole: "viewer",
        badge: (o) => o.issues.open ?? null,
      },
    ],
  },
  {
    label: "소통",
    items: [
      { key: "chats", label: "채팅 열람", href: "/admin/chats", icon: "ChatsCircle", minRole: "viewer" },
      { key: "push", label: "푸시 전송 상태", href: "/admin/push", icon: "Pulse", minRole: "viewer" },
      { key: "notices", label: "알림·공지", href: "/admin/notices", icon: "Megaphone", minRole: "viewer" },
    ],
  },
  {
    label: "앱 제어",
    items: [{ key: "remote-config", label: "원격 설정", href: "/admin/remote-config", icon: "SlidersHorizontal", minRole: "viewer" }],
  },
  {
    label: "웹사이트",
    items: [
      { key: "leads", label: "랜딩 문의", href: "/admin/leads", icon: "EnvelopeSimple", minRole: "viewer", badge: (o) => o.kpi.newLeads },
    ],
  },
  {
    label: "관리",
    items: [
      { key: "audit", label: "감사 로그", href: "/admin/audit", icon: "ListMagnifyingGlass", minRole: "operator" },
      { key: "admins", label: "운영 계정", href: "/admin/admins", icon: "UserGear", minRole: "owner" },
    ],
  },
];

/** Sidebar footer links (로그아웃 is a form, not a link). */
export const NAV_FOOTER: NavItem[] = [{ key: "account", label: "내 계정", href: "/admin/account", icon: "UserCircle", minRole: "viewer" }];

/** Console pages outside the sidebar groups. */
const EXTRA_PAGES: NavItem[] = [
  ...NAV_FOOTER,
  { key: "search", label: "검색", href: "/admin/search", icon: "ListMagnifyingGlass", minRole: "viewer" },
];

const GROUPED = NAV_GROUPS.flatMap((group) => group.items.map((item) => ({ group: group.label, item })));
const ALL: { group: string | null; item: NavItem }[] = [...GROUPED, ...EXTRA_PAGES.map((item) => ({ group: null, item }))];

/** The groups and items a role may open; groups left empty are dropped. */
export function visibleNav(role: AdminRole): NavGroup[] {
  return NAV_GROUPS.map((group) => ({ label: group.label, items: group.items.filter((item) => hasRole(role, item.minRole)) })).filter(
    (group) => group.items.length > 0,
  );
}

function normalise(pathname: string): string {
  const path = pathname.split(/[?#]/)[0] ?? "";
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

function match(pathname: string): { group: string | null; item: NavItem; rest: string } | null {
  const path = normalise(pathname);
  if (path === "/admin") return { ...ALL.find((entry) => entry.item.key === "dashboard")!, rest: "" };
  for (const entry of ALL) {
    if (entry.item.href === "/admin") continue;
    if (path === entry.item.href) return { ...entry, rest: "" };
    if (path.startsWith(`${entry.item.href}/`)) return { ...entry, rest: path.slice(entry.item.href.length + 1) };
  }
  return null;
}

/** The nav key of the screen `pathname` belongs to (sidebar highlight). */
export function activeNavKey(pathname: string): string | null {
  return match(pathname)?.item.key ?? null;
}

/** The screen name of a console path, for breadcrumbs and document titles. */
export function navTitle(pathname: string): string | null {
  return match(pathname)?.item.label ?? null;
}

export type Crumb = { label: string; href?: AdminHref };

/** Group (text), screen (link), then the detail page when the path goes deeper. */
export function breadcrumbTrail(pathname: string): Crumb[] {
  const found = match(pathname);
  if (!found) return [];
  const trail: Crumb[] = [];
  if (found.group) trail.push({ label: found.group });
  trail.push({ label: found.item.label, href: found.item.href });
  if (found.rest) trail.push({ label: found.item.detail ?? "상세" });
  return trail;
}

/** Sidebar counts by nav key. Zero and missing counts are left out. */
export function navBadges(overview: Overview | null): Record<string, number> {
  if (!overview) return {};
  const badges: Record<string, number> = {};
  for (const { item } of GROUPED) {
    const count = item.badge?.(overview);
    if (typeof count === "number" && Number.isFinite(count) && count > 0) badges[item.key] = count;
  }
  return badges;
}

export type PaletteShortcut = { key: string; label: string; href: AdminHref; minRole: AdminRole };

/** ⌘K 바로가기 (screens appendix 9): filtered list views. */
export const PALETTE_SHORTCUTS: PaletteShortcut[] = [
  { key: "backorders-overdue", label: "기한 지난 미송 보기", href: "/admin/backorders?view=overdue", minRole: "viewer" },
  { key: "deliveries-48h", label: "수령 대기 48시간 넘음", href: "/admin/deliveries?view=awaiting_48h", minRole: "viewer" },
  { key: "accounts-review", label: "서류 확인 대기", href: "/admin/accounts?view=review", minRole: "viewer" },
  { key: "leads-new", label: "새 랜딩 문의", href: "/admin/leads?status=new", minRole: "viewer" },
];

export function visibleShortcuts(role: AdminRole): PaletteShortcut[] {
  return PALETTE_SHORTCUTS.filter((shortcut) => hasRole(role, shortcut.minRole));
}

export type EntityKind = "account" | "request" | "lead";
export type EntityRef = { kind: EntityKind; id: string; label?: string };

/**
 * Where a search result opens. Leads have no page of their own: the list
 * opens on every status, searched by the lead's name, with `lead` naming the
 * row whose Sheet should open.
 */
export function entityHref(ref: EntityRef): AdminHref {
  const id = encodeURIComponent(ref.id);
  switch (ref.kind) {
    case "account":
      return `/admin/accounts/${id}`;
    case "request":
      return `/admin/requests/${id}`;
    case "lead": {
      const q = ref.label?.trim() ? `&q=${encodeURIComponent(ref.label.trim())}` : "";
      return `/admin/leads?view=all${q}&lead=${id}`;
    }
  }
}

export type EnvPill = { label: string; tone: "local" | "live-read" | "live-write" };

/** Top-bar environment pill (screens appendix 9): which database, and whether this role can change it. */
export function envPill(target: "local" | "live", role: AdminRole): EnvPill {
  if (target === "local") return { label: "로컬 데이터 · 테스트", tone: "local" };
  return hasRole(role, "operator") ? { label: "운영 DB · 변경 가능", tone: "live-write" } : { label: "운영 DB · 읽기 전용", tone: "live-read" };
}
