-- 입금 전 최종 청구 금액 변경. 원금·배분은 보존하고 차액을 조정 이력으로 남긴다.
create function saip_private.billing_set_final_amount(args jsonb, actor uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare
  invoice_id text := btrim(coalesce(args->>'invoiceId', ''));
  invoice jsonb;
  final_amount integer;
  delta integer;
begin
  perform saip_private.billing_require_role(actor, 'uncle');
  select data into invoice
  from public.saip_records
  where collection = 'invoices' and id = invoice_id
  for update;
  if invoice is null then
    raise exception '기록을 찾을 수 없어요. 목록을 다시 확인해 주세요.';
  end if;
  if not saip_private.billing_can_manage(invoice, actor) then
    raise exception '청구 담당 삼촌만 최종 발행 금액을 변경할 수 있어요.';
  end if;
  perform saip_private.version(invoice, saip_private.order_flow_integer(args->'invoiceVersion', '청구서 버전'));
  if saip_private.s(invoice, 'status') <> 'sent'
     or saip_private.b(invoice, 'requiresReconciliation')
     or saip_private.b(invoice, 'platformPayoutComplete')
     or saip_private.n(invoice, 'missingAmountCount') <> 0
     or saip_private.n(invoice, 'reportedReceiptAmount') <> 0
     or saip_private.n(invoice, 'pendingReceiptCount') <> 0
     or saip_private.n(invoice, 'confirmedReceiptAmount') <> 0
     or saip_private.n(invoice, 'confirmedRefundAmount') <> 0
     or exists (
       select 1 from public.saip_records
       where collection = 'invoiceReceipts'
         and data->>'invoiceId' = invoice_id
         and data->>'status' in ('reported', 'confirmed')
     ) then
    raise exception '송금 알림이나 입금 확인 전인 청구서만 최종 금액을 변경할 수 있어요.';
  end if;
  final_amount := saip_private.order_flow_integer(args->'finalAmount', '최종 발행 금액');
  if final_amount = 0 then
    raise exception '최종 발행 금액은 0보다 커야 해요.';
  end if;
  delta := final_amount - saip_private.n(invoice, 'adjustedTotalAmount');
  if delta = 0 then return invoice_id; end if;
  perform saip_private.billing_put(
    'invoiceAdjustments',
    'invoice-adjustment:' || gen_random_uuid()::text,
    jsonb_build_object(
      'invoiceId', invoice_id,
      'kind', case when delta > 0 then 'charge' else 'discount' end,
      'amount', abs(delta),
      'reason', '최종 발행 금액 변경',
      'actorId', actor::text,
      'previousAmount', saip_private.n(invoice, 'adjustedTotalAmount'),
      'finalAmount', final_amount,
      'readers', invoice->'readers',
      'createdAt', clock_timestamp(),
      'updatedAt', clock_timestamp(),
      'version', 0
    )
  );
  perform saip_private.billing_rebuild_invoice(invoice_id);
  return invoice_id;
end;
$$;

create or replace function saip_private.billing_command(command text, args jsonb, actor uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare
  normalized text := case when left(command, 3) = 'wf.' then substring(command from 4) else command end;
begin
  if normalized = 'billing.completeOrderReceipt' then
    return saip_private.billing_complete_order_receipt(args, actor);
  elsif normalized = 'billing.issueOrderInvoice' then
    return saip_private.billing_issue_order_invoice(args, actor);
  elsif normalized = 'billing.setFinalAmount' then
    return saip_private.billing_set_final_amount(args, actor);
  end if;
  return saip_private.billing_command_before_order_flow(command, args, actor);
end;
$$;

revoke all on function
  saip_private.billing_set_final_amount(jsonb,uuid),
  saip_private.billing_command(text,jsonb,uuid)
from public, anon, authenticated;
