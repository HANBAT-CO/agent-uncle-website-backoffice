alter function saip_private.billing_command(text,jsonb,uuid)
  rename to billing_command_before_order_flow;

-- 금액과 버전은 정수 그대로 받아 소수 반올림·누락·오버플로를 막는다.
create function saip_private.order_flow_integer(value jsonb, label text)
returns integer language plpgsql immutable set search_path = '' as $$
declare raw text := value #>> '{}';
begin
  if value is null or jsonb_typeof(value) not in ('number', 'string')
     or raw !~ '^[0-9]+$' or length(raw) > 10 then
    raise exception '% 값을 0 이상의 정수로 입력해 주세요.', label;
  end if;
  if raw::bigint > 2147483647 then
    raise exception '% 금액 또는 버전이 허용 범위를 초과했어요.', label;
  end if;
  return raw::integer;
end $$;

create function saip_private.order_flow_request_wholesalers(request_record jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(name order by name), '{}'::text[])
  from (
    select distinct btrim(source_name) as name
    from (
      select saip_private.s(request_record, 'wholesaler') as source_name
      union all
      select item->>'wholesaler'
      from jsonb_array_elements(coalesce(request_record->'wholesalers', '[]'::jsonb)) as item
    ) names
    where btrim(coalesce(source_name, '')) <> ''
  ) normalized
$$;

create function saip_private.order_flow_related_invoice_id(request_id text)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(min(invoice.id), '')
  from public.saip_records as invoice
  where invoice.collection = 'invoices'
    and request_id = any(saip_private.invoice_request_ids(invoice.id, invoice.data))
$$;

create function saip_private.billing_complete_order_receipt(args jsonb, actor uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare
  request_id text := btrim(coalesce(args->>'requestId', ''));
  expected_version integer;
  request_record jsonb;
  delivery record;
  delivery_id text;
  total_quantity integer;
  missing_delivery_quantity integer;
  receipt_title text;
begin
  if request_id = '' or not (args ? 'version') or jsonb_typeof(args->'version') = 'null' then
    raise exception '최신 주문 상태를 확인하고 다시 시도해 주세요.';
  end if;
  expected_version := saip_private.order_flow_integer(args->'version', '주문 버전');

  perform saip_private.billing_require_role(actor, 'retailer');
  request_record := saip_private.billing_request(actor, request_id);
  if saip_private.s(request_record, 'retailerId') <> actor::text then
    raise exception '소유 소매업자만 전체 수령을 확인할 수 있어요.';
  end if;
  perform saip_private.version(request_record, expected_version);

  if saip_private.s(request_record, 'requestType') <> 'wholesaler' then
    raise exception '위치형 주문만 전체 수령을 확인할 수 있어요.';
  end if;
  if saip_private.order_received(request_record) then
    raise exception '이미 전체 수령 확인을 마친 주문이에요.';
  end if;
  if saip_private.s(request_record, 'status') <> 'accepted' then
    raise exception '진행 중인 위치형 주문에서만 전체 수령을 확인할 수 있어요.';
  end if;
  if saip_private.n(request_record, 'held') > 0
     or saip_private.n(request_record, 'openIssues') > 0
     or saip_private.b(request_record, 'needsReply')
     or saip_private.s(request_record, 'proposalId') <> '' then
    raise exception '보류·수량 문제·미송 답변·변경 협의가 남아 있으면 전체 수령을 확인할 수 없어요.';
  end if;

  total_quantity := saip_private.n(request_record, 'quantity') - saip_private.n(request_record, 'cancelled');
  if total_quantity <= 0 then
    raise exception '수령할 상품이 없는 주문이에요.';
  end if;
  if saip_private.n(request_record, 'delivered') > total_quantity
     or saip_private.n(request_record, 'received') > saip_private.n(request_record, 'delivered') then
    raise exception '전달 수량을 다시 확인해 주세요.';
  end if;

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
        'actorId', actor,
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
        'actorId', actor,
        'actual', missing_delivery_quantity,
        'confirmed', missing_delivery_quantity,
        'reason', '전체 수령 확인',
        'deliveryVersion', 0,
        'kind', 'confirmation',
        'createdAt', clock_timestamp()
      ),
      saip_private.pair(request_record)
    );
  end if;

  receipt_title := case
    when missing_delivery_quantity > 0 then format('상품 전체 %s개 수령을 확인했어요', total_quantity)
    else '상품 전체 수령을 확인했어요'
  end;

  perform saip_private.save_request(
    request_id,
    request_record,
    request_record || jsonb_build_object(
      'acquired', total_quantity + saip_private.n(request_record, 'acquiredCancelled'),
      'resultShared', true,
      'delivered', total_quantity,
      'received', total_quantity,
      'receivedAt', clock_timestamp()
    ),
    receipt_title
  );

  return request_id;
