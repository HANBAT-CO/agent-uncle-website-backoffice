-- 소매업자는 자기 포장 진행만 받는다. 팀 장부·채팅·다른 거래처는 투영하지 않는다.
create function saip_private.retailer_pickup_progress(actor uuid) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  result jsonb := '{}'; request_row record; wholesaler record; job record;
  jobs integer; packages jsonb; total integer; status text; projection jsonb;
  wholesalers jsonb;
begin
  for request_row in select id,data from public.saip_records
    where collection='requests' and data->>'retailerId'=actor::text
      and data->>'status' in ('accepted','completed')
  loop
    wholesalers := request_row.data->'wholesalers';
    if jsonb_typeof(wholesalers) is distinct from 'array' or wholesalers='[]'::jsonb then
      wholesalers := jsonb_build_array(jsonb_build_object('wholesaler',request_row.data->>'wholesaler'));
    end if;
    for wholesaler in select value,ordinality-1 as index
      from jsonb_array_elements(wholesalers) with ordinality
    loop
      select count(*) into jobs from public.saip_records where collection='teamJobs'
        and data->>'requestId'=request_row.id
        and saip_private.n(data,'wholesalerIndex')=wholesaler.index
        and coalesce(data->>'status','')<>'archived';
      select id,data into job from public.saip_records where collection='teamJobs'
        and data->>'requestId'=request_row.id and jobs=1
        and saip_private.n(data,'wholesalerIndex')=wholesaler.index
        and coalesce(data->>'status','')<>'archived';
      select coalesce(jsonb_agg(jsonb_build_object('id',id)||saip_private.pick(data,
        array['packageLabel','quantity','unit','status','version','receiptNote'])),'[]')
        into packages from public.saip_records where collection='teamPackages'
          and data->>'jobId'=job.id and data->>'retailerId'=actor::text;
      total := jsonb_array_length(packages);
      status := 'partial';
      if total=0 then status := 'pending';
      elsif saip_private.b(job.data,'scopeConfirmed')
        and not saip_private.b(job.data,'hasBackorder')
        and saip_private.n(job.data,'expectedPackageCount')=total
        and not exists(select 1 from jsonb_array_elements(packages) p where
          coalesce(p->>'status','') not in ('picked','held','handoff_requested','delivery_ready','delivered','received'))
      then
        if not exists(select 1 from jsonb_array_elements(packages) p where p->>'status'<>'received') then
          status := 'received';
        elsif not exists(select 1 from jsonb_array_elements(packages) p where p->>'status' not in ('delivered','received')) then
          status := 'delivered';
        else status := 'picked'; end if;
      end if;
      projection := jsonb_build_object(
        'requestId',request_row.id,'jobId',coalesce(job.id,''),'wholesalerIndex',wholesaler.index,
        'wholesalerName',coalesce(wholesaler.value->>'wholesaler',''),
        'createdAt',request_row.data->>'createdAt','scopeConfirmed',saip_private.b(job.data,'scopeConfirmed'),
        'expectedPackageCount',saip_private.n(job.data,'expectedPackageCount'),
        'hasBackorder',saip_private.b(job.data,'hasBackorder'),
        'openIssues',saip_private.n(request_row.data,'openIssues'),
        'packages',packages,'status',status);
      result := result||jsonb_build_object(request_row.id||':'||wholesaler.index,projection);
    end loop;
  end loop;
  return result;
end $$;

alter function saip_private.saip_snapshot() rename to snapshot_before_pickup_projection;
create function saip_private.saip_snapshot() returns jsonb
language sql stable set search_path = '' as $$
  select saip_private.snapshot_before_pickup_projection() ||
    jsonb_build_object('pickupProgress',saip_private.retailer_pickup_progress(auth.uid()));
$$;

