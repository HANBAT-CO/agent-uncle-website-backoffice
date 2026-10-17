-- 도매처형 요청의 변경/취소 협의를 상품 필드 없이 처리하고,
-- 부분 취소는 활성 도매처 목록만 줄이며 전체 취소일 때만 기존 집계 취소 흐름으로 전환한다.

create or replace function saip_private.normalize_wholesaler_payment_mode(value text)
returns text language sql immutable set search_path = '' as $$
  select case btrim(coalesce(value,''))
    when 'advance' then 'advance'
    when 'direct' then 'direct'
    else 'review'
  end
$$;

create or replace function saip_private.normalize_wholesaler_row(entry jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'wholesaler', btrim(coalesce(entry->>'wholesaler','')),
    'location', btrim(coalesce(entry->>'location','')),
    'paymentMode', saip_private.normalize_wholesaler_payment_mode(entry->>'paymentMode')
  ) || case
    when btrim(coalesce(entry->>'favoriteId','')) = '' then '{}'::jsonb
    else jsonb_build_object('favoriteId', btrim(entry->>'favoriteId'))
  end
$$;

create or replace function saip_private.stored_wholesaler_rows(source jsonb, preserve_empty boolean default false)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare rows jsonb := '[]'::jsonb; entry jsonb; normalized jsonb;
begin
  if jsonb_typeof(source->'wholesalers') = 'array' then
    for entry in select value from jsonb_array_elements(source->'wholesalers') loop
      if jsonb_typeof(entry) <> 'object' then continue; end if;
      normalized := saip_private.normalize_wholesaler_row(entry);
      if preserve_empty
         or btrim(saip_private.s(normalized,'wholesaler')) <> ''
         or btrim(saip_private.s(normalized,'location')) <> '' then
        rows := rows || jsonb_build_array(normalized);
      end if;
    end loop;
  end if;
  if jsonb_array_length(rows) = 0 then
    normalized := saip_private.normalize_wholesaler_row(jsonb_build_object(
      'wholesaler', source->>'wholesaler',
      'location', source->>'location',
      'paymentMode', source->>'paymentMode',
      'favoriteId', source->>'favoriteId'
    ));
    if preserve_empty
       or btrim(saip_private.s(normalized,'wholesaler')) <> ''
       or btrim(saip_private.s(normalized,'location')) <> '' then
      rows := rows || jsonb_build_array(normalized);
    end if;
  end if;
  return rows;
end $$;

create or replace function saip_private.wholesaler_names(rows jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(
    case
      when btrim(coalesce(value->>'location','')) = '' then btrim(coalesce(value->>'wholesaler','도매처'))
      else btrim(coalesce(value->>'wholesaler','도매처')) || ' · ' || btrim(value->>'location')
    end
    order by ordinality
  ), '[]'::jsonb)
  from jsonb_array_elements(coalesce(rows,'[]'::jsonb)) with ordinality
$$;

