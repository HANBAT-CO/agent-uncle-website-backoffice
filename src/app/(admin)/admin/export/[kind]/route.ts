import { NextResponse, type NextRequest } from "next/server";

import { toCsv, type CsvColumn } from "@/lib/admin/csv";
import { verifyAdmin } from "@/lib/admin/dal";
import { formatKstStamp, isKstDay, kstDayRange, kstToday } from "@/lib/admin/format";
import {
  DELIVERY_STATE_LABEL,
  ISSUE_STATUS_LABEL,
  LEAD_ROLE_LABEL,
  PROPOSAL_KIND_LABEL,
  PROPOSAL_STATUS_LABEL,
  RECEIPT_KIND_LABEL,
  ROLE_KIND_LABEL,
  verificationLabel,
} from "@/lib/admin/labels";
import { hasRole, ROLE_LABEL } from "@/lib/admin/roles";
import { EXPORT_KINDS, EXPORT_MIN_ROLE, rpc, type ExportKind } from "@/lib/admin/rpc";
import { safeNext } from "@/lib/admin/session";

/*
 * POST /admin/export/{kind} → CSV (spec 4, 6, 7; tasks WP-03 step 5).
 * - Origin must be this host (a cross-site form post gets 403).
 * - verifyAdmin() and the role per kind; backoffice_export re-checks both and
 *   writes the audit row with the reason.
 * - 기간 arrives as KST days and is sent as UTC bounds (kstDayRange).
 * - Korean headers, a BOM for Excel, never cached. Failures go back to the
 *   list with ?exportError= (303, so the browser GETs the page).
 */

/** KST 'YYYY-MM-DD HH:mm', which spreadsheets read as a date. */
const time = (value: unknown) => (typeof value === "string" ? formatKstStamp(value) : "");
const label = (map: Record<string, string>) => (value: unknown) => (typeof value === "string" ? (map[value] ?? value) : "");
const yesNo = (value: unknown) => (value === true ? "예" : value === false ? "아니요" : "");

const COLUMNS: Record<ExportKind, CsvColumn[]> = {
  requests: [
    { key: "id", header: "요청 ID" },
    { key: "createdAt", header: "요청 시각", format: time },
    { key: "label", header: "상태" },
    { key: "retailerName", header: "소매업자" },
    { key: "uncleName", header: "사입삼촌" },
    { key: "wholesaler", header: "도매처" },
    { key: "location", header: "위치" },
    { key: "product", header: "상품" },
    { key: "option", header: "옵션" },
    { key: "quantity", header: "요청" },
    { key: "acquired", header: "확보" },
    { key: "delivered", header: "전달" },
    { key: "received", header: "수령" },
    { key: "cancelled", header: "취소" },
    { key: "backorder", header: "남은 미송" },
    { key: "recheck", header: "재확인일" },
    { key: "updatedAt", header: "최근 처리 시각", format: time },
  ],
  deliveries: [
    { key: "id", header: "전달 ID" },
    { key: "requestId", header: "요청 ID" },
    { key: "createdAt", header: "전달 일시", format: time },
    { key: "product", header: "상품" },
    { key: "option", header: "옵션" },
    { key: "quantity", header: "이번 전달" },
    { key: "received", header: "확인한 수량" },
    { key: "actual", header: "실제 받은 수량" },
    {
      key: "receiptRecorded",
      header: "상태",
      format: (value, row) =>
        value !== true ? DELIVERY_STATE_LABEL.awaiting : row.actual !== row.quantity ? DELIVERY_STATE_LABEL.mismatch : DELIVERY_STATE_LABEL.received,
    },
    { key: "correctedAt", header: "정정 시각", format: time },
    { key: "retailerId", header: "소매업자 ID" },
    { key: "uncleId", header: "사입삼촌 ID" },
  ],
  receipts: [
    { key: "id", header: "수령 기록 ID" },
    { key: "requestId", header: "요청 ID" },
    { key: "deliveryId", header: "전달 ID" },
    { key: "createdAt", header: "기록 시각", format: time },
    { key: "kind", header: "종류", format: label(RECEIPT_KIND_LABEL) },
    { key: "confirmed", header: "확인한 수량" },
    { key: "actual", header: "실제 받은 수량" },
    { key: "reason", header: "사유" },
    { key: "actorId", header: "기록한 계정 ID" },
  ],
  issues: [
    { key: "id", header: "문제 ID" },
    { key: "requestId", header: "요청 ID" },
    { key: "deliveryId", header: "전달 ID" },
    { key: "createdAt", header: "보고 시각", format: time },
    { key: "reason", header: "유형 · 설명" },
    { key: "status", header: "상태", format: label(ISSUE_STATUS_LABEL) },
    { key: "held", header: "보류" },
    { key: "actual", header: "실제 받은 수량" },
    { key: "action", header: "조치" },
    { key: "reporterId", header: "보고자 ID" },
  ],
  proposals: [
    { key: "id", header: "협의 ID" },
    { key: "requestId", header: "요청 ID" },
    { key: "createdAt", header: "제안 시각", format: time },
    { key: "kind", header: "종류", format: label(PROPOSAL_KIND_LABEL) },
    { key: "status", header: "상태", format: label(PROPOSAL_STATUS_LABEL) },
    { key: "held", header: "보류" },
    { key: "proposerId", header: "제안자 ID" },
    { key: "resolvedBy", header: "처리한 계정 ID" },
  ],
  accounts: [
    { key: "id", header: "계정 ID" },
    { key: "role", header: "역할", format: label(ROLE_KIND_LABEL) },
    { key: "name", header: "매장명" },
    { key: "contact", header: "담당자명" },
    { key: "phone", header: "연락처" },
    { key: "email", header: "이메일" },
    { key: "businessName", header: "사업자명" },
    { key: "businessNumber", header: "사업자등록번호" },
    { key: "address", header: "주소" },
    { key: "addressDetail", header: "상세주소" },
    { key: "verification", header: "사업자 서류", format: (value) => verificationLabel(typeof value === "string" ? value : null) },
    { key: "complete", header: "가입 완료", format: yesNo },
    { key: "provider", header: "로그인 수단" },
    { key: "salesChannel", header: "판매 채널" },
    { key: "pickupArea", header: "도매 픽업 구역" },
    { key: "deliveryArea", header: "소매 배송 지역" },
  ],
  leads: [
    { key: "id", header: "문의 ID" },
    { key: "created_at", header: "접수 시각", format: time },
    { key: "role", header: "역할", format: label(LEAD_ROLE_LABEL) },
    { key: "name", header: "이름" },
    { key: "business_name", header: "매장" },
    { key: "contact", header: "연락처" },
    { key: "market", header: "사입 시장" },
    { key: "message", header: "남긴 말" },
    { key: "source", header: "유입" },
    { key: "consent", header: "개인정보 동의", format: yesNo },
  ],
};

