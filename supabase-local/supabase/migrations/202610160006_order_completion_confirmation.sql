create or replace function saip_private.finish(r jsonb) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  q integer := saip_private.n(r, 'quantity');
  a integer := saip_private.n(r, 'acquired');
  d integer := saip_private.n(r, 'delivered');
  recv integer := saip_private.n(r, 'received');
  c integer := saip_private.n(r, 'cancelled');
  ac integer := saip_private.n(r, 'acquiredCancelled');
  h integer := saip_private.n(r, 'held');
  wholesaler_only boolean := saip_private.s(r, 'requestType') = 'wholesaler';
  fulfilled integer := q - c;
  bilateral_complete boolean := (
    coalesce(r->>'purchaseCompletedAt', '') <> ''
    and coalesce(r->>'receiptConfirmedAt', '') <> ''
  ) or (
    -- 기존에 정상 완료된 주문은 새 확인 시각이 없어도 완료 상태를 유지한다.
    saip_private.s(r, 'status') = 'completed'
    and recv > 0
    and h = 0
    and not saip_private.b(r, 'needsReply')
  );
begin
  if q <= 0
     or c < 0
     or recv < 0
     or recv > d
     or d > a
     or ac < 0
     or ac > c
     or ac + d > a
     or h < 0
     or h > a - ac - d
     or c > q
     or q - c < a - ac
     or saip_private.n(r, 'openIssues') < 0 then
    raise exception '확보·전달·수령·취소 수량을 다시 확인해 주세요.';
  end if;

  if r->>'status' in ('rejected', 'pending') then
    return r;
  end if;

  if saip_private.n(r, 'openIssues') = 0
     and saip_private.s(r, 'proposalId') = ''
     and saip_private.remaining(r) = 0
     and recv = fulfilled
     and d = fulfilled
     and (fulfilled = 0 or not wholesaler_only or bilateral_complete) then
    return r || jsonb_build_object(
      'status',
      case when q = c then 'cancelled' else 'completed' end
    );
  end if;

  return r || '{"status":"accepted"}'::jsonb;
end $$;

