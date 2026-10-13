import { describe, expect, it } from "vitest";

import {
  NOTICE_COPY,
  canSaveSeverity,
  isoToKstLocal,
  kstLocalToIso,
  noticeFormSchema,
  noticeInputFromForm,
  noticeWindowLabel,
  publishDescription,
} from "./notice-form";

const base = {
  noticeId: "",
  version: "",
  title: "추석 연휴 픽업 일정 안내",
  body: "연휴 기간에는 픽업과 전달이 하루 정도 늦어질 수 있어요.",
  audience: "retailer",
  severity: "info",
  linkUrl: "",
  startsAt: "",
  endsAt: "",
  dismissible: "1",
  intent: "draft",
};

function parse(overrides: Record<string, string> = {}) {
  return noticeFormSchema.safeParse({ ...base, ...overrides });
}

function firstMessage(overrides: Record<string, string>) {
  const result = parse(overrides);
  if (result.success) throw new Error("expected a validation error");
  return result.error.issues[0];
}

describe("KST datetime-local conversion (Review Focus 3)", () => {
  it("reads a datetime-local value as Korean time", () => {
    expect(kstLocalToIso("2026-10-13T09:00")).toBe("2026-10-13T00:00:00.000Z");
    expect(kstLocalToIso("2026-10-13T00:30")).toBe("2026-10-12T15:30:00.000Z");
    expect(kstLocalToIso("2026-10-13T09:00:30")).toBe("2026-10-13T00:00:30.000Z");
  });

  it("refuses values that are not a real local time", () => {
    expect(kstLocalToIso("")).toBeNull();
    expect(kstLocalToIso("2026-02-30T09:00")).toBeNull();
    expect(kstLocalToIso("2026-10-13 09:00")).toBeNull();
    expect(kstLocalToIso("2026-10-13T25:00")).toBeNull();
  });

  it("writes an ISO time back as a KST datetime-local value", () => {
    expect(isoToKstLocal("2026-10-13T00:00:00.000Z")).toBe("2026-10-13T09:00");
    expect(isoToKstLocal("2026-10-12T15:30:00+00:00")).toBe("2026-10-13T00:30");
    expect(isoToKstLocal(null)).toBe("");
    expect(isoToKstLocal("not a date")).toBe("");
  });
});