function isExportKind(value: string): value is ExportKind {
  return (EXPORT_KINDS as readonly string[]).includes(value);
}

/**
 * Same-origin check. The Origin header must name this host. Console pages are
 * served with `Referrer-Policy: no-referrer`, so a browser form post from the
 * console itself sends `Origin: null`; that case is accepted only when the
 * browser also says `Sec-Fetch-Site: same-origin` (a header pages cannot
 * forge). Anything else, including a missing Origin, is refused.
 */
function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (origin === "null") return request.headers.get("sec-fetch-site") === "same-origin";
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host");
  try {
    return Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Back to the list the export started from, with the message in ?exportError= (and which dialog it belongs to). */
function backWithError(request: NextRequest, returnTo: string, kind: ExportKind, message: string): NextResponse {
  const target = new URL(returnTo, request.nextUrl.origin);
  target.searchParams.set("exportError", message);
  target.searchParams.set("exportKind", kind);
  return NextResponse.redirect(target, 303);
}

function returnPath(request: NextRequest, field: FormDataEntryValue | null): string {
  if (typeof field === "string" && field.startsWith("/admin")) return safeNext(field);
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const url = new URL(referer);
      if (url.origin === request.nextUrl.origin) return safeNext(`${url.pathname}${url.search}`);
    } catch {
      // fall through
    }
  }
  return "/admin";
}

function forbidden(): NextResponse {
  return new NextResponse("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ kind: string }> }) {
  if (!sameOrigin(request)) return forbidden();
  const session = await verifyAdmin();
  const { kind } = await ctx.params;
  if (!isExportKind(kind)) return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

  const form = await request.formData();
  const returnTo = returnPath(request, form.get("returnTo"));
  const minRole = EXPORT_MIN_ROLE[kind];
  if (!hasRole(session.role, minRole)) return backWithError(request, returnTo, kind, `${ROLE_LABEL[minRole]} 이상만 내려받을 수 있어요.`);

  const reason = String(form.get("reason") ?? "").trim();
  if (reason.length < 5) return backWithError(request, returnTo, kind, "사유를 5자 이상 입력해 주세요.");
  const fromDay = String(form.get("from") ?? "");
  const toDay = String(form.get("to") ?? "");
  if ((fromDay && !isKstDay(fromDay)) || (toDay && !isKstDay(toDay))) {
    return backWithError(request, returnTo, kind, "기간을 다시 선택해 주세요.");
  }
  if (fromDay && toDay && fromDay > toDay) return backWithError(request, returnTo, kind, "시작일이 종료일보다 늦어요.");

  const result = await rpc.exportRows({
    kind,
    reason,
    from: fromDay ? kstDayRange(fromDay).from : undefined,
    to: toDay ? kstDayRange(toDay).to : undefined,
    includeDemo: form.get("demo") === "1",
  });
  if (!result.ok) return backWithError(request, returnTo, kind, result.error.message);

  const csv = toCsv(result.data.rows, COLUMNS[kind]);
  const filename = `saip-${kind}-${kstToday().replace(/-/g, "")}.csv`;
  const headers = new Headers({
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
  });
  if (result.data.truncated) headers.set("X-Export-Truncated", "1");
  return new NextResponse(csv, { status: 200, headers });
}
