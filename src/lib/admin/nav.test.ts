import { describe, expect, it } from "vitest";

import overviewFixture from "./rpc/__fixtures__/overview.owner.json";
import { overviewSchema, type Overview } from "./rpc/schemas";
import {
  NAV_FOOTER,
  NAV_GROUPS,
  PALETTE_SHORTCUTS,
  activeNavKey,
  breadcrumbTrail,
  entityHref,
  envPill,
  navBadges,
  navTitle,
  visibleNav,
  visibleShortcuts,
} from "./nav";

const overview: Overview = overviewSchema.parse(overviewFixture);

function labels(groups: { label: string; items: { label: string }[] }[]): string[] {
  return groups.flatMap((group) => group.items.map((item) => item.label));
}

describe("NAV_GROUPS (screens appendix 9, sidebar)", () => {
  it("has exactly the spec groups in order", () => {
    expect(NAV_GROUPS.map((group) => group.label)).toEqual(["운영 현황", "계정·관계", "거래 흐름", "소통", "앱 제어", "웹사이트", "관리"]);
  });

  it("has exactly the spec items in order", () => {
    expect(NAV_GROUPS.map((group) => [group.label, group.items.map((item) => [item.label, item.href, item.minRole])])).toEqual([
      ["운영 현황", [["대시보드", "/admin", "viewer"], ["운영 점검", "/admin/checks", "viewer"]]],
      ["계정·관계", [["계정·가입", "/admin/accounts", "viewer"], ["탈퇴·개인 설정", "/admin/lifecycle", "viewer"], ["거래처 연결", "/admin/connections", "viewer"]]],
      [
        "거래 흐름",
        [
          ["청구·정산", "/admin/billing", "viewer"],
          ["팀·동료 업무", "/admin/team-work", "viewer"],
          ["사입 요청", "/admin/requests", "viewer"],
          ["전달·수령", "/admin/deliveries", "viewer"],
          ["미송 재확인", "/admin/backorders", "viewer"],
          ["문제·정정", "/admin/issues", "viewer"],
        ],
      ],
      ["소통", [["채팅 열람", "/admin/chats", "viewer"], ["푸시 전송 상태", "/admin/push", "viewer"], ["알림·공지", "/admin/notices", "viewer"]]],
      ["앱 제어", [["원격 설정", "/admin/remote-config", "viewer"]]],
      ["웹사이트", [["랜딩 문의", "/admin/leads", "viewer"]]],
      ["관리", [["감사 로그", "/admin/audit", "operator"], ["운영 계정", "/admin/admins", "owner"]]],
    ]);
  });

  it("footer holds 내 계정", () => {
    expect(NAV_FOOTER.map((item) => [item.label, item.href])).toEqual([["내 계정", "/admin/account"]]);
  });

  it("every href starts with /admin and keys are unique", () => {
    const items = [...NAV_GROUPS.flatMap((group) => group.items), ...NAV_FOOTER];
    for (const item of items) expect(item.href === "/admin" || item.href.startsWith("/admin/")).toBe(true);
    expect(new Set(items.map((item) => item.key)).size).toBe(items.length);
  });
});

describe("visibleNav", () => {
  it("viewer: no 감사 로그, no 운영 계정, and no empty 관리 group", () => {
    const nav = visibleNav("viewer");
    expect(labels(nav)).not.toContain("감사 로그");
    expect(labels(nav)).not.toContain("운영 계정");
    expect(nav.map((group) => group.label)).not.toContain("관리");
    expect(labels(nav)).toContain("랜딩 문의");
  });

  it("operator: 감사 로그 but not 운영 계정", () => {
    const nav = visibleNav("operator");
    expect(labels(nav)).toContain("감사 로그");
    expect(labels(nav)).not.toContain("운영 계정");
  });

  it("owner: every item", () => {
    expect(labels(visibleNav("owner"))).toEqual(labels(NAV_GROUPS));
  });
});

describe("activeNavKey", () => {
  it("matches the dashboard only on /admin", () => {
    expect(activeNavKey("/admin")).toBe("dashboard");
    expect(activeNavKey("/admin/")).toBe("dashboard");
  });

  it("matches a section and its detail pages on a segment boundary", () => {
    expect(activeNavKey("/admin/accounts")).toBe("accounts");
    expect(activeNavKey("/admin/accounts/ab462a8d")).toBe("accounts");
    expect(activeNavKey("/admin/account")).toBe("account");
    expect(activeNavKey("/admin/accountsx")).toBeNull();
    expect(activeNavKey("/admin/nope")).toBeNull();
  });
});

describe("navTitle", () => {
  it("names console screens for breadcrumbs and titles", () => {
    expect(navTitle("/admin")).toBe("대시보드");
    expect(navTitle("/admin/requests/62b7f913")).toBe("사입 요청");
    expect(navTitle("/admin/account")).toBe("내 계정");
    expect(navTitle("/admin/search")).toBe("검색");
    expect(navTitle("/admin/nope")).toBeNull();
  });
});