-- 기존 탈퇴 트리거와 같은 트랜잭션에서 업무 접근을 회수한다.
-- 미정산 금액과 실제 보관자는 상대방의 사실 기록으로 보존한다.
create function saip_private.erase_workflow_account() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record; next_readers uuid[]; value jsonb; members jsonb; admins jsonb;
begin
  delete from public.saip_records where
    (collection='favoriteWholesalers' and data->>'ownerId'=old.id::text)
    or (collection='colleagueConnections' and old.id=any(readers))
    or (collection='teamInvites' and old.id::text in(data->>'fromId',data->>'toId',data->>'inviterId',data->>'inviteeId'));
  for r in select * from public.saip_records where old.id=any(readers)
    and collection not in ('accounts','signupProgress','connections','drafts','requests','deliveries',
      'receipts','events','proposals','issues','messages','notices','attachments','chatBlocks')
  loop
    next_readers := array_remove(r.readers,old.id);
    value := r.data||jsonb_build_object('readers',to_jsonb(next_readers),
      'version',saip_private.n(r.data,'version')+1);
    if r.collection='teams' then
      select coalesce(jsonb_agg(member),'[]') into members
        from jsonb_array_elements_text(coalesce(value->'memberIds','[]')) member where member<>old.id::text;
      select coalesce(jsonb_agg(member),'[]') into admins
        from jsonb_array_elements_text(coalesce(value->'adminIds','[]')) member where members ? member;
      value := value||jsonb_build_object('memberIds',members,'adminIds',admins,
        'managementRequired',admins='[]'::jsonb,
        'departedMemberIds',coalesce(value->'departedMemberIds','[]')||jsonb_build_array(old.id::text));
      if value->>'ownerId'=old.id::text then value := value||'{"ownerId":""}'; end if;
    end if;
    if r.collection='teamChats' and value->>'senderId'=old.id::text
      and not saip_private.b(value,'system') and coalesce(value->>'kind','')<>'system' then
      value := value||'{"body":"","attachments":[],"deleted":true}';
    end if;
    if r.collection in ('teamJobs','teamPackages','teamHandoffs')
      and old.id::text in(value->>'pickupAssigneeId',value->>'finalAssigneeId',
        value->>'currentHolderId',value->>'fromId',value->>'toId') then
      value := value||'{"requiresReconciliation":true,"reconciliationReason":"account_deleted"}';
    end if;
    if r.collection in ('fieldPayments','supplierPaymentAllocations','supplierRefunds',
      'invoices','invoiceReceipts','reimbursements')
      and old.id::text in(value->>'retailerId',value->>'uncleId',value->>'payerId',
        value->>'payeeId',value->>'paidToId',value->>'recipientId') then
      value := value||'{"requiresReconciliation":true,"reconciliationReason":"account_deleted"}';
    end if;
    perform saip_private.workflow_put(r.collection,r.id,value,next_readers);
  end loop;
  return old;
end $$;
create trigger saip_erase_workflow_account before delete on auth.users
for each row execute function saip_private.erase_workflow_account();

revoke all on function saip_private.retailer_pickup_progress(uuid),
  saip_private.saip_snapshot(),saip_private.snapshot_before_pickup_projection(),
  saip_private.erase_workflow_account() from public,anon,authenticated;

-- 동료 검색은 거래처 검색과 분리한다. 소속 팀의 이름만 공개하며 가입이나
-- 팀 장부·대화 열람 권한을 부여하지 않는다.
create function public.saip_search_colleagues(
  query text, limit_count integer default 20, offset_count integer default 0
) returns table(id text, data jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := auth.uid(); me jsonb;
  term text := lower(btrim(coalesce(query,'')));
begin
  me := saip_private.get('accounts',actor::text);
  if actor is null or not public.saip_account_active()
    or not saip_private.b(me,'complete') or saip_private.b(me,'deletionPending')
    or coalesce(me->>'role','')<>'uncle' then
    raise exception '가입을 완료한 사입삼촌만 동료를 검색할 수 있어요.';
  end if;
  if term='' or length(term)>100 or limit_count is null or offset_count is null
    or limit_count<1 or limit_count>50 or offset_count<0 then
    raise exception '동료의 이름이나 #코드를 입력해 주세요.';
  end if;
  return query select a.id,
    saip_private.directory_public_profile(a.data)||jsonb_build_object('teamMemberships',
      (select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.data->>'name') order by t.id),'[]')
        from public.saip_records t where t.collection='teams' and t.data->>'status'='active'
          and coalesce(t.data->'memberIds','[]') ? a.id))
    from public.saip_records a
    where a.collection='accounts' and a.id<>actor::text and a.data->>'role'='uncle'
      and saip_private.b(a.data,'complete') and not saip_private.b(a.data,'deletionPending')
      and not exists(select 1 from saip_private.account_deletions d where d.account_id::text=a.id)
      and (case when term ~ '^#[0-9]{4}$' then a.data->>'publicCode'=term
        else position(term in lower(coalesce(a.data->>'name','')))>0
          or position(term in lower(coalesce(a.data->>'nickname','')))>0 end)
    order by lower(coalesce(nullif(a.data->>'nickname',''),a.data->>'name','')),a.id
    limit limit_count offset offset_count;
end $$;
revoke all on function public.saip_search_colleagues(text,integer,integer) from public,anon;
grant execute on function public.saip_search_colleagues(text,integer,integer) to authenticated;
