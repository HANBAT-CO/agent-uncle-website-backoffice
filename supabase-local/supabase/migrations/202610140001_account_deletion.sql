-- 탈퇴는 서비스 역할의 Edge Function만 시작한다. Storage 원본 제거 후
-- Auth 사용자 삭제 트랜잭션에서 앱 데이터도 함께 정리한다.
create table saip_private.account_deletions (
  account_id uuid primary key references auth.users(id) on delete cascade,
  started_at timestamptz not null default clock_timestamp()
);
revoke all on saip_private.account_deletions from public, anon, authenticated;

create function public.saip_account_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from auth.users where id=auth.uid())
    and not exists(select 1 from saip_private.account_deletions where account_id=auth.uid());
$$;
revoke all on function public.saip_account_active() from public, anon;
grant execute on function public.saip_account_active() to authenticated;

-- 기존 API를 비공개 스키마로 옮겨 권한 검사 없는 우회 호출을 막는다.
alter function public.saip_command(text,jsonb,text) set schema saip_private;
alter function public.saip_snapshot() set schema saip_private;
alter function public.saip_can_read_attachment(text) set schema saip_private;
alter function public.saip_check_phone_available(text) set schema saip_private;
alter function public.saip_search_partners(text,text,integer,integer,integer,integer) set schema saip_private;
alter function public.saip_lookup_code(text) set schema saip_private;
revoke all on all functions in schema saip_private from public, anon, authenticated;

create function public.saip_command(command text,args jsonb default '{}',operation_id text default '') returns text
language plpgsql security definer set search_path = '' as $$
begin
  -- 일반 명령끼리는 병렬 실행, 탈퇴 시작/완료만 배타적으로 실행한다.
  perform pg_advisory_xact_lock_shared(hashtextextended('saip-account-lifecycle',0));
  if not public.saip_account_active() then
    if command='bootstrap' and exists(select 1 from saip_private.account_deletions where account_id=auth.uid()) then
      return auth.uid()::text;
    end if;
    raise exception '탈퇴 중이거나 종료된 계정이에요.';
  end if;
  return saip_private.saip_command(command,args,operation_id);
end $$;

create function public.saip_snapshot() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare profile jsonb;
begin
  if exists(select 1 from saip_private.account_deletions where account_id=auth.uid()) then
    select data into profile from public.saip_records where collection='accounts' and id=auth.uid()::text;
    return jsonb_build_object('accounts',jsonb_build_object(auth.uid()::text,
      coalesce(profile,'{}')||'{"deletionPending":true}'));
  end if;
  if not public.saip_account_active() then raise exception '탈퇴 중이거나 종료된 계정이에요.'; end if;
  return saip_private.saip_snapshot();
end $$;

