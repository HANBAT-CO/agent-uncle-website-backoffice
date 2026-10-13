-- Server owns all business mutations. Clients can only read authorized rows
-- and invoke validated commands; auth.uid() is never supplied by the client.
create schema if not exists saip_private;
revoke all on schema saip_private from public, anon, authenticated;

create table public.saip_records (
  collection text not null check (collection in ('accounts','signupProgress','connections','drafts','requests','deliveries','receipts','events','proposals','issues','messages','notices','attachments')),
  id text not null,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  readers uuid[] not null,
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);
create index saip_records_readers on public.saip_records using gin(readers);
create index saip_records_request on public.saip_records(collection, (data->>'requestId'));
create unique index saip_account_code on public.saip_records((data->>'code')) where collection = 'accounts';
alter table public.saip_records enable row level security;
revoke all on public.saip_records from anon, authenticated;
grant select on public.saip_records to authenticated;
create policy participant_read on public.saip_records for select to authenticated using ((select auth.uid()) = any(readers));

create table saip_private.operations (
  actor uuid not null references auth.users(id),
  id text not null,
  payload jsonb not null,
  result text not null,
  created_at timestamptz not null default now(),
  primary key (actor,id)
);

create function saip_private.n(j jsonb, k text) returns integer language sql immutable set search_path = '' as $$
  select coalesce((j->>k)::integer,0)
$$;
create function saip_private.s(j jsonb, k text) returns text language sql immutable set search_path = '' as $$
  select coalesce(j->>k,'')
$$;
create function saip_private.b(j jsonb, k text) returns boolean language sql immutable set search_path = '' as $$
  select coalesce((j->>k)::boolean,false)
$$;
create function saip_private.pick(j jsonb, keys text[]) returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(key,value),'{}') from jsonb_each(j) where key = any(keys)
$$;
create function saip_private.get(c text, i text) returns jsonb language plpgsql set search_path = '' as $$
declare r jsonb;
begin
  select data into r from public.saip_records where collection=c and id=i;
  if r is null then raise exception '기록을 찾을 수 없어요. 목록을 다시 확인해 주세요.'; end if;
  return r;
end $$;
create function saip_private.put(c text, i text, d jsonb, access uuid[]) returns void language sql set search_path = '' as $$
  insert into public.saip_records(collection,id,data,readers) values(c,i,d,access)
  on conflict(collection,id) do update set data=excluded.data,readers=excluded.readers,updated_at=clock_timestamp()
$$;
create function saip_private.version(r jsonb,v integer) returns void language plpgsql set search_path = '' as $$
begin
  if v is null or saip_private.n(r,'version') <> v then raise exception '다른 작업으로 내용이 변경됐어요. 최신 내용을 확인하고 다시 시도해 주세요.'; end if;
end $$;
create function saip_private.pair(r jsonb) returns uuid[] language sql immutable set search_path = '' as $$
  select array[(r->>'retailerId')::uuid,(r->>'uncleId')::uuid]
$$;
create function saip_private.request(i text, v integer default null) returns jsonb language plpgsql set search_path = '' as $$
declare r jsonb;
begin
  select data into r from public.saip_records where collection='requests' and id=i for update;
  if r is null or not auth.uid()=any(saip_private.pair(r)) then raise exception '이 요청을 볼 수 없어요.'; end if;
  if v is not null then perform saip_private.version(r,v); end if;
  return r;
end $$;
create function saip_private.role(r jsonb,role_name text) returns void language plpgsql set search_path = '' as $$
begin
  if saip_private.s(r,role_name||'Id') <> auth.uid()::text then raise exception '이 작업을 처리할 권한이 없어요.'; end if;
end $$;
create function saip_private.connected(a uuid,b uuid) returns boolean language sql stable set search_path = '' as $$
  select a<>b and exists(select 1 from public.saip_records where collection='connections' and readers @> array[a,b] and data->>'status'='accepted')
$$;
create function saip_private.accepted(r jsonb) returns void language plpgsql set search_path = '' as $$
begin
  if r->>'status'<>'accepted' then raise exception '진행 중인 요청에서 처리해 주세요.'; end if;
end $$;
create function saip_private.unheld(r jsonb) returns void language plpgsql set search_path = '' as $$
begin
  if saip_private.s(r,'proposalId')<>'' then raise exception '진행 중인 변경·취소 협의를 먼저 처리해 주세요.'; end if;
end $$;
create function saip_private.available(r jsonb) returns integer language sql immutable set search_path = '' as $$
  select saip_private.n(r,'acquired')-saip_private.n(r,'acquiredCancelled')-saip_private.n(r,'delivered')-saip_private.n(r,'held')
$$;
create function saip_private.remaining(r jsonb) returns integer language sql immutable set search_path = '' as $$
  select saip_private.n(r,'quantity')-saip_private.n(r,'cancelled')-saip_private.n(r,'acquired')+saip_private.n(r,'acquiredCancelled')
