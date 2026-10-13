import { describe, expect, it } from "vitest";

import { ACCOUNT_STATE_FACETS, ACCOUNT_VIEW_TABS, accountStateFor, loadAccountParams } from "./search-params";

describe("accounts list URL state (screens 10.7)", () => {
  it("maps every tab and 상태 facet to one p_state", () => {
    expect(accountStateFor("")).toBeUndefined();
    expect(accountStateFor("signup")).toBe("signup");
    expect(accountStateFor("review")).toBe("awaiting_review");
    expect(accountStateFor("today")).toBe("joined_today");
    expect(accountStateFor("working")).toBe("working");
    expect(accountStateFor("suspended")).toBe("suspended");
    expect(accountStateFor("missing")).toBe("document_missing");
    expect(accountStateFor("banned")).toBe("login_banned");
    expect(accountStateFor("no-account")).toBe("no_account");
  });

  it("ignores an unknown view", () => {
    expect(accountStateFor("whatever")).toBeUndefined();
  });

  it("keeps the appendix order and copy for tabs and the 상태 rail", () => {
    expect(ACCOUNT_VIEW_TABS.map((tab) => tab.label)).toEqual(["전체", "가입 미완료", "서류 확인 대기", "오늘 가입", "업무 중인 사입삼촌", "이용 제한"]);
    expect(ACCOUNT_STATE_FACETS.map((facet) => facet.label)).toEqual([
      "가입 미완료",
      "가입 완료",
      "서류 미등록",
      "서류 확인 대기",
      "확인함",
      "재제출 필요",
      "이용 제한",
      "로그인 차단",
      "운영 계정",
      "앱 계정 없음",
    ]);
  });

  it("parses role, sort and paging, dropping values the RPC does not accept", () => {
    const params = loadAccountParams({ role: "uncle", sort: "name_asc", page: "2", size: "100", q: " 망원 ", view: "review" });
    expect(params).toMatchObject({ role: "uncle", sort: "name_asc", page: 2, size: 100, q: " 망원 ", view: "review" });
    const bad = loadAccountParams({ role: "admin", sort: "drop table", size: "7" });
    expect(bad.role).toBeNull();
    expect(bad.sort).toBe("created_desc");
    expect(bad.size).toBe(50);
  });
});
