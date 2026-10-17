-- 차단 상태도 참여자에게만 전달하여 기존 Realtime / snapshot 갱신을 사용한다.
alter table public.saip_records drop constraint saip_records_collection_check;
alter table public.saip_records add constraint saip_records_collection_check check (
  collection in ('accounts','signupProgress','connections','drafts','requests',
    'deliveries','receipts','events','proposals','issues','messages','notices','attachments','chatBlocks')
);

alter function saip_private.saip_snapshot() rename to snapshot_before_chat_blocks;
create function saip_private.saip_snapshot() returns jsonb
language sql stable set search_path = '' as $$
  select saip_private.snapshot_before_chat_blocks() || jsonb_build_object('chatBlocks',
    (select coalesce(jsonb_object_agg(id,data),'{}') from public.saip_records
     where collection='chatBlocks' and auth.uid()=any(readers)));
$$;

-- 공개 API의 계정 탈퇴 검사와 생명주기 잠금을 유지한다.
alter function saip_private.saip_command(text,jsonb,text) rename to command_before_chat_blocks;
create function saip_private.saip_command(command text,args jsonb default '{}',operation_id text default '')
returns text language plpgsql set search_path = '' as $$
declare
  actor uuid := auth.uid(); peer uuid; block_id text; message jsonb; prior record;
  payload jsonb := jsonb_build_object('command',command,'args',args);
begin
  if command not in ('setChatBlocked','sendMessage','editMessage') then
    return saip_private.command_before_chat_blocks(command,args,operation_id);
  end if;
  if actor is null then raise exception '로그인이 필요해요.'; end if;
  if operation_id is null or operation_id='' or length(operation_id)>200
    or args is null or jsonb_typeof(args)<>'object' or octet_length(args::text)>262144 then
    raise exception '작업 정보를 확인해 주세요.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('saip-actor-'||actor::text,0));
  select * into prior from saip_private.operations o where o.actor=auth.uid() and o.id=operation_id;
  if found then
    if prior.payload<>payload then raise exception '같은 작업 번호로 다른 내용을 전송할 수 없어요.'; end if;
    return prior.result;
  end if;
  if command='editMessage' then
    select data into message from public.saip_records
      where collection='messages' and id=args->>'id' and data->>'senderId'=actor::text;
    if message is null then raise exception '본인이 보낸 메시지만 수정할 수 있어요.'; end if;
    peer := (message->>'recipientId')::uuid;
  else
    peer := (args->>'peerId')::uuid;
  end if;
  if peer is null or peer=actor then raise exception '대화 상대방을 확인해 주세요.'; end if;
  -- 양쪽 계정의 차단/해제/전송/수정을 동일한 쌍의 잠금으로 직렬화한다.
  perform pg_advisory_xact_lock(hashtextextended('saip-chat-'||least(actor::text,peer::text)||':'||greatest(actor::text,peer::text),0));
  if command='setChatBlocked' then
    if jsonb_typeof(args->'blocked') is distinct from 'boolean' then
      raise exception '차단 여부를 확인해 주세요.';
    end if;
    block_id := actor::text||':'||peer::text;
    perform saip_private.get('accounts',actor::text);
    perform saip_private.get('accounts',peer::text);
    if not saip_private.connected(actor,peer) and not exists(
      select 1 from public.saip_records where collection='chatBlocks' and id=block_id
    ) then raise exception '연결된 상대방만 차단할 수 있어요.'; end if;
    perform saip_private.put('chatBlocks',block_id,jsonb_build_object(
      'ownerId',actor,'peerId',peer,'blocked',args->'blocked','createdAt',clock_timestamp()
    ),array[actor,peer]);
    insert into saip_private.operations(actor,id,payload,result) values(actor,operation_id,payload,block_id);
    return block_id;
  end if;
  if exists(select 1 from public.saip_records where collection='chatBlocks'
    and id in (actor::text||':'||peer::text,peer::text||':'||actor::text)
    and saip_private.b(data,'blocked')) then
    raise exception '차단된 대화에서는 메시지를 보내거나 수정할 수 없어요.';
  end if;
  return saip_private.command_before_chat_blocks(command,args,operation_id);
end $$;

-- 탈퇴한 계정이 남긴 차단 정보도 함께 정리한다.
create function saip_private.erase_chat_blocks() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.saip_records where collection='chatBlocks' and old.id=any(readers);
  return old;
end $$;
create trigger saip_erase_chat_blocks after delete on auth.users
for each row execute function saip_private.erase_chat_blocks();

revoke all on function saip_private.saip_snapshot(), saip_private.saip_command(text,jsonb,text),
  saip_private.snapshot_before_chat_blocks(), saip_private.command_before_chat_blocks(text,jsonb,text),
  saip_private.erase_chat_blocks() from public, anon, authenticated;
