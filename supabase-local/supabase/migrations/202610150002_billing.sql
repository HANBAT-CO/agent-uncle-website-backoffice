create or replace function saip_private.billing_new_id(prefix text)
returns text
language sql
volatile
set search_path = ''
as $$
  select prefix || md5(clock_timestamp()::text || random()::text)
$$;

create or replace function saip_private.billing_unique_texts(input_values text[])
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(value order by value), '{}'::text[])
  from (
    select distinct btrim(value) as value
    from unnest(coalesce(input_values, '{}'::text[])) as value
    where btrim(value) <> ''
  ) dedup
$$;

create or replace function saip_private.billing_merge_texts(a text[], b text[])
returns text[]
language sql
immutable
set search_path = ''
as $$
  select saip_private.billing_unique_texts(coalesce(a, '{}'::text[]) || coalesce(b, '{}'::text[]))
$$;

create or replace function saip_private.billing_text_array(value jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(elem order by elem), '{}'::text[])
  from (
    select distinct btrim(value) as elem
    from jsonb_array_elements_text(coalesce(value, '[]'::jsonb)) as value
    where btrim(value) <> ''
  ) dedup
$$;

create or replace function saip_private.billing_readers(data jsonb)
returns uuid[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(value::uuid order by value), '{}'::uuid[])
  from unnest(saip_private.billing_text_array(data->'readers')) as value
$$;