end;
$$;

create function saip_private.billing_issue_order_invoice(args jsonb, actor uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare
  request_id text := btrim(coalesce(args->>'requestId', ''));
  expected_version integer;
  request_record jsonb;
  request_wholesalers text[];
  goods_rows jsonb := coalesce(args->'goods', '[]'::jsonb);
  goods_row jsonb;
  goods_map jsonb := '{}'::jsonb;
  wholesaler_name text;
  goods_amount integer;
  total_goods_amount bigint := 0;
  delivery_fee_amount integer := 0;
  existing_invoice_id text;
  payment record;
  allocation record;
  existing_payment_ids text[] := '{}'::text[];
  supplied_payment_ids text[];
  supplied_payment_versions jsonb := coalesce(args->'paymentVersions', '{}'::jsonb);
  payment_id text;
  invoice_id text;
  invoice_args jsonb;
  group_key text := null;
  current_group_key text;
begin
  if request_id = '' or not (args ? 'version') or jsonb_typeof(args->'version') = 'null' then
    raise exception '최신 주문 상태를 확인하고 다시 시도해 주세요.';
  end if;
  expected_version := saip_private.order_flow_integer(args->'version', '주문 버전');

  perform saip_private.billing_require_role(actor, 'uncle');
  request_record := saip_private.billing_request(actor, request_id);
  if saip_private.s(request_record, 'uncleId') <> actor::text then
    raise exception '소유 삼촌만 주문 청구서를 발행할 수 있어요.';
  end if;
  perform saip_private.version(request_record, expected_version);

  if saip_private.s(request_record, 'requestType') <> 'wholesaler' then
    raise exception '위치형 주문만 주문 청구서를 발행할 수 있어요.';
  end if;
  if not saip_private.order_received(request_record) then
    raise exception '소매업자의 전체 수령 확인 후에만 주문 청구서를 발행할 수 있어요.';
  end if;

  existing_invoice_id := saip_private.order_flow_related_invoice_id(request_id);
  if existing_invoice_id <> '' then
    raise exception '이미 이 주문에 연결된 청구서가 있어요. 기존 청구서를 확인해 주세요.';
  end if;

  delivery_fee_amount := saip_private.order_flow_integer(args->'deliveryFeeAmount', '배송비');

  if jsonb_typeof(coalesce(args->'paymentIds', '[]'::jsonb)) <> 'array' then
    raise exception '기존 지급 목록을 다시 확인해 주세요.';
  end if;
  supplied_payment_ids := saip_private.billing_merge_texts('{}'::text[], saip_private.billing_text_array(args->'paymentIds'));
  if exists(select 1 from jsonb_array_elements(coalesce(args->'paymentIds', '[]'::jsonb)) v
      where jsonb_typeof(v) <> 'string' or btrim(v #>> '{}') = '')
     or jsonb_array_length(coalesce(args->'paymentIds', '[]'::jsonb)) <>
        cardinality(supplied_payment_ids) then
    raise exception '기존 지급 목록에 잘못되거나 중복된 항목이 있어요.';
  end if;

  if jsonb_typeof(goods_rows) <> 'array' then
    raise exception '도매처별 상품값을 다시 확인해 주세요.';
  end if;
  if jsonb_typeof(supplied_payment_versions) <> 'object' then
    raise exception '기존 지급의 최신 버전을 모두 확인해 주세요.';
  end if;

  for payment in
    select id, data
    from public.saip_records
    where collection = 'fieldPayments'
      and data->>'requestId' = request_id
    order by id
    for update
  loop
    existing_payment_ids := saip_private.billing_merge_texts(existing_payment_ids, array[payment.id]);

    current_group_key := saip_private.billing_group_key(payment.data);
    if group_key is null then
      group_key := current_group_key;
    elsif group_key <> current_group_key then
      raise exception '서로 다른 지급 범위가 섞여 있어 기존 상세 관리 경로에서 정리해 주세요.';
    end if;

    if saip_private.s(payment.data, 'retailerId') <> saip_private.s(request_record, 'retailerId')
       or saip_private.s(payment.data, 'payeeId') <> saip_private.s(request_record, 'uncleId') then
      raise exception '주문 범위와 다른 지급은 기존 상세 관리 경로에서 정리해 주세요.';
    end if;
    if saip_private.s(payment.data, 'invoiceId') <> '' then
      raise exception '이미 청구서에 연결된 지급이 있어 새 주문 청구를 만들 수 없어요.';
    end if;
    total_goods_amount := total_goods_amount + greatest(0,
      saip_private.n(payment.data, 'customerChargeAmount') - saip_private.n(payment.data, 'directPaidAmount'));

    for allocation in
      select id, data
      from public.saip_records
      where collection = 'supplierPaymentAllocations'
        and data->>'paymentId' = payment.id
      order by id
      for update
    loop
      if saip_private.s(allocation.data, 'requestId') <> request_id then
        raise exception '다른 주문과 공유된 지급은 기존 상세 관리 경로에서 정리해 주세요.';
      end if;
      if saip_private.s(allocation.data, 'invoiceId') <> '' then
        raise exception '이미 청구서에 연결된 지급이 있어 새 주문 청구를 만들 수 없어요.';
      end if;
      if saip_private.billing_group_key(allocation.data) <> current_group_key then
        raise exception '배분 범위가 실제 지급과 맞지 않아요. 기존 상세 관리 경로에서 정리해 주세요.';
      end if;
    end loop;
  end loop;

  if coalesce(array_length(existing_payment_ids, 1), 0) > 0 then
    if jsonb_array_length(goods_rows) > 0 then
      raise exception '기존 지급이 있는 주문은 상품값을 다시 입력하지 않고 기존 지급 전체를 선택해 주세요.';
    end if;
    if coalesce(array_length(existing_payment_ids, 1), 0) <> coalesce(array_length(supplied_payment_ids, 1), 0)
       or exists(select 1 from unnest(existing_payment_ids) as id where not id = any(supplied_payment_ids))
       or exists(select 1 from unnest(supplied_payment_ids) as id where not id = any(existing_payment_ids)) then
      raise exception '이 주문의 기존 미청구 지급 전체를 그대로 선택해 주세요.';
    end if;

    if (select count(*) from jsonb_object_keys(supplied_payment_versions)) <> coalesce(array_length(existing_payment_ids, 1), 0)
       or exists(
         select 1 from jsonb_object_keys(supplied_payment_versions) as key
         where not key = any(existing_payment_ids)
       ) then
      raise exception '기존 지급의 최신 버전을 모두 확인해 주세요.';
    end if;

    foreach payment_id in array existing_payment_ids loop
      if not (supplied_payment_versions ? payment_id) then
        raise exception '기존 지급의 최신 버전을 모두 확인해 주세요.';
      end if;
      select data into payment
      from public.saip_records
      where collection = 'fieldPayments' and id = payment_id
      for update;
      perform saip_private.version(payment.data,
        saip_private.order_flow_integer(supplied_payment_versions->payment_id, '지급 버전'));
    end loop;

    if total_goods_amount + delivery_fee_amount <= 0 or total_goods_amount + delivery_fee_amount > 2147483647 then
      raise exception '총 청구 금액을 확인해 주세요.';
    end if;

    invoice_args := jsonb_build_object(
      'paymentIds', to_jsonb(existing_payment_ids),
      'deliveryFeeAmount', delivery_fee_amount
    );
    invoice_id := saip_private.billing_command_before_order_flow('billing.createInvoiceDraft', invoice_args, actor);
    perform saip_private.billing_command_before_order_flow(
      'billing.sendInvoice',
      jsonb_build_object('invoiceId', invoice_id),
      actor
    );
    return invoice_id;
  end if;

  if coalesce(array_length(supplied_payment_ids, 1), 0) > 0
     or exists(select 1 from jsonb_object_keys(supplied_payment_versions) limit 1) then
    raise exception '기존 지급이 없는 주문은 도매처별 상품값으로 청구를 만들어 주세요.';
  end if;

  request_wholesalers := saip_private.order_flow_request_wholesalers(request_record);
  if coalesce(array_length(request_wholesalers, 1), 0) = 0 then
    raise exception '주문의 도매처 정보를 먼저 확인해 주세요.';
  end if;
  if jsonb_array_length(goods_rows) = 0 then
    raise exception '도매처별 상품값을 입력해 주세요.';
  end if;

  for goods_row in
    select value
    from jsonb_array_elements(goods_rows) as value
  loop
    if jsonb_typeof(goods_row) <> 'object' then
      raise exception '도매처별 상품값을 다시 확인해 주세요.';
    end if;

    wholesaler_name := btrim(coalesce(goods_row->>'wholesaler', ''));
    if wholesaler_name = '' or not wholesaler_name = any(request_wholesalers) then
      raise exception '주문의 도매처만 청구에 포함할 수 있어요.';
    end if;
    if not (goods_row ? 'amount') or jsonb_typeof(goods_row->'amount') = 'null'
       or nullif(btrim(goods_row->>'amount'), '') is null then
      raise exception '상품값을 0원 이상의 정수로 입력해 주세요.';
    end if;

    goods_amount := saip_private.order_flow_integer(goods_row->'amount', '상품값');
    if coalesce((goods_map->>wholesaler_name)::bigint, 0) + goods_amount > 2147483647 then
      raise exception '총 청구 금액을 확인해 주세요.';
    end if;

    goods_map := jsonb_set(
      goods_map,
      array[wholesaler_name],
      to_jsonb(coalesce((goods_map->>wholesaler_name)::integer, 0) + goods_amount),
      true
    );
  end loop;

  foreach wholesaler_name in array request_wholesalers loop
    if not (goods_map ? wholesaler_name) then
      raise exception '주문의 모든 도매처 상품값을 입력해 주세요.';
    end if;
    total_goods_amount := total_goods_amount + coalesce((goods_map->>wholesaler_name)::integer, 0);
  end loop;

  if (select count(*) from jsonb_object_keys(goods_map)) <> coalesce(array_length(request_wholesalers, 1), 0) then
    raise exception '주문의 도매처만 청구에 포함할 수 있어요.';
  end if;
  if total_goods_amount + delivery_fee_amount <= 0 or total_goods_amount + delivery_fee_amount > 2147483647 then
    raise exception '총 청구 금액을 확인해 주세요.';
  end if;

  existing_payment_ids := '{}'::text[];
  foreach wholesaler_name in array request_wholesalers loop
    goods_amount := coalesce((goods_map->>wholesaler_name)::integer, 0);
    if goods_amount >= 0 then
      payment_id := saip_private.billing_command_before_order_flow(
        'billing.recordFieldPayment',
        jsonb_build_object(
          'requestId', request_id,
          'wholesaler', wholesaler_name,
          'payerId', actor::text,
          'payeeId', actor::text,
          'fundingSource', 'personal',
          'settlementKind', 'advance',
          'actualPaidAmount', goods_amount,
          'cashAllocatedAmount', goods_amount,
          'customerChargeAmount', goods_amount,
          'directPaidAmount', 0,
          'supplierFeeAmount', 0
        ),
        actor
      );
      existing_payment_ids := saip_private.billing_merge_texts(existing_payment_ids, array[payment_id]);
    end if;
  end loop;

  if coalesce(array_length(existing_payment_ids, 1), 0) = 0 then
    raise exception '청구에 넣을 지급 금액이 없어요.';
  end if;

  invoice_args := jsonb_build_object(
    'paymentIds', to_jsonb(existing_payment_ids),
    'deliveryFeeAmount', delivery_fee_amount
  );
  invoice_id := saip_private.billing_command_before_order_flow('billing.createInvoiceDraft', invoice_args, actor);
  perform saip_private.billing_command_before_order_flow(
    'billing.sendInvoice',
    jsonb_build_object('invoiceId', invoice_id),
    actor
  );
  return invoice_id;
end;
$$;

create function saip_private.billing_command(command text, args jsonb, actor uuid)
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
  end if;

  return saip_private.billing_command_before_order_flow(command, args, actor);
end;
$$;

revoke all on function
  saip_private.order_flow_integer(jsonb,text),
  saip_private.order_flow_request_wholesalers(jsonb),
  saip_private.order_flow_related_invoice_id(text),
  saip_private.billing_complete_order_receipt(jsonb,uuid),
  saip_private.billing_issue_order_invoice(jsonb,uuid),
  saip_private.billing_command(text,jsonb,uuid),
  saip_private.billing_command_before_order_flow(text,jsonb,uuid)
from public, anon, authenticated;
