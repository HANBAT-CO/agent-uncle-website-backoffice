-- 토큰과 발송 작업은 클라이언트 조회/Realtime에서 제외한다.
create table saip_private.push_devices (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  binding uuid not null,
  platform text not null check (platform in ('ios','android')),
  environment text not null check (environment in ('development','production')),
  token text not null,
  activity_secret_hash text,
  enabled boolean not null default true,
  live_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  unique(platform,environment,token)
);
create table saip_private.push_activities (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references saip_private.push_devices(id) on delete cascade,
  request_id text not null,
  token text,
  ended boolean not null default false,
  last_timestamp bigint not null default 0,
  expires_at timestamptz not null default now()+interval '8 hours',
  unique(device_id,request_id)
);
create table saip_private.push_outbox (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references saip_private.push_devices(id) on delete cascade,
  binding uuid not null,
  notice_id text,
  activity_id uuid references saip_private.push_activities(id) on delete cascade,
  state text not null default 'pending' check (state in ('pending','sending','accepted','skipped','dead')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '24 hours',
  lease uuid,
  lease_until timestamptz,
  sending_token text,
  sending_event text,
  last_error text,
  created_at timestamptz not null default now(),
  unique(device_id,notice_id)
);
create index push_outbox_due on saip_private.push_outbox(available_at) where state in ('pending','sending');
revoke all on saip_private.push_devices,saip_private.push_activities,saip_private.push_outbox from public,anon,authenticated;

create function public.saip_register_push(device jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare old_device saip_private.push_devices; actor uuid:=auth.uid(); sid uuid:=(auth.jwt()->>'session_id')::uuid;
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('saip-account-lifecycle',0));
  if not public.saip_account_active() or sid is null
    or not exists(select 1 from auth.sessions where id=sid and user_id=actor and (not_after is null or not_after>now())) then raise exception '로그인이 필요해요.'; end if;
  if coalesce(device->>'platform','') not in ('ios','android') or coalesce(device->>'environment','') not in ('development','production')
    or coalesce(length(device->>'token'),0) not between 16 and 4096
    or (device->>'platform'='ios' and coalesce(length(device->>'activitySecret'),0) not between 64 and 128)
    or (device->>'id')::uuid is null or (device->>'binding')::uuid is null then
    raise exception '알림 기기 정보를 확인해 주세요.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('push-device-'||(device->>'id'),0));
  select * into old_device from saip_private.push_devices where id=(device->>'id')::uuid;
  -- 같은 설치에서 다른 계정으로 전환할 때 이전 작업/Live Activity 연결을 폐기한다.
  if old_device.id is not null and (old_device.owner_id<>actor or old_device.binding<>(device->>'binding')::uuid) then
    delete from saip_private.push_devices where id=old_device.id;
  end if;
  delete from saip_private.push_devices where platform=device->>'platform' and environment=device->>'environment'
    and token=device->>'token' and id<>(device->>'id')::uuid;
  insert into saip_private.push_devices(id,owner_id,session_id,binding,platform,environment,token,activity_secret_hash,enabled,live_enabled)
    values((device->>'id')::uuid,actor,sid,(device->>'binding')::uuid,device->>'platform',device->>'environment',device->>'token',
      encode(extensions.digest(device->>'activitySecret','sha256'),'hex'),coalesce((device->>'enabled')::boolean,false),coalesce((device->>'liveEnabled')::boolean,false))
    on conflict(id) do update set session_id=excluded.session_id,token=excluded.token,activity_secret_hash=excluded.activity_secret_hash,
      platform=excluded.platform,environment=excluded.environment,
      enabled=excluded.enabled,live_enabled=excluded.live_enabled,updated_at=now();
  if not coalesce((device->>'liveEnabled')::boolean,false) then
    insert into saip_private.push_outbox(device_id,binding,activity_id,expires_at)
      select a.device_id,(device->>'binding')::uuid,a.id,now()+interval '1 hour'
      from saip_private.push_activities a where a.device_id=(device->>'id')::uuid and not a.ended;
  end if;
end $$;

create function public.saip_unregister_push(device_id uuid,binding_id uuid) returns void
language sql security definer set search_path = '' as $$
  delete from saip_private.push_devices where id=device_id and binding=binding_id and owner_id=auth.uid();
$$;

-- 사용자가 앱에서 시작한 요청만 토큰을 등록할 수 있다.
create function public.saip_prepare_activity(device_id uuid,binding_id uuid,request_id text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.saip_account_active() or not exists(select 1 from saip_private.push_devices d where d.id=device_id
    and d.binding=binding_id and d.owner_id=auth.uid() and d.platform='ios' and d.live_enabled)
    or not exists(select 1 from public.saip_records r where r.collection='requests' and r.id=request_id and auth.uid()=any(r.readers)
      and r.data->>'status'='accepted') then raise exception '진행 상황 알림을 등록할 수 없어요.'; end if;
  insert into saip_private.push_activities as a(device_id,request_id) values(device_id,request_id)
    on conflict on constraint push_activities_device_id_request_id_key do update set
      token=case when a.ended or a.expires_at<=now() then null else a.token end,
      expires_at=case when a.ended or a.expires_at<=now() then now()+interval '8 hours' else a.expires_at end,ended=false;
end $$;

-- 백그라운드 토큰 교체 전용 권한: 로그인 토큰/갱신 토큰을 네이티브에 복제하지 않는다.
-- 이 비밀값은 Keychain에 저장하며, 이미 준비한 활동의 토큰 등록 외에는 아무 권한도 없다.
create function public.saip_activity_token(device_id uuid,binding_id uuid,capability text,request_id text,token text,ended boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare activity uuid; d saip_private.push_devices;
begin
  select * into d from saip_private.push_devices where id=device_id and binding=binding_id and platform='ios'
    and activity_secret_hash=encode(extensions.digest(capability,'sha256'),'hex') and updated_at>now()-interval '30 days';
  if d.id is null or not exists(select 1 from auth.sessions where id=d.session_id and user_id=d.owner_id and (not_after is null or not_after>now()))
    or exists(select 1 from saip_private.account_deletions where account_id=d.owner_id)
    or coalesce(length(token),0) not between 16 and 4096 then raise exception '활동을 확인할 수 없어요.'; end if;
  update saip_private.push_activities a set token=saip_activity_token.token,ended=saip_activity_token.ended
    where a.device_id=d.id and a.request_id=saip_activity_token.request_id and not a.ended and a.expires_at>now()
      and (not saip_activity_token.ended or a.token=saip_activity_token.token)
    returning id into activity;
  if activity is null then return; end if;
  insert into saip_private.push_outbox(device_id,binding,activity_id,expires_at)
    values(d.id,d.binding,activity,now()+interval '8 hours');
  perform pg_notify('saip_push','ready');
end $$;

create function saip_private.enqueue_push() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.collection='notices' and TG_OP='INSERT' then
    insert into saip_private.push_outbox(device_id,binding,notice_id)
      select id,binding,new.id from saip_private.push_devices where owner_id::text=new.data->>'ownerId' and enabled;
  elsif new.collection='requests' then
    if TG_OP='UPDATE' and old.data=new.data and old.readers=new.readers then return new; end if;
    insert into saip_private.push_outbox(device_id,binding,activity_id,expires_at)
      select a.device_id,d.binding,a.id,a.expires_at+interval '1 hour' from saip_private.push_activities a
      join saip_private.push_devices d on d.id=a.device_id
      where a.request_id=new.id and not a.ended and a.expires_at>now();
  elsif new.collection='accounts' and TG_OP='UPDATE' and new.data->>'deletionPending'='true' then
    delete from saip_private.push_devices where owner_id::text=new.id;
  end if;
  perform pg_notify('saip_push','ready');
  return new;
end $$;
create trigger saip_enqueue_push after insert or update on public.saip_records
  for each row when (new.collection in ('notices','requests','accounts')) execute function saip_private.enqueue_push();

-- 발송 직전에도 권한/설정을 재검사한다. 알림 본문에는 채팅 원문을 넣지 않는다.
create function saip_private.push_payload(job saip_private.push_outbox) returns jsonb
language plpgsql set search_path = '' as $$
declare d saip_private.push_devices; a saip_private.push_activities; n jsonb; r jsonb; profile jsonb;
  ending boolean; body text; state jsonb; result jsonb; kind text; target text; preference text;
begin
  select * into d from saip_private.push_devices where id=job.device_id;
  if d.id is null or d.binding<>job.binding or not exists(select 1 from auth.sessions where id=d.session_id and user_id=d.owner_id and (not_after is null or not_after>now()))
    or exists(select 1 from saip_private.account_deletions where account_id=d.owner_id) then return null; end if;
  select data into profile from public.saip_records where collection='accounts' and id=d.owner_id::text;
  if profile is null then return null; end if;
  result:=jsonb_build_object('id',job.id,'platform',d.platform,'environment',d.environment,'token',d.token,
    'ownerId',d.owner_id,'binding',d.binding,'expiresAt',extract(epoch from job.expires_at)::bigint);
  if job.activity_id is not null then
    select * into a from saip_private.push_activities where id=job.activity_id;
    if a.ended then return null; end if;
    select data into r from public.saip_records where collection='requests' and id=a.request_id and d.owner_id=any(readers);
    ending:=r is null or not d.live_enabled or a.expires_at<=now() or r->>'status' in ('completed','cancelled','rejected');
    if a.token is null then return null; end if;
    body:=case when ending then '사입 종료' when coalesce((r->>'needsReply')::boolean,false) then '확인 필요'
      when saip_private.n(r,'delivered')>saip_private.n(r,'received') then '전달 완료 · 수령 대기'
      when saip_private.n(r,'acquired')-saip_private.n(r,'acquiredCancelled')>saip_private.n(r,'delivered') then '상품 확보 · 전달 대기'
      else '사입 진행 중' end;
    state:=jsonb_build_object('status',body,'acquired',greatest(0,saip_private.n(r,'acquired')-saip_private.n(r,'acquiredCancelled')),
      'total',greatest(0,saip_private.n(r,'quantity')-saip_private.n(r,'cancelled')),'ended',ending);
    return result||jsonb_build_object('type','live','token',a.token,'activityId',a.id,
      'requestId',a.request_id,'event',case when ending then 'end' else 'update' end,
      'contentState',state,'timestamp',floor(extract(epoch from clock_timestamp()))::bigint);
  end if;
  if not d.enabled then return null; end if;
  select data into n from public.saip_records where collection='notices' and id=job.notice_id and d.owner_id=any(readers);
  kind:=n->>'kind'; target:=n->>'targetId';
  preference:=case kind when 'colleague' then 'connection' when 'handoff' then 'delivery'
    when 'team' then 'request' when 'invoice' then 'request' else kind end;
  if n is null or coalesce((n->>'read')::boolean,false) or profile->'notificationSettings'->>preference='false' then return null; end if;
  if kind='chat' then
    if not exists(select 1 from public.saip_records where collection='accounts' and id=target)
      or exists(select 1 from public.saip_records where collection='chatBlocks' and readers @> array[d.owner_id,target::uuid]
        and data->>'blocked'='true') then return null; end if;
  elsif not exists(select 1 from public.saip_records where id in (target,n->>'requestId') and d.owner_id=any(readers)
    and collection in ('requests','connections','deliveries','invoices','teams','teamJobs','teamHandoffs','colleagueConnections','teamInvites')) then return null;
  end if;
  return result||jsonb_build_object('type','notice','noticeId',job.notice_id,'kind',kind,'targetId',target,
    'requestId',coalesce(n->>'requestId',''),'title','사입삼춘','body',case kind when 'chat' then '새 메시지가 도착했어요.'
      when 'connection' then '거래처 연결 소식이 있어요.' when 'delivery' then '전달·수령 상태를 확인해 주세요.' else '사입 업무에 새 소식이 있어요.' end);
end $$;

create function public.saip_claim_push(batch_size integer default 20) returns setof jsonb
language plpgsql security definer set search_path = '' as $$
declare job saip_private.push_outbox; payload jsonb; claim uuid;
begin
  update saip_private.push_outbox set state='dead',last_error='expired' where state in ('pending','sending') and expires_at<=now();
  for job in select o.* from saip_private.push_outbox o where
    ((o.state='pending' and o.available_at<=now()) or (o.state='sending' and o.lease_until<now()))
    and o.attempts<8 and o.expires_at>now()
    and not exists(select 1 from saip_private.push_outbox busy where busy.device_id=o.device_id and busy.state='sending' and busy.lease_until>=now())
    order by o.created_at limit least(greatest(batch_size,1),50) for update skip locked
  loop
    if not pg_try_advisory_xact_lock(hashtextextended('push-claim-'||job.device_id::text,0)) then continue; end if;
    -- 한 배치에서도 같은 기기의 Live Activity 갱신을 직렬화한다.
    if exists(select 1 from saip_private.push_outbox busy where busy.device_id=job.device_id and busy.state='sending' and busy.lease_until>=now()) then continue; end if;
    payload:=saip_private.push_payload(job);
    if payload is null then update saip_private.push_outbox set state='skipped' where id=job.id; continue; end if;
    if job.activity_id is not null then
      if exists(select 1 from saip_private.push_activities where id=job.activity_id and last_timestamp >= (payload->>'timestamp')::bigint) then
        update saip_private.push_outbox set available_at=clock_timestamp()+interval '1 second',state='pending',lease_until=null where id=job.id;
        continue;
      end if;
      update saip_private.push_activities set last_timestamp=(payload->>'timestamp')::bigint where id=job.activity_id;
    end if;
    claim:=gen_random_uuid();
    update saip_private.push_outbox set state='sending',lease=claim,lease_until=now()+interval '60 seconds',attempts=attempts+1,
      sending_token=payload->>'token',sending_event=payload->>'event' where id=job.id;
    return next payload||jsonb_build_object('lease',claim,'attempt',job.attempts+1);
  end loop;
  update saip_private.push_outbox set state='dead',last_error='attempt_limit' where state='sending' and lease_until<now() and attempts>=8;
end $$;

-- 워커가 매시간 호출한다. 토큰/작업 이력을 무기한 보관하지 않는다.
create function public.saip_prune_push() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from saip_private.push_outbox where state in ('accepted','skipped','dead') and created_at<now()-interval '30 days';
  delete from saip_private.push_activities where expires_at<now()-interval '2 days';
  delete from saip_private.push_devices d where updated_at<now()-interval '90 days'
    or not exists(select 1 from auth.sessions where id=d.session_id and user_id=d.owner_id and (not_after is null or not_after>now()));
end $$;

create function public.saip_finish_push(job_id uuid,claim_id uuid,outcome text,error_code text default '',retry_seconds integer default 30) returns void
language plpgsql security definer set search_path = '' as $$
declare job saip_private.push_outbox;
begin
  select * into job from saip_private.push_outbox where id=job_id and lease=claim_id and state='sending' for update;
  if not found then return; end if;
  if outcome not in ('accepted','retry','dead','invalid') then raise exception 'invalid outcome'; end if;
  update saip_private.push_outbox set state=case when outcome='retry' and attempts<8 then 'pending' when outcome='accepted' then 'accepted' else 'dead' end,
    available_at=now()+make_interval(secs=>least(greatest(retry_seconds,1),3600)),lease_until=null,last_error=left(error_code,100) where id=job_id;
  if job.activity_id is not null then
    if outcome='invalid' or (outcome='accepted' and job.sending_event='end') then
      update saip_private.push_activities set ended=true where id=job.activity_id and token=job.sending_token;
    elsif outcome='accepted' then
      update saip_private.push_outbox set state='skipped' where activity_id=job.activity_id and state='pending' and created_at<=job.created_at;
      -- APNs timestamp가 같은 초에 겹치지 않게 한다. 다음 발송도 최신 DB 상태로 만든다.
      update saip_private.push_outbox set available_at=greatest(available_at,now()+interval '1 second')
        where activity_id=job.activity_id and state='pending';
    end if;
  elsif outcome='invalid' then update saip_private.push_devices set enabled=false where id=job.device_id and binding=job.binding and token=job.sending_token;
  end if;
end $$;

revoke all on function saip_private.enqueue_push(),saip_private.push_payload(saip_private.push_outbox) from public,anon,authenticated;
revoke all on function public.saip_register_push(jsonb),public.saip_unregister_push(uuid,uuid),public.saip_prepare_activity(uuid,uuid,text) from public,anon;
grant execute on function public.saip_register_push(jsonb),public.saip_unregister_push(uuid,uuid),public.saip_prepare_activity(uuid,uuid,text) to authenticated;
revoke all on function public.saip_activity_token(uuid,uuid,text,text,text,boolean) from public;
grant execute on function public.saip_activity_token(uuid,uuid,text,text,text,boolean) to anon,authenticated;
revoke all on function public.saip_claim_push(integer),public.saip_finish_push(uuid,uuid,text,text,integer),public.saip_prune_push() from public,anon,authenticated;
grant execute on function public.saip_claim_push(integer),public.saip_finish_push(uuid,uuid,text,text,integer),public.saip_prune_push() to service_role;