$$;
create function saip_private.finish(r jsonb) returns jsonb language plpgsql set search_path = '' as $$
declare q integer:=saip_private.n(r,'quantity'); a integer:=saip_private.n(r,'acquired'); d integer:=saip_private.n(r,'delivered');
  recv integer:=saip_private.n(r,'received'); c integer:=saip_private.n(r,'cancelled'); ac integer:=saip_private.n(r,'acquiredCancelled'); h integer:=saip_private.n(r,'held');
begin
  if q<=0 or c<0 or recv<0 or recv>d or d>a or ac<0 or ac>c or ac+d>a or h<0 or h>a-ac-d or c>q or q-c<a-ac or saip_private.n(r,'openIssues')<0 then
    raise exception '확보·전달·수령·취소 수량을 다시 확인해 주세요.';
  end if;
  if r->>'status' in ('rejected','pending') then return r; end if;
  if saip_private.n(r,'openIssues')=0 and saip_private.s(r,'proposalId')='' and saip_private.remaining(r)=0 and recv=q-c and d=q-c then
    return r||jsonb_build_object('status',case when q=c then 'cancelled' else 'completed' end);
  end if;
  return r||'{"status":"accepted"}';
end $$;
create function saip_private.notice(owner uuid,title text,kind text,target text,req text default '') returns void language sql set search_path = '' as $$
  select saip_private.put('notices',gen_random_uuid()::text,jsonb_build_object('ownerId',owner,'title',title,'kind',kind,'targetId',target,'requestId',req,'read',false,'createdAt',clock_timestamp()),array[owner])
$$;
create function saip_private.event(i text,before_value jsonb,after_value jsonb,title text,kind text default 'request',target text default '') returns void language plpgsql set search_path = '' as $$
declare eid text:=gen_random_uuid()::text; actor uuid:=auth.uid(); peer uuid;
begin
  peer:=case when after_value->>'retailerId'=actor::text then (after_value->>'uncleId')::uuid else (after_value->>'retailerId')::uuid end;
  perform saip_private.put('events',eid,jsonb_build_object('requestId',i,'actorId',actor,'title',title,'before',before_value,'after',after_value,'createdAt',clock_timestamp()),array[actor,peer]);
  perform saip_private.put('messages',eid,jsonb_build_object('senderId',actor,'recipientId',peer,'body',title,'requestId',i,'system',true,'status','sent','read',false,'createdAt',clock_timestamp()),array[actor,peer]);
  perform saip_private.notice(peer,title,kind,case when target='' then i else target end,i);
end $$;
create function saip_private.save_request(i text,old jsonb,next_value jsonb,title text,kind text default 'request',target text default '') returns void language plpgsql set search_path = '' as $$
declare r jsonb;
begin
  r:=saip_private.finish(next_value)||jsonb_build_object('version',saip_private.n(old,'version')+1,'updatedAt',clock_timestamp());
  perform saip_private.put('requests',i,r,saip_private.pair(r));
  perform saip_private.event(i,old,r,title,kind,target);
end $$;
create function saip_private.request_fields(j jsonb) returns jsonb language sql immutable set search_path = '' as $$
  select saip_private.pick(j,array['uncleId','wholesaler','location','product','option','quantity','address','addressDetail','note','photos'])
$$;
create function saip_private.owned_attachment(i text,owner uuid) returns void language plpgsql set search_path = '' as $$
begin
  if saip_private.get('attachments',i)->>'ownerId' <> owner::text then raise exception '본인이 첨부한 파일을 선택해 주세요.'; end if;
end $$;
create function saip_private.validate_request(r jsonb,owner uuid) returns void language plpgsql set search_path = '' as $$
declare k text; a text;
begin
  foreach k in array array['uncleId','wholesaler','location','product','option','address','addressDetail'] loop
    if btrim(saip_private.s(r,k))='' then raise exception '담당자·도매처·상품·옵션·배송지 필수 항목을 입력해 주세요.'; end if;
  end loop;
  if saip_private.n(r,'quantity')<=0 or not saip_private.connected(owner,(r->>'uncleId')::uuid) then raise exception '수량과 연결된 사입삼촌을 확인해 주세요.'; end if;
  for a in select jsonb_array_elements_text(coalesce(r->'photos','[]')) loop perform saip_private.owned_attachment(a,owner); end loop;
end $$;
create function saip_private.add_issue(i text,r jsonb,v jsonb) returns jsonb language plpgsql set search_path = '' as $$
declare h integer:=saip_private.n(v,'held');
begin
  if h<0 or h>saip_private.available(r) then raise exception '보류할 확보 수량을 확인해 주세요.'; end if;
  perform saip_private.put('issues',gen_random_uuid()::text,saip_private.pick(v,array['reason','actual','deliveryId','held'])||jsonb_build_object('requestId',i,'reporterId',auth.uid(),'status','open','version',0,'createdAt',clock_timestamp()),saip_private.pair(r));
  return r||jsonb_build_object('held',saip_private.n(r,'held')+h,'openIssues',saip_private.n(r,'openIssues')+1);
end $$;

-- Full profiles and business documents are private. Partner projections contain
-- only fields needed for a trade, never business numbers, consent or auth data.
create function saip_private.public_profile(j jsonb,connected boolean default false) returns jsonb language sql immutable set search_path = '' as $$
 select saip_private.pick(j,array['name','role','complete','photoId','pickupArea','deliveryArea','deadline','holiday','intro','working'] || case when connected then array['contact','phone','address','addressDetail','deliveryNote'] else array[]::text[] end)