create function public.saip_can_read_attachment(path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.saip_account_active() and saip_private.saip_can_read_attachment(path);
$$;
create function public.saip_check_phone_available(phone text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요해요.'; end if;
  if not public.saip_account_active() then raise exception '탈퇴 중이거나 종료된 계정이에요.'; end if;
  return saip_private.saip_check_phone_available(phone);
end $$;
create function public.saip_lookup_code(code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.saip_account_active() then raise exception '탈퇴 중이거나 종료된 계정이에요.'; end if;
  return saip_private.saip_lookup_code(code);
end $$;
create function public.saip_search_partners(query text default '',region text default '',min_fee integer default null,
  max_fee integer default null,limit_count integer default 20,offset_count integer default 0)
returns table(id text,data jsonb) language plpgsql security definer set search_path = '' as $$
begin
  if not public.saip_account_active() then raise exception '탈퇴 중이거나 종료된 계정이에요.'; end if;
  return query select * from saip_private.saip_search_partners(query,region,min_fee,max_fee,limit_count,offset_count);
end $$;

-- 읽기 정책은 이전 함수 OID를 참조하므로 새 공개 래퍼에 다시 연결한다.
alter policy participant_read on public.saip_records using (
  (select public.saip_account_active()) and (select auth.uid())=any(readers)
);
alter policy attachment_read on storage.objects using (
  bucket_id='saip-attachments' and public.saip_can_read_attachment(name)
);
create function public.saip_can_upload_attachment() returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('saip-account-lifecycle',0));
  return public.saip_account_active();
end $$;
alter policy attachment_insert on storage.objects with check (
  bucket_id='saip-attachments' and (storage.foldername(name))[1]=auth.uid()::text
  and public.saip_can_upload_attachment()
);
alter policy attachment_cleanup on storage.objects using (
  bucket_id='saip-attachments' and (storage.foldername(name))[1]=auth.uid()::text
  and public.saip_account_active()
  and not exists(select 1 from public.saip_records where collection='attachments' and data->>'path'=name)
);

create function public.saip_begin_account_deletion(account_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('saip-account-lifecycle',0));
  insert into saip_private.account_deletions(account_id) values(account_id) on conflict do nothing;
  update public.saip_records set data=data||'{"deletionPending":true,"complete":false,"working":false}'
    where collection='accounts' and id=account_id::text;
  delete from public.saip_records where collection='connections' and account_id=any(readers);
end $$;
revoke all on function public.saip_begin_account_deletion(uuid) from public,anon,authenticated;
grant execute on function public.saip_begin_account_deletion(uuid) to service_role;

-- 등록 전 실패 파일과 하위 경로도 포함. 소유자 UUID prefix로만 범위를 제한한다.
create function public.saip_deletion_files(account_id uuid) returns table(name text)
language sql security definer set search_path = '' as $$
  select o.name from storage.objects o where o.bucket_id='saip-attachments'
    and split_part(o.name,'/',1)=account_id::text
    and exists(select 1 from saip_private.account_deletions d where d.account_id=saip_deletion_files.account_id)
  order by o.name limit 100;
$$;
revoke all on function public.saip_deletion_files(uuid) from public,anon,authenticated;
grant execute on function public.saip_deletion_files(uuid) to service_role;

create function saip_private.erase_deleted_account() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('saip-account-lifecycle',0));
  -- Storage 메타데이터를 직접 지우면 실제 파일이 남으므로 삭제를 거부한다.
  if exists(select 1 from storage.objects where bucket_id='saip-attachments' and split_part(name,'/',1)=old.id::text) then
    raise exception '첨부파일을 먼저 삭제해 주세요.';
  end if;
  delete from saip_private.operations where actor=old.id;
  delete from saip_private.phone_claim_conflicts where old.id=any(account_ids);
  delete from public.saip_records where
    (collection in ('accounts','signupProgress') and id=old.id::text)
    or (collection in ('drafts','notices','attachments') and data->>'ownerId'=old.id::text)
    or (collection='connections' and old.id=any(readers));
  update public.saip_records set data=data||jsonb_build_object(
    'body','','attachments','[]'::jsonb,'requestId','','deleted',true,
    'deletedAt',clock_timestamp(),'version',saip_private.n(data,'version')+1)
    where collection='messages' and data->>'senderId'=old.id::text
      and not saip_private.b(data,'system') and not saip_private.b(data,'deleted');
  -- 마지막 참여자까지 탈퇴한 기록은 보존할 상대방이 없다.
  delete from public.saip_records r where old.id=any(r.readers)
    and not exists(select 1 from auth.users u where u.id=any(r.readers) and u.id<>old.id);
  return old;
end $$;
revoke all on function saip_private.erase_deleted_account() from public,anon,authenticated;
create trigger saip_erase_deleted_account before delete on auth.users
for each row execute function saip_private.erase_deleted_account();

revoke all on function public.saip_command(text,jsonb,text), public.saip_snapshot(),
  public.saip_can_read_attachment(text), public.saip_check_phone_available(text),
  public.saip_lookup_code(text), public.saip_search_partners(text,text,integer,integer,integer,integer),
  public.saip_can_upload_attachment() from public,anon;
grant execute on function public.saip_command(text,jsonb,text), public.saip_snapshot(),
  public.saip_can_read_attachment(text), public.saip_check_phone_available(text),
  public.saip_lookup_code(text), public.saip_search_partners(text,text,integer,integer,integer,integer),
  public.saip_can_upload_attachment() to authenticated;
