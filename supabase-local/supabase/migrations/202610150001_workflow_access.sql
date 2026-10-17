-- 현장 업무 명령은 기존 계정 생명주기 잠금 안에서 실행한다.
-- 동일 작업 번호의 재시도는 정확히 같은 입력만 허용한다.
alter table public.saip_records drop constraint saip_records_collection_check;
alter table public.saip_records add constraint saip_records_collection_check check (
  collection in ('accounts','signupProgress','connections','drafts','requests',
    'deliveries','receipts','events','proposals','issues','messages','notices','attachments','chatBlocks',
    'fieldPayments','supplierPaymentAllocations','supplierRefunds',
    'invoices','invoiceAdjustments','invoiceReceipts','invoiceInquiries','reimbursements',
    'colleagueConnections','teams','teamInvites','teamChats','teamRounds','teamAreas',
    'teamJobs','teamPackages','teamHandoffs','teamReceipts',
    'favoriteWholesalers','appReleases','updateDismissals')
);

alter function saip_private.saip_command(text,jsonb,text) rename to command_before_workflow;
create function saip_private.saip_command(command text,args jsonb default '{}',operation_id text default '')
returns text language plpgsql set search_path = '' as $$
declare
  actor uuid := auth.uid(); profile jsonb; prior record; result text; name text;
  payload jsonb := jsonb_build_object('command',command,'args',args);
begin
  -- 요청 수정·팀 배정·금액 기록이 같은 원본을 동시에 변경하지 못하게 한다.
  -- 잠금 순서: 생명주기 → 업무 → 기존 명령의 계정/대화 잠금.
  perform pg_advisory_xact_lock(hashtextextended('saip-workflow',0));
  if command not like 'wf.%' then
    return saip_private.command_before_workflow(command,args,operation_id);
  end if;
  if actor is null or not public.saip_account_active() then raise exception '로그인이 필요해요.'; end if;
  if operation_id is null or operation_id='' or length(operation_id)>200
    or args is null or jsonb_typeof(args)<>'object' or octet_length(args::text)>262144 then
    raise exception '작업 정보를 확인해 주세요.';
  end if;
  profile := saip_private.get('accounts',actor::text);
  if not saip_private.b(profile,'complete') or saip_private.b(profile,'deletionPending') then
    raise exception '가입을 완료한 계정으로 이용해 주세요.';
  end if;
  select * into prior from saip_private.operations o where o.actor=auth.uid() and o.id=operation_id;
  if found then
    if prior.payload<>payload then raise exception '같은 작업 번호로 다른 내용을 전송할 수 없어요.'; end if;
    return prior.result;
  end if;
  name := substr(command,4);
  if name like 'billing.%' then
    result := saip_private.billing_command(name,args,actor);
  elsif name in ('connectColleague','respondColleagueConnection','createTeam','inviteTeamMember',
    'respondTeamInvite','leaveTeam','sendColleagueMessage','markColleagueChatRead','sendTeamMessage',
    'markTeamChatRead','createTeamRound','assignTeamArea','createPickupJob','assignPickupJob',
    'recordPackageCustody','requestPackageHandoff','confirmPackageHandoff','recordPackageDelivery',
    'recordPackageReceipt','autoAssignTeamRound','updatePickupScope','requestTeamMembership',
    'recoverPackageCustody') then
    result := saip_private.team_command(name,args,actor);
  else
    result := saip_private.convenience_command(name,args,actor);
  end if;
  if result is null then raise exception '작업 결과를 확인하지 못했어요.'; end if;
  insert into saip_private.operations(actor,id,payload,result) values(actor,operation_id,payload,result);
  return result;
end $$;

alter function saip_private.saip_snapshot() rename to snapshot_before_workflow;
create function saip_private.saip_snapshot() returns jsonb
language plpgsql stable set search_path = '' as $$
declare result jsonb := saip_private.snapshot_before_workflow(); c text; rows jsonb; profile record;
begin
  foreach c in array array['fieldPayments','supplierPaymentAllocations','supplierRefunds',
    'invoices','invoiceAdjustments','invoiceReceipts','invoiceInquiries','reimbursements',
    'colleagueConnections','teams','teamInvites','teamChats','teamRounds','teamAreas','teamJobs',
    'teamPackages','teamHandoffs','teamReceipts','favoriteWholesalers','appReleases','updateDismissals'] loop
    select coalesce(jsonb_object_agg(id,data),'{}') into rows from public.saip_records
      where collection=c and auth.uid()=any(readers);
    result := result||jsonb_build_object(c,rows);
  end loop;
  -- 팀 동료는 연락처·계좌·전체 고객 프로필 대신 공개 프로필만 받는다.
  for profile in select a.id,a.data from public.saip_records a
    where a.collection='accounts' and a.id<>auth.uid()::text
      and not (result->'accounts' ? a.id)
      and not saip_private.b(a.data,'deletionPending')
      and exists(select 1 from public.saip_records r where auth.uid()=any(r.readers)
        and ((r.collection='colleagueConnections' and a.id in(r.data->>'fromId',r.data->>'toId'))
          or (r.collection='teams' and coalesce(r.data->'memberIds','[]') ? a.id)))
  loop
    result := jsonb_set(result,array['accounts',profile.id],
      saip_private.public_profile(profile.data,false) || jsonb_build_object('teamMemberships',(
        select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.data->>'name') order by t.id),'[]')
        from public.saip_records t where t.collection='teams' and t.data->>'status'='active'
          and coalesce(t.data->'memberIds','[]') ? profile.id
      )),true);
  end loop;
  return result;
end $$;

revoke all on function saip_private.saip_command(text,jsonb,text),saip_private.command_before_workflow(text,jsonb,text),
  saip_private.saip_snapshot(),saip_private.snapshot_before_workflow() from public,anon,authenticated;
