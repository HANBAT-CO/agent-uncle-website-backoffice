import { createLoader, parseAsString, parseAsStringLiteral } from "nuqs/server";

import { pageParsers } from "@/lib/admin/search-params";

/*
 * 알림·공지 URL state (screens 10.14): the tab (알림 기록 by default, 공지),
 * the 알림 기록 view (전체 · 안 읽음 · 오늘), the page, and the open notice
 * editor (`notice=new` or a notice id).
 */
export const NOTICE_TABS = ["history", "notices"] as const;
export type NoticeTab = (typeof NOTICE_TABS)[number];

export const NOTICE_HISTORY_VIEWS = ["unread", "today"] as const;

export const noticeParsers = {
  page: pageParsers.page,
  size: pageParsers.size,
  demo: pageParsers.demo,
  tab: parseAsStringLiteral(NOTICE_TABS).withDefault("history"),
  view: parseAsStringLiteral(NOTICE_HISTORY_VIEWS),
  notice: parseAsString,
};

export const loadNoticeParams = createLoader(noticeParsers);