describe("noticeFormSchema", () => {
  it("accepts a valid draft and trims the text", () => {
    const result = parse({ title: "  공지 제목  ", body: " 내용 " });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toMatchObject({
      noticeId: null,
      version: null,
      title: "공지 제목",
      body: "내용",
      audience: "retailer",
      severity: "info",
      linkUrl: null,
      startsAt: null,
      endsAt: null,
      dismissible: true,
      intent: "draft",
    });
  });

  it("refuses an empty or too long title", () => {
    expect(firstMessage({ title: "" })).toMatchObject({ message: "공지 제목은 1~80자로 입력해 주세요.", path: ["title"] });
    expect(firstMessage({ title: "   " }).message).toBe("공지 제목은 1~80자로 입력해 주세요.");
    expect(firstMessage({ title: "가".repeat(81) }).message).toBe("공지 제목은 1~80자로 입력해 주세요.");
    expect(parse({ title: "가".repeat(80) }).success).toBe(true);
  });

  it("refuses an empty or too long body", () => {
    expect(firstMessage({ body: "" }).message).toBe("공지 내용은 1~2,000자로 입력해 주세요.");
    expect(firstMessage({ body: "가".repeat(2001) }).message).toBe("공지 내용은 1~2,000자로 입력해 주세요.");
    expect(parse({ body: "가".repeat(2000) }).success).toBe(true);
  });

  it("accepts https links only", () => {
    expect(firstMessage({ linkUrl: "http://agentuncle.kr" })).toMatchObject({
      message: "링크는 https 주소만 넣을 수 있어요.",
      path: ["linkUrl"],
    });
    expect(firstMessage({ linkUrl: "javascript:alert(1)" }).message).toBe("링크는 https 주소만 넣을 수 있어요.");
    expect(firstMessage({ linkUrl: "https://" }).message).toBe("링크는 https 주소만 넣을 수 있어요.");
    expect(firstMessage({ linkUrl: `https://agentuncle.kr/${"a".repeat(500)}` }).message).toBe("링크는 500자 이하로 입력해 주세요.");
    const ok = parse({ linkUrl: " https://agentuncle.kr/notice " });
    expect(ok.success && ok.data.linkUrl).toBe("https://agentuncle.kr/notice");
  });

  it("converts the KST window to ISO and keeps the end after the start", () => {
    const ok = parse({ startsAt: "2026-10-13T09:00", endsAt: "2026-10-20T18:00" });
    expect(ok.success && ok.data.startsAt).toBe("2026-10-13T00:00:00.000Z");
    expect(ok.success && ok.data.endsAt).toBe("2026-10-20T09:00:00.000Z");
    expect(firstMessage({ startsAt: "2026-10-13T09:00", endsAt: "2026-10-13T09:00" })).toMatchObject({
      message: "종료 시각은 시작 시각보다 늦어야 해요.",
      path: ["endsAt"],
    });
    expect(firstMessage({ startsAt: "2026-13-01T09:00" })).toMatchObject({ message: "시작 시각을 다시 입력해 주세요.", path: ["startsAt"] });
    expect(firstMessage({ endsAt: "nope" })).toMatchObject({ message: "종료 시각을 다시 입력해 주세요.", path: ["endsAt"] });
  });

  it("checks the audience, the severity and the intent", () => {
    expect(firstMessage({ audience: "staff" }).message).toBe("공지 대상을 선택해 주세요.");
    expect(firstMessage({ severity: "loud" }).message).toBe("공지 중요도를 선택해 주세요.");
    expect(parse({ intent: "delete" }).success).toBe(false);
  });

  it("reads the id, the version and the switch", () => {
    const ok = parse({ noticeId: "135777d6-055a-4a4d-a113-9ba94cfde327", version: "3", dismissible: "0", intent: "publish" });
    expect(ok.success).toBe(true);
    if (!ok.success) return;
    expect(ok.data).toMatchObject({ noticeId: "135777d6-055a-4a4d-a113-9ba94cfde327", version: 3, dismissible: false, intent: "publish" });
    expect(parse({ noticeId: "not-a-uuid" }).success).toBe(false);
    expect(parse({ version: "-1" }).success).toBe(false);
  });
});

describe("noticeInputFromForm", () => {
  it("publishes, drafts and ends through the active flag", () => {
    const parsed = noticeFormSchema.parse({ ...base, intent: "publish" });
    expect(noticeInputFromForm(parsed)).toMatchObject({ active: true, title: base.title, audience: "retailer", linkUrl: null });
    expect(noticeInputFromForm({ ...parsed, intent: "draft" }).active).toBe(false);
    expect(noticeInputFromForm({ ...parsed, intent: "end" }).active).toBe(false);
  });
});

describe("roles and copy (screens 10.14)", () => {
  it("lets only the owner save a critical notice", () => {
    expect(canSaveSeverity("owner", "critical")).toBe(true);
    expect(canSaveSeverity("operator", "critical")).toBe(false);
    expect(canSaveSeverity("operator", "important")).toBe(true);
    expect(canSaveSeverity("viewer", "info")).toBe(false);
    expect(NOTICE_COPY.criticalOwnerOnly).toBe("긴급 공지는 관리자만 게시할 수 있어요.");
  });

  it("names the audience in the publish dialog", () => {
    expect(NOTICE_COPY.publishTitle).toBe("공지를 게시할까요?");
    expect(publishDescription("retailer")).toBe("소매업자에게 앱을 열 때 보여요.");
    expect(publishDescription("uncle")).toBe("사입삼촌에게 앱을 열 때 보여요.");
    expect(publishDescription("all")).toBe("전체에게 앱을 열 때 보여요.");
  });

  it("keeps the honest push banner word for word", () => {
    expect(NOTICE_COPY.pushBanner).toBe(
      "원격 푸시는 아직 연결하지 않았어요. 공지는 앱이 이 기능을 지원하도록 업데이트된 뒤부터, 앱을 열 때 보여요.",
    );
  });

  it("describes the window in KST", () => {
    const now = new Date("2026-10-13T03:00:00Z");
    expect(noticeWindowLabel("2026-10-13T06:40:14Z", null, now)).toBe("10월 13일 15:40부터");
    expect(noticeWindowLabel("2026-10-13T06:40:14Z", "2026-10-20T09:00:00Z", now)).toBe("10월 13일 15:40 ~ 10월 20일 18:00");
  });
});