create or replace function saip_private.billing_put(collection_name text, record_id text, data jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform saip_private.put(
    collection_name,
    record_id,
    data || jsonb_build_object('id', record_id),
    saip_private.billing_readers(data)
  );
end;
$$;

create or replace function saip_private.billing_account(user_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  account jsonb;
begin
  select data into account
  from public.saip_records
  where collection = 'accounts' and id = user_id::text;

  if account is null then
    raise exception '기록을 찾을 수 없어요. 목록을 다시 확인해 주세요.';
  end if;
  return account;
end;
$$;

create or replace function saip_private.billing_require_role(actor uuid, role_name text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  account jsonb;
begin
  account := saip_private.billing_account(actor);
  if saip_private.s(account, 'role') <> role_name or not saip_private.b(account, 'complete') then
    raise exception '%만 이 작업을 처리할 수 있어요.', case role_name when 'uncle' then '삼촌' else '소매업자' end;
  end if;
end;
$$;

create or replace function saip_private.billing_request(actor uuid, request_id text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  request_record jsonb;
begin
  select data into request_record
  from public.saip_records
  where collection = 'requests' and id = request_id
  for update;

  if request_record is null then
    raise exception '기록을 찾을 수 없어요. 목록을 다시 확인해 주세요.';
  end if;
  if saip_private.s(request_record, 'retailerId') <> actor::text
     and saip_private.s(request_record, 'uncleId') <> actor::text then
    raise exception '이 요청을 볼 수 없어요.';
  end if;
  return request_record;
end;
$$;

create or replace function saip_private.billing_billable_amount(payment jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select greatest(
    saip_private.n(payment, 'customerChargeAmount') - saip_private.n(payment, 'directPaidAmount'),
    0
  )
$$;

create or replace function saip_private.billing_group_key(payment jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select concat_ws(
    '|',
    saip_private.s(payment, 'retailerId'),
    saip_private.s(payment, 'teamId'),
    saip_private.s(payment, 'roundId'),
    saip_private.s(payment, 'payeeId')
  )
$$;

create or replace function saip_private.billing_can_manage(invoice jsonb, actor uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select actor::text = any(saip_private.billing_text_array(invoice->'managerIds'))
$$;

create or replace function saip_private.billing_signed_adjustment(adjustment jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case saip_private.s(adjustment, 'kind')
    when 'charge' then saip_private.n(adjustment, 'amount')
    when 'discount' then -saip_private.n(adjustment, 'amount')
    when 'cancel' then -saip_private.n(adjustment, 'amount')
    else 0
  end
$$;

create or replace function saip_private.billing_request_locked(request_id text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  request_record jsonb;
begin
  select data into request_record
  from public.saip_records
  where collection = 'requests' and id = request_id
  for update;

  if request_record is null then
    raise exception '기록을 찾을 수 없어요. 목록을 다시 확인해 주세요.';
  end if;
  return request_record;
end;
$$;

create or replace function saip_private.billing_request_accepted(request_id text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  request_record jsonb;
begin
  request_record := saip_private.billing_request_locked(request_id);
  if saip_private.s(request_record, 'status') <> 'accepted' then
    raise exception '실제로 수락되어 진행 중인 요청만 청구에 연결할 수 있어요.';
  end if;
  return request_record;
end;
$$;

create or replace function saip_private.billing_request_wholesaler(request_record jsonb, selected text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  selected_name text := btrim(coalesce(selected, ''));
  fallback_name text := '';
  choice_count integer := 0;
begin
  with wholesaler_names as (
    select distinct btrim(name) as name
    from (
      select saip_private.s(request_record, 'wholesaler') as name
      union all
      select item->>'wholesaler'
      from jsonb_array_elements(coalesce(request_record->'wholesalers', '[]'::jsonb)) as item
    ) names
    where btrim(name) <> ''
  )
  select count(*), coalesce(min(name), '')
  into choice_count, fallback_name
  from wholesaler_names;

  if selected_name = '' then
    if choice_count = 1 then
      return fallback_name;
    end if;
  elsif exists(
    select 1
    from (
      select distinct btrim(name) as name
      from (
        select saip_private.s(request_record, 'wholesaler') as name
        union all
        select item->>'wholesaler'
        from jsonb_array_elements(coalesce(request_record->'wholesalers', '[]'::jsonb)) as item
      ) names
      where btrim(name) <> ''
    ) wholesaler_names
    where name = selected_name
  ) then
    return selected_name;
  end if;

  raise exception '이 요청에 포함된 도매처를 선택해 주세요.';
end;
$$;

create or replace function saip_private.billing_require_scope_member(team jsonb, user_id text, label text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(btrim(user_id), '') = '' then
    raise exception '% 값을 확인해 주세요.', label;
  end if;
  if team is not null
     and not (coalesce(team->'memberIds', '[]'::jsonb) ? user_id) then
    raise exception '같은 팀의 %만 선택해 주세요.', label;
  end if;
end;
$$;

create or replace function saip_private.billing_can_handle_request_with_team_job(
  actor uuid,
  request_id text,
  team_id text,
  round_id text,
  wholesaler text default ''
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when coalesce(team_id, '') = '' or coalesce(round_id, '') = '' then false
    else exists(
      select 1
      from public.saip_records
      where collection = 'teamJobs'
        and data->>'requestId' = request_id
        and data->>'teamId' = team_id
        and data->>'roundId' = round_id
        and (
          coalesce(wholesaler, '') = ''
          or data->>'wholesalerName' = wholesaler
        )
        and actor::text in (data->>'pickupAssigneeId', data->>'finalAssigneeId')
    )
  end
$$;

create or replace function saip_private.billing_validate_scope(
  request_id text,
  request_record jsonb,
  actor uuid,
  team_id text,
  round_id text,
  payer_id text,
  payee_id text,
  wholesaler text default ''
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  team jsonb;
  round_record jsonb;
  scoped_job_count integer := 0;
begin
  if coalesce(team_id, '') <> '' then
    select data into team
    from public.saip_records
    where collection = 'teams' and id = team_id;

    if team is null then
      raise exception '기록을 찾을 수 없어요. 목록을 다시 확인해 주세요.';
    end if;
    if saip_private.s(team, 'status') <> 'active' then
      raise exception '활성 팀만 청구 업무에 연결할 수 있어요.';
    end if;

    select count(*) into scoped_job_count
    from public.saip_records
    where collection = 'teamJobs'
      and data->>'requestId' = request_id
      and data->>'teamId' = team_id
      and (
        coalesce(round_id, '') = ''
        or data->>'roundId' = round_id
      )
      and (
        coalesce(wholesaler, '') = ''
        or data->>'wholesalerName' = wholesaler
      );

    if scoped_job_count <= 0 then
      raise exception '이 요청에 실제로 연결된 팀·회차만 청구 업무에 사용할 수 있어요.';
    end if;

    perform saip_private.billing_require_scope_member(team, actor::text, '팀 삼촌');
    perform saip_private.billing_require_scope_member(team, saip_private.s(request_record, 'uncleId'), '팀 삼촌');
    perform saip_private.billing_require_scope_member(team, payer_id, '팀 삼촌');
    perform saip_private.billing_require_scope_member(team, payee_id, '팀 삼촌');
  elsif coalesce(round_id, '') <> '' then
    raise exception '회차를 연결하려면 먼저 같은 팀을 선택해 주세요.';
  elsif payer_id <> saip_private.s(request_record, 'uncleId')
     or payee_id <> saip_private.s(request_record, 'uncleId') then
    raise exception '다른 삼촌의 지급·수취를 기록하려면 실제 팀 업무를 연결해 주세요.';
  end if;

  if coalesce(round_id, '') <> '' then
    select data into round_record
    from public.saip_records
    where collection = 'teamRounds' and id = round_id;

    if round_record is null then
      raise exception '기록을 찾을 수 없어요. 목록을 다시 확인해 주세요.';
    end if;
    if saip_private.s(round_record, 'status') <> 'active'
       or saip_private.s(round_record, 'teamId') <> team_id then
      raise exception '같은 팀의 실제 회차만 청구 업무에 연결할 수 있어요.';
    end if;
  end if;

  perform saip_private.billing_require_role(payer_id::uuid, 'uncle');
  perform saip_private.billing_require_role(payee_id::uuid, 'uncle');
end;
$$;

create or replace function saip_private.billing_require_field_payment_actor(
  request_record jsonb,
  request_id text,
  actor uuid,
  team_id text,
  round_id text,
  wholesaler text default ''
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if saip_private.s(request_record, 'uncleId') = actor::text then
    return;
  end if;
  if saip_private.billing_can_handle_request_with_team_job(actor, request_id, team_id, round_id, wholesaler) then
    return;
  end if;
  raise exception '담당 삼촌이나 실제 배정된 팀 동료만 현장 지급을 기록할 수 있어요.';
end;
$$;

create or replace function saip_private.billing_internal_readers(team_id text, actor_ids text[])
returns text[]
language plpgsql
stable
set search_path = ''
as $$
begin
  -- 팀 가입만으로 개인 대납·회수 장부를 공개하지 않는다.
  return saip_private.billing_unique_texts(actor_ids);
end;
$$;

create or replace function saip_private.billing_invoice_readers(invoice jsonb, include_retailer boolean)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select saip_private.billing_unique_texts(
    coalesce(
      (
        select array_agg(reader)
        from unnest(saip_private.billing_text_array(invoice->'readers')) as reader
        where reader <> saip_private.s(invoice, 'retailerId')
      ),
      '{}'::text[]
    )
    || case
      when include_retailer and saip_private.s(invoice, 'retailerId') <> ''
        then array[saip_private.s(invoice, 'retailerId')]
      else '{}'::text[]
    end
  )
$$;

create or replace function saip_private.billing_reimbursement_settled_amount(reimbursement jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select coalesce(sum(greatest((row->>'amount')::integer, 0)), 0)
  from jsonb_array_elements(coalesce(reimbursement->'settlements', '[]'::jsonb)) as row
$$;

create or replace function saip_private.billing_reimbursement_status(total_amount integer, settled_amount integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when total_amount <= 0 then case when settled_amount > 0 then 'settled' else 'open' end
    when settled_amount >= total_amount then 'settled'
    when settled_amount > 0 then 'partial'
    else 'open'
  end
$$;

create or replace function saip_private.billing_recorded_at(data jsonb)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select coalesce(nullif(data->>'createdAt', '')::timestamptz, 'epoch'::timestamptz)
$$;

create or replace function saip_private.billing_matching_draft_invoice_id(allocation jsonb)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select id
    from public.saip_records
    where collection = 'invoices'
      and data->>'status' = 'draft'
      and saip_private.billing_group_key(data) = saip_private.billing_group_key(allocation)
    order by saip_private.billing_recorded_at(data) asc, id asc
    limit 1
  ), '')
$$;

create or replace function saip_private.billing_upsert_reimbursement(
  reimbursement_id text,
  kind text,
  invoice_id text,
  field_payment_id text,
  from_id text,
  to_id text,
  total_amount integer,
  readers text[]
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  current_reimbursement jsonb;
  settlements jsonb;
  settled_amount integer;
  next_reimbursement jsonb;
begin
  select data into current_reimbursement
  from public.saip_records
  where collection = 'reimbursements' and id = reimbursement_id
  for update;

  settlements := coalesce(current_reimbursement->'settlements', '[]'::jsonb);
  settled_amount := saip_private.billing_reimbursement_settled_amount(
    coalesce(current_reimbursement, '{}'::jsonb) || jsonb_build_object('settlements', settlements)
  );

  next_reimbursement := coalesce(current_reimbursement, '{}'::jsonb) || jsonb_build_object(
    'invoiceId', invoice_id,
    'fieldPaymentId', field_payment_id,
    'kind', kind,
    'fromId', from_id,
    'toId', to_id,
    'totalAmount', total_amount,
    'settledAmount', least(settled_amount, greatest(total_amount, settled_amount)),
    'status', saip_private.billing_reimbursement_status(total_amount, settled_amount),
    'settlementIds', to_jsonb(
      saip_private.billing_unique_texts(
        coalesce((
          select array_agg(settlement_id)
          from (
            select row->>'id' as settlement_id
            from jsonb_array_elements(settlements) as row
            where coalesce(row->>'id', '') <> ''
          ) ids
        ), '{}'::text[])
      )
    ),
    'settlements', settlements,
    'createdAt', coalesce(nullif(saip_private.s(coalesce(current_reimbursement, '{}'::jsonb), 'createdAt'), ''), clock_timestamp()::text),
    'updatedAt', clock_timestamp(),
    'version', saip_private.n(coalesce(current_reimbursement, '{}'::jsonb), 'version') + 1,
    'readers', to_jsonb(saip_private.billing_unique_texts(readers))
  );

  perform saip_private.billing_put('reimbursements', reimbursement_id, next_reimbursement);
end;
$$;

create or replace function saip_private.billing_append_reimbursement_settlement(
  reimbursement_id text,
  settlement_id text,
  amount integer,
  kind text,
  actor_id uuid,
  note text default '',
  source_id text default ''
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  current_reimbursement jsonb;
  settlements jsonb;
  next_reimbursement jsonb;
  settled_amount integer;
begin
  select data into current_reimbursement
  from public.saip_records
  where collection = 'reimbursements' and id = reimbursement_id
  for update;

  if current_reimbursement is null then
    raise exception '기록을 찾을 수 없어요. 목록을 다시 확인해 주세요.';
  end if;
  if exists(
    select 1
    from jsonb_array_elements(coalesce(current_reimbursement->'settlements', '[]'::jsonb)) as row
    where row->>'id' = settlement_id
  ) then
    return;
  end if;

  settlements := coalesce(current_reimbursement->'settlements', '[]'::jsonb) || jsonb_build_array(
    jsonb_build_object(
      'id', settlement_id,
      'amount', amount,
      'kind', kind,
      'actorId', actor_id::text,
      'note', coalesce(note, ''),
      'sourceId', coalesce(source_id, ''),
      'createdAt', clock_timestamp()
    )
  );
  settled_amount := saip_private.billing_reimbursement_settled_amount(
    current_reimbursement || jsonb_build_object('settlements', settlements)
  );

  next_reimbursement := current_reimbursement || jsonb_build_object(
    'settledAmount', least(settled_amount, greatest(saip_private.n(current_reimbursement, 'totalAmount'), settled_amount)),
    'status', saip_private.billing_reimbursement_status(saip_private.n(current_reimbursement, 'totalAmount'), settled_amount),
    'settlementIds', to_jsonb(
      saip_private.billing_unique_texts(
        coalesce((
          select array_agg(row->>'id')
          from jsonb_array_elements(settlements) as row
          where coalesce(row->>'id', '') <> ''
        ), '{}'::text[])
      )
    ),
    'settlements', settlements,
    'updatedAt', clock_timestamp(),
    'version', saip_private.n(current_reimbursement, 'version') + 1
  );

  perform saip_private.billing_put('reimbursements', reimbursement_id, next_reimbursement);
end;
$$;

create or replace function saip_private.billing_sync_payer_reimbursement(payment_id text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  payment jsonb;
  total_amount integer;
  reimbursement_id text;
  readers text[];
begin
  select data into payment
  from public.saip_records
  where collection = 'fieldPayments' and id = payment_id
  for update;

  if payment is null then
    raise exception '기록을 찾을 수 없어요. 목록을 다시 확인해 주세요.';
  end if;

  if saip_private.s(payment, 'fundingSource') <> 'personal'
     or saip_private.s(payment, 'payerId') = saip_private.s(payment, 'payeeId') then
    if saip_private.s(payment, 'reimbursementId') <> ''
       and exists(
         select 1
         from public.saip_records
         where collection = 'reimbursements' and id = saip_private.s(payment, 'reimbursementId')
       ) then
      perform saip_private.billing_upsert_reimbursement(
        saip_private.s(payment, 'reimbursementId'),
        'payer_reimbursement',
        saip_private.s(payment, 'invoiceId'),
        payment_id,
        saip_private.s(payment, 'payeeId'),
        saip_private.s(payment, 'payerId'),
        0,
        saip_private.billing_internal_readers(
          saip_private.s(payment, 'teamId'),
          array[saip_private.s(payment, 'uncleId'), saip_private.s(payment, 'payerId'), saip_private.s(payment, 'payeeId')]
        )
      );
      perform saip_private.billing_put(
        'fieldPayments',
        payment_id,
        payment || jsonb_build_object(
          'reimbursementId', '',
          'updatedAt', clock_timestamp(),
          'version', saip_private.n(payment, 'version') + 1
        )
      );
    end if;
    return;
  end if;

  total_amount := saip_private.n(payment, 'actualPaidAmount');

  reimbursement_id := coalesce(nullif(saip_private.s(payment, 'reimbursementId'), ''), 'payer-reimbursement:' || payment_id);
  readers := saip_private.billing_internal_readers(
    saip_private.s(payment, 'teamId'),
    array[saip_private.s(payment, 'uncleId'), saip_private.s(payment, 'payerId'), saip_private.s(payment, 'payeeId')]
  );

  perform saip_private.billing_upsert_reimbursement(
    reimbursement_id,
    'payer_reimbursement',
    saip_private.s(payment, 'invoiceId'),
    payment_id,
    saip_private.s(payment, 'payeeId'),
    saip_private.s(payment, 'payerId'),
    total_amount,
    readers
  );

  select data into payment
  from public.saip_records
  where collection = 'fieldPayments' and id = payment_id
  for update;

  if saip_private.s(payment, 'reimbursementId') <> reimbursement_id then
    perform saip_private.billing_put(
      'fieldPayments',
      payment_id,
      payment || jsonb_build_object(
        'reimbursementId', reimbursement_id,
        'updatedAt', clock_timestamp(),
        'version', saip_private.n(payment, 'version') + 1
      )
    );
  end if;
end;
$$;

create or replace function saip_private.billing_rebuild_payment(payment_id text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  payment jsonb;
  cash_allocated_amount integer;
  customer_charge_amount integer;
  direct_paid_amount integer;
  supplier_fee_amount integer;
  allocated_amount integer;
  unallocated_amount integer;
  allocation_ids text[];
  invoice_ids text[];
begin
  select data into payment
  from public.saip_records
  where collection = 'fieldPayments' and id = payment_id
  for update;

  if payment is null then
    raise exception '기록을 찾을 수 없어요. 목록을 다시 확인해 주세요.';
  end if;

  select
    coalesce(sum(saip_private.n(data, 'cashAllocatedAmount')), 0),
    coalesce(sum(saip_private.n(data, 'customerChargeAmount')), 0),
    coalesce(sum(saip_private.n(data, 'directPaidAmount')), 0),
    coalesce(sum(saip_private.n(data, 'supplierFeeAmount')), 0),
    coalesce(sum(saip_private.n(data, 'cashAllocatedAmount')), 0),
    coalesce(array_agg(id order by saip_private.billing_recorded_at(data) asc, id asc), '{}'::text[]),
    coalesce(array_agg(distinct data->>'invoiceId') filter (where data->>'invoiceId' <> ''), '{}'::text[])
  into
    cash_allocated_amount,
    customer_charge_amount,
    direct_paid_amount,
    supplier_fee_amount,
    allocated_amount,
    allocation_ids,
    invoice_ids
  from public.saip_records
  where collection = 'supplierPaymentAllocations'
    and data->>'paymentId' = payment_id;

  unallocated_amount := greatest(saip_private.n(payment, 'actualPaidAmount') - allocated_amount, 0);

  perform saip_private.billing_put(
    'fieldPayments',
    payment_id,
    payment || jsonb_build_object(
      'cashAllocatedAmount', cash_allocated_amount,
      'customerChargeAmount', customer_charge_amount,
      'directPaidAmount', direct_paid_amount,
      'supplierFeeAmount', supplier_fee_amount,
      'allocatedAmount', allocated_amount,
      'unallocatedAmount', unallocated_amount,
      'allocationIds', to_jsonb(allocation_ids),
      'invoiceId', case when coalesce(array_length(invoice_ids, 1), 0) = 0 then '' else invoice_ids[1] end,
      'updatedAt', clock_timestamp(),
      'version', saip_private.n(payment, 'version') + 1
    )
  );

  perform saip_private.billing_sync_payer_reimbursement(payment_id);
end;
$$;

create or replace function saip_private.billing_sync_customer_refund(invoice_id text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  invoice jsonb;
  refund_id text;
  current_refund jsonb;
  base_refund_amount integer;
  settled_amount integer;
  total_amount integer;
begin
  invoice := saip_private.get('invoices', invoice_id);
  base_refund_amount := greatest(
    saip_private.n(invoice, 'confirmedReceiptAmount') - saip_private.n(invoice, 'adjustedTotalAmount'),
    0
  );

  select id, data into refund_id, current_refund
  from public.saip_records
  where collection = 'reimbursements'
    and data->>'invoiceId' = invoice_id
    and data->>'kind' = 'customer_refund'
  order by updated_at desc, id desc
  limit 1
  for update;

  if current_refund is null and base_refund_amount <= 0 then
    return;
  end if;

  settled_amount := saip_private.billing_reimbursement_settled_amount(coalesce(current_refund, '{}'::jsonb));
  total_amount := greatest(base_refund_amount, settled_amount);
  if current_refund is null and total_amount <= 0 then
    return;
  end if;

  perform saip_private.billing_upsert_reimbursement(
    coalesce(refund_id, 'customer-refund:' || invoice_id),
    'customer_refund',
    invoice_id,
    saip_private.s(coalesce(current_refund, '{}'::jsonb), 'fieldPaymentId'),
    saip_private.s(invoice, 'payeeId'),
    saip_private.s(invoice, 'retailerId'),
    total_amount,
    saip_private.billing_invoice_readers(invoice, true)
  );
end;
$$;

create or replace function saip_private.billing_rebuild_invoice(invoice_id text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  current_invoice jsonb;
  principal_amount integer;
  base_total_amount integer;
  adjustment_total_amount integer;
  adjusted_total_amount integer;
  reported_receipt_amount integer;
  pending_receipt_count integer;
  pending_receipt_amount integer;
  confirmed_receipt_amount integer;
  confirmed_refund_amount integer;
  remaining_due_amount integer;
  refund_required_amount integer;
  inquiry_open_count integer;
  missing_amount_count integer := 0;
  next_status text;
  payment_row jsonb;
  payment_id text;
  manager_ids text[];
  reader_ids text[];
begin
  select data into current_invoice
  from public.saip_records
  where collection = 'invoices' and id = invoice_id
  for update;

  if current_invoice is null then
    raise exception '기록을 찾을 수 없어요. 목록을 다시 확인해 주세요.';
  end if;

  select saip_private.billing_merge_texts(
    array[saip_private.s(current_invoice, 'payeeId')],
    coalesce(array_agg(data->>'uncleId'), '{}'::text[])
  ) into manager_ids
  from public.saip_records
  where collection = 'supplierPaymentAllocations' and data->>'invoiceId' = invoice_id;
  if not exists (
    select 1 from public.saip_records
    where collection = 'supplierPaymentAllocations' and data->>'invoiceId' = invoice_id
  ) then
    select saip_private.billing_merge_texts(manager_ids,
      coalesce(array_agg(data->>'uncleId'), '{}'::text[])) into manager_ids
    from public.saip_records
    where collection = 'fieldPayments'
      and id = any(saip_private.billing_text_array(current_invoice->'fieldPaymentIds'));
  end if;
  reader_ids := manager_ids;
  if saip_private.s(current_invoice, 'status') <> 'draft' then
    reader_ids := saip_private.billing_merge_texts(reader_ids, array[saip_private.s(current_invoice, 'retailerId')]);
  end if;

  select coalesce(sum(greatest(saip_private.n(data, 'customerChargeAmount') - saip_private.n(data, 'directPaidAmount'), 0)), 0)
  into principal_amount
  from public.saip_records
  where collection = 'supplierPaymentAllocations'
    and data->>'invoiceId' = invoice_id;

  base_total_amount := principal_amount + saip_private.n(current_invoice, 'deliveryFeeAmount');

  select coalesce(sum(saip_private.billing_signed_adjustment(data)), 0)
  into adjustment_total_amount
  from public.saip_records
  where collection = 'invoiceAdjustments'
    and data->>'invoiceId' = invoice_id;

  adjusted_total_amount := greatest(base_total_amount + adjustment_total_amount, 0);

  select
    coalesce(sum(case when data->>'status' in ('reported', 'confirmed') then saip_private.n(data, 'amount') else 0 end), 0),
    coalesce(count(*) filter (where data->>'status' = 'reported'), 0),
    coalesce(sum(case when data->>'status' = 'reported' then saip_private.n(data, 'amount') else 0 end), 0),
    coalesce(sum(case when data->>'status' = 'confirmed' then saip_private.n(data, 'amount') else 0 end), 0)
  into
    reported_receipt_amount,
    pending_receipt_count,
    pending_receipt_amount,
    confirmed_receipt_amount
  from public.saip_records
  where collection = 'invoiceReceipts'
    and data->>'invoiceId' = invoice_id;

  select coalesce(sum(saip_private.n(data, 'settledAmount')), 0)
  into confirmed_refund_amount
  from public.saip_records
  where collection = 'reimbursements'
    and data->>'invoiceId' = invoice_id
    and data->>'kind' = 'customer_refund';

  remaining_due_amount := greatest(adjusted_total_amount - confirmed_receipt_amount, 0);
  refund_required_amount := greatest(
    greatest(confirmed_receipt_amount - adjusted_total_amount, 0) - confirmed_refund_amount,
    0
  );

  select coalesce(count(*), 0)
  into inquiry_open_count
  from public.saip_records
  where collection = 'invoiceInquiries'
    and data->>'invoiceId' = invoice_id
    and data->>'status' = 'open';

  foreach payment_id in array saip_private.billing_text_array(current_invoice->'fieldPaymentIds') loop
    select data into payment_row
    from public.saip_records
    where collection = 'fieldPayments' and id = payment_id;

    if payment_row is null then
      raise exception '기록을 찾을 수 없어요. 목록을 다시 확인해 주세요.';
    end if;
    if saip_private.s(payment_row, 'settlementKind') = 'review'
       or saip_private.n(payment_row, 'unallocatedAmount') > 0
       or coalesce((payment_row->>'cashAllocatedAmountMissing')::boolean, true)
       or coalesce((payment_row->>'customerChargeAmountMissing')::boolean, true)
       or coalesce((payment_row->>'directPaidAmountMissing')::boolean, true)
       or coalesce((payment_row->>'supplierFeeAmountMissing')::boolean, true) then
      missing_amount_count := missing_amount_count + 1;
    end if;
  end loop;

  next_status := saip_private.s(current_invoice, 'status');
  if next_status <> 'draft' then
    if confirmed_receipt_amount >= adjusted_total_amount then
      next_status := 'collected';
    elsif confirmed_receipt_amount > 0 then
      next_status := 'partial';
    else
      next_status := 'sent';
    end if;
  end if;

  perform saip_private.billing_put(
    'invoices',
    invoice_id,
    current_invoice || jsonb_build_object(
      'managerIds', to_jsonb(manager_ids),
      'readers', to_jsonb(reader_ids),
      'status', next_status,
      'principalAmount', principal_amount,
      'baseTotalAmount', base_total_amount,
      'adjustmentTotalAmount', adjustment_total_amount,
      'adjustedTotalAmount', adjusted_total_amount,
      'reportedReceiptAmount', reported_receipt_amount,
      'pendingReceiptCount', pending_receipt_count,
      'pendingReceiptAmount', pending_receipt_amount,
      'confirmedReceiptAmount', confirmed_receipt_amount,
      'confirmedRefundAmount', confirmed_refund_amount,
      'remainingDueAmount', remaining_due_amount,
      'refundRequiredAmount', refund_required_amount,
      'missingAmountCount', missing_amount_count,
      'inquiryOpenCount', inquiry_open_count,
      'updatedAt', clock_timestamp(),
      'version', saip_private.n(current_invoice, 'version') + 1
    )
  );

  perform saip_private.billing_sync_customer_refund(invoice_id);
  return saip_private.get('invoices', invoice_id);
end;
$$;

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
  request_record jsonb;
  invoice jsonb;
  current_invoice jsonb;
  payment jsonb;
  current_payment jsonb;
  linked_payment jsonb;
  linked_allocation jsonb;
  receipt jsonb;
  reimbursement jsonb;
  allocation jsonb;
  team jsonb;
  message_data jsonb;
  item jsonb;
  payment_id text;
  invoice_id text;
  receipt_id text;
  reimbursement_id text;
  adjustment_id text;
  allocation_id text;
  settlement_id text;
  inquiry_id text;
  message_id text;
  requested_id text;
  payment_ids text[] := '{}'::text[];
  selected_payment_ids text[] := '{}'::text[];
  selected_allocation_ids text[] := '{}'::text[];
  linked_allocation_ids text[] := '{}'::text[];
  payment_ids_for_invoice text[] := '{}'::text[];
  current_field_payment_ids text[] := '{}'::text[];
  current_allocation_ids text[] := '{}'::text[];
  reader_ids text[] := '{}'::text[];
  manager_ids text[] := '{}'::text[];
  invoice_readers text[] := '{}'::text[];
  invoice_version integer;
  group_key text;
  first_source jsonb := null;
  label text;
  due_at text;
  funding_source text;
  settlement_kind text;
  team_id text;
  round_id text;
  payer_id text;
  payee_id text;
  actual_recipient_id text;
  receipt_target text;
  wholesaler text;
  request_wholesaler text;
  adjustment_kind text;
  note text;
  amount integer;
  actual_paid_amount integer;
  cash_allocated_amount integer;
  customer_charge_amount integer;
  direct_paid_amount integer;
  supplier_fee_amount integer;
  delivery_fee_amount integer;
  confirmed boolean;
  has_initial_allocation_input boolean;
  existing_amounts_match_current boolean;
  correcting_allocation boolean := false;
  metadata_only_update boolean;
  payment_group_matches boolean;
  existing_allocation_count integer := 0;
  current_allocation_id text;
  current_allocation_request_id text;
  previous_receipts_amount integer;
  remaining_principal integer;
  allocated_principal integer;
  previous_credits integer;
  remaining_amount integer;
  remaining_credit integer;
  credit integer;
  excess integer;
  existing_team_recovery_id text;
  current_settlement_ids text[];
begin
  if normalized in ('billing.recordFieldPayment', 'billing.resolveFieldPayment') then
    perform saip_private.billing_require_role(actor, 'uncle');

    requested_id := coalesce(nullif(btrim(args->>'id'), ''), '');
    if requested_id <> '' then
      select data into current_payment
      from public.saip_records
      where collection = 'fieldPayments' and id = requested_id
      for update;
    end if;

    request_record := saip_private.billing_request_accepted(args->>'requestId');
    if current_payment is not null then
      if args ? 'version' then
        perform saip_private.version(current_payment, (args->>'version')::integer);
      end if;
      if saip_private.s(current_payment, 'requestId') <> args->>'requestId' then
        raise exception '같은 요청의 기존 현장 지급만 다시 정리할 수 있어요.';
      end if;
      if not (coalesce(current_payment->'readers', '[]'::jsonb) ? actor::text) then
        raise exception '현장 지급 당사자만 기록을 수정할 수 있어요.';
      end if;
      if exists(
        select 1
        from public.saip_records alloc
        join public.saip_records draft
          on draft.collection = 'invoices'
         and draft.id = alloc.data->>'invoiceId'
        where alloc.collection = 'supplierPaymentAllocations'
          and alloc.data->>'paymentId' = requested_id
          and coalesce(alloc.data->>'invoiceId', '') <> ''
          and draft.data->>'status' <> 'draft'
      )
         or exists(
           select 1
           from public.saip_records
           where collection = 'supplierRefunds'
             and data->>'paymentId' = requested_id
         )
         or (
           saip_private.s(current_payment, 'reimbursementId') <> ''
           and exists(
             select 1
             from public.saip_records
             where collection = 'reimbursements'
               and id = saip_private.s(current_payment, 'reimbursementId')
               and saip_private.billing_reimbursement_settled_amount(data) > 0
           )
         ) then
        raise exception '발행·환불·반환이 반영된 지급은 덮어쓸 수 없어요. 별도 조정으로 남겨 주세요.';
      end if;
    end if;

    payer_id := coalesce(nullif(btrim(args->>'payerId'), ''), nullif(saip_private.s(coalesce(current_payment, '{}'::jsonb), 'payerId'), ''), actor::text);
    payee_id := coalesce(nullif(btrim(args->>'payeeId'), ''), nullif(saip_private.s(coalesce(current_payment, '{}'::jsonb), 'payeeId'), ''), actor::text);
    team_id := coalesce(nullif(btrim(args->>'teamId'), ''), saip_private.s(coalesce(current_payment, '{}'::jsonb), 'teamId'));
    round_id := coalesce(nullif(btrim(args->>'roundId'), ''), saip_private.s(coalesce(current_payment, '{}'::jsonb), 'roundId'));

    wholesaler := saip_private.billing_request_wholesaler(
      request_record,
      coalesce(nullif(btrim(args->>'wholesaler'), ''), saip_private.s(coalesce(current_payment, '{}'::jsonb), 'wholesaler'))
    );

    perform saip_private.billing_require_field_payment_actor(request_record, args->>'requestId', actor, team_id, round_id, wholesaler);
    perform saip_private.billing_validate_scope(args->>'requestId', request_record, actor, team_id, round_id, payer_id, payee_id, wholesaler);
    if current_payment is not null and (
      saip_private.s(current_payment, 'payerId') <> payer_id
      or saip_private.s(current_payment, 'payeeId') <> payee_id
      or saip_private.s(current_payment, 'teamId') <> team_id
      or saip_private.s(current_payment, 'roundId') <> round_id
      or saip_private.s(current_payment, 'wholesaler') <> wholesaler
    ) then
      raise exception '기존 지급의 당사자·팀·회차·도매처는 변경할 수 없어요.';
    end if;

    funding_source := coalesce(nullif(btrim(args->>'fundingSource'), ''), nullif(saip_private.s(coalesce(current_payment, '{}'::jsonb), 'fundingSource'), ''), 'unknown');
    settlement_kind := coalesce(nullif(btrim(args->>'settlementKind'), ''), nullif(saip_private.s(coalesce(current_payment, '{}'::jsonb), 'settlementKind'), ''), 'review');
    if funding_source not in ('personal', 'team_fund', 'unknown') then
      raise exception '자금 출처를 다시 확인해 주세요.';
    end if;
    if settlement_kind not in ('advance', 'direct', 'review') then
      raise exception '결제 방식은 advance/direct/review 중 하나여야 해요.';
    end if;

    if args ? 'actualPaidAmount'
       and jsonb_typeof(args->'actualPaidAmount') <> 'null'
       and nullif(btrim(args->>'actualPaidAmount'), '') is not null then
      actual_paid_amount := (args->>'actualPaidAmount')::integer;
      if actual_paid_amount < 0 then
        raise exception 'actualPaidAmount 값을 확인해 주세요.';
      end if;
    elsif current_payment is null then
      raise exception 'actualPaidAmount 값을 확인해 주세요.';
    else
      actual_paid_amount := saip_private.n(current_payment, 'actualPaidAmount');
    end if;

    cash_allocated_amount := case when args ? 'cashAllocatedAmount' and jsonb_typeof(args->'cashAllocatedAmount') <> 'null' then (args->>'cashAllocatedAmount')::integer else null end;
    customer_charge_amount := case when args ? 'customerChargeAmount' and jsonb_typeof(args->'customerChargeAmount') <> 'null' then (args->>'customerChargeAmount')::integer else null end;
    direct_paid_amount := case when args ? 'directPaidAmount' and jsonb_typeof(args->'directPaidAmount') <> 'null' then (args->>'directPaidAmount')::integer else null end;
    supplier_fee_amount := case when args ? 'supplierFeeAmount' and jsonb_typeof(args->'supplierFeeAmount') <> 'null' then (args->>'supplierFeeAmount')::integer else null end;
    has_initial_allocation_input := cash_allocated_amount is not null
      or customer_charge_amount is not null
      or direct_paid_amount is not null
      or supplier_fee_amount is not null;

    existing_amounts_match_current := current_payment is not null
      and coalesce(jsonb_array_length(coalesce(current_payment->'allocationIds', '[]'::jsonb)), 0) > 0
      and has_initial_allocation_input
      and cash_allocated_amount = saip_private.n(current_payment, 'cashAllocatedAmount')
      and customer_charge_amount = saip_private.n(current_payment, 'customerChargeAmount')
      and direct_paid_amount = saip_private.n(current_payment, 'directPaidAmount')
      and supplier_fee_amount = saip_private.n(current_payment, 'supplierFeeAmount');
    if existing_amounts_match_current then
      has_initial_allocation_input := false;
    end if;

    if current_payment is not null then
      select
        count(*),
        coalesce(min(id), ''),
        coalesce(min(data->>'requestId'), '')
      into
        existing_allocation_count,
        current_allocation_id,
        current_allocation_request_id
      from public.saip_records
      where collection = 'supplierPaymentAllocations'
        and data->>'paymentId' = requested_id;

      correcting_allocation := has_initial_allocation_input
        and existing_allocation_count = 1
        and current_allocation_request_id = args->>'requestId';
    end if;

    if has_initial_allocation_input then
      if cash_allocated_amount is null or customer_charge_amount is null or direct_paid_amount is null or supplier_fee_amount is null then
        raise exception '현금 배분액, 고객 부담액, 직접 결제액, 수수료·상계를 모두 명시해 주세요.';
      end if;
      if cash_allocated_amount < 0 or customer_charge_amount < 0 or direct_paid_amount < 0 or supplier_fee_amount < 0 then
        raise exception '금액을 다시 확인해 주세요.';
      end if;
      if direct_paid_amount > customer_charge_amount then
        raise exception '직접 결제 금액이 고객 부담액보다 클 수 없어요.';
      end if;
      if cash_allocated_amount > actual_paid_amount then
        raise exception '배분할 실제 현금이 총 지급액보다 클 수 없어요.';
      end if;
    end if;
    if settlement_kind = 'direct'
       and (
         (has_initial_allocation_input and customer_charge_amount <> direct_paid_amount)
         or (
           not has_initial_allocation_input
           and current_payment is not null
           and exists(
             select 1
             from public.saip_records
             where collection = 'supplierPaymentAllocations'
               and data->>'paymentId' = requested_id
               and greatest(saip_private.n(data, 'customerChargeAmount') - saip_private.n(data, 'directPaidAmount'), 0) <> 0
           )
         )
       ) then
      raise exception '직접 결제 완료 건은 고객 부담액 전액을 직접 결제액으로 기록해 주세요.';
    end if;

    payment_id := coalesce(nullif(btrim(args->>'id'), ''), 'field-payment:' || md5(clock_timestamp()::text || random()::text));
    if current_payment is null and exists(
      select 1 from public.saip_records where collection = 'fieldPayments' and id = payment_id
    ) then
      raise exception '이미 기록된 현장 지급이에요.';
    end if;
    if current_payment is not null
       and not correcting_allocation
       and actual_paid_amount < saip_private.n(current_payment, 'allocatedAmount') then
      raise exception '이미 배분한 실제 현금보다 총 지급액을 작게 바꿀 수 없어요.';
    end if;
    if current_payment is not null
       and coalesce(jsonb_array_length(coalesce(current_payment->'allocationIds', '[]'::jsonb)), 0) > 0
       and has_initial_allocation_input
       and not correcting_allocation then
      raise exception '여러 고객에게 배분한 금액은 개별 배분 기록에서 수정해 주세요.';
    end if;

    reader_ids := saip_private.billing_internal_readers(
      team_id,
      array[actor::text, saip_private.s(request_record, 'uncleId'), payer_id, payee_id]
    );
    note := coalesce(args->>'note', '');

    payment := coalesce(current_payment, '{}'::jsonb) || jsonb_build_object(
      'requestId', args->>'requestId',
      'retailerId', saip_private.s(request_record, 'retailerId'),
      'uncleId', saip_private.s(request_record, 'uncleId'),
      'teamId', team_id,
      'roundId', round_id,
      'payeeId', payee_id,
      'payerId', payer_id,
      'wholesaler', wholesaler,
      'note', note,
      'fundingSource', funding_source,
      'settlementKind', settlement_kind,
      'actualPaidAmount', actual_paid_amount,
      'cashAllocatedAmount', coalesce(saip_private.n(coalesce(current_payment, '{}'::jsonb), 'cashAllocatedAmount'), 0),
      'allocatedAmount', coalesce(saip_private.n(coalesce(current_payment, '{}'::jsonb), 'allocatedAmount'), 0),
      'unallocatedAmount', greatest(actual_paid_amount - coalesce(saip_private.n(coalesce(current_payment, '{}'::jsonb), 'allocatedAmount'), 0), 0),
      'customerChargeAmount', coalesce(saip_private.n(coalesce(current_payment, '{}'::jsonb), 'customerChargeAmount'), 0),
      'directPaidAmount', coalesce(saip_private.n(coalesce(current_payment, '{}'::jsonb), 'directPaidAmount'), 0),
      'supplierFeeAmount', coalesce(saip_private.n(coalesce(current_payment, '{}'::jsonb), 'supplierFeeAmount'), 0),
      'cashAllocatedAmountMissing', case
        when has_initial_allocation_input then false
        else coalesce((coalesce(current_payment, '{}'::jsonb)->>'cashAllocatedAmountMissing')::boolean, true)
      end,
      'customerChargeAmountMissing', case
        when has_initial_allocation_input then false
        else coalesce((coalesce(current_payment, '{}'::jsonb)->>'customerChargeAmountMissing')::boolean, true)
      end,
      'directPaidAmountMissing', case
        when has_initial_allocation_input then false
        else coalesce((coalesce(current_payment, '{}'::jsonb)->>'directPaidAmountMissing')::boolean, true)
      end,
      'supplierFeeAmountMissing', case
        when has_initial_allocation_input then false
        else coalesce((coalesce(current_payment, '{}'::jsonb)->>'supplierFeeAmountMissing')::boolean, true)
      end,
      'allocationIds', coalesce(current_payment->'allocationIds', '[]'::jsonb),
      'invoiceId', saip_private.s(coalesce(current_payment, '{}'::jsonb), 'invoiceId'),
      'reimbursementId', case
        when funding_source = 'personal' and payer_id <> payee_id then 'payer-reimbursement:' || payment_id
        else ''
      end,
      'readers', to_jsonb(reader_ids),
      'createdAt', coalesce(nullif(saip_private.s(coalesce(current_payment, '{}'::jsonb), 'createdAt'), ''), clock_timestamp()::text),
      'updatedAt', clock_timestamp(),
      'version', case when current_payment is null then 0 else saip_private.n(current_payment, 'version') + 1 end
    );

    perform saip_private.billing_put('fieldPayments', payment_id, payment);
    perform saip_private.billing_sync_payer_reimbursement(payment_id);

    if correcting_allocation then
      select data into allocation
      from public.saip_records
      where collection = 'supplierPaymentAllocations' and id = current_allocation_id
      for update;

      perform saip_private.billing_put(
        'supplierPaymentAllocations',
        current_allocation_id,
        allocation || jsonb_build_object(
          'cashAllocatedAmount', cash_allocated_amount,
          'allocatedAmount', cash_allocated_amount,
          'customerChargeAmount', customer_charge_amount,
          'directPaidAmount', direct_paid_amount,
          'supplierFeeAmount', supplier_fee_amount,
          'note', note,
          'updatedAt', clock_timestamp(),
          'version', saip_private.n(allocation, 'version') + 1
        )
      );
      perform saip_private.billing_rebuild_payment(payment_id);
      if saip_private.s(allocation, 'invoiceId') <> '' then
        perform saip_private.billing_rebuild_invoice(saip_private.s(allocation, 'invoiceId'));
      end if;
    elsif has_initial_allocation_input then
      payment := saip_private.get('fieldPayments', payment_id);
      if saip_private.s(payment, 'uncleId') <> actor::text
         and saip_private.s(payment, 'payeeId') <> actor::text
         and saip_private.s(payment, 'payerId') <> actor::text
         and not saip_private.billing_can_handle_request_with_team_job(
           actor,
           saip_private.s(payment, 'requestId'),
           saip_private.s(payment, 'teamId'),
           saip_private.s(payment, 'roundId'),
           saip_private.s(payment, 'wholesaler')
         ) then
        raise exception '현장 지급 당사자만 배분을 기록할 수 있어요.';
      end if;
      request_record := saip_private.billing_request_accepted(saip_private.s(payment, 'requestId'));
      perform saip_private.billing_request_wholesaler(request_record, saip_private.s(payment, 'wholesaler'));
      if saip_private.s(payment, 'teamId') <> '' or saip_private.s(payment, 'roundId') <> '' then
        perform saip_private.billing_validate_scope(
          saip_private.s(payment, 'requestId'),
          request_record,
          actor,
          saip_private.s(payment, 'teamId'),
          saip_private.s(payment, 'roundId'),
          saip_private.s(payment, 'payerId'),
          saip_private.s(payment, 'payeeId'),
          saip_private.s(payment, 'wholesaler')
        );
      end if;
      allocation_id := 'allocation:' || payment_id;
      if exists(select 1 from public.saip_records where collection = 'supplierPaymentAllocations' and id = allocation_id) then
        raise exception '이미 반영한 배분이에요.';
      end if;
      perform saip_private.billing_put(
        'supplierPaymentAllocations',
        allocation_id,
        jsonb_build_object(
          'paymentId', payment_id,
          'requestId', saip_private.s(payment, 'requestId'),
          'retailerId', saip_private.s(request_record, 'retailerId'),
          'uncleId', saip_private.s(request_record, 'uncleId'),
          'teamId', saip_private.s(payment, 'teamId'),
          'roundId', saip_private.s(payment, 'roundId'),
          'payeeId', saip_private.s(payment, 'payeeId'),
          'payerId', saip_private.s(payment, 'payerId'),
          'cashAllocatedAmount', cash_allocated_amount,
          'customerChargeAmount', customer_charge_amount,
          'directPaidAmount', direct_paid_amount,
          'supplierFeeAmount', supplier_fee_amount,
          'allocatedAmount', cash_allocated_amount,
          'invoiceId', '',
          'note', note,
          'readers', payment->'readers',
          'createdAt', clock_timestamp(),
          'updatedAt', clock_timestamp(),
          'version', 0
        )
      );
      invoice_id := saip_private.billing_matching_draft_invoice_id(saip_private.get('supplierPaymentAllocations', allocation_id));
      if invoice_id <> '' then
        allocation := saip_private.get('supplierPaymentAllocations', allocation_id);
        perform saip_private.billing_put(
          'supplierPaymentAllocations',
          allocation_id,
          allocation || jsonb_build_object(
            'invoiceId', invoice_id,
            'updatedAt', clock_timestamp(),
            'version', saip_private.n(allocation, 'version') + 1
          )
        );
      end if;
      perform saip_private.billing_rebuild_payment(payment_id);
      if invoice_id <> '' then
        select data into invoice
        from public.saip_records
        where collection = 'invoices' and id = invoice_id
        for update;
        perform saip_private.billing_put(
          'invoices',
          invoice_id,
          invoice || jsonb_build_object(
            'fieldPaymentIds', to_jsonb(saip_private.billing_merge_texts(saip_private.billing_text_array(invoice->'fieldPaymentIds'), array[payment_id])),
            'allocationIds', to_jsonb(saip_private.billing_merge_texts(saip_private.billing_text_array(invoice->'allocationIds'), array[allocation_id])),
            'updatedAt', clock_timestamp(),
            'version', saip_private.n(invoice, 'version') + 1
          )
        );
        perform saip_private.billing_rebuild_invoice(invoice_id);
      elsif saip_private.s(coalesce(current_payment, '{}'::jsonb), 'invoiceId') <> '' then
        perform saip_private.billing_rebuild_invoice(saip_private.s(current_payment, 'invoiceId'));
      end if;
    elsif current_payment is not null then
      for invoice_id in
        select distinct data->>'invoiceId'
        from public.saip_records
        where collection = 'supplierPaymentAllocations'
          and data->>'paymentId' = payment_id
          and data->>'invoiceId' <> ''
      loop
        perform saip_private.billing_rebuild_invoice(invoice_id);
      end loop;
    end if;

    return payment_id;

  elsif normalized = 'billing.allocateSupplierPayment' then
    perform saip_private.billing_require_role(actor, 'uncle');
    payment_id := args->>'paymentId';
    select data into payment
    from public.saip_records
    where collection = 'fieldPayments' and id = payment_id
    for update;

    if payment is null then
      raise exception '기록을 찾을 수 없어요. 목록을 다시 확인해 주세요.';
    end if;
    if saip_private.s(payment, 'uncleId') <> actor::text
       and saip_private.s(payment, 'payeeId') <> actor::text
       and saip_private.s(payment, 'payerId') <> actor::text
       and not saip_private.billing_can_handle_request_with_team_job(
         actor,
         saip_private.s(payment, 'requestId'),
         saip_private.s(payment, 'teamId'),
         saip_private.s(payment, 'roundId'),
         saip_private.s(payment, 'wholesaler')
       ) then
      raise exception '현장 지급 당사자만 배분을 기록할 수 있어요.';
    end if;
    if args ? 'version' then
      perform saip_private.version(payment, (args->>'version')::integer);
    end if;

    current_allocation_id := coalesce(nullif(btrim(args->>'allocationId'), ''), '');
    if current_allocation_id <> '' then
      select data into allocation
      from public.saip_records
      where collection = 'supplierPaymentAllocations' and id = current_allocation_id
      for update;

      if allocation is null
         or saip_private.s(allocation, 'paymentId') <> payment_id
         or not (args ? 'allocationVersion') then
        raise exception '수정할 배분의 지급과 최신 버전을 확인해 주세요.';
      end if;
      perform saip_private.version(allocation, (args->>'allocationVersion')::integer);
      if exists(
        select 1
        from public.saip_records alloc
        join public.saip_records draft
          on draft.collection = 'invoices'
         and draft.id = alloc.data->>'invoiceId'
        where alloc.collection = 'supplierPaymentAllocations'
          and alloc.data->>'paymentId' = payment_id
          and coalesce(alloc.data->>'invoiceId', '') <> ''
          and draft.data->>'status' <> 'draft'
      )
         or exists(
           select 1
           from public.saip_records
           where collection = 'supplierRefunds'
             and data->>'paymentId' = payment_id
         )
         or (
           saip_private.s(payment, 'reimbursementId') <> ''
           and exists(
             select 1
             from public.saip_records
             where collection = 'reimbursements'
               and id = saip_private.s(payment, 'reimbursementId')
               and saip_private.billing_reimbursement_settled_amount(data) > 0
           )
         ) then
        raise exception '발행·환불·반환이 반영된 배분은 수정할 수 없어요.';
      end if;
    end if;

    requested_id := coalesce(
      nullif(btrim(args->>'requestId'), ''),
      saip_private.s(coalesce(allocation, payment), 'requestId')
    );
    if allocation is not null
       and saip_private.s(allocation, 'requestId') <> requested_id then
      raise exception '기존 배분의 고객 요청은 변경할 수 없어요.';
    end if;

    request_record := saip_private.billing_request_accepted(requested_id);
    perform saip_private.billing_request_wholesaler(request_record, saip_private.s(payment, 'wholesaler'));
    if requested_id <> saip_private.s(payment, 'requestId')
       and (saip_private.s(payment, 'teamId') = '' or saip_private.s(payment, 'roundId') = '') then
      raise exception '여러 고객에게 배분하려면 같은 팀·회차의 지급을 선택해 주세요.';
    end if;
    if saip_private.s(payment, 'teamId') <> '' or saip_private.s(payment, 'roundId') <> '' then
      perform saip_private.billing_validate_scope(
        requested_id,
        request_record,
        actor,
        saip_private.s(payment, 'teamId'),
        saip_private.s(payment, 'roundId'),
        saip_private.s(payment, 'payerId'),
        saip_private.s(payment, 'payeeId'),
        saip_private.s(payment, 'wholesaler')
      );
      perform saip_private.billing_require_field_payment_actor(
        request_record,
        requested_id,
        actor,
        saip_private.s(payment, 'teamId'),
        saip_private.s(payment, 'roundId'),
        saip_private.s(payment, 'wholesaler')
      );
    end if;

    request_wholesaler := saip_private.billing_request_wholesaler(request_record, saip_private.s(payment, 'wholesaler'));

    cash_allocated_amount := case when args ? 'cashAllocatedAmount' and jsonb_typeof(args->'cashAllocatedAmount') <> 'null' then (args->>'cashAllocatedAmount')::integer else null end;
    customer_charge_amount := case when args ? 'customerChargeAmount' and jsonb_typeof(args->'customerChargeAmount') <> 'null' then (args->>'customerChargeAmount')::integer else null end;
    direct_paid_amount := case when args ? 'directPaidAmount' and jsonb_typeof(args->'directPaidAmount') <> 'null' then (args->>'directPaidAmount')::integer else null end;
    supplier_fee_amount := case when args ? 'supplierFeeAmount' and jsonb_typeof(args->'supplierFeeAmount') <> 'null' then (args->>'supplierFeeAmount')::integer else null end;
    if cash_allocated_amount is null or customer_charge_amount is null or direct_paid_amount is null or supplier_fee_amount is null then
      raise exception '현금 배분액, 고객 부담액, 직접 결제액, 수수료·상계를 모두 명시해 주세요.';
    end if;
    if cash_allocated_amount < 0 or customer_charge_amount < 0 or direct_paid_amount < 0 or supplier_fee_amount < 0 then
      raise exception '금액을 다시 확인해 주세요.';
    end if;
    if direct_paid_amount > customer_charge_amount then
      raise exception '직접 결제 금액이 고객 부담액보다 클 수 없어요.';
    end if;
    if saip_private.s(payment, 'settlementKind') = 'direct'
       and customer_charge_amount <> direct_paid_amount then
      raise exception '직접 결제 완료 건은 고객 부담액 전액을 직접 결제액으로 기록해 주세요.';
    end if;
    if cash_allocated_amount > saip_private.n(payment, 'unallocatedAmount') + saip_private.n(coalesce(allocation, '{}'::jsonb), 'allocatedAmount') then
      raise exception '남은 미배분 금액보다 크게 배분할 수 없어요.';
    end if;

    allocation_id := coalesce(
      nullif(saip_private.s(coalesce(allocation, '{}'::jsonb), 'id'), ''),
      nullif(btrim(args->>'id'), ''),
      'allocation:' || md5(clock_timestamp()::text || random()::text)
    );
    if allocation is null
       and exists(select 1 from public.saip_records where collection = 'supplierPaymentAllocations' and id = allocation_id) then
      raise exception '이미 반영한 배분이에요.';
    end if;

    perform saip_private.billing_put(
      'supplierPaymentAllocations',
      allocation_id,
      coalesce(allocation, '{}'::jsonb) || jsonb_build_object(
        'paymentId', payment_id,
        'requestId', requested_id,
        'retailerId', saip_private.s(request_record, 'retailerId'),
        'uncleId', saip_private.s(request_record, 'uncleId'),
        'teamId', saip_private.s(payment, 'teamId'),
        'roundId', saip_private.s(payment, 'roundId'),
        'payeeId', saip_private.s(payment, 'payeeId'),
        'payerId', saip_private.s(payment, 'payerId'),
        'cashAllocatedAmount', cash_allocated_amount,
        'customerChargeAmount', customer_charge_amount,
        'directPaidAmount', direct_paid_amount,
        'supplierFeeAmount', supplier_fee_amount,
        'allocatedAmount', cash_allocated_amount,
        'invoiceId', saip_private.s(coalesce(allocation, '{}'::jsonb), 'invoiceId'),
        'note', coalesce(args->>'note', ''),
        'readers', payment->'readers',
        'createdAt', coalesce(nullif(saip_private.s(coalesce(allocation, '{}'::jsonb), 'createdAt'), ''), clock_timestamp()::text),
        'updatedAt', clock_timestamp(),
        'version', case when allocation is null then 0 else saip_private.n(allocation, 'version') + 1 end
      )
    );

    invoice_id := saip_private.billing_matching_draft_invoice_id(saip_private.get('supplierPaymentAllocations', allocation_id));
    if invoice_id <> '' then
      allocation := saip_private.get('supplierPaymentAllocations', allocation_id);
      perform saip_private.billing_put(
        'supplierPaymentAllocations',
        allocation_id,
        allocation || jsonb_build_object(
          'invoiceId', invoice_id,
          'updatedAt', clock_timestamp(),
          'version', saip_private.n(allocation, 'version') + 1
        )
      );
    end if;

    perform saip_private.billing_rebuild_payment(payment_id);
    if invoice_id <> '' then
      select data into invoice
      from public.saip_records
      where collection = 'invoices' and id = invoice_id
      for update;
      perform saip_private.billing_put(
        'invoices',
        invoice_id,
        invoice || jsonb_build_object(
          'fieldPaymentIds', to_jsonb(saip_private.billing_merge_texts(saip_private.billing_text_array(invoice->'fieldPaymentIds'), array[payment_id])),
          'allocationIds', to_jsonb(saip_private.billing_merge_texts(saip_private.billing_text_array(invoice->'allocationIds'), array[allocation_id])),
          'updatedAt', clock_timestamp(),
          'version', saip_private.n(invoice, 'version') + 1
        )
      );
      perform saip_private.billing_rebuild_invoice(invoice_id);
    end if;
    return allocation_id;

  elsif normalized = 'billing.createInvoiceDraft' then
    perform saip_private.billing_require_role(actor, 'uncle');
    requested_id := coalesce(nullif(btrim(args->>'invoiceId'), ''), '');
    if requested_id <> '' and exists(select 1 from public.saip_records where collection = 'invoices' and id = requested_id) then
      select data into current_invoice
      from public.saip_records
      where collection = 'invoices' and id = requested_id
      for update;
    end if;

    payment_ids := saip_private.billing_text_array(args->'paymentIds');
    current_settlement_ids := saip_private.billing_text_array(args->'allocationIds');

    if coalesce(array_length(current_settlement_ids, 1), 0) > 0 then
      foreach allocation_id in array current_settlement_ids loop
        select data into allocation
        from public.saip_records
        where collection = 'supplierPaymentAllocations' and id = allocation_id
        for update;
        if allocation is null then
          raise exception '기록을 찾을 수 없어요. 목록을 다시 확인해 주세요.';
        end if;
        selected_allocation_ids := saip_private.billing_merge_texts(selected_allocation_ids, array[allocation_id]);
        selected_payment_ids := saip_private.billing_merge_texts(selected_payment_ids, array[saip_private.s(allocation, 'paymentId')]);
        if first_source is null then
          first_source := allocation;
        end if;
      end loop;
    else
      foreach payment_id in array payment_ids loop
        select data into payment
        from public.saip_records
        where collection = 'fieldPayments' and id = payment_id
        for update;
        if payment is null then
          raise exception '기록을 찾을 수 없어요. 목록을 다시 확인해 주세요.';
        end if;
        selected_payment_ids := saip_private.billing_merge_texts(selected_payment_ids, array[payment_id]);
        if first_source is null then
          first_source := payment;
        end if;
        for allocation_id, allocation in
          select id, data
          from public.saip_records
          where collection = 'supplierPaymentAllocations'
            and data->>'paymentId' = payment_id
        loop
          selected_allocation_ids := saip_private.billing_merge_texts(selected_allocation_ids, array[allocation_id]);
        end loop;
      end loop;
    end if;

    metadata_only_update := current_invoice is not null
      and coalesce(array_length(selected_payment_ids, 1), 0) = 0
      and coalesce(array_length(selected_allocation_ids, 1), 0) = 0;

    if coalesce(array_length(selected_payment_ids, 1), 0) = 0
       and coalesce(array_length(selected_allocation_ids, 1), 0) = 0
       and current_invoice is not null then
      invoice_version := case
        when args ? 'invoiceVersion' then (args->>'invoiceVersion')::integer
        when args ? 'version' then (args->>'version')::integer
        else null
      end;
      if invoice_version is not null then
        perform saip_private.version(current_invoice, invoice_version);
      end if;
      if not saip_private.billing_can_manage(current_invoice, actor) then
        raise exception '청구 담당 삼촌만 기존 초안을 수정할 수 있어요.';
      end if;
      selected_allocation_ids := saip_private.billing_text_array(current_invoice->'allocationIds');
      selected_payment_ids := saip_private.billing_text_array(current_invoice->'fieldPaymentIds');
      if coalesce(array_length(selected_allocation_ids, 1), 0) > 0 then
        select data into first_source
        from public.saip_records
        where collection = 'supplierPaymentAllocations'
          and id = selected_allocation_ids[1];
      elsif coalesce(array_length(selected_payment_ids, 1), 0) > 0 then
        select data into first_source
        from public.saip_records
        where collection = 'fieldPayments'
          and id = selected_payment_ids[1];
      end if;
    end if;

    if coalesce(array_length(selected_allocation_ids, 1), 0) > 0 then
      select data into first_source from public.saip_records
      where collection = 'supplierPaymentAllocations' and id = selected_allocation_ids[1];
    end if;
    if first_source is null then
      raise exception '청구에 넣을 지급 또는 배분 기록을 선택해 주세요.';
    end if;
    group_key := saip_private.billing_group_key(first_source);
    invoice_id := coalesce(requested_id, '');

    foreach allocation_id in array selected_allocation_ids loop
      select data into allocation
      from public.saip_records
      where collection = 'supplierPaymentAllocations' and id = allocation_id
      for update;
      if allocation is null then
        raise exception '기록을 찾을 수 없어요. 목록을 다시 확인해 주세요.';
      end if;
      if saip_private.billing_group_key(allocation) <> group_key then
        raise exception '같은 소매업자·팀·회차·수취 담당 배분만 한 청구서로 묶을 수 있어요.';
      end if;
      if saip_private.s(allocation, 'invoiceId') <> '' and saip_private.s(allocation, 'invoiceId') <> invoice_id then
        raise exception '이미 다른 청구서에 묶인 배분이 섞여 있어요.';
      end if;
      select data into linked_payment
      from public.saip_records
      where collection = 'fieldPayments' and id = saip_private.s(allocation, 'paymentId')
      for update;
      if linked_payment is null then
        raise exception '기록을 찾을 수 없어요. 목록을 다시 확인해 주세요.';
      end if;
      if saip_private.s(linked_payment, 'teamId') <> saip_private.s(allocation, 'teamId')
         or saip_private.s(linked_payment, 'roundId') <> saip_private.s(allocation, 'roundId')
         or saip_private.s(linked_payment, 'payeeId') <> saip_private.s(allocation, 'payeeId')
         or saip_private.s(linked_payment, 'payerId') <> saip_private.s(allocation, 'payerId') then
        raise exception '실제 지급과 배분 범위가 맞지 않아요. 최신 내용을 확인해 주세요.';
      end if;
      request_record := saip_private.billing_request_accepted(saip_private.s(allocation, 'requestId'));
      if saip_private.s(linked_payment, 'wholesaler') <> ''
      then
        perform saip_private.billing_request_wholesaler(request_record, saip_private.s(linked_payment, 'wholesaler'));
      end if;
      perform saip_private.billing_validate_scope(
        saip_private.s(allocation, 'requestId'),
        request_record,
        actor,
        saip_private.s(linked_payment, 'teamId'),
        saip_private.s(linked_payment, 'roundId'),
        saip_private.s(linked_payment, 'payerId'),
        saip_private.s(linked_payment, 'payeeId'),
        saip_private.s(linked_payment, 'wholesaler')
      );
      if not metadata_only_update
         and saip_private.s(allocation, 'payeeId') <> actor::text
         and saip_private.s(allocation, 'uncleId') <> actor::text then
        raise exception '해당 거래처의 청구 담당자만 청구서를 만들 수 있어요.';
      end if;
    end loop;

    foreach payment_id in array selected_payment_ids loop
      select data into payment
      from public.saip_records
      where collection = 'fieldPayments' and id = payment_id
      for update;
      if payment is null then
        raise exception '기록을 찾을 수 없어요. 목록을 다시 확인해 주세요.';
      end if;

      payment_group_matches := exists(
        select 1
        from public.saip_records alloc
        where alloc.collection = 'supplierPaymentAllocations'
          and alloc.data->>'paymentId' = payment_id
          and saip_private.billing_group_key(alloc.data) = group_key
      );
      if not payment_group_matches and saip_private.billing_group_key(payment) <> group_key then
        raise exception '같은 소매업자·팀·회차·수취 담당 지급만 한 청구서로 묶을 수 있어요.';
      end if;

      request_record := saip_private.billing_request_accepted(saip_private.s(payment, 'requestId'));
      if saip_private.s(payment, 'wholesaler') <> '' then
        perform saip_private.billing_request_wholesaler(request_record, saip_private.s(payment, 'wholesaler'));
      end if;
      perform saip_private.billing_validate_scope(
        saip_private.s(payment, 'requestId'),
        request_record,
        actor,
        saip_private.s(payment, 'teamId'),
        saip_private.s(payment, 'roundId'),
        saip_private.s(payment, 'payerId'),
        saip_private.s(payment, 'payeeId'),
        saip_private.s(payment, 'wholesaler')
      );
      if not metadata_only_update and cardinality(selected_allocation_ids) = 0
         and saip_private.s(payment, 'payeeId') <> actor::text
         and saip_private.s(payment, 'uncleId') <> actor::text then
        raise exception '같은 팀 범위에서 실제 관련된 지급만 청구 초안에 넣을 수 있어요.';
      end if;
    end loop;

    if invoice_id = '' then
      invoice_id := 'invoice:' || md5(clock_timestamp()::text || random()::text);
    elsif current_invoice is null and exists(
      select 1 from public.saip_records where collection = 'invoices' and id = invoice_id
    ) then
      select data into current_invoice
      from public.saip_records
      where collection = 'invoices' and id = invoice_id
      for update;
    end if;

    if current_invoice is not null then
      if saip_private.s(current_invoice, 'status') <> 'draft' and not metadata_only_update then
        raise exception '발행 전 청구 초안만 다시 묶을 수 있어요.';
      end if;
      invoice_version := case
        when args ? 'invoiceVersion' then (args->>'invoiceVersion')::integer
        when args ? 'version' then (args->>'version')::integer
        else null
      end;
      if invoice_version is not null then
        perform saip_private.version(current_invoice, invoice_version);
      end if;
      if not saip_private.billing_can_manage(current_invoice, actor) then
        raise exception '청구 담당 삼촌만 기존 초안을 수정할 수 있어요.';
      end if;
      if saip_private.billing_group_key(current_invoice) <> group_key then
        raise exception '같은 소매업자·팀·회차·수취 담당 초안에만 이어서 반영할 수 있어요.';
      end if;
      if saip_private.s(current_invoice, 'status') <> 'draft' and (args ? 'deliveryFeeAmount') then
        raise exception '발행 후에는 배달비를 바꿀 수 없어요.';
      end if;
      current_field_payment_ids := saip_private.billing_text_array(current_invoice->'fieldPaymentIds');
      current_allocation_ids := saip_private.billing_text_array(current_invoice->'allocationIds');
    end if;

    payment_ids_for_invoice := current_field_payment_ids;
    foreach payment_id in array selected_payment_ids loop
      payment_ids_for_invoice := saip_private.billing_merge_texts(payment_ids_for_invoice, array[payment_id]);
    end loop;

    foreach payment_id in array payment_ids_for_invoice loop
      select data into payment
      from public.saip_records
      where collection = 'fieldPayments' and id = payment_id
      for update;
      if payment is null then
        raise exception '기록을 찾을 수 없어요. 목록을 다시 확인해 주세요.';
      end if;
      request_record := saip_private.billing_request_accepted(saip_private.s(payment, 'requestId'));
      perform saip_private.billing_validate_scope(
        saip_private.s(payment, 'requestId'),
        request_record,
        actor,
        saip_private.s(payment, 'teamId'),
        saip_private.s(payment, 'roundId'),
        saip_private.s(payment, 'payerId'),
        saip_private.s(payment, 'payeeId')
      );
    end loop;

    linked_allocation_ids := current_allocation_ids;
    foreach allocation_id in array selected_allocation_ids loop
      linked_allocation_ids := saip_private.billing_merge_texts(linked_allocation_ids, array[allocation_id]);
    end loop;
    manager_ids := array[saip_private.s(first_source, 'payeeId')];
    foreach allocation_id in array linked_allocation_ids loop
      allocation := saip_private.get('supplierPaymentAllocations', allocation_id);
      manager_ids := saip_private.billing_merge_texts(manager_ids, array[saip_private.s(allocation, 'uncleId')]);
    end loop;
    if coalesce(array_length(linked_allocation_ids, 1), 0) = 0 then
      manager_ids := saip_private.billing_merge_texts(manager_ids, array[saip_private.s(first_source, 'uncleId')]);
    end if;
    reader_ids := manager_ids;
    if current_invoice is not null and saip_private.s(current_invoice, 'status') <> 'draft' then
      reader_ids := saip_private.billing_merge_texts(reader_ids, array[saip_private.s(current_invoice, 'retailerId')]);
    end if;

    if args ? 'deliveryFeeAmount' then
      delivery_fee_amount := coalesce((args->>'deliveryFeeAmount')::integer, 0);
      if delivery_fee_amount < 0 then
        raise exception '배달비를 다시 확인해 주세요.';
      end if;
    else
      delivery_fee_amount := saip_private.n(coalesce(current_invoice, '{}'::jsonb), 'deliveryFeeAmount');
    end if;
    label := coalesce(nullif(btrim(args->>'label'), ''), saip_private.s(coalesce(current_invoice, '{}'::jsonb), 'label'));
    due_at := case
      when args ? 'dueAt' and nullif(btrim(args->>'dueAt'), '') is not null then btrim(args->>'dueAt')
      else saip_private.s(coalesce(current_invoice, '{}'::jsonb), 'dueAt')
    end;

    invoice := coalesce(current_invoice, '{}'::jsonb) || jsonb_build_object(
      'retailerId', saip_private.s(first_source, 'retailerId'),
      'teamId', saip_private.s(first_source, 'teamId'),
      'roundId', saip_private.s(first_source, 'roundId'),
      'payeeId', saip_private.s(first_source, 'payeeId'),
      'managerIds', to_jsonb(manager_ids),
      'fieldPaymentIds', to_jsonb(payment_ids_for_invoice),
      'allocationIds', to_jsonb(linked_allocation_ids),
      'label', coalesce(label, ''),
      'status', coalesce(nullif(saip_private.s(coalesce(current_invoice, '{}'::jsonb), 'status'), ''), 'draft'),
      'principalAmount', 0,
      'deliveryFeeAmount', delivery_fee_amount,
      'baseTotalAmount', 0,
      'adjustmentTotalAmount', 0,
      'adjustedTotalAmount', 0,
      'reportedReceiptAmount', 0,
      'pendingReceiptCount', 0,
      'pendingReceiptAmount', 0,
      'confirmedReceiptAmount', 0,
      'confirmedRefundAmount', 0,
      'remainingDueAmount', 0,
      'refundRequiredAmount', 0,
      'missingAmountCount', 0,
      'inquiryOpenCount', 0,
      'dueAt', coalesce(due_at, ''),
      'sentAt', saip_private.s(coalesce(current_invoice, '{}'::jsonb), 'sentAt'),
      'readers', to_jsonb(reader_ids),
      'createdAt', coalesce(nullif(saip_private.s(coalesce(current_invoice, '{}'::jsonb), 'createdAt'), ''), clock_timestamp()::text),
      'updatedAt', clock_timestamp(),
      'version', case when current_invoice is null then 0 else saip_private.n(current_invoice, 'version') + 1 end
    );
    perform saip_private.billing_put('invoices', invoice_id, invoice);

    foreach allocation_id in array linked_allocation_ids loop
      select data into allocation
      from public.saip_records
      where collection = 'supplierPaymentAllocations' and id = allocation_id
      for update;
      if allocation is null then
        raise exception '기록을 찾을 수 없어요. 목록을 다시 확인해 주세요.';
      end if;
      perform saip_private.billing_put(
        'supplierPaymentAllocations',
        allocation_id,
        allocation || jsonb_build_object(
          'invoiceId', invoice_id,
          'updatedAt', clock_timestamp(),
          'version', saip_private.n(allocation, 'version') + 1
        )
      );
      perform saip_private.billing_rebuild_payment(saip_private.s(allocation, 'paymentId'));
    end loop;

    perform saip_private.billing_rebuild_invoice(invoice_id);
    return invoice_id;

  elsif normalized = 'billing.sendInvoice' then
    perform saip_private.billing_send_one_invoice(
      args->>'invoiceId',
      actor,
      case when args ? 'version' then (args->>'version')::integer else null end
    );
    return args->>'invoiceId';

  elsif normalized = 'billing.sendInvoices' then
    if jsonb_typeof(args->'items') = 'array' and jsonb_array_length(args->'items') > 0 then
      amount := 0;
      for item in select value from jsonb_array_elements(args->'items') as value loop
        perform saip_private.billing_send_one_invoice(
          item->>'invoiceId',
          actor,
          case when item ? 'version' then (item->>'version')::integer else null end
        );
        amount := amount + 1;
      end loop;
      return amount::text || '건';
    end if;
    if coalesce(nullif(btrim(args->>'invoiceId'), ''), '') = '' then
      raise exception '발행할 청구서를 선택해 주세요.';
    end if;
    perform saip_private.billing_send_one_invoice(
      args->>'invoiceId',
      actor,
      case when args ? 'version' then (args->>'version')::integer else null end
    );
    return args->>'invoiceId';

  elsif normalized = 'billing.addAdjustment' then
    perform saip_private.billing_require_role(actor, 'uncle');
    invoice_id := args->>'invoiceId';
    select data into invoice
    from public.saip_records
    where collection = 'invoices' and id = invoice_id
    for update;

    if invoice is null then
      raise exception '기록을 찾을 수 없어요. 목록을 다시 확인해 주세요.';
    end if;
    if not saip_private.billing_can_manage(invoice, actor) then
      raise exception '청구 담당 삼촌만 조정을 남길 수 있어요.';
    end if;
    if args ? 'invoiceVersion' then
      perform saip_private.version(invoice, (args->>'invoiceVersion')::integer);
    elsif args ? 'version' then
      perform saip_private.version(invoice, (args->>'version')::integer);
    end if;

    adjustment_kind := btrim(args->>'kind');
    if adjustment_kind not in ('charge', 'discount', 'cancel') then
      raise exception '조정 종류를 다시 확인해 주세요.';
    end if;
    amount := coalesce((args->>'amount')::integer, 0);
    if amount < 1 then
      raise exception 'amount 값을 확인해 주세요.';
    end if;
    adjustment_id := coalesce(nullif(btrim(args->>'id'), ''), 'invoice-adjustment:' || md5(clock_timestamp()::text || random()::text));
    if exists(select 1 from public.saip_records where collection = 'invoiceAdjustments' and id = adjustment_id) then
      raise exception '이미 기록한 조정이에요.';
    end if;

    perform saip_private.billing_put(
      'invoiceAdjustments',
      adjustment_id,
      jsonb_build_object(
        'invoiceId', invoice_id,
        'kind', adjustment_kind,
        'amount', amount,
        'reason', coalesce(args->>'reason', ''),
        'readers', invoice->'readers',
        'createdAt', clock_timestamp(),
        'updatedAt', clock_timestamp(),
        'version', 0
      )
    );
    perform saip_private.billing_rebuild_invoice(invoice_id);
    return adjustment_id;

  elsif normalized = 'billing.reportReceipt' then
    perform saip_private.billing_require_role(actor, 'retailer');
    invoice_id := args->>'invoiceId';
    select data into invoice
    from public.saip_records
    where collection = 'invoices' and id = invoice_id
    for update;

    if invoice is null then
      raise exception '기록을 찾을 수 없어요. 목록을 다시 확인해 주세요.';
    end if;
    if saip_private.s(invoice, 'retailerId') <> actor::text then
      raise exception '이 청구서에 대한 송금 알림만 남길 수 있어요.';
    end if;
    if saip_private.s(invoice, 'status') = 'draft' then
      raise exception '아직 발행되지 않은 청구서에는 송금 알림을 남길 수 없어요.';
    end if;

    amount := coalesce((args->>'amount')::integer, 0);
    if amount < 1 then
      raise exception 'amount 값을 확인해 주세요.';
    end if;
    receipt_target := coalesce(nullif(btrim(args->>'paidToId'), ''), saip_private.s(invoice, 'payeeId'));
    if receipt_target <> saip_private.s(invoice, 'payeeId')
       and not exists(
         select 1
         from public.saip_records r
         where r.collection = 'reimbursements'
           and r.data->>'kind' = 'payer_reimbursement'
           and r.data->>'toId' = receipt_target
           and (
             r.data->>'invoiceId' = invoice_id
             or r.data->>'fieldPaymentId' = any(saip_private.billing_text_array(invoice->'fieldPaymentIds'))
           )
       ) then
      raise exception '실제 수취자만 선택해 주세요.';
    end if;

    receipt_id := coalesce(nullif(btrim(args->>'id'), ''), 'invoice-receipt:' || md5(clock_timestamp()::text || random()::text));
    if exists(select 1 from public.saip_records where collection = 'invoiceReceipts' and id = receipt_id) then
      raise exception '이미 남긴 송금 알림이에요.';
    end if;

    perform saip_private.billing_put(
      'invoiceReceipts',
      receipt_id,
      jsonb_build_object(
        'invoiceId', invoice_id,
        'reporterId', actor::text,
        'paidToId', receipt_target,
        'amount', amount,
        'note', coalesce(args->>'note', ''),
        'status', 'reported',
        'reimbursementId', '',
        'readers', to_jsonb(saip_private.billing_invoice_readers(invoice, true)),
        'createdAt', clock_timestamp(),
        'updatedAt', clock_timestamp(),
        'version', 0
      )
    );
    perform saip_private.billing_rebuild_invoice(invoice_id);
    return receipt_id;

  elsif normalized = 'billing.confirmReceipt' then
    perform saip_private.billing_require_role(actor, 'uncle');
    receipt_id := args->>'receiptId';
    select data into receipt
    from public.saip_records
    where collection = 'invoiceReceipts' and id = receipt_id
    for update;

    if receipt is null then
      raise exception '기록을 찾을 수 없어요. 목록을 다시 확인해 주세요.';
    end if;
    invoice_id := saip_private.s(receipt, 'invoiceId');
    select data into invoice
    from public.saip_records
    where collection = 'invoices' and id = invoice_id
    for update;

    if invoice is null then
      raise exception '기록을 찾을 수 없어요. 목록을 다시 확인해 주세요.';
    end if;
    if not saip_private.billing_can_manage(invoice, actor) then
      raise exception '청구 담당 삼촌만 송금 알림을 처리할 수 있어요.';
    end if;
    if args ? 'version' then
      perform saip_private.version(receipt, (args->>'version')::integer);
    end if;
    if saip_private.s(receipt, 'status') <> 'reported' then
      raise exception '확인 대기 중인 송금 알림만 처리할 수 있어요.';
    end if;

    confirmed := coalesce((args->>'confirmed')::boolean, true);
    reimbursement_id := '';

    perform saip_private.billing_put(
      'invoiceReceipts',
      receipt_id,
      receipt || jsonb_build_object(
        'status', case when confirmed then 'confirmed' else 'rejected' end,
        'confirmedAt', case when confirmed then clock_timestamp()::text else '' end,
        'confirmedBy', case when confirmed then actor::text else '' end,
        'reimbursementId', reimbursement_id,
        'updatedAt', clock_timestamp(),
        'version', saip_private.n(receipt, 'version') + 1
      )
    );

    if confirmed and saip_private.s(receipt, 'paidToId') <> saip_private.s(invoice, 'payeeId') then
      remaining_credit := saip_private.n(receipt, 'amount');
      select coalesce(sum(saip_private.n(data, 'amount')), 0)
      into previous_receipts_amount
      from public.saip_records
      where collection = 'invoiceReceipts'
        and data->>'invoiceId' = invoice_id
        and id <> receipt_id
        and data->>'status' = 'confirmed';

      remaining_principal := greatest(saip_private.n(invoice, 'principalAmount') - previous_receipts_amount, 0);
      for reimbursement_id, reimbursement in
        select r.id, r.data
        from public.saip_records r
        where r.collection = 'reimbursements'
          and r.data->>'kind' = 'payer_reimbursement'
          and r.data->>'toId' = saip_private.s(receipt, 'paidToId')
          and (
            r.data->>'invoiceId' = invoice_id
            or r.data->>'fieldPaymentId' = any(saip_private.billing_text_array(invoice->'fieldPaymentIds'))
          )
        order by saip_private.billing_recorded_at(r.data) asc, r.id asc
      loop
        exit when remaining_credit <= 0;
        select coalesce(sum(least(saip_private.n(data, 'allocatedAmount'), greatest(saip_private.n(data, 'customerChargeAmount') - saip_private.n(data, 'directPaidAmount'), 0))), 0)
        into allocated_principal
        from public.saip_records
        where collection = 'supplierPaymentAllocations'
          and data->>'paymentId' = saip_private.s(reimbursement, 'fieldPaymentId')
          and data->>'invoiceId' = invoice_id;

        select coalesce(sum(greatest((row->>'amount')::integer, 0)), 0)
        into previous_credits
        from jsonb_array_elements(coalesce(reimbursement->'settlements', '[]'::jsonb)) as row
        left join public.saip_records source_receipt
          on source_receipt.collection = 'invoiceReceipts'
         and source_receipt.id = row->>'sourceId'
        where row->>'kind' = 'receipt_credit'
          and source_receipt.data->>'invoiceId' = invoice_id;

        remaining_amount := greatest(saip_private.n(reimbursement, 'totalAmount') - saip_private.n(reimbursement, 'settledAmount'), 0);
        credit := least(
          least(remaining_credit, remaining_amount),
          least(remaining_principal, greatest(allocated_principal - previous_credits, 0))
        );
        if credit <= 0 then
          continue;
        end if;
        perform saip_private.billing_append_reimbursement_settlement(
          reimbursement_id,
          'receipt-credit:' || receipt_id || ':' || reimbursement_id,
          credit,
          'receipt_credit',
          actor,
          '',
          receipt_id
        );
        remaining_credit := remaining_credit - credit;
        remaining_principal := remaining_principal - credit;
      end loop;

      if remaining_credit > 0 then
        select r.id, r.data into existing_team_recovery_id, reimbursement
        from public.saip_records r
        where r.collection = 'reimbursements'
          and r.data->>'kind' = 'team_recovery'
          and r.data->>'fromId' = saip_private.s(receipt, 'paidToId')
          and r.data->>'toId' = saip_private.s(invoice, 'payeeId')
          and r.data->>'invoiceId' = invoice_id
        order by r.updated_at desc, r.id desc
        limit 1
        for update;

        existing_team_recovery_id := coalesce(nullif(existing_team_recovery_id, ''), 'team-recovery:' || invoice_id || ':' || saip_private.s(receipt, 'paidToId'));
        perform saip_private.billing_upsert_reimbursement(
          existing_team_recovery_id,
          'team_recovery',
          invoice_id,
          saip_private.s(coalesce(reimbursement, '{}'::jsonb), 'fieldPaymentId'),
          saip_private.s(receipt, 'paidToId'),
          saip_private.s(invoice, 'payeeId'),
          saip_private.n(coalesce(reimbursement, '{}'::jsonb), 'totalAmount') + remaining_credit,
          saip_private.billing_merge_texts(saip_private.billing_invoice_readers(invoice, false), array[saip_private.s(receipt, 'paidToId')])
        );
        reimbursement_id := coalesce(nullif(reimbursement_id, ''), existing_team_recovery_id);
      end if;

      perform saip_private.billing_put(
        'invoiceReceipts',
        receipt_id,
        saip_private.get('invoiceReceipts', receipt_id) || jsonb_build_object(
          'reimbursementId', reimbursement_id,
          'updatedAt', clock_timestamp(),
          'version', saip_private.n(saip_private.get('invoiceReceipts', receipt_id), 'version') + 1
        )
      );
    end if;

    perform saip_private.billing_rebuild_invoice(invoice_id);
    return receipt_id;

  elsif normalized = 'billing.recordSupplierRefund' then
    perform saip_private.billing_require_role(actor, 'uncle');
    payment_id := args->>'paymentId';
    select data into payment
    from public.saip_records
    where collection = 'fieldPayments' and id = payment_id
    for update;

    if payment is null then
      raise exception '기록을 찾을 수 없어요. 목록을 다시 확인해 주세요.';
    end if;
    if saip_private.s(payment, 'uncleId') <> actor::text
       and saip_private.s(payment, 'payeeId') <> actor::text
       and saip_private.s(payment, 'payerId') <> actor::text then
      raise exception '현장 지급 당사자만 도매처 환급을 기록할 수 있어요.';
    end if;
    if args ? 'version' then
      perform saip_private.version(payment, (args->>'version')::integer);
    end if;

    amount := coalesce((args->>'amount')::integer, 0);
    if amount < 1 then
      raise exception 'amount 값을 확인해 주세요.';
    end if;
    actual_recipient_id := args->>'actualRecipientId';
    if actual_recipient_id <> saip_private.s(payment, 'payerId')
       and actual_recipient_id <> saip_private.s(payment, 'payeeId') then
      raise exception '실제 환급을 받은 당사자만 선택해 주세요.';
    end if;
    select coalesce(sum(saip_private.n(data, 'amount')), 0)
    into previous_receipts_amount
    from public.saip_records
    where collection = 'supplierRefunds'
      and data->>'paymentId' = payment_id;
    if previous_receipts_amount + amount > saip_private.n(payment, 'actualPaidAmount') then
      raise exception '실제 지급액보다 많은 금액을 환불로 기록할 수 없어요.';
    end if;

    reimbursement_id := saip_private.s(payment, 'reimbursementId');
    receipt_id := coalesce(nullif(btrim(args->>'id'), ''), 'supplier-refund:' || md5(clock_timestamp()::text || random()::text));
    if exists(select 1 from public.saip_records where collection = 'supplierRefunds' and id = receipt_id) then
      raise exception '이미 기록한 도매처 환급이에요.';
    end if;

    perform saip_private.billing_put(
      'supplierRefunds',
      receipt_id,
      jsonb_build_object(
        'paymentId', payment_id,
        'invoiceId', saip_private.s(payment, 'invoiceId'),
        'actualRecipientId', actual_recipient_id,
        'amount', amount,
        'note', coalesce(args->>'note', ''),
        'reimbursementId', reimbursement_id,
        'readers', payment->'readers',
        'createdAt', clock_timestamp(),
        'updatedAt', clock_timestamp(),
        'version', 0
      )
    );

    if reimbursement_id <> '' then
      select data into reimbursement
      from public.saip_records
      where collection = 'reimbursements' and id = reimbursement_id
      for update;
      if reimbursement is not null then
        credit := least(amount, greatest(saip_private.n(reimbursement, 'totalAmount') - saip_private.n(reimbursement, 'settledAmount'), 0));
        if credit > 0 then
          perform saip_private.billing_append_reimbursement_settlement(
            reimbursement_id,
            'supplier-refund:' || receipt_id,
            credit,
            'supplier_refund_credit',
            actor,
            coalesce(args->>'note', ''),
            receipt_id
          );
        end if;
        excess := amount - credit;
        if actual_recipient_id = saip_private.s(payment, 'payerId') and excess > 0 then
          select id, data into existing_team_recovery_id, reimbursement
          from public.saip_records
          where collection = 'reimbursements'
            and data->>'fieldPaymentId' = payment_id
            and data->>'kind' = 'team_recovery'
          order by updated_at desc, id desc
          limit 1
          for update;

          perform saip_private.billing_upsert_reimbursement(
            coalesce(nullif(existing_team_recovery_id, ''), 'team-recovery:' || payment_id),
            'team_recovery',
            saip_private.s(payment, 'invoiceId'),
            payment_id,
            saip_private.s(payment, 'payerId'),
            saip_private.s(payment, 'payeeId'),
            saip_private.n(coalesce(reimbursement, '{}'::jsonb), 'totalAmount') + excess,
            saip_private.billing_internal_readers(
              saip_private.s(payment, 'teamId'),
              array[saip_private.s(payment, 'uncleId'), saip_private.s(payment, 'payerId'), saip_private.s(payment, 'payeeId')]
            )
          );
        end if;
      end if;
    end if;

    if saip_private.s(payment, 'invoiceId') <> '' then
      perform saip_private.billing_rebuild_invoice(saip_private.s(payment, 'invoiceId'));
    end if;
    return receipt_id;

  elsif normalized = 'billing.flagInvoiceInquiry' then
    perform saip_private.billing_require_role(actor, 'retailer');
    invoice_id := args->>'invoiceId';
    select data into invoice
    from public.saip_records
    where collection = 'invoices' and id = invoice_id
    for update;

    if invoice is null then
      raise exception '기록을 찾을 수 없어요. 목록을 다시 확인해 주세요.';
    end if;
    if saip_private.s(invoice, 'retailerId') <> actor::text then
      raise exception '해당 소매업자만 금액 문의를 남길 수 있어요.';
    end if;
    if saip_private.s(invoice, 'status') = 'draft' then
      raise exception '아직 발행되지 않은 청구서에는 문의를 남길 수 없어요.';
    end if;

    note := coalesce(nullif(args->>'note', ''), '');
    if note = '' then
      raise exception 'note 값을 확인해 주세요.';
    end if;
    inquiry_id := coalesce(nullif(btrim(args->>'id'), ''), 'invoice-inquiry:' || md5(clock_timestamp()::text || random()::text));
    if exists(select 1 from public.saip_records where collection = 'invoiceInquiries' and id = inquiry_id) then
      raise exception '이미 남긴 금액 문의예요.';
    end if;
    message_id := coalesce(nullif(btrim(args->>'messageId'), ''), 'message:' || md5(clock_timestamp()::text || random()::text));
    if exists(select 1 from public.saip_records where collection = 'messages' and id = message_id) then
      raise exception '이미 같은 문의 메시지를 보냈어요.';
    end if;

    payment_id := coalesce((
      select data->>'requestId'
      from public.saip_records
      where collection = 'supplierPaymentAllocations'
        and data->>'invoiceId' = invoice_id
      order by saip_private.billing_recorded_at(data) asc, id asc
      limit 1
    ), '');

    message_data := jsonb_build_object(
      'senderId', actor::text,
      'recipientId', saip_private.s(invoice, 'payeeId'),
      'body', note,
      'attachments', '[]'::jsonb,
      'status', 'sent',
      'readBy', to_jsonb(array[actor::text]),
      'requestId', payment_id,
      'invoiceId', invoice_id,
      'inquiry', true,
      'readers', to_jsonb(saip_private.billing_invoice_readers(invoice, true)),
      'createdAt', clock_timestamp(),
      'updatedAt', clock_timestamp(),
      'version', 0
    );
    perform saip_private.put(
      'messages',
      message_id,
      message_data || jsonb_build_object('id', message_id),
      saip_private.billing_readers(message_data)
    );

    perform saip_private.billing_put(
      'invoiceInquiries',
      inquiry_id,
      jsonb_build_object(
        'invoiceId', invoice_id,
        'requesterId', actor::text,
        'recipientId', saip_private.s(invoice, 'payeeId'),
        'messageId', message_id,
        'note', note,
        'status', 'open',
        'readers', to_jsonb(saip_private.billing_invoice_readers(invoice, true)),
        'createdAt', clock_timestamp(),
        'updatedAt', clock_timestamp(),
        'version', 0
      )
    );
    perform saip_private.billing_rebuild_invoice(invoice_id);
    return inquiry_id;

  elsif normalized = 'billing.resolveInvoiceInquiry' then
    perform saip_private.billing_require_role(actor, 'uncle');
    inquiry_id := args->>'inquiryId';
    select data into linked_allocation
    from public.saip_records
    where collection = 'invoiceInquiries' and id = inquiry_id
    for update;

    if linked_allocation is null then
      raise exception '기록을 찾을 수 없어요. 목록을 다시 확인해 주세요.';
    end if;
    invoice_id := saip_private.s(linked_allocation, 'invoiceId');
    select data into invoice
    from public.saip_records
    where collection = 'invoices' and id = invoice_id
    for update;

    if invoice is null then
      raise exception '기록을 찾을 수 없어요. 목록을 다시 확인해 주세요.';
    end if;
    if not saip_private.billing_can_manage(invoice, actor) then
      raise exception '청구 담당 삼촌만 금액 문의를 해결할 수 있어요.';
    end if;
    if args ? 'version' then
      perform saip_private.version(linked_allocation, (args->>'version')::integer);
    end if;
    if saip_private.s(linked_allocation, 'status') = 'resolved' then
      return inquiry_id;
    end if;

    perform saip_private.billing_put(
      'invoiceInquiries',
      inquiry_id,
      linked_allocation || jsonb_build_object(
        'status', 'resolved',
        'resolvedAt', clock_timestamp(),
        'resolvedBy', actor::text,
        'resolutionNote', coalesce(args->>'note', ''),
        'updatedAt', clock_timestamp(),
        'version', saip_private.n(linked_allocation, 'version') + 1
      )
    );
    perform saip_private.billing_rebuild_invoice(invoice_id);
    return inquiry_id;

  elsif normalized = 'billing.settleReimbursement' then
    reimbursement_id := args->>'reimbursementId';
    select data into reimbursement
    from public.saip_records
    where collection = 'reimbursements' and id = reimbursement_id
    for update;

    if reimbursement is null then
      raise exception '기록을 찾을 수 없어요. 목록을 다시 확인해 주세요.';
    end if;

    invoice_id := coalesce(nullif(btrim(args->>'invoiceId'), ''), saip_private.s(reimbursement, 'invoiceId'));
    if invoice_id <> '' then
      select data into invoice
      from public.saip_records
      where collection = 'invoices' and id = invoice_id
      for update;
      if invoice is null then
        raise exception '기록을 찾을 수 없어요. 목록을 다시 확인해 주세요.';
      end if;
      if not saip_private.billing_can_manage(invoice, actor)
         and saip_private.s(reimbursement, 'fromId') <> actor::text
         and saip_private.s(reimbursement, 'toId') <> actor::text then
        raise exception '정산 당사자만 반환을 기록할 수 있어요.';
      end if;
    elsif saip_private.s(reimbursement, 'fromId') <> actor::text
          and saip_private.s(reimbursement, 'toId') <> actor::text then
      raise exception '정산 당사자만 반환을 기록할 수 있어요.';
    end if;

    if args ? 'version' then
      perform saip_private.version(reimbursement, (args->>'version')::integer);
    end if;

    amount := coalesce((args->>'amount')::integer, 0);
    if amount < 1 then
      raise exception 'amount 값을 확인해 주세요.';
    end if;
    remaining_amount := greatest(saip_private.n(reimbursement, 'totalAmount') - saip_private.n(reimbursement, 'settledAmount'), 0);
    if amount > remaining_amount then
      raise exception '남은 반환 대상 금액보다 크게 처리할 수 없어요.';
    end if;

    settlement_id := coalesce(nullif(btrim(args->>'settlementId'), ''), 'reimbursement-settlement:' || md5(clock_timestamp()::text || random()::text));
    perform saip_private.billing_append_reimbursement_settlement(
      reimbursement_id,
      settlement_id,
      amount,
      'manual',
      actor,
      coalesce(args->>'note', ''),
      ''
    );
    if invoice_id <> '' then
      perform saip_private.billing_rebuild_invoice(invoice_id);
    end if;
    return reimbursement_id;
  end if;

  raise exception '지원하지 않는 청구 명령이에요: %', command;
end;
$$;

revoke all on function saip_private.billing_new_id(text) from public, anon, authenticated;
revoke all on function saip_private.billing_unique_texts(text[]) from public, anon, authenticated;
revoke all on function saip_private.billing_merge_texts(text[], text[]) from public, anon, authenticated;
revoke all on function saip_private.billing_text_array(jsonb) from public, anon, authenticated;
revoke all on function saip_private.billing_readers(jsonb) from public, anon, authenticated;
revoke all on function saip_private.billing_put(text, text, jsonb) from public, anon, authenticated;
revoke all on function saip_private.billing_account(uuid) from public, anon, authenticated;
revoke all on function saip_private.billing_require_role(uuid, text) from public, anon, authenticated;
revoke all on function saip_private.billing_request(uuid, text) from public, anon, authenticated;
revoke all on function saip_private.billing_request_locked(text) from public, anon, authenticated;
revoke all on function saip_private.billing_request_accepted(text) from public, anon, authenticated;
revoke all on function saip_private.billing_request_wholesaler(jsonb, text) from public, anon, authenticated;
revoke all on function saip_private.billing_require_scope_member(jsonb, text, text) from public, anon, authenticated;
revoke all on function saip_private.billing_can_handle_request_with_team_job(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function saip_private.billing_validate_scope(text, jsonb, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function saip_private.billing_require_field_payment_actor(jsonb, text, uuid, text, text, text) from public, anon, authenticated;
revoke all on function saip_private.billing_internal_readers(text, text[]) from public, anon, authenticated;
revoke all on function saip_private.billing_invoice_readers(jsonb, boolean) from public, anon, authenticated;
revoke all on function saip_private.billing_reimbursement_settled_amount(jsonb) from public, anon, authenticated;
revoke all on function saip_private.billing_reimbursement_status(integer, integer) from public, anon, authenticated;
revoke all on function saip_private.billing_recorded_at(jsonb) from public, anon, authenticated;
revoke all on function saip_private.billing_matching_draft_invoice_id(jsonb) from public, anon, authenticated;
revoke all on function saip_private.billing_upsert_reimbursement(text, text, text, text, text, text, integer, text[]) from public, anon, authenticated;
revoke all on function saip_private.billing_append_reimbursement_settlement(text, text, integer, text, uuid, text, text) from public, anon, authenticated;
revoke all on function saip_private.billing_sync_payer_reimbursement(text) from public, anon, authenticated;
revoke all on function saip_private.billing_rebuild_payment(text) from public, anon, authenticated;
revoke all on function saip_private.billing_billable_amount(jsonb) from public, anon, authenticated;
revoke all on function saip_private.billing_group_key(jsonb) from public, anon, authenticated;
revoke all on function saip_private.billing_can_manage(jsonb, uuid) from public, anon, authenticated;
revoke all on function saip_private.billing_signed_adjustment(jsonb) from public, anon, authenticated;
revoke all on function saip_private.billing_sync_customer_refund(text) from public, anon, authenticated;
revoke all on function saip_private.billing_rebuild_invoice(text) from public, anon, authenticated;
revoke all on function saip_private.billing_send_one_invoice(text, uuid, integer) from public, anon, authenticated;
revoke all on function saip_private.billing_command(text, jsonb, uuid) from public, anon, authenticated;
