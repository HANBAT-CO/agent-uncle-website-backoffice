-- 202610110006까지 적용된 운영 서버에 채팅 수정·삭제 명령만 먼저 제공한다.
-- 후속 거래처 마이그레이션과 독립적으로 배포하며 기존 함수의 다른 명령은 보존한다.
-- 202610130002까지 이미 적용된 개발 DB에서는 아무것도 변경하지 않는다.
do $migration$
declare
  current_body text;
  definition text;
  anchor text := '   elsif command=''markChatRead'' then';
  message_actions text := $actions$   elsif command in ('editMessage','deleteMessage') then
     -- 같은 메시지의 수정·삭제와 읽음 갱신을 행 잠금으로 직렬화한다.
     select data into r from public.saip_records
       where collection='messages' and id=i and actor=any(readers) for update;
     if not found or saip_private.s(r,'senderId')<>actor_id then
       raise exception '본인이 보낸 메시지만 수정하거나 삭제할 수 있어요.';
     end if;
     if saip_private.b(r,'deleted') then
       raise exception '이미 삭제된 메시지는 변경할 수 없어요.';
     end if;
     if saip_private.b(r,'system') or saip_private.s(r,'status')<>'sent' then
       raise exception '전송된 일반 메시지만 수정하거나 삭제할 수 있어요.';
     end if;
     perform saip_private.version(r,saip_private.n(args,'version'));
     if command='editMessage' then
       title:=btrim(saip_private.s(args,'body'));
       if title='' and coalesce(r->'attachments','[]')='[]' then
         raise exception '메시지 내용을 입력해 주세요.';
       end if;
       if length(title)>10000 then
         raise exception '메시지를 10,000자 이하로 나누어 보내 주세요.';
       end if;
       n:=r||jsonb_build_object('body',title,'editedAt',clock_timestamp(),
         'version',saip_private.n(r,'version')+1);
     else
       n:=r||jsonb_build_object('body','','attachments','[]'::jsonb,'requestId','',
         'deleted',true,'deletedAt',clock_timestamp(),
         'version',saip_private.n(r,'version')+1);
     end if;
     perform saip_private.put('messages',i,n,array[actor,(r->>'recipientId')::uuid]);
$actions$;
begin
  select prosrc, pg_get_functiondef(oid) into strict current_body, definition
    from pg_proc where oid='public.saip_command(text,jsonb,text)'::regprocedure;
  if position('''editMessage''' in current_body)>0
     and position('''deleteMessage''' in current_body)>0 then
    return;
  end if;
  -- 확인한 운영 버전과 다르면 덮어쓰지 않고 재검토하도록 중단한다.
  if md5(current_body)<>'f9c3dc3da3ccb6a39e4d7d105af256d1' then
    raise exception '채팅 명령 적용 전 서버 함수 버전을 다시 확인해 주세요.';
  end if;
  if (length(current_body)-length(replace(current_body,anchor,'')))/length(anchor)<>1 then
    raise exception '채팅 명령 삽입 위치를 확인해 주세요.';
  end if;
  execute replace(definition,anchor,message_actions||anchor);
end $migration$;
