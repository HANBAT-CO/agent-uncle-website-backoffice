import { randomUUID } from "node:crypto";
import { RevealForm } from "../workflows/WorkflowForms";
import { EyeSlashIcon, ListChecksIcon } from "@phosphor-icons/react/dist/ssr";

import { DefinitionList, type DefinitionItem } from "@/components/admin/common/DefinitionList";
import { KstTime } from "@/components/admin/common/KstTime";
import { StatusChip } from "@/components/admin/common/StatusChip";
import { MISSING_FIELD_LABEL, PROVIDER_LABEL, roleKindLabel, SIGNUP_STAGE_LABEL } from "@/lib/admin/labels";
import type { AccountDossier } from "@/lib/admin/rpc/schemas";

import { missingLabels, signupProgress } from "./signup";

/** The app's own signupProgress stage, when it says more than the derived label. */
function stageHint(stage: string | null, label: string): string | undefined {
  const text = stage ? SIGNUP_STAGE_LABEL[stage] : undefined;
  return text && !label.startsWith(text) ? `앱 단계: ${text}` : undefined;
}

const yesNo = (value: boolean | null | undefined, yes: string, no: string) => (value ? yes : no);

/**
 * 프로필 (screens 10.7): a definition list of the app profile and the login.
 * Viewers get the masked projection from SQL plus the masking note.
 */
export function ProfileTab({ dossier, masked }: { dossier: AccountDossier; masked: boolean }) {
  const account = dossier.account;
  const auth = dossier.auth;
  const role = account?.role ?? null;
  const progress = signupProgress(role, dossier.signup.missing, account?.complete ?? false);
  const missing = account?.complete ? [] : dossier.signup.missing;

  const common: DefinitionItem[] = [
    { term: "닉네임", value: account?.nickname },
    { term: "공개 코드", value: account?.publicCode },
    { term: "사입 수수료", value: account?.fee },
    { term: "정산 계좌", value: account?.bankRegistered ? "등록됨" : "미등록" },
    { term: "탈퇴 상태", value: account?.deletionPending ? "탈퇴 처리 중" : "해당 없음" },
    { term: "역할", value: account ? roleKindLabel(role) : "앱 계정 없음" },
    { term: "가입 단계", value: <StatusChip label={progress.label} />, hint: stageHint(dossier.signup.stage, progress.label) },
    { term: MISSING_FIELD_LABEL.name, value: account?.name },
    { term: MISSING_FIELD_LABEL.contact, value: account?.contact },
    { term: MISSING_FIELD_LABEL.phone, value: account?.phone },
    { term: "이메일", value: auth.email ?? account?.email },
  ];

  const retailer: DefinitionItem[] = [
    { term: MISSING_FIELD_LABEL.businessName, value: account?.businessName },
    { term: MISSING_FIELD_LABEL.businessNumber, value: account?.businessNumber },
    { term: MISSING_FIELD_LABEL.address, value: [account?.address, account?.addressDetail].filter(Boolean).join(" ") },
    { term: MISSING_FIELD_LABEL.salesChannel, value: account?.salesChannel },
  ];

  const uncle: DefinitionItem[] = [
    { term: MISSING_FIELD_LABEL.pickupArea, value: account?.pickupArea },
    { term: MISSING_FIELD_LABEL.deliveryArea, value: account?.deliveryArea },
    { term: MISSING_FIELD_LABEL.deadline, value: account?.deadline },
    { term: "휴무", value: account?.holiday },
    { term: "활동 시간", value: account?.activityHours || [account?.activityStart, account?.activityEnd].filter(Boolean).join(" ~ ") },
    { term: "업무 상태", value: yesNo(account?.working, "업무 중", "쉬는 중") },
  ];

  const tail: DefinitionItem[] = [
    { term: "사입 시장", value: account?.markets?.join(", ") },
    { term: "소개", value: account?.intro },
    { term: "약관 동의", value: account ? `${yesNo(account.terms, "이용약관 동의함", "이용약관 미동의")} · ${yesNo(account.privacy, "개인정보 동의함", "개인정보 미동의")}` : null },
    { term: "로그인 수단", value: PROVIDER_LABEL[auth.provider] ?? auth.provider },
    { term: "이메일 인증", value: yesNo(auth.emailConfirmed, "확인됨", "확인 전") },
    { term: "최근 로그인", value: <KstTime iso={auth.lastSignInAt} /> },
    { term: "가입일", value: <KstTime iso={auth.createdAt} withYear="always" /> },
    { term: "앱 초안", value: `${dossier.draftCount.toLocaleString("ko-KR")}건 (내용은 보이지 않아요)` },
    { term: "안 읽은 알림", value: `${dossier.unreadNotices.toLocaleString("ko-KR")}건` },
  ];

  const items = [...common, ...(role === "uncle" ? uncle : role === "retailer" ? retailer : []), ...tail];

  return (
    <div className="flex flex-col gap-4">
      {masked ? (
        <p className="flex items-center gap-1.5 rounded-md bg-status-neutral-bg px-3 py-2 text-sm text-status-neutral">
          <EyeSlashIcon aria-hidden weight="bold" className="size-4 shrink-0" />
          열람자 권한에서는 연락처가 가려져요.
        </p>
      ) : null}
      {missing.length > 0 ? (
        <p className="flex items-start gap-1.5 rounded-md border border-dashed bg-card px-3 py-2 text-sm">
          <ListChecksIcon aria-hidden weight="bold" className="mt-[0.2em] size-4 shrink-0 text-muted-foreground" />
          <span>입력이 남은 항목: {missingLabels(missing)}</span>
        </p>
      ) : null}
      {!masked && account ? <RevealForm kind="bank" id={account.id} operationId={randomUUID()} /> : null}
      <div className="rounded-xl border bg-card p-5">
        <DefinitionList items={items} columns={2} />
      </div>
    </div>
  );
}
