/*
 * 문제 유형 (screens appendix 10.9, 10.12). The app writes an issue reason as
 * '{유형}\n{설명}' (requests.dart reportIssue); the demo seed writes
 * '{유형}: {설명}'. An issue that carries `actual` comes from a receipt whose
 * real count differs from the delivered count. Client-safe and pure.
 */

const TYPED_KINDS = ["상품·옵션이 달라요", "수량이 부족해요", "오염·파손이 있어요"] as const;
export const RECEIPT_DIFFERENCE = "수령 수량 차이";
export const OTHER_KIND = "기타";

export const ISSUE_KINDS = [...TYPED_KINDS, RECEIPT_DIFFERENCE] as const;
export type IssueKind = (typeof ISSUE_KINDS)[number] | typeof OTHER_KIND;

/** The typed kind at the start of a reason and the rest of it, or null when the reason has none. */
function splitKind(reason: string): { kind: (typeof TYPED_KINDS)[number]; rest: string } | null {
  const text = reason.trim();
  const newline = text.indexOf("\n");
  const firstLine = (newline === -1 ? text : text.slice(0, newline)).trim();
  for (const kind of TYPED_KINDS) {
    if (firstLine === kind) return { kind, rest: newline === -1 ? "" : text.slice(newline + 1).trim() };
    if (firstLine.startsWith(`${kind}:`)) return { kind, rest: text.slice(kind.length + 1).trim() };
  }
  return null;
}

export function issueKind(reason: string | null | undefined, hasActual: boolean): IssueKind {
  if (hasActual) return RECEIPT_DIFFERENCE;
  return splitKind(reason ?? "")?.kind ?? OTHER_KIND;
}

/** 설명: the reporter's own words, without the kind line. */
export function issueDescription(reason: string | null | undefined): string {
  const text = (reason ?? "").trim();
  return splitKind(text)?.rest ?? text;
}