create or replace function saip_private.request_completion_comparable(r jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(r, '{}'::jsonb) - array[
    'acceptedAt',
    'purchaseCompletedAt',
    'receiptConfirmedAt',
    'receivedAt',
    'updatedAt',
    'version'
  ]
$$;

create or replace function saip_private.prepare_completion_confirmation(
  old jsonb,
  next_value jsonb,
  preserve_completion_confirmation boolean default false
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  prepared jsonb := coalesce(next_value, '{}'::jsonb);
  had_confirmation boolean :=
    coalesce(old->>'purchaseCompletedAt', '') <> ''
    or coalesce(old->>'receiptConfirmedAt', '') <> ''
    or coalesce(prepared->>'purchaseCompletedAt', '') <> ''
    or coalesce(prepared->>'receiptConfirmedAt', '') <> '';
begin
  if coalesce(old->>'acceptedAt', '') <> '' and coalesce(prepared->>'acceptedAt', '') = '' then
    prepared := prepared || jsonb_build_object('acceptedAt', old->>'acceptedAt');
  end if;
  if coalesce(old->>'receivedAt', '') <> '' and coalesce(prepared->>'receivedAt', '') = '' then
    prepared := prepared || jsonb_build_object('receivedAt', old->>'receivedAt');
  end if;

  if not had_confirmation then
    return prepared;
  end if;

  if preserve_completion_confirmation then
    if coalesce(old->>'purchaseCompletedAt', '') <> '' and coalesce(prepared->>'purchaseCompletedAt', '') = '' then
      prepared := prepared || jsonb_build_object('purchaseCompletedAt', old->>'purchaseCompletedAt');
    end if;
    if coalesce(old->>'receiptConfirmedAt', '') <> '' and coalesce(prepared->>'receiptConfirmedAt', '') = '' then
      prepared := prepared || jsonb_build_object('receiptConfirmedAt', old->>'receiptConfirmedAt');
    end if;
    return prepared;
  end if;

  if saip_private.request_completion_comparable(old) <> saip_private.request_completion_comparable(prepared) then
    return prepared - 'purchaseCompletedAt' - 'receiptConfirmedAt';
  end if;

  if coalesce(old->>'purchaseCompletedAt', '') <> '' and coalesce(prepared->>'purchaseCompletedAt', '') = '' then
    prepared := prepared || jsonb_build_object('purchaseCompletedAt', old->>'purchaseCompletedAt');
  end if;
  if coalesce(old->>'receiptConfirmedAt', '') <> '' and coalesce(prepared->>'receiptConfirmedAt', '') = '' then
    prepared := prepared || jsonb_build_object('receiptConfirmedAt', old->>'receiptConfirmedAt');
  end if;
  return prepared;
end $$;

create or replace function saip_private.save_request(
  i text,
  old jsonb,
  next_value jsonb,
  title text,
  kind text default 'request',
  target text default ''
) returns void
language plpgsql
set search_path = ''
as $$
declare
  r jsonb;
begin
  r := saip_private.prepare_completion_confirmation(old, next_value, false);
  if coalesce(old->>'acceptedAt', '') = ''
     and saip_private.s(old, 'status') = 'pending'
     and saip_private.s(r, 'status') = 'accepted'
     and coalesce(r->>'acceptedAt', '') = '' then
    r := r || jsonb_build_object('acceptedAt', clock_timestamp());
  end if;

  r := saip_private.finish(r) || jsonb_build_object(
    'version', saip_private.n(old, 'version') + 1,
    'updatedAt', clock_timestamp()
  );

  if saip_private.n(r, 'received') > saip_private.n(old, 'received') then
    r := r || jsonb_build_object('receivedAt', clock_timestamp());
  end if;

  perform saip_private.put('requests', i, r, saip_private.pair(r));
  perform saip_private.event(i, old, r, title, kind, target);
end $$;

create or replace function saip_private.save_request_preserving_completion(
  i text,
  old jsonb,
  next_value jsonb,
  title text,
  kind text default 'request',
  target text default ''
) returns void
language plpgsql
set search_path = ''
as $$
declare
  r jsonb;
begin
  r := saip_private.prepare_completion_confirmation(old, next_value, true);
  if coalesce(old->>'acceptedAt', '') = ''
     and saip_private.s(old, 'status') = 'pending'
     and saip_private.s(r, 'status') = 'accepted'
     and coalesce(r->>'acceptedAt', '') = '' then
    r := r || jsonb_build_object('acceptedAt', clock_timestamp());
  end if;

  r := saip_private.finish(r) || jsonb_build_object(
    'version', saip_private.n(old, 'version') + 1,
    'updatedAt', clock_timestamp()
  );

  if saip_private.n(r, 'received') > saip_private.n(old, 'received') then
    r := r || jsonb_build_object('receivedAt', clock_timestamp());
  end if;

  perform saip_private.put('requests', i, r, saip_private.pair(r));
  perform saip_private.event(i, old, r, title, kind, target);
end $$;

create or replace function saip_private.billing_finalize_order_completion_records(
  request_id text,
  request_record jsonb
) returns void
language plpgsql
set search_path = ''
as $$
declare
  delivery record;
  delivery_id text;
  total_quantity integer := saip_private.n(request_record, 'quantity') - saip_private.n(request_record, 'cancelled');
  missing_delivery_quantity integer;
  receipt_actor_id text := saip_private.s(request_record, 'retailerId');
begin
  for delivery in
    select id, data
    from public.saip_records
    where collection = 'deliveries'
      and data->>'requestId' = request_id
      and not coalesce((data->>'receiptRecorded')::boolean, false)
    order by coalesce(nullif(data->>'createdAt', '')::timestamptz, '-infinity'::timestamptz), id
    for update
  loop
    perform saip_private.put(
      'receipts',
      gen_random_uuid()::text,
      jsonb_build_object(
        'requestId', request_id,
        'deliveryId', delivery.id,
        'actorId', receipt_actor_id,
        'actual', saip_private.n(delivery.data, 'quantity'),
        'confirmed', saip_private.n(delivery.data, 'quantity'),
        'reason', '',
        'deliveryVersion', saip_private.n(delivery.data, 'version'),
        'kind', 'confirmation',
        'createdAt', clock_timestamp()
      ),
      saip_private.pair(request_record)
    );

    perform saip_private.put(
      'deliveries',
      delivery.id,
      delivery.data || jsonb_build_object(
        'received', saip_private.n(delivery.data, 'quantity'),
        'actual', saip_private.n(delivery.data, 'quantity'),
        'receiptRecorded', true,
        'version', saip_private.n(delivery.data, 'version') + 1
      ),
      saip_private.pair(request_record)
    );
  end loop;

  missing_delivery_quantity := total_quantity - saip_private.n(request_record, 'delivered');
  if missing_delivery_quantity < 0 then
    raise exception '전달 수량을 다시 확인해 주세요.';
  end if;

  if missing_delivery_quantity > 0 then
    delivery_id := gen_random_uuid()::text;
    perform saip_private.put(
      'deliveries',
      delivery_id,
      saip_private.pick(request_record, array['product', 'option', 'requestType', 'wholesalers', 'wholesaler', 'location', 'address', 'addressDetail', 'retailerId', 'uncleId'])
        || jsonb_build_object(
          'requestId', request_id,
          'quantity', missing_delivery_quantity,
          'received', missing_delivery_quantity,
          'actual', missing_delivery_quantity,
          'receiptRecorded', true,
          'createdAt', clock_timestamp(),
          'version', 1
        ),
      saip_private.pair(request_record)
    );

    perform saip_private.put(
      'receipts',
      gen_random_uuid()::text,
      jsonb_build_object(
        'requestId', request_id,
        'deliveryId', delivery_id,
        'actorId', receipt_actor_id,
        'actual', missing_delivery_quantity,
        'confirmed', missing_delivery_quantity,
        'reason', '',
        'deliveryVersion', 0,
        'kind', 'confirmation',
        'createdAt', clock_timestamp()
      ),
      saip_private.pair(request_record)
    );
  end if;
end $$;

create or replace function saip_private.billing_complete_order_purchase(args jsonb, actor uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare
  request_id text := btrim(coalesce(args->>'requestId', ''));
  expected_version integer;
  request_record jsonb;
  total_quantity integer;
  next_request jsonb;
begin
  if request_id = '' or not (args ? 'version') or jsonb_typeof(args->'version') = 'null' then
    raise exception '최신 주문 상태를 확인하고 다시 시도해 주세요.';
  end if;
  expected_version := saip_private.order_flow_integer(args->'version', '주문 버전');

  perform saip_private.billing_require_role(actor, 'uncle');
  request_record := saip_private.billing_request(actor, request_id);
  if saip_private.s(request_record, 'uncleId') <> actor::text then
    raise exception '담당 삼촌만 사입 완료를 확인할 수 있어요.';
  end if;
  perform saip_private.version(request_record, expected_version);

  if saip_private.s(request_record, 'requestType') <> 'wholesaler' then
    raise exception '도매처 주문만 사입 완료를 확인할 수 있어요.';
  end if;
  if saip_private.s(request_record, 'status') <> 'accepted' then
    raise exception '진행 중인 주문에서만 사입 완료를 확인할 수 있어요.';
  end if;
  if coalesce(request_record->>'purchaseCompletedAt', '') <> '' then
    raise exception '이미 사입 완료를 확인한 주문이에요.';
  end if;
  if saip_private.n(request_record, 'held') > 0 then
    raise exception '보류 수량을 먼저 정리해 주세요.';
  end if;
  if saip_private.n(request_record, 'openIssues') > 0 then
    raise exception '열린 문제를 먼저 해결해 주세요.';
  end if;
  if saip_private.b(request_record, 'needsReply') then
    raise exception '미송 응답을 먼저 처리해 주세요.';
  end if;
  if saip_private.s(request_record, 'proposalId') <> '' then
    raise exception '진행 중인 변경·취소 협의를 먼저 처리해 주세요.';
  end if;

  total_quantity := saip_private.n(request_record, 'quantity') - saip_private.n(request_record, 'cancelled');
  if total_quantity <= 0 then
    raise exception '사입 완료를 확인할 상품이 없는 주문이에요.';
  end if;
  if saip_private.n(request_record, 'delivered') > total_quantity
     or saip_private.n(request_record, 'received') > saip_private.n(request_record, 'delivered') then
    raise exception '전달 수량을 다시 확인해 주세요.';
  end if;

  next_request := request_record || jsonb_build_object('purchaseCompletedAt', clock_timestamp());
  if coalesce(request_record->>'receiptConfirmedAt', '') <> '' then
    perform saip_private.billing_finalize_order_completion_records(request_id, request_record);
    next_request := next_request || jsonb_build_object(
      'acquired', total_quantity + saip_private.n(request_record, 'acquiredCancelled'),
      'resultShared', true,
      'delivered', total_quantity,
      'received', total_quantity
    );
    perform saip_private.save_request_preserving_completion(
      request_id,
      request_record,
      next_request,
      '사입 완료를 확인했어요',
      'delivery'
    );
  else
    perform saip_private.save_request(
      request_id,
      request_record,
      next_request,
      '사입 완료를 확인했어요',
      'delivery'
    );
  end if;

  return request_id;
end $$;

create or replace function saip_private.billing_complete_order_receipt(args jsonb, actor uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare
  request_id text := btrim(coalesce(args->>'requestId', ''));
  expected_version integer;
  request_record jsonb;
  total_quantity integer;
  next_request jsonb;
begin
  if request_id = '' or not (args ? 'version') or jsonb_typeof(args->'version') = 'null' then
    raise exception '최신 주문 상태를 확인하고 다시 시도해 주세요.';
  end if;
  expected_version := saip_private.order_flow_integer(args->'version', '주문 버전');

  perform saip_private.billing_require_role(actor, 'retailer');
  request_record := saip_private.billing_request(actor, request_id);
  if saip_private.s(request_record, 'retailerId') <> actor::text then
    raise exception '소유 소매업자만 수령 완료를 확인할 수 있어요.';
  end if;
  perform saip_private.version(request_record, expected_version);

  if saip_private.s(request_record, 'requestType') <> 'wholesaler' then
    raise exception '도매처 주문만 수령 완료를 확인할 수 있어요.';
  end if;
  if saip_private.s(request_record, 'status') <> 'accepted' then
    raise exception '진행 중인 주문에서만 수령 완료를 확인할 수 있어요.';
  end if;
  if coalesce(request_record->>'receiptConfirmedAt', '') <> '' then
    raise exception '이미 수령 완료를 확인한 주문이에요.';
  end if;
  if saip_private.n(request_record, 'held') > 0 then
    raise exception '보류 수량을 먼저 정리해 주세요.';
  end if;
  if saip_private.n(request_record, 'openIssues') > 0 then
    raise exception '열린 문제를 먼저 해결해 주세요.';
  end if;
  if saip_private.b(request_record, 'needsReply') then
    raise exception '미송 응답을 먼저 처리해 주세요.';
  end if;
  if saip_private.s(request_record, 'proposalId') <> '' then
    raise exception '진행 중인 변경·취소 협의를 먼저 처리해 주세요.';
  end if;

  total_quantity := saip_private.n(request_record, 'quantity') - saip_private.n(request_record, 'cancelled');
  if total_quantity <= 0 then
    raise exception '수령할 상품이 없는 주문이에요.';
  end if;
  if saip_private.n(request_record, 'delivered') > total_quantity
     or saip_private.n(request_record, 'received') > saip_private.n(request_record, 'delivered') then
    raise exception '전달 수량을 다시 확인해 주세요.';
  end if;

  next_request := request_record || jsonb_build_object('receiptConfirmedAt', clock_timestamp());
  if coalesce(request_record->>'purchaseCompletedAt', '') <> '' then
    perform saip_private.billing_finalize_order_completion_records(request_id, request_record);
    next_request := next_request || jsonb_build_object(
      'acquired', total_quantity + saip_private.n(request_record, 'acquiredCancelled'),
      'resultShared', true,
      'delivered', total_quantity,
      'received', total_quantity
    );
    perform saip_private.save_request_preserving_completion(
      request_id,
      request_record,
      next_request,
      '수령 완료를 확인했어요',
      'delivery'
    );
  else
    perform saip_private.save_request(
      request_id,
      request_record,
      next_request,
      '수령 완료를 확인했어요',
      'delivery'
    );
  end if;

  return request_id;
end $$;

create or replace function saip_private.billing_send_one_invoice(
  invoice_id text,
  actor uuid,
  expected_version integer default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  invoice jsonb;
  payment jsonb;
  payment_id text;
  adjustment_id text;
  adjustment jsonb;
  next_readers text[];
begin
  select data into invoice
  from public.saip_records
  where collection = 'invoices' and id = invoice_id
  for update;

  if invoice is null then
    raise exception '기록을 찾을 수 없어요. 목록을 다시 확인해 주세요.';
  end if;
  if not saip_private.billing_can_manage(invoice, actor) then
    raise exception '청구 담당 삼촌만 발행할 수 있어요.';
  end if;
  if expected_version is not null then
    perform saip_private.version(invoice, expected_version);
  end if;
  if saip_private.s(invoice, 'status') <> 'draft' then
    raise exception '아직 발행 전인 청구서만 선택해 주세요.';
  end if;
  if exists (
    select 1
    from unnest(saip_private.invoice_request_ids(invoice_id, invoice)) as request_id
    join public.saip_records as request
      on request.collection = 'requests' and request.id = request_id
    where saip_private.s(request.data, 'requestType') = 'wholesaler'
      and saip_private.s(request.data, 'status') = 'accepted'
      and not (
        coalesce(request.data->>'purchaseCompletedAt', '') <> ''
        and coalesce(request.data->>'receiptConfirmedAt', '') <> ''
      )
  ) then
    raise exception '양쪽 완료 확인을 마친 위치형 주문만 청구서를 발행할 수 있어요.';
  end if;

  foreach payment_id in array saip_private.billing_text_array(invoice->'fieldPaymentIds') loop
    select data into payment
    from public.saip_records
    where collection = 'fieldPayments' and id = payment_id
    for update;

    if payment is null then
      raise exception '기록을 찾을 수 없어요. 목록을 다시 확인해 주세요.';
    end if;
    if saip_private.n(payment, 'unallocatedAmount') > 0 then
      raise exception '미배분 현장 지급이 남아 있으면 청구서를 발행할 수 없어요.';
    end if;
    if saip_private.s(payment, 'settlementKind') = 'review' then
      raise exception '결제 방식이 review 인 현장 지급은 확인 후에만 청구서를 발행할 수 있어요.';
    end if;
    if coalesce((payment->>'cashAllocatedAmountMissing')::boolean, true)
       or coalesce((payment->>'customerChargeAmountMissing')::boolean, true)
       or coalesce((payment->>'directPaidAmountMissing')::boolean, true)
       or coalesce((payment->>'supplierFeeAmountMissing')::boolean, true) then
      raise exception '금액 입력이 비어 있는 현장 지급은 먼저 실제 값을 채워 주세요.';
    end if;
  end loop;

  next_readers := saip_private.billing_invoice_readers(invoice, true);
  perform saip_private.billing_put(
    'invoices',
    invoice_id,
    invoice || jsonb_build_object(
      'status', 'sent',
      'sentAt', clock_timestamp(),
      'readers', to_jsonb(next_readers),
      'updatedAt', clock_timestamp(),
      'version', saip_private.n(invoice, 'version') + 1
    )
  );

  for adjustment_id, adjustment in
    select id, data
    from public.saip_records
    where collection = 'invoiceAdjustments'
      and data->>'invoiceId' = invoice_id
    for update
  loop
    perform saip_private.billing_put(
      'invoiceAdjustments',
      adjustment_id,
      adjustment || jsonb_build_object(
        'readers', to_jsonb(next_readers),
        'updatedAt', clock_timestamp(),
        'version', saip_private.n(adjustment, 'version') + 1
      )
    );
  end loop;

  perform saip_private.billing_rebuild_invoice(invoice_id);
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
  if normalized = 'billing.completeOrderPurchase' then
    return saip_private.billing_complete_order_purchase(args, actor);
  elsif normalized = 'billing.completeOrderReceipt' then
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
  saip_private.finish(jsonb),
  saip_private.request_completion_comparable(jsonb),
  saip_private.prepare_completion_confirmation(jsonb,jsonb,boolean),
  saip_private.save_request(text,jsonb,jsonb,text,text,text),
  saip_private.save_request_preserving_completion(text,jsonb,jsonb,text,text,text),
  saip_private.billing_finalize_order_completion_records(text,jsonb),
  saip_private.billing_complete_order_purchase(jsonb,uuid),
  saip_private.billing_complete_order_receipt(jsonb,uuid),
  saip_private.billing_send_one_invoice(text,uuid,integer),
  saip_private.billing_command(text,jsonb,uuid)
from public, anon, authenticated;
