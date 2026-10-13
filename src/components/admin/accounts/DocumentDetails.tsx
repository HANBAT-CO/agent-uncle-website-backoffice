import { ClockCounterClockwiseIcon } from "@phosphor-icons/react/dist/ssr";

import { DefinitionList } from "@/components/admin/common/DefinitionList";
import { KstTime } from "@/components/admin/common/KstTime";
import { StatusChip } from "@/components/admin/common/StatusChip";
import { bytes } from "@/lib/admin/format";
import { verificationLabel } from "@/lib/admin/labels";
import type { AccountDossier } from "@/lib/admin/rpc/schemas";

import { REVIEW_CHECKS, REVIEW_DECISION_LABEL } from "./review";

type Attachment = AccountDossier["attachments"][number];

/** 서류 metadata (screens 10.7): state, file, business name and number (masked for viewers). */
export function DocumentDetails({ dossier, document, masked }: { dossier: AccountDossier; document: Attachment | null; masked: boolean }) {
  const account = dossier.account;
  const kind = document?.mime?.includes("pdf") ? "PDF" : document?.mime?.startsWith("image/") ? "이미지" : document ? "파일" : null;
  return (
    <DefinitionList
      columns={2}
      items={[
        { term: "서류 상태", value: <StatusChip label={verificationLabel(account?.verification ?? "none")} /> },
        { term: "제출 시각", value: document ? <KstTime iso={document.createdAt} /> : null },
        { term: "파일", value: document ? `${kind} · ${bytes(document.size)}` : null, hint: masked ? "열람자 권한에서는 파일 이름이 보이지 않아요." : document?.name },
        { term: "최근 검토", value: account?.verificationReviewedAt ? <KstTime iso={account.verificationReviewedAt} /> : "아직 검토하지 않았어요" },
        { term: "사업자명", value: account?.businessName },
        { term: "사업자등록번호", value: account?.businessNumber },
        ...(account?.verification === "rejected" && account.verificationNote ? [{ term: "앱에 보인 재제출 안내", value: account.verificationNote }] : []),
      ]}
    />
  );
}

/** 검토 기록: every review of this account, newest first (immutable). Internal notes only reach operators. */
export function ReviewHistory({ reviews, names }: { reviews: AccountDossier["reviews"]; names: Record<string, string> }) {
  return (
    <section aria-label="검토 기록" className="flex flex-col gap-3">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <ClockCounterClockwiseIcon aria-hidden weight="bold" className="size-4 text-muted-foreground" />
        검토 기록
        <span className="num text-xs font-normal text-muted-foreground">{reviews.length}건</span>
      </h3>
      {reviews.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">아직 검토한 기록이 없어요</p>
      ) : (
        <ol className="flex flex-col divide-y rounded-xl border bg-card">
          {reviews.map((review) => {
            const checked = REVIEW_CHECKS.filter((check) => review.checks[check.key] === true).map((check) => check.label);
            return (
              <li key={review.id} className="flex flex-col gap-1 px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="text-sm font-semibold text-foreground">{REVIEW_DECISION_LABEL[review.decision]}</span>
                  <span className="font-medium text-foreground">{names[review.reviewedBy] ?? "운영 계정"}</span>
                  <KstTime iso={review.reviewedAt} />
                </div>
                {review.userMessage ? <p className="text-sm break-words">앱에 보일 안내: {review.userMessage}</p> : null}
                {review.internalNote ? <p className="text-xs break-words whitespace-pre-wrap text-muted-foreground">내부 메모: {review.internalNote}</p> : null}
                {checked.length > 0 ? <p className="text-xs text-muted-foreground">확인한 항목: {checked.join(", ")}</p> : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
