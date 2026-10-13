-- 주문서는 도매처 1~10곳만 입력받고 수령지는 저장된 소매업자 정보로 채운다.
-- 기존 상품별 요청과 접수·전달·수령 처리의 권한/중복 전송 방지는 유지한다.
create or replace function saip_private.request_fields(j jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  result jsonb := saip_private.pick(j,array[
    'uncleId','requestType','wholesalers','wholesaler','location',
    'product','option','quantity','address','addressDetail','note','photos'
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
      entries := entries || jsonb_build_array(jsonb_build_object(
        'wholesaler',btrim(entry->>'wholesaler'),
        'location',btrim(entry->>'location')
      ));
    end loop;
    result := result || jsonb_build_object(
      'wholesalers',entries,
      'wholesaler',coalesce(entries->0->>'wholesaler',''),
      'location',coalesce(entries->0->>'location','')
    );
  end if;
  if j->>'requestType' = 'wholesaler' then
    -- 상품 수량 대신 요청 한 건으로 기존 상태 처리 흐름을 이어 간다.
    result := result || '{"product":"","option":"","quantity":1,"photos":[]}'::jsonb;
  end if;
  return result;
end $$;

create or replace function saip_private.validate_request(r jsonb,owner uuid)
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
        raise exception '도매처 %의 이름과 위치를 입력해 주세요.',entry_index;
      end if;
    end loop;
  end if;
  required_fields := case when r->>'requestType' = 'wholesaler'
    then array['uncleId','wholesaler','location']
    else array['uncleId','wholesaler','location','product','option','address','addressDetail']
  end;
  foreach k in array required_fields loop
    if btrim(saip_private.s(r,k)) = '' then
      raise exception '% 항목을 입력해 주세요.',case k
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

create or replace function saip_private.prepare_wholesaler_record()
returns trigger language plpgsql set search_path = '' as $$
declare profile jsonb; request_data jsonb; owner_id text;
begin
  if new.collection = 'deliveries' then
    select data into request_data from public.saip_records
      where collection = 'requests' and id = new.data->>'requestId';
    if request_data->>'requestType' = 'wholesaler' then
      new.data := new.data || saip_private.pick(request_data,
        array['requestType','wholesalers','wholesaler','location']);
    end if;
  elsif new.data->>'requestType' = 'wholesaler'
    and (new.collection = 'drafts' or new.data->>'status' = 'pending') then
    owner_id := case when new.collection = 'drafts'
      then new.data->>'ownerId' else new.data->>'retailerId' end;
    profile := saip_private.get('accounts',owner_id);
    new.data := new.data || jsonb_build_object(
      'address',saip_private.s(profile,'address'),
      'addressDetail',saip_private.s(profile,'addressDetail'),
      'note',saip_private.s(profile,'deliveryNote')
    );
  end if;
  return new;
end $$;

create trigger saip_prepare_wholesaler_record
before insert or update of data on public.saip_records
for each row when (new.collection in ('drafts','requests','deliveries'))
execute function saip_private.prepare_wholesaler_record();

-- 수령 확인 날짜는 이후 문제 처리나 일반 수정으로 밀리지 않게 별도로 보존한다.
create or replace function saip_private.save_request(
  i text,old jsonb,next_value jsonb,title text,kind text default 'request',target text default ''
) returns void language plpgsql set search_path = '' as $$
declare r jsonb;
begin
  r := saip_private.finish(next_value) || jsonb_build_object(
    'version',saip_private.n(old,'version')+1,'updatedAt',clock_timestamp()
  );
  if saip_private.n(r,'received') > saip_private.n(old,'received') then
    r := r || jsonb_build_object('receivedAt',clock_timestamp());
  end if;
  perform saip_private.put('requests',i,r,saip_private.pair(r));
  perform saip_private.event(i,old,r,title,kind,target);
end $$;

-- 이전 요청은 마지막 실제 수령 기록을 사용하고, 기록이 없으면 종료 시각을 사용한다.
update public.saip_records as request
set data = request.data || jsonb_build_object('receivedAt',coalesce(
  (select max(nullif(receipt.data->>'createdAt','')::timestamptz)
   from public.saip_records as receipt
   where receipt.collection = 'receipts'
     and receipt.data->>'requestId' = request.id
     and saip_private.n(receipt.data,'confirmed') > 0),
  nullif(request.data->>'updatedAt','')::timestamptz
))
where request.collection = 'requests'
  and request.data->>'status' = 'completed'
  and saip_private.n(request.data,'received') > 0
  and coalesce(request.data->>'receivedAt','') = '';

revoke all on function saip_private.prepare_wholesaler_record() from public,anon,authenticated;
