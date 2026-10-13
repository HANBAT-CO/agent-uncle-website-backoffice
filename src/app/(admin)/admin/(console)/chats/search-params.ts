import { createLoader, parseAsString } from "nuqs/server";

import { pageParsers } from "@/lib/admin/search-params";

/*
 * 채팅 열람 URL state (screens 10.13): the list page and the selected pair
 * (`?a=&b=`, account ids only). The transcript and the reason never go into
 * the URL: they live in client state after the audited Server Action.
 */
export const chatParsers = {
  page: pageParsers.page,
  size: pageParsers.size,
  demo: pageParsers.demo,
  a: parseAsString,
  b: parseAsString,
};

export const loadChatParams = createLoader(chatParsers);
