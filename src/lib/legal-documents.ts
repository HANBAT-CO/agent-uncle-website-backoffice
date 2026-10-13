import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { PRIVACY_PAGE, TERMS_PAGE } from "@/content/legal";

export const LEGAL_DOCUMENTS = {
  privacy: {
    ...PRIVACY_PAGE,
    filename: "privacy-policy.md",
    english: "Privacy policy",
    introduction: "개인정보를 어떻게 수집하고 이용하는지,\n그리고 어떤 권리를 행사할 수 있는지 안내합니다.",
    related: "terms",
  },
  terms: {
    ...TERMS_PAGE,
    filename: "terms-of-service.md",
    english: "Terms of service",
    introduction: "사입삼춘을 이용하는 데 필요한 조건과\n이용자와 운영자의 권리·의무를 안내합니다.",
    related: "privacy",
  },
} as const;

export type LegalDocumentKind = keyof typeof LEGAL_DOCUMENTS;
export type LegalHeading = { id: string; title: string; line: number; depth: number };

/** Read the supplied Markdown at build time; the parser stays on the server. */
export async function readLegalDocument(kind: LegalDocumentKind) {
  const document = LEGAL_DOCUMENTS[kind];
  const source = await readFile(path.join(process.cwd(), "src/content/legal-documents", document.filename), "utf8");
  // The page hero supplies the sole H1. All remaining source text is rendered.
  const markdown = source.replace(/^# [^\n]+\r?\n/, "");
  const headings: LegalHeading[] = [];
  let section = 0;
  let subsection = 0;
  for (const [index, line] of markdown.split("\n").entries()) {
    const match = /^(#{2,3}) (.+)$/.exec(line);
    if (!match) continue;
    const depth = match[1].length;
    if (depth === 2) { section += 1; subsection = 0; }
    else subsection += 1;
    headings.push({
      id: depth === 2 ? `section-${section}` : `section-${section}-${subsection}`,
      title: match[2],
      line: index + 1,
      depth,
    });
  }
  return { ...document, markdown, headings };
}