describe("breadcrumbTrail", () => {
  it("group, then the screen link, then the detail", () => {
    expect(breadcrumbTrail("/admin/requests/62b7f913")).toEqual([
      { label: "거래 흐름" },
      { label: "사입 요청", href: "/admin/requests" },
      { label: "요청 상세" },
    ]);
    expect(breadcrumbTrail("/admin/accounts/ab462a8d")).toEqual([
      { label: "계정·관계" },
      { label: "계정·가입", href: "/admin/accounts" },
      { label: "계정 상세" },
    ]);
  });

  it("a top-level screen ends on its own page", () => {
    expect(breadcrumbTrail("/admin")).toEqual([{ label: "운영 현황" }, { label: "대시보드", href: "/admin" }]);
    expect(breadcrumbTrail("/admin/search")).toEqual([{ label: "검색", href: "/admin/search" }]);
    expect(breadcrumbTrail("/admin/account")).toEqual([{ label: "내 계정", href: "/admin/account" }]);
  });

  it("unknown paths have no trail", () => {
    expect(breadcrumbTrail("/admin/nope")).toEqual([]);
  });
});

describe("navBadges (screens appendix 9, badge sources)", () => {
  it("reads every badge from the overview", () => {
    const urgent = overview.queue.filter((item) => item.severity === "critical" || item.severity === "high").length;
    expect(navBadges(overview)).toEqual({
      ...(urgent > 0 ? { checks: urgent } : {}),
      accounts: overview.accounts.awaitingReview,
      requests: overview.kpi.attention,
      deliveries: overview.kpi.deliveriesAwaitingReceipt,
      backorders: overview.kpi.overdueRechecks,
      issues: 3,
      leads: overview.kpi.newLeads,
    });
  });

  it("hides zero counts and tolerates a missing overview", () => {
    const quiet: Overview = {
      ...overview,
      queue: [],
      kpi: { ...overview.kpi, attention: 0, newLeads: 0 },
      issues: {},
    };
    const badges = navBadges(quiet);
    expect(badges).not.toHaveProperty("checks");
    expect(badges).not.toHaveProperty("requests");
    expect(badges).not.toHaveProperty("issues");
    expect(badges).not.toHaveProperty("leads");
    expect(navBadges(null)).toEqual({});
  });

  it("counts only critical and high queue items for 운영 점검", () => {
    const item = overview.queue[0];
    const mixed: Overview = {
      ...overview,
      queue: [
        { ...item, severity: "critical" },
        { ...item, severity: "high" },
        { ...item, severity: "normal" },
        { ...item, severity: "low" },
      ],
    };
    expect(navBadges(mixed).checks).toBe(2);
  });
});

describe("palette shortcuts (screens appendix 9)", () => {
  it("are the four spec shortcuts into console lists", () => {
    expect(PALETTE_SHORTCUTS.map((shortcut) => shortcut.label)).toEqual([
      "기한 지난 미송 보기",
      "수령 대기 48시간 넘음",
      "서류 확인 대기",
      "새 랜딩 문의",
    ]);
    for (const shortcut of PALETTE_SHORTCUTS) expect(shortcut.href.startsWith("/admin/")).toBe(true);
  });

  it("respect the role of their screen", () => {
    expect(visibleShortcuts("viewer")).toHaveLength(4);
  });
});

describe("entityHref", () => {
  it("links search results to their screens", () => {
    expect(entityHref({ kind: "account", id: "ab462a8d" })).toBe("/admin/accounts/ab462a8d");
    expect(entityHref({ kind: "request", id: "62b7f913" })).toBe("/admin/requests/62b7f913");
    expect(entityHref({ kind: "lead", id: "e534df28", label: "재민 셀렉트" })).toBe(
      `/admin/leads?view=all&q=${encodeURIComponent("재민 셀렉트")}&lead=e534df28`,
    );
  });

  it("encodes ids", () => {
    expect(entityHref({ kind: "account", id: "a/b?c" })).toBe("/admin/accounts/a%2Fb%3Fc");
  });
});

describe("envPill (screens appendix 9)", () => {
  it("local reads 로컬 데이터 · 테스트 for every role", () => {
    for (const role of ["viewer", "operator", "owner"] as const) {
      expect(envPill("local", role)).toEqual({ label: "로컬 데이터 · 테스트", tone: "local" });
    }
  });

  it("live: read-only for viewers, writable (stronger fill) for operators and owners", () => {
    expect(envPill("live", "viewer")).toEqual({ label: "운영 DB · 읽기 전용", tone: "live-read" });
    expect(envPill("live", "operator")).toEqual({ label: "운영 DB · 변경 가능", tone: "live-write" });
    expect(envPill("live", "owner")).toEqual({ label: "운영 DB · 변경 가능", tone: "live-write" });
  });
});
