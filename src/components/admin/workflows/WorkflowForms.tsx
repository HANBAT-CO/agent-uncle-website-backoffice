"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ActionState } from "@/lib/admin/actions";
import {
  bankSchema,
  teamChatSchema,
  workflowDetailSchema,
} from "@/lib/admin/rpc/workflow-schemas";
import { RecordFields } from "./RecordFields";
import { recordPayment, revealWorkflow } from "./actions";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
const idle: ActionState = { status: "idle" };
function Result({ state }: { state: ActionState }) {
  if (state.status === "idle") return null;
  return (
    <div
      role={state.status === "error" ? "alert" : "status"}
      className="text-sm"
    >
      <p>{state.message}</p>
      {state.status === "error" && state.loginHref ? (
        <Link className="underline" href={state.loginHref}>
          다시 로그인
        </Link>
      ) : null}
    </div>
  );
}
export function RevealForm({
  kind,
  id,
  collection = "",
  operationId,
}: {
  kind: "bank" | "chat" | "detail";
  id: string;
  collection?: string;
  operationId: string;
}) {
  const [state, action, pending] = useActionState(revealWorkflow, idle);
  const [hidden, setHidden] = useState(false);
  const [offset, setOffset] = useState(0);
  const raw = state.status === "success" && !hidden ? state.data : undefined;
  const bank = kind === "bank" ? bankSchema.safeParse(raw) : null;
  const chat = kind === "chat" ? teamChatSchema.safeParse(raw) : null;
  const detail = kind === "detail" ? workflowDetailSchema.safeParse(raw) : null;
  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <form
        action={action}
        onSubmit={() => setHidden(false)}
        className="flex flex-wrap items-end gap-3"
      >
        <input type="hidden" name="operationId" value={operationId} />
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="collection" value={collection} />
        <input type="hidden" name="offset" value={offset} />
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
          열람 사유
          <Input
            name="reason"
            required
            minLength={5}
            maxLength={1000}
            placeholder="고객 문의 또는 점검 사유를 입력하세요"
          />
        </label>
        <Button disabled={pending}>
          {pending
            ? "조회 중…"
            : kind === "bank"
              ? "정산 계좌 열람"
              : kind === "chat"
                ? "대화 내용 열람"
                : "메모·문의 내용 열람"}
        </Button>
      </form>
      <Result state={state} />
      {bank?.success ? <RecordFields data={bank.data} /> : null}
      {detail?.success ? (
        Object.keys(detail.data.contents).length ? (
          <RecordFields data={detail.data.contents} />
        ) : (
          <p className="text-sm text-muted-foreground">추가 내용이 없어요.</p>
        )
      ) : null}
      {chat?.success ? (
        <>
          <p className="text-sm">
            총 {chat.data.total}개
            {chat.data.rows.length ? ` · ${chat.data.offset + 1}부터` : ""}
          </p>
          {chat.data.rows.map((row) => (
            <article key={row.id} className="space-y-2 border-t pt-3">
              <RecordFields
                data={row.data}
                fields={[
                  "senderId",
                  "peerId",
                  "createdAt",
                  "editedAt",
                  "deleted",
                  "body",
                  "requestId",
                ]}
              />
            </article>
          ))}
          {chat.data.total === 0 ? <p>대화 기록이 없어요.</p> : null}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={offset === 0}
              onClick={() => {
                setOffset(Math.max(0, offset - 25));
                setHidden(true);
              }}
            >
              이전 범위 선택
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={offset + 25 >= chat.data.total}
              onClick={() => {
                setOffset(offset + 25);
                setHidden(true);
              }}
            >
              다음 범위 선택
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            범위를 선택한 뒤 열람 버튼을 누르면 해당 대화의 열람 사유가
            기록돼요.
          </p>
        </>
      ) : null}
      {raw ? (
        <Button variant="ghost" onClick={() => setHidden(true)}>
          내용 가리기
        </Button>
      ) : null}
    </div>
  );
}
export function PaymentForm({
  recordId,
  version,
  amount,
  action: paymentAction,
  operationId,
}: {
  recordId: string;
  version: number;
  amount: number;
  action: "confirm_receipt" | "reject_receipt" | "pay_uncle";
  operationId: string;
}) {
  const [state, action, pending] = useActionState(recordPayment, idle);
  const router = useRouter();
  const title =
    paymentAction === "pay_uncle"
      ? "삼촌 지급 완료 기록"
      : paymentAction === "confirm_receipt"
        ? "입금 확인"
        : "입금 반려";
  return (
    <form action={action} className="space-y-3 rounded-lg border p-4">
      <h3 className="font-medium">{title}</h3>
      <p className="text-sm text-muted-foreground">
        {paymentAction === "pay_uncle"
          ? "은행에서 실제 지급을 완료한 뒤 기록하세요. 이 버튼은 송금을 실행하지 않아요."
          : "은행 거래내역을 대조한 뒤 결과를 기록하세요."}
      </p>
      <input type="hidden" name="operationId" value={operationId} />
      <input type="hidden" name="recordId" value={recordId} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="action" value={paymentAction} />
      <label className="flex flex-col gap-1 text-sm">
        확인 금액 (원)
        <Input
          name="amount"
          type="number"
          min={0}
          max={2147483647}
          step={1}
          defaultValue={amount}
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        은행 거래 확인 번호
        <Input name="reference" required maxLength={300} autoComplete="off" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        처리 사유
        <Input name="reason" required minLength={5} maxLength={1000} />
      </label>
      <Result state={state} />
      <Button disabled={pending || state.status === "success"}>
        {pending ? "처리 중…" : title}
      </Button>
      {state.status === "success" ||
      (state.status === "error" && state.kind === "conflict") ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => router.refresh()}
        >
          최신 상태 확인
        </Button>
      ) : null}
    </form>
  );
}