create or replace function saip_private.apply_wholesaler_rows(target jsonb, rows jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select target || jsonb_build_object(
    'wholesalers', coalesce(rows,'[]'::jsonb),
    'wholesaler', coalesce(rows->0->>'wholesaler',''),
    'location', coalesce(rows->0->>'location','')
  )
$$;

create or replace function saip_private.apply_wholesaler_change(request_value jsonb, changes jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare next_value jsonb;
begin
  perform saip_private.validate_wholesaler_change(changes);
  next_value := saip_private.apply_wholesaler_rows(
    request_value || '{"product":"","option":"","quantity":1,"photos":[]}'::jsonb,
    saip_private.stored_wholesaler_rows(changes, true)
  );
  if changes ? 'address' then
    next_value := next_value || jsonb_build_object('address', saip_private.s(changes,'address'));
  end if;
  if changes ? 'addressDetail' then
    next_value := next_value || jsonb_build_object('addressDetail', saip_private.s(changes,'addressDetail'));
  end if;
  if changes ? 'note' then
    next_value := next_value || jsonb_build_object('note', saip_private.s(changes,'note'));
  end if;
  if changes ? 'destinationOverride' then
    next_value := next_value || jsonb_build_object('destinationOverride', saip_private.b(changes,'destinationOverride'));
  end if;
  return next_value;
end $$;

create or replace function saip_private.sanitize_wholesaler_cancel_indexes(changes jsonb, row_count integer)
returns integer[] language plpgsql immutable set search_path = '' as $$
declare raw jsonb := changes->'wholesalerIndexes'; entry jsonb; idx_text text; idx integer; candidate numeric; result integer[] := '{}';
begin
  if jsonb_typeof(raw) is distinct from 'array' then
    raise exception '취소할 도매처를 1곳 이상 선택해 주세요.';
  end if;
  if jsonb_array_length(raw) = 0 then
    raise exception '취소할 도매처를 1곳 이상 선택해 주세요.';
  end if;
  for entry in select value from jsonb_array_elements(raw) loop
    idx_text := btrim(entry #>> '{}');
    if idx_text is null
       or (jsonb_typeof(entry) <> 'number' and
           (jsonb_typeof(entry) <> 'string' or idx_text !~ '^-?[0-9]+$')) then
      raise exception '취소할 도매처 선택을 다시 확인해 주세요.';
    end if;
    candidate := idx_text::numeric;
    if candidate <> trunc(candidate) or candidate < 0 or candidate >= row_count then
      raise exception '취소할 도매처 선택을 다시 확인해 주세요.';
    end if;
    idx := candidate::integer;
    if idx = any(result) then
      raise exception '취소할 도매처 선택을 다시 확인해 주세요.';
    end if;
    result := array_append(result, idx);
  end loop;
  select coalesce(array_agg(value order by value), '{}'::integer[]) into result
  from unnest(result) value;
  return result;
end $$;

create or replace function saip_private.select_wholesaler_rows(rows jsonb, indexes integer[])
returns jsonb language plpgsql immutable set search_path = '' as $$
declare selected jsonb := '[]'::jsonb; idx integer;
begin
  for idx in select unnest(indexes) loop
    selected := selected || jsonb_build_array(rows->idx);
  end loop;
  return selected;
end $$;

create or replace function saip_private.remove_wholesaler_rows(rows jsonb, indexes integer[])
returns jsonb language plpgsql immutable set search_path = '' as $$
declare remaining jsonb := '[]'::jsonb; entry record;
begin
  for entry in select value, ordinality - 1 as idx from jsonb_array_elements(rows) with ordinality loop
    if not (entry.idx = any(indexes)) then
      remaining := remaining || jsonb_build_array(entry.value);
    end if;
  end loop;
  return remaining;
end $$;

create or replace function saip_private.append_cancelled_wholesaler_snapshots(
  request_value jsonb,
  cancelled_rows jsonb,
  indexes integer[],
  reason text,
  actor uuid,
  proposal_id text,
  cancelled_at timestamptz default clock_timestamp()
) returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  snapshots jsonb := case when jsonb_typeof(request_value->'cancelledWholesalers') = 'array'
    then request_value->'cancelledWholesalers' else '[]'::jsonb end;
  entry record;
begin
  for entry in select value, ordinality from jsonb_array_elements(cancelled_rows) with ordinality loop
    snapshots := snapshots || jsonb_build_array(entry.value || jsonb_build_object(
      'originalIndex', indexes[entry.ordinality],
      'reason', reason,
      'cancelledAt', cancelled_at,
      'cancelledBy', actor::text,
      'proposalId', proposal_id
    ));
  end loop;
  return snapshots;
end $$;

create or replace function saip_private.validate_wholesaler_change(changes jsonb)
returns void language plpgsql immutable set search_path = '' as $$
declare rows jsonb := changes->'wholesalers'; entry jsonb;
begin
  if jsonb_typeof(rows) is distinct from 'array' then
    raise exception '도매처를 1곳 이상, 최대 10곳까지 입력해 주세요.';
  end if;
  if jsonb_array_length(rows) not between 1 and 10 then
    raise exception '도매처를 1곳 이상, 최대 10곳까지 입력해 주세요.';
  end if;
  for entry in select value from jsonb_array_elements(rows) loop
    if jsonb_typeof(entry) is distinct from 'object'
       or jsonb_typeof(entry->'wholesaler') is distinct from 'string'
       or jsonb_typeof(entry->'location') is distinct from 'string'
       or btrim(entry->>'wholesaler') = '' or btrim(entry->>'location') = '' then
      raise exception '도매처 이름과 위치를 입력해 주세요.';
    end if;
    if entry ? 'paymentMode' and
       (jsonb_typeof(entry->'paymentMode') is distinct from 'string'
        or entry->>'paymentMode' not in ('advance','direct','review')) then
      raise exception '도매처 결제 방식을 확인해 주세요.';
    end if;
  end loop;
end $$;

create or replace function saip_private.wholesaler_change_values(changes jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare result jsonb := jsonb_build_object(
  'requestType', 'wholesaler',
  'wholesalers', saip_private.stored_wholesaler_rows(changes, true),
  'reason', btrim(coalesce(changes->>'reason',''))
);
begin
  perform saip_private.validate_wholesaler_change(changes);
  if changes ? 'address' then
    result := result || jsonb_build_object('address', saip_private.s(changes,'address'));
  end if;
  if changes ? 'addressDetail' then
    result := result || jsonb_build_object('addressDetail', saip_private.s(changes,'addressDetail'));
  end if;
  if changes ? 'note' then
    result := result || jsonb_build_object('note', saip_private.s(changes,'note'));
  end if;
  if changes ? 'destinationOverride' then
    result := result || jsonb_build_object('destinationOverride', saip_private.b(changes,'destinationOverride'));
  end if;
  return result;
end $$;

create or replace function saip_private.request_fields(j jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  result jsonb := saip_private.pick(j,array[
    'uncleId','requestType','wholesalers','wholesaler','location',
    'product','option','quantity','address','addressDetail','note','photos',
    'receivingShop','destinationOverride','roundLabel'
  ]);
  entries jsonb := '[]'::jsonb;
  entry jsonb;
begin
  if j ? 'wholesalers' then
    if jsonb_typeof(j->'wholesalers') is distinct from 'array' then
      raise exception '도매처 목록을 확인해 주세요.';
    end if;
    if jsonb_array_length(j->'wholesalers') > 10 then
      raise exception '도매처는 최대 10곳까지 입력할 수 있어요.';
    end if;
    for entry in select value from jsonb_array_elements(j->'wholesalers') loop
      if jsonb_typeof(entry) is distinct from 'object'
         or jsonb_typeof(entry->'wholesaler') is distinct from 'string'
         or jsonb_typeof(entry->'location') is distinct from 'string' then
        raise exception '도매처 이름과 위치를 확인해 주세요.';
      end if;
      entries := entries || jsonb_build_array(saip_private.normalize_wholesaler_row(entry));
    end loop;
    result := result || jsonb_build_object(
      'wholesalers', entries,
      'wholesaler', coalesce(entries->0->>'wholesaler',''),
      'location', coalesce(entries->0->>'location','')
    );
  end if;
  if j->>'requestType' = 'wholesaler' then
    result := result || '{"product":"","option":"","quantity":1,"photos":[]}'::jsonb;
  end if;
  return result;
end $$;

create or replace function saip_private.validate_request(r jsonb, owner uuid)
returns void language plpgsql set search_path = '' as $$
declare
  k text;
  a text;
  entry jsonb;
  entry_index integer := 0;
  required_fields text[];
begin
  if r->>'requestType' = 'wholesaler' or r ? 'wholesalers' then
    if jsonb_typeof(r->'wholesalers') is distinct from 'array' then
      raise exception '도매처를 1곳 이상, 최대 10곳까지 입력해 주세요.';
    end if;
    if jsonb_array_length(r->'wholesalers') not between 1 and 10 then
      raise exception '도매처를 1곳 이상, 최대 10곳까지 입력해 주세요.';
    end if;
    for entry in select value from jsonb_array_elements(r->'wholesalers') loop
      entry_index := entry_index + 1;
      if jsonb_typeof(entry) is distinct from 'object'
         or jsonb_typeof(entry->'wholesaler') is distinct from 'string'
         or jsonb_typeof(entry->'location') is distinct from 'string'
         or btrim(saip_private.s(entry,'wholesaler')) = ''
         or btrim(saip_private.s(entry,'location')) = '' then
        raise exception '도매처 %의 이름과 위치를 입력해 주세요.', entry_index;
      end if;
    end loop;
  end if;
  required_fields := case when r->>'requestType' = 'wholesaler'
    then array['uncleId','wholesaler','location']
    else array['uncleId','wholesaler','location','product','option','address','addressDetail']
  end;
  foreach k in array required_fields loop
    if btrim(saip_private.s(r,k)) = '' then
      raise exception '% 항목을 입력해 주세요.', case k
        when 'uncleId' then '사입삼촌' when 'wholesaler' then '도매처'
        when 'location' then '도매처 위치' when 'product' then '상품명'
        when 'option' then '옵션' when 'address' then '배송지'
        when 'addressDetail' then '상세주소' end;
    end if;
  end loop;
  if saip_private.n(r,'quantity') <= 0
     or not saip_private.connected(owner,(r->>'uncleId')::uuid) then
    raise exception '수량과 연결된 사입삼촌을 확인해 주세요.';
  end if;
  for a in select jsonb_array_elements_text(coalesce(r->'photos','[]')) loop
    perform saip_private.owned_attachment(a,owner);
  end loop;
end $$;

create or replace function saip_private.saip_command(command text,args jsonb default '{}',operation_id text default '')
returns text language plpgsql set search_path='' as $$
declare
  actor uuid:=auth.uid();
  actor_id text:=auth.uid()::text;
  me jsonb;
  bank jsonb;
  k text;
  result text:=coalesce(args->>'id','');
  prior record;
  payload jsonb:=jsonb_build_object('command',command,'args',args);
  i text:=coalesce(args->>'id','');
  v jsonb:=coalesce(args->'values','{}');
  r jsonb;
  n jsonb;
  p jsonb;
  rid text;
  kind text:=coalesce(args->>'kind','');
  approved boolean:=saip_private.b(args,'approve');
  held integer;
  proposal_id text;
  active_rows jsonb;
  rows jsonb;
  selected_rows jsonb;
  remaining_rows jsonb;
  indexes integer[];
  cancelled_quantity integer;
  outstanding_acquired integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('saip-workflow',0));

  if command='saveProfile' then
    perform pg_advisory_xact_lock(hashtextextended('saip-actor-'||actor_id,0));
    select * into prior from saip_private.operations o where o.actor=auth.uid() and o.id=operation_id;
    if found then
      if prior.payload<>payload then
        raise exception '같은 작업 번호로 다른 내용을 전송할 수 없어요.';
      end if;
      return prior.result;
    end if;
    me:=saip_private.get('accounts',actor::text);
    bank:=saip_private.pick(me||coalesce(args->'values','{}'),array['bankName','bankAccount','bankHolder']);
    foreach k in array array['bankName','bankAccount','bankHolder'] loop
      if bank ? k then
        if jsonb_typeof(bank->k)<>'string' then raise exception '계좌 정보를 확인해 주세요.'; end if;
        bank:=jsonb_set(bank,array[k],to_jsonb(btrim(bank->>k)));
      end if;
    end loop;
    if saip_private.b(args,'complete') or saip_private.b(me,'complete') then
      if not saip_private.b(me,'complete') or saip_private.s(bank,'bankName')<>''
        or saip_private.s(bank,'bankAccount')<>'' or saip_private.s(bank,'bankHolder')<>'' then
        foreach k in array array['bankName','bankAccount','bankHolder'] loop
          if saip_private.s(bank,k)='' then
            raise exception '% 항목을 입력해 주세요.',
              case k when 'bankName' then '은행명' when 'bankAccount' then '계좌번호' else '예금주명' end;
          end if;
        end loop;
        if length(bank->>'bankName')>50 or length(bank->>'bankHolder')>100
          or (bank->>'bankAccount') !~ '^[0-9 -]+$'
          or regexp_replace(bank->>'bankAccount','[^0-9]','','g') !~ '^[0-9]{8,20}$' then
          raise exception '은행명·계좌번호·예금주명을 확인해 주세요.';
        end if;
      end if;
    end if;
    result:=saip_private.command_before_order_payment(command,args,operation_id);
    update public.saip_records set data=data||bank where collection='accounts' and id=actor::text;
    return result;
  end if;

  if command not in ('propose','respondProposal') then
    return saip_private.command_before_order_payment(command,args,operation_id);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('saip-actor-'||actor_id,0));
  select * into prior from saip_private.operations o where o.actor=auth.uid() and o.id=operation_id;
  if found then
    if prior.payload<>payload then
      raise exception '같은 작업 번호로 다른 내용을 전송할 수 없어요.';
    end if;
    return prior.result;
  end if;

  if command='propose' then
    if kind not in ('change','cancel') then
      return saip_private.command_before_order_payment(command,args,operation_id);
    end if;
    r:=saip_private.request(i,saip_private.n(args,'version'));
    if r->>'requestType' is distinct from 'wholesaler' then
      return saip_private.command_before_order_payment(command,args,operation_id);
    end if;
    perform saip_private.unheld(r);
    perform saip_private.accepted(r);
    if btrim(coalesce(v->>'reason',''))='' then
      raise exception '변경 사유와 협의할 처리 방법을 입력해 주세요.';
    end if;

    if kind='cancel' then
      if not (v ? 'wholesalerIndexes') then
        return saip_private.command_before_order_payment(command,args,operation_id);
      end if;
      if saip_private.n(r,'delivered') > 0 or saip_private.n(r,'received') > 0 then
        raise exception '전달이 시작된 도매처형 요청은 취소 협의를 진행할 수 없어요.';
      end if;
      active_rows := saip_private.stored_wholesaler_rows(r);
      indexes := saip_private.sanitize_wholesaler_cancel_indexes(v, jsonb_array_length(active_rows));
      selected_rows := saip_private.select_wholesaler_rows(active_rows, indexes);
      v := jsonb_build_object(
        'wholesalerIndexes', to_jsonb(indexes),
        'reason', btrim(coalesce(v->>'reason',''))
      );
      held := 0;
      proposal_id := gen_random_uuid()::text;
      perform saip_private.put('proposals',proposal_id,jsonb_build_object(
        'requestId',i,
        'kind',kind,
        'values',v,
        'proposerId',actor_id,
        'status','pending',
        'held',held,
        'version',0,
        'createdAt',clock_timestamp(),
        'wholesalers',selected_rows,
        'wholesalerNames',saip_private.wholesaler_names(selected_rows)
      ),saip_private.pair(r));
      perform saip_private.save_request(i,r,r||jsonb_build_object(
        'proposalId',proposal_id,
        'held',saip_private.n(r,'held')+held
      ),'변경·취소·정정 협의를 요청했어요');
      result := proposal_id;
    else
      if not (saip_private.s(v,'requestType')='wholesaler' or v ? 'wholesalers') then
        return saip_private.command_before_order_payment(command,args,operation_id);
      end if;
      v := saip_private.wholesaler_change_values(v);
      n := saip_private.apply_wholesaler_change(r, v);
      perform saip_private.validate_request(n,(r->>'retailerId')::uuid);
      perform saip_private.finish(n);
      rows := saip_private.stored_wholesaler_rows(v, true);
      held := saip_private.available(r);
      proposal_id := gen_random_uuid()::text;
      perform saip_private.put('proposals',proposal_id,jsonb_build_object(
        'requestId',i,
        'kind',kind,
        'values',v,
        'proposerId',actor_id,
        'status','pending',
        'held',held,
        'version',0,
        'createdAt',clock_timestamp(),
        'wholesalers',rows,
        'wholesalerNames',saip_private.wholesaler_names(rows)
      ),saip_private.pair(r));
      perform saip_private.save_request(i,r,r||jsonb_build_object(
        'proposalId',proposal_id,
        'held',saip_private.n(r,'held')+held
      ),'변경·취소·정정 협의를 요청했어요');
      result := proposal_id;
    end if;
  else
    p:=saip_private.get('proposals',i);
    r:=saip_private.request(p->>'requestId');
    if r->>'requestType' is distinct from 'wholesaler' then
      return saip_private.command_before_order_payment(command,args,operation_id);
    end if;
    v:=coalesce(p->'values','{}');
    kind:=p->>'kind';
    if (kind='cancel' and not (v ? 'wholesalerIndexes'))
      or (kind='change' and not (saip_private.s(v,'requestType')='wholesaler' or v ? 'wholesalers'))
      or kind not in ('change','cancel') then
      return saip_private.command_before_order_payment(command,args,operation_id);
    end if;
    perform saip_private.version(p,saip_private.n(args,'version'));
    rid:=p->>'requestId';
    if p->>'status' <> 'pending' or r->>'proposalId' <> i then
      raise exception '이미 처리한 변경안이에요.';
    end if;
    if p->>'proposerId' = actor_id and approved then
      raise exception '상대방이 확인해야 확정할 수 있어요.';
    end if;
    n := r || jsonb_build_object(
      'proposalId','',
      'held', greatest(0, saip_private.n(r,'held') - saip_private.n(p,'held'))
    );
    if approved then
      if kind='cancel' then
        if saip_private.n(r,'delivered') > 0 or saip_private.n(r,'received') > 0 then
          raise exception '전달이 시작된 도매처형 요청은 취소할 수 없어요.';
        end if;
        active_rows := saip_private.stored_wholesaler_rows(r);
        indexes := saip_private.sanitize_wholesaler_cancel_indexes(v, jsonb_array_length(active_rows));
        selected_rows := saip_private.select_wholesaler_rows(active_rows, indexes);
        remaining_rows := saip_private.remove_wholesaler_rows(active_rows, indexes);
        n := saip_private.apply_wholesaler_rows(n, remaining_rows) || jsonb_build_object(
          'cancelledWholesalers', saip_private.append_cancelled_wholesaler_snapshots(
            r,
            selected_rows,
            indexes,
            btrim(coalesce(v->>'reason','')),
            actor,
            i,
            clock_timestamp()
          )
        );
        if jsonb_array_length(remaining_rows) = 0 then
          cancelled_quantity := greatest(0, saip_private.n(r,'quantity') - saip_private.n(r,'cancelled'));
          outstanding_acquired := greatest(0, saip_private.n(r,'acquired') - saip_private.n(r,'acquiredCancelled') - saip_private.n(r,'delivered'));
          n := n || jsonb_build_object(
            'cancelled', saip_private.n(r,'cancelled') + cancelled_quantity,
            'acquiredCancelled', saip_private.n(r,'acquiredCancelled') + least(cancelled_quantity, outstanding_acquired)
          );
          if saip_private.remaining(n) = 0 then
            n := n || '{"needsReply":false,"recheck":""}'::jsonb;
          end if;
        end if;
      else
        n := saip_private.apply_wholesaler_change(n, v);
        perform saip_private.validate_request(n,(r->>'retailerId')::uuid);
        if saip_private.remaining(n) > 0 and saip_private.b(r,'resultShared') then
          n := n || '{"needsReply":true}'::jsonb;
        end if;
      end if;
    end if;
    perform saip_private.put('proposals',i,p||jsonb_build_object(
      'status', case when approved then 'approved' when p->>'proposerId'=actor_id then 'withdrawn' else 'rejected' end,
      'version', saip_private.n(p,'version') + 1,
      'resolvedBy', actor_id
    ), saip_private.pair(r));
    perform saip_private.save_request(rid,r,n,case when approved then '협의한 변경·취소·정정을 확정했어요' else '변경·취소·정정안을 종료했어요' end);
  end if;

  insert into saip_private.operations(actor,id,payload,result)
  values(actor,operation_id,payload,coalesce(result,''));
  return result;
end $$;

revoke all on function saip_private.normalize_wholesaler_payment_mode(text) from public,anon,authenticated;
revoke all on function saip_private.normalize_wholesaler_row(jsonb) from public,anon,authenticated;
revoke all on function saip_private.stored_wholesaler_rows(jsonb,boolean) from public,anon,authenticated;
revoke all on function saip_private.wholesaler_names(jsonb) from public,anon,authenticated;
revoke all on function saip_private.apply_wholesaler_rows(jsonb,jsonb) from public,anon,authenticated;
revoke all on function saip_private.apply_wholesaler_change(jsonb,jsonb) from public,anon,authenticated;
revoke all on function saip_private.sanitize_wholesaler_cancel_indexes(jsonb,integer) from public,anon,authenticated;
revoke all on function saip_private.select_wholesaler_rows(jsonb,integer[]) from public,anon,authenticated;
revoke all on function saip_private.remove_wholesaler_rows(jsonb,integer[]) from public,anon,authenticated;
revoke all on function saip_private.append_cancelled_wholesaler_snapshots(jsonb,jsonb,integer[],text,uuid,text,timestamptz) from public,anon,authenticated;
revoke all on function saip_private.wholesaler_change_values(jsonb) from public,anon,authenticated;
revoke all on function saip_private.validate_wholesaler_change(jsonb) from public,anon,authenticated;
revoke all on function saip_private.saip_command(text,jsonb,text) from public,anon,authenticated;