$$;
create function public.saip_lookup_code(code text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.saip_records; me jsonb; existing text;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요.'; end if;
  me:=saip_private.get('accounts',auth.uid()::text);
  select * into p from public.saip_records where collection='accounts' and data->>'code'=upper(btrim(code));
  if p.id is null then raise exception '초대 코드를 다시 확인해 주세요.'; end if;
  if p.id=auth.uid()::text or p.data->>'role'=me->>'role' then raise exception '다른 역할의 상대방 코드를 입력해 주세요.'; end if;
  if not saip_private.b(p.data,'complete') then raise exception '상대방이 아직 가입을 완료하지 않았어요.'; end if;
  if (p.data->>'codeExpires')::timestamptz<now() then raise exception '만료된 코드예요. 상대방에게 새 코드를 요청해 주세요.'; end if;
  select data->>'status' into existing from public.saip_records where collection='connections' and readers @> array[auth.uid(),p.id::uuid] and data->>'status' in ('accepted','pending');
  if existing is not null then raise exception '이미 연결되었거나 수락 대기 중이에요.'; end if;
  return jsonb_build_object('id',p.id,'data',saip_private.public_profile(p.data));
end $$;

create function public.saip_snapshot() returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb:='{}'::jsonb; c text; rows jsonb; p record;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요.'; end if;
  foreach c in array array['accounts','signupProgress','connections','drafts','requests','deliveries','receipts','events','proposals','issues','messages','notices','attachments'] loop
    select coalesce(jsonb_object_agg(id,data),'{}') into rows from public.saip_records where collection=c and auth.uid()=any(readers);
    result:=result||jsonb_build_object(c,rows);
  end loop;
  for p in select distinct a.id,a.data from public.saip_records a join public.saip_records c on c.collection='connections' and a.id=any(c.readers::text[])
    where a.collection='accounts' and a.id<>auth.uid()::text and auth.uid()=any(c.readers)
  loop
    result:=jsonb_set(result,array['accounts',p.id],saip_private.public_profile(p.data,saip_private.connected(auth.uid(),p.id::uuid)),true);
  end loop;
  select coalesce(jsonb_object_agg(id,saip_private.pick(data,array['ownerId','name','mime','size','createdAt'])),'{}'::jsonb) into rows
    from public.saip_records where collection='attachments' and public.saip_can_read_attachment(data->>'path');
  result:=jsonb_set(result,array['attachments'],rows);
  return result;
end $$;

-- Private bucket; sharing is derived from the current authorized request,
-- chat or connected profile. Knowing an attachment ID grants no access.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('saip-attachments','saip-attachments',false,10485760,array['image/jpeg','image/png','application/pdf']) on conflict(id) do nothing;
create function public.saip_can_read_attachment(path text) returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists (
  select 1 from public.saip_records a where a.collection='attachments' and a.data->>'path'=path and (
   a.data->>'ownerId'=auth.uid()::text or exists(
    select 1 from public.saip_records r where auth.uid()=any(r.readers) and (
     (r.collection='requests' and (r.data->'photos') ? a.id) or
     (r.collection='messages' and r.data->>'status'='sent' and (r.data->'attachments') ? a.id)
    )
   ) or exists(select 1 from public.saip_records p where p.collection='accounts' and p.data->>'photoId'=a.id and saip_private.connected(auth.uid(),p.id::uuid))
  )
 )
$$;
create policy attachment_insert on storage.objects for insert to authenticated with check (
 bucket_id='saip-attachments' and (storage.foldername(name))[1]=auth.uid()::text
);
create policy attachment_read on storage.objects for select to authenticated using (
 bucket_id='saip-attachments' and public.saip_can_read_attachment(name)
);
-- Only unregistered uploads may be removed (cleanup after a failed registration).
create policy attachment_cleanup on storage.objects for delete to authenticated using (
 bucket_id='saip-attachments' and (storage.foldername(name))[1]=auth.uid()::text
 and not exists(select 1 from public.saip_records where collection='attachments' and data->>'path'=name)
);

revoke all on all functions in schema saip_private from public,anon,authenticated;
revoke all on function public.saip_lookup_code(text), public.saip_snapshot(), public.saip_can_read_attachment(text) from public,anon;
grant execute on function public.saip_lookup_code(text), public.saip_snapshot(), public.saip_can_read_attachment(text) to authenticated;
-- Realtime never bypasses participant RLS.
alter publication supabase_realtime add table public.saip_records;

create function public.saip_attachment_path(attachment_id text) returns text language plpgsql security definer set search_path = '' as $$
declare path text;
begin
 select data->>'path' into path from public.saip_records where collection='attachments' and id=attachment_id;
 if not coalesce(public.saip_can_read_attachment(path),false) then raise exception '이 첨부파일을 볼 수 없어요.'; end if;
 return path;
end $$;
revoke all on function public.saip_attachment_path(text) from public,anon;
grant execute on function public.saip_attachment_path(text) to authenticated;
