-- Name the missing signup field, including the required business document.
-- Preserve all existing command validation, access checks and transactions.
create or replace function public.saip_command(command text, args jsonb default '{}', operation_id text default '') returns text
language plpgsql security definer set search_path = '' as $$
declare
 actor uuid:=auth.uid(); actor_id text:=auth.uid()::text; i text:=coalesce(args->>'id',''); v jsonb:=coalesce(args->'values','{}');
 r jsonb; n jsonb; p jsonb; d jsonb; me jsonb; peer jsonb; candidate jsonb; existing record;
 result text:=i; title text; k text; aid text; pid text; rid text; did text; action text; kind text; group_key text; dest text;
 q integer; picked integer; left_qty integer; confirmed integer; h integer; actual integer; approved boolean;
 entry record; payload jsonb:=jsonb_build_object('command',command,'args',args);
begin
 if actor is null then raise exception '로그인이 필요해요.'; end if;
 if operation_id='' or length(operation_id)>200 or jsonb_typeof(args)<>'object' or octet_length(args::text)>262144 then raise exception '작업 정보를 확인해 주세요.'; end if;
 -- Serialize retries from this actor; unrelated users and requests can proceed.
 perform pg_advisory_xact_lock(hashtextextended('saip-actor-'||actor_id,0));
 select * into existing from saip_private.operations where saip_private.operations.actor=auth.uid() and id=operation_id;
 if found then
   if existing.payload<>payload then raise exception '같은 작업 번호로 다른 내용을 전송할 수 없어요.'; end if;
   return existing.result;
 end if;
 if command='bootstrap' then
   if not exists(select 1 from public.saip_records where collection='accounts' and id=actor_id) then
     select jsonb_build_object('label',coalesce(raw_user_meta_data->>'full_name',raw_user_meta_data->>'name',email,'새 계정'),'email',email,'provider',coalesce(raw_app_meta_data->>'provider','social')) into r from auth.users where id=actor;
     if r is null then raise exception '인증 계정을 확인해 주세요.'; end if;
     r:=r||jsonb_build_object('complete',false,'version',0,'code',upper(replace(gen_random_uuid()::text,'-','')),'codeExpires',now()+interval '7 days','working',true,'verificationStatus','unverified');
     perform saip_private.put('accounts',actor_id,r,array[actor]);
     perform saip_private.put('signupProgress',actor_id,jsonb_build_object('accountId',actor,'stage','role','updatedAt',clock_timestamp()),array[actor]);
   end if;
   result:=actor_id;
 else
   me:=saip_private.get('accounts',actor_id);
   if command='chooseRole' then
     if saip_private.b(me,'complete') or coalesce(args->>'role','') not in ('retailer','uncle') then raise exception '가입 후에는 역할을 바꿀 수 없어요.'; end if;
     perform saip_private.put('accounts',actor_id,me||jsonb_build_object('role',args->>'role','version',saip_private.n(me,'version')+1),array[actor]);
     perform saip_private.put('signupProgress',actor_id,jsonb_build_object('accountId',actor,'stage','profile','role',args->>'role','updatedAt',clock_timestamp()),array[actor]);
   elsif command='saveProfile' then
     n:=me||saip_private.pick(v,array['name','contact','phone','businessName','businessNumber','documentId','photoId','address','addressDetail','deliveryNote','pickupArea','deliveryArea','deadline','holiday','intro','working','terms','privacy','notificationSettings']);
     foreach k in array array['documentId','photoId'] loop
       if saip_private.s(n,k)<>'' then perform saip_private.owned_attachment(n->>k,actor); end if;
     end loop;
     if saip_private.b(args,'complete') or saip_private.b(me,'complete') then
       foreach k in array array['name','contact','phone','businessName','businessNumber','documentId']||case when n->>'role'='retailer' then array['address','addressDetail'] else array['pickupArea','deliveryArea','deadline'] end loop
         if btrim(saip_private.s(n,k))='' then
           if k='documentId' then raise exception '사업자등록증을 첨부해 주세요.'; end if;
           raise exception '% 항목을 입력해 주세요.', case k
             when 'name' then case when n->>'role'='retailer' then '매장명·쇼핑몰명' else '활동명·업체명' end
             when 'contact' then '이름·담당자명'
             when 'phone' then '연락처'
             when 'businessName' then '사업자명'
             when 'businessNumber' then '사업자등록번호'
             when 'address' then '주소'
             when 'addressDetail' then '상세주소'
             when 'pickupArea' then '도매 픽업 구역'
             when 'deliveryArea' then '소매 배송 지역'
             when 'deadline' then '요청 마감시간'
           end;
         end if;
       end loop;
       if coalesce(n->>'role','') not in ('retailer','uncle') or not saip_private.b(n,'terms') or not saip_private.b(n,'privacy') then raise exception '역할 선택과 필수 동의를 확인해 주세요.'; end if;
       if replace(n->>'businessNumber','-','') !~ '^\d{10}$' or n->>'phone' !~ '^\+?[\d -]{9,16}$' then raise exception '연락처와 사업자등록번호를 확인해 주세요.'; end if;
       n:=n||'{"complete":true}';
     end if;
     n:=n||jsonb_build_object('version',saip_private.n(me,'version')+1,'documentStatus',case when saip_private.s(n,'documentId')='' then 'missing' else 'submitted' end);
     if saip_private.s(n,'documentId')<>saip_private.s(me,'documentId') then n:=n||'{"verificationStatus":"unverified"}'; end if;
     perform saip_private.put('accounts',actor_id,n,array[actor]);
     perform saip_private.put('signupProgress',actor_id,jsonb_build_object('accountId',actor,'stage',case when saip_private.b(n,'complete') then 'completed' else 'profile' end,'role',n->>'role','updatedAt',clock_timestamp()),array[actor]);
   elsif command='registerAttachment' then
     if i='' or position('/' in i)>0 then raise exception '파일 정보를 확인해 주세요.'; end if;
     if exists(select 1 from public.saip_records where collection='attachments' and id=i) then raise exception '이미 등록한 파일이에요.'; end if;
     select jsonb_build_object('mime',metadata->>'mimetype','size',(metadata->>'size')::bigint) into d from storage.objects where bucket_id='saip-attachments' and name=actor_id||'/'||i;
     if d is null or saip_private.n(d,'size')<=0 or saip_private.n(d,'size')>10485760 then raise exception '업로드된 파일을 확인해 주세요.'; end if;
     perform saip_private.put('attachments',i,d||jsonb_build_object('ownerId',actor,'name',left(args->>'name',250),'path',actor_id||'/'||i,'createdAt',clock_timestamp()),array[actor]);
   elsif command='renewCode' then
     perform saip_private.put('accounts',actor_id,me||jsonb_build_object('code',upper(replace(gen_random_uuid()::text,'-','')),'codeExpires',now()+interval '7 days','version',saip_private.n(me,'version')+1),array[actor]);
   elsif command='connect' then
     pid:=args->>'peerId';
     perform pg_advisory_xact_lock(hashtextextended('saip-connect-'||least(actor_id,pid)||greatest(actor_id,pid),0));
     peer:=saip_private.get('accounts',pid);
     if not saip_private.b(me,'complete') or not saip_private.b(peer,'complete') or peer->>'role'=me->>'role' or pid=actor_id then raise exception '가입을 완료한 다른 역할의 계정과 연결해 주세요.'; end if;
     if peer->>'code'<>upper(btrim(coalesce(args->>'code',''))) or (peer->>'codeExpires')::timestamptz<now() then raise exception '초대 코드를 다시 확인해 주세요. 만료되었을 수 있어요.'; end if;
     if exists(select 1 from public.saip_records where collection='connections' and readers @> array[actor,pid::uuid] and data->>'status' in ('pending','accepted')) then raise exception '이미 연결되었거나 수락 대기 중이에요.'; end if;
     result:=gen_random_uuid()::text;
     perform saip_private.put('connections',result,jsonb_build_object('from',actor,'to',pid,'status','pending','version',0,'createdAt',clock_timestamp()),array[actor,pid::uuid]);
     perform saip_private.notice(pid::uuid,'새 거래처 연결 요청','connection',result);
   elsif command='respondConnection' then
     select data into r from public.saip_records where collection='connections' and id=i and actor=any(readers) for update;
     perform saip_private.version(r,saip_private.n(args,'version'));
     action:=args->>'status';
     if r is null or r->>'status'<>'pending' or coalesce(action,'') not in ('accepted','rejected','withdrawn') or r->>(case when action='withdrawn' then 'from' else 'to' end)<>actor_id then raise exception '이 연결 요청을 처리할 수 없어요.'; end if;
     perform saip_private.put('connections',i,r||jsonb_build_object('status',action,'version',saip_private.n(r,'version')+1),array[(r->>'from')::uuid,(r->>'to')::uuid]);
     perform saip_private.notice((case when r->>'from'=actor_id then r->>'to' else r->>'from' end)::uuid,'연결 요청을 처리했어요','connection',i);
   elsif command in ('saveDraft','deleteDraft','sendDraft') then
     if saip_private.s(me,'role')<>'retailer' or i='' then raise exception '소매업자만 요청을 작성할 수 있어요.'; end if;
     select data into r from public.saip_records where collection='drafts' and id=i;
     if r is not null and r->>'ownerId'<>actor_id then raise exception '본인의 초안만 처리할 수 있어요.'; end if;
     if exists(select 1 from public.saip_records where collection='requests' and id=i) then
       if command='sendDraft' then
         perform saip_private.role(saip_private.request(i),'retailer');
         insert into saip_private.operations(actor,id,payload,result) values(actor,operation_id,payload,i);
         return i;
       end if;
       raise exception '이미 전송한 요청이에요.';
     end if;
     if command='saveDraft' then
       perform saip_private.put('drafts',i,coalesce(r,'{}')||saip_private.request_fields(v)||jsonb_build_object('ownerId',actor,'createdAt',coalesce(r->>'createdAt',clock_timestamp()::text),'updatedAt',clock_timestamp()),array[actor]);
     elsif command='deleteDraft' then
       delete from public.saip_records where collection='drafts' and id=i;
     else
       if r is null or not saip_private.b(me,'complete') then raise exception '가입과 초안 내용을 확인해 주세요.'; end if;
       perform saip_private.validate_request(r,actor);
       n:=saip_private.request_fields(r)||jsonb_build_object('retailerId',actor,'status','pending','version',0,'createdAt',clock_timestamp(),'updatedAt',clock_timestamp(),'acquired',0,'delivered',0,'received',0,'cancelled',0,'acquiredCancelled',0);
       perform saip_private.put('requests',i,n,saip_private.pair(n));
       delete from public.saip_records where collection='drafts' and id=i;
       perform saip_private.event(i,'{}',n,'새 사입 요청을 보냈어요');
     end if;
   elsif command='updateRequest' then
     r:=saip_private.request(i,saip_private.n(args,'version')); perform saip_private.role(r,'retailer');
     if r->>'status'<>'pending' then raise exception '수락한 요청은 변경 협의로 수정해 주세요.'; end if;
     n:=r||saip_private.request_fields(v)||jsonb_build_object('uncleId',r->>'uncleId');
     perform saip_private.validate_request(n,actor); perform saip_private.save_request(i,r,n,'수락 전 요청 내용을 수정했어요');
   elsif command='act' then
     r:=saip_private.request(i,saip_private.n(args,'version')); n:=r; action:=args->>'action';
     if r->>'status' in ('completed','cancelled','rejected') then raise exception '이미 종료된 요청이에요.'; end if;
     if action in ('accept','reject') then
       perform saip_private.role(r,'uncle');
       if r->>'status'<>'pending' then raise exception '최신 접수 상태를 확인해 주세요.'; end if;
       if action='reject' and btrim(saip_private.s(v,'reason'))='' then raise exception '거절 사유를 입력해 주세요.'; end if;
       n:=n||jsonb_build_object('status',case when action='accept' then 'accepted' else 'rejected' end);
       title:=case when action='accept' then '요청을 수락했어요' else '요청을 거절했어요' end;
     elsif action='cancel' then
       perform saip_private.role(r,'retailer');
       if r->>'status'<>'pending' then raise exception '수락 후에는 취소 협의를 진행해 주세요.'; end if;
       n:=n||jsonb_build_object('status','cancelled','cancelled',saip_private.n(r,'quantity')); title:='수락 전 요청을 취소했어요';
     elsif action='result' then
       perform saip_private.role(r,'uncle'); perform saip_private.accepted(r); perform saip_private.unheld(r);
       q:=saip_private.n(v,'acquired'); left_qty:=saip_private.n(r,'quantity')-saip_private.n(r,'cancelled')-q+saip_private.n(r,'acquiredCancelled');
       if q<saip_private.n(r,'acquired') or left_qty<0 or saip_private.n(v,'backorder')<>left_qty then raise exception '누적 확보·미송 수량을 확인해 주세요. 감소는 수량 정정을 이용해 주세요.'; end if;
       if left_qty>0 then
         if nullif(v->>'recheck','')::date is null or btrim(saip_private.s(v,'reason'))='' then raise exception '미송 재확인일과 설명을 입력해 주세요.'; end if;
       end if;
       n:=n||jsonb_build_object('acquired',q,'resultShared',true,'recheck',case when left_qty>0 then v->>'recheck' else '' end,'needsReply',left_qty>0 and saip_private.b(v,'needsReply'));
       title:=format('확보 %s개 · 미송 %s개 결과를 공유했어요',q,left_qty);
     elsif action='wait' then
       perform saip_private.role(r,'retailer'); perform saip_private.accepted(r);
       if not saip_private.b(r,'needsReply') then raise exception '현재 답변할 미송이 없어요.'; end if;
       n:=n||'{"needsReply":false}'; title:='미송을 기다리기로 했어요';
     else raise exception '지원하지 않는 처리예요.';
     end if;
     perform saip_private.save_request(i,r,n,title||case when saip_private.s(v,'reason')='' then '' else E'\n'||(v->>'reason') end);
   elsif command='deliver' then
     if jsonb_typeof(args->'quantities')<>'object' or args->'quantities'='{}' then raise exception '전달할 요청과 수량을 선택해 주세요.'; end if;
     for entry in select key,value from jsonb_each_text(args->'quantities') order by key loop
       if not (coalesce(args->'versions','{}') ? entry.key) then raise exception '최신 전달 수량을 확인해 주세요.'; end if;
       r:=saip_private.request(entry.key,(args->'versions'->>entry.key)::integer); perform saip_private.role(r,'uncle'); perform saip_private.accepted(r);
       q:=entry.value::integer; dest:=(r->>'retailerId')||'|'||(r->>'address')||'|'||(r->>'addressDetail');
       if group_key is not null and group_key<>dest then raise exception '배송지가 다른 요청은 따로 전달 기록을 남겨 주세요.'; end if;
       group_key:=dest;
       if q<=0 or q>saip_private.available(r) then raise exception '전달 가능한 수량을 넘을 수 없어요.'; end if;
       did:=gen_random_uuid()::text;
       d:=saip_private.pick(r,array['product','option','address','addressDetail','retailerId','uncleId'])||jsonb_build_object('requestId',entry.key,'quantity',q,'received',0,'receiptRecorded',false,'createdAt',clock_timestamp(),'version',0);
       perform saip_private.put('deliveries',did,d,saip_private.pair(r));
       perform saip_private.save_request(entry.key,r,r||jsonb_build_object('delivered',saip_private.n(r,'delivered')+q),format('%s개 전달을 기록했어요',q),'delivery',did);
     end loop;
     result:=operation_id;
   elsif command='receive' then
     d:=saip_private.get('deliveries',i); rid:=d->>'requestId'; r:=saip_private.request(rid); perform saip_private.role(r,'retailer');
     d:=saip_private.get('deliveries',i); perform saip_private.version(d,saip_private.n(args,'version')); perform saip_private.unheld(r);
     if saip_private.b(d,'receiptRecorded') then raise exception '이미 확인한 전달분이에요. 차이는 문제 알리기를 이용해 주세요.'; end if;
     actual:=saip_private.n(args,'actual'); q:=saip_private.n(d,'quantity');
     if actual<0 or (actual<>q and btrim(saip_private.s(args,'reason'))='') then raise exception '실제 수량과 수량 차이의 상황을 입력해 주세요.'; end if;
     confirmed:=least(actual,q);
     perform saip_private.put('receipts',gen_random_uuid()::text,jsonb_build_object('requestId',rid,'deliveryId',i,'actorId',actor,'actual',actual,'confirmed',confirmed,'reason',args->>'reason','deliveryVersion',saip_private.n(d,'version'),'kind','confirmation','createdAt',clock_timestamp()),saip_private.pair(r));
     perform saip_private.put('deliveries',i,d||jsonb_build_object('received',confirmed,'actual',actual,'receiptRecorded',true,'version',saip_private.n(d,'version')+1),saip_private.pair(r));
     n:=r||jsonb_build_object('received',saip_private.n(r,'received')+confirmed);
     if actual<>q then n:=saip_private.add_issue(rid,n,jsonb_build_object('reason',args->>'reason','actual',actual,'deliveryId',i,'held',0)); end if;
     perform saip_private.save_request(rid,r,n,case when actual=q then format('%s개 수령을 확인했어요',actual) else format('수령 수량 차이: 실제 %s개 · 기록 %s개',actual,q) end,'delivery',i);
   elsif command='propose' then
     r:=saip_private.request(i,saip_private.n(args,'version')); perform saip_private.unheld(r); kind:=args->>'kind';
     if coalesce(kind,'') not in ('change','cancel','correction') or btrim(saip_private.s(v,'reason'))='' then raise exception '변경 종류와 사유를 입력해 주세요.'; end if;
     if kind<>'correction' then perform saip_private.accepted(r); end if;
     if kind='correction' then
       perform saip_private.role(r,'uncle');
       if r->>'status' in ('pending','cancelled','rejected') then raise exception '확보 후 수량을 정정해 주세요.'; end if;
       if saip_private.n(v,'acquired')<0 or saip_private.n(v,'quantity')<0 or saip_private.n(v,'received')<0 then raise exception '정정 수량을 확인해 주세요.'; end if;
       candidate:=r||jsonb_build_object('acquired',saip_private.n(v,'acquired'));
       if saip_private.s(v,'deliveryId')<>'' then
         d:=saip_private.get('deliveries',v->>'deliveryId');
         if d->>'requestId'<>i or saip_private.n(v,'received')>saip_private.n(v,'quantity') then raise exception '전달 회차와 수령 수량을 확인해 주세요.'; end if;
         candidate:=candidate||jsonb_build_object('delivered',saip_private.n(r,'delivered')-saip_private.n(d,'quantity')+saip_private.n(v,'quantity'),'received',saip_private.n(r,'received')-saip_private.n(d,'received')+saip_private.n(v,'received'));
       end if;
       perform saip_private.finish(candidate);
       if saip_private.remaining(candidate)>0 and nullif(coalesce(v->>'recheck',r->>'recheck'),'')::date is null then raise exception '정정 후 미송 재확인일을 입력해 주세요.'; end if;
     elsif kind='cancel' then
       q:=saip_private.n(v,'quantity'); picked:=saip_private.n(v,'acquiredCancelled');
       if q<=0 or q>saip_private.n(r,'quantity')-saip_private.n(r,'cancelled')-saip_private.n(r,'delivered') or picked<0 or picked>q or picked>saip_private.available(r) or q-picked>saip_private.remaining(r) then raise exception '취소 수량과 그중 확보한 수량을 확인해 주세요.'; end if;
     else
       candidate:=r||saip_private.request_fields(v)||jsonb_build_object('uncleId',r->>'uncleId');
       perform saip_private.validate_request(candidate,(r->>'retailerId')::uuid); perform saip_private.finish(candidate);
     end if;
     h:=case when kind='cancel' then saip_private.n(v,'acquiredCancelled') else saip_private.available(r) end; pid:=gen_random_uuid()::text;
     perform saip_private.put('proposals',pid,jsonb_build_object('requestId',i,'kind',kind,'values',v,'proposerId',actor,'status','pending','held',h,'version',0,'createdAt',clock_timestamp()),saip_private.pair(r));
     perform saip_private.save_request(i,r,r||jsonb_build_object('proposalId',pid,'held',saip_private.n(r,'held')+h),'변경·취소·정정 협의를 요청했어요'); result:=pid;
   elsif command='respondProposal' then
     p:=saip_private.get('proposals',i); rid:=p->>'requestId'; r:=saip_private.request(rid); p:=saip_private.get('proposals',i);
     perform saip_private.version(p,saip_private.n(args,'version')); approved:=saip_private.b(args,'approve');
     if p->>'status'<>'pending' or r->>'proposalId'<>i then raise exception '이미 처리한 변경안이에요.'; end if;
     if approved and p->>'proposerId'=actor_id then raise exception '상대방이 확인해야 확정할 수 있어요.'; end if;
     n:=r||jsonb_build_object('proposalId','','held',saip_private.n(r,'held')-saip_private.n(p,'held')); v:=p->'values';
     if approved then
       if p->>'kind'='cancel' then
         n:=n||jsonb_build_object('cancelled',saip_private.n(r,'cancelled')+saip_private.n(v,'quantity'),'acquiredCancelled',saip_private.n(r,'acquiredCancelled')+saip_private.n(v,'acquiredCancelled'));
         if saip_private.remaining(n)=0 then n:=n||'{"needsReply":false,"recheck":""}'; end if;
       elsif p->>'kind'='change' then
         n:=n||saip_private.request_fields(v)||jsonb_build_object('uncleId',r->>'uncleId'); perform saip_private.validate_request(n,(r->>'retailerId')::uuid);
         if saip_private.remaining(n)>0 and saip_private.b(r,'resultShared') then n:=n||'{"needsReply":true}'; end if;
       else
         n:=n||jsonb_build_object('acquired',saip_private.n(v,'acquired')); left_qty:=saip_private.remaining(n);
         n:=n||jsonb_build_object('needsReply',left_qty>0,'recheck',case when left_qty>0 then coalesce(v->>'recheck',r->>'recheck') else '' end);
         did:=saip_private.s(v,'deliveryId');
         if did<>'' then
           d:=saip_private.get('deliveries',did); q:=saip_private.n(v,'quantity'); confirmed:=saip_private.n(v,'received');
           if d->>'requestId'<>rid or confirmed>q then raise exception '전달·수령 정정 수량을 확인해 주세요.'; end if;
           n:=n||jsonb_build_object('delivered',saip_private.n(r,'delivered')-saip_private.n(d,'quantity')+q,'received',saip_private.n(r,'received')-saip_private.n(d,'received')+confirmed);
           candidate:=d||jsonb_build_object('quantity',q,'received',confirmed,'actual',confirmed,'receiptRecorded',confirmed=q,'version',saip_private.n(d,'version')+1,'correctedAt',clock_timestamp());
           perform saip_private.put('deliveries',did,candidate,saip_private.pair(r));
           perform saip_private.put('receipts',gen_random_uuid()::text,jsonb_build_object('requestId',rid,'deliveryId',did,'actorId',actor,'actual',confirmed,'confirmed',confirmed,'previousConfirmed',saip_private.n(d,'received'),'reason',v->>'reason','proposalId',i,'kind','correction','createdAt',clock_timestamp()),saip_private.pair(r));
           perform saip_private.put('events',gen_random_uuid()::text,jsonb_build_object('requestId',rid,'deliveryId',did,'actorId',actor,'title','전달 회차 정정: '||(v->>'reason'),'before',d,'after',candidate,'createdAt',clock_timestamp()),saip_private.pair(r));
         end if;
       end if;
     end if;
     perform saip_private.put('proposals',i,p||jsonb_build_object('status',case when approved then 'approved' when p->>'proposerId'=actor_id then 'withdrawn' else 'rejected' end,'version',saip_private.n(p,'version')+1,'resolvedBy',actor),saip_private.pair(r));
     perform saip_private.save_request(rid,r,n,case when approved then '협의한 변경·취소·정정을 확정했어요' else '변경·취소·정정안을 종료했어요' end);
   elsif command='reportIssue' then
     r:=saip_private.request(i,saip_private.n(args,'version')); perform saip_private.role(r,'retailer');
     if r->>'status' in ('pending','cancelled','rejected') or btrim(saip_private.s(v,'reason'))='' then raise exception '진행 중이거나 수령한 요청의 문제 상황을 입력해 주세요.'; end if;
     if saip_private.s(v,'deliveryId')<>'' and saip_private.get('deliveries',v->>'deliveryId')->>'requestId'<>i then raise exception '이 요청의 전달 회차를 선택해 주세요.'; end if;
     n:=saip_private.add_issue(i,r,v); perform saip_private.save_request(i,r,n,'상품 문제를 알렸어요: '||(v->>'reason'));
   elsif command='actOnIssue' then
     p:=saip_private.get('issues',i); rid:=p->>'requestId'; r:=saip_private.request(rid); p:=saip_private.get('issues',i); perform saip_private.version(p,saip_private.n(args,'version')); n:=r; action:=args->>'action';
     if p->>'status'='resolved' then raise exception '이미 해결한 문제예요.'; end if;
     if action='resolve' then
       perform saip_private.role(r,'retailer');
       if saip_private.s(p,'deliveryId')<>'' and p ? 'actual' then
         d:=saip_private.get('deliveries',p->>'deliveryId');
         if saip_private.n(d,'actual')<>saip_private.n(d,'quantity') then raise exception '전달 기록과 실제 수량 차이를 먼저 정정해 주세요.'; end if;
       end if;
       n:=n||jsonb_build_object('openIssues',saip_private.n(r,'openIssues')-1,'held',saip_private.n(r,'held')-saip_private.n(p,'held')); p:=p||'{"status":"resolved"}'; title:='소매업자가 문제 해결을 확인했어요';
     elsif action='action' then
       perform saip_private.role(r,'uncle');
       if btrim(saip_private.s(args,'note'))='' then raise exception '조치 내용을 입력해 주세요.'; end if;
       p:=p||jsonb_build_object('status','actionTaken','action',args->>'note'); title:='문제 조치를 기록했어요: '||(args->>'note');
     else raise exception '지원하지 않는 문제 처리예요.';
     end if;
     perform saip_private.put('issues',i,p||jsonb_build_object('version',saip_private.n(p,'version')+1),saip_private.pair(r)); perform saip_private.save_request(rid,r,n,title);
   elsif command='sendMessage' then
     pid:=args->>'peerId';
     if not saip_private.connected(actor,pid::uuid) then raise exception '연결된 상대방에게만 메시지를 보낼 수 있어요.'; end if;
     if btrim(saip_private.s(args,'body'))='' and coalesce(args->'attachments','[]')='[]' then raise exception '메시지나 사진을 추가해 주세요.'; end if;
     if length(args->>'body')>10000 then raise exception '메시지를 10,000자 이하로 나누어 보내 주세요.'; end if;
     if exists(select 1 from public.saip_records where collection='messages' and id=i) then raise exception '이미 사용한 메시지 번호예요.'; end if;
     rid:=saip_private.s(args,'requestId');
     if rid<>'' then r:=saip_private.request(rid); if not pid::uuid=any(saip_private.pair(r)) then raise exception '대화 상대방의 요청을 선택해 주세요.'; end if; end if;
     for aid in select jsonb_array_elements_text(coalesce(args->'attachments','[]')) loop perform saip_private.owned_attachment(aid,actor); end loop;
     perform saip_private.put('messages',i,jsonb_build_object('senderId',actor,'recipientId',pid,'body',btrim(args->>'body'),'attachments',coalesce(args->'attachments','[]'),'requestId',rid,'status','sent','system',false,'read',false,'createdAt',clock_timestamp()),array[actor,pid::uuid]);
     perform saip_private.notice(pid::uuid,case when btrim(saip_private.s(args,'body'))='' then '사진을 보냈어요' else left(args->>'body',120) end,'chat',actor_id);
   elsif command='markChatRead' then
     update public.saip_records set data=data||'{"read":true}',updated_at=clock_timestamp() where collection='messages' and data->>'recipientId'=actor_id and data->>'senderId'=args->>'peerId' and data->>'status'='sent' and not saip_private.b(data,'read');
   elsif command='readNotice' then
     r:=saip_private.get('notices',i);
     if r->>'ownerId'<>actor_id then raise exception '이 알림을 볼 수 없어요.'; end if;
     perform saip_private.put('notices',i,r||'{"read":true}',array[actor]);
   elsif command='refreshReminders' then
     for entry in select id,data from public.saip_records where collection='requests' and data->>'uncleId'=actor_id and data->>'status'='accepted' loop
       r:=entry.data; did:='recheck-'||entry.id||'-'||saip_private.s(r,'recheck');
       if saip_private.b(r,'resultShared') and saip_private.remaining(r)>0 and not saip_private.b(r,'needsReply') and nullif(r->>'recheck','')::date <= (now() at time zone 'Asia/Seoul')::date and not exists(select 1 from public.saip_records where collection='notices' and id=did) then
         perform saip_private.put('notices',did,jsonb_build_object('ownerId',actor,'title','미송을 재확인해 주세요','kind','request','targetId',entry.id,'requestId',entry.id,'read',false,'createdAt',clock_timestamp()),array[actor]);
       end if;
     end loop;
   else raise exception '지원하지 않는 작업이에요.';
   end if;
 end if;
 insert into saip_private.operations(actor,id,payload,result) values(actor,operation_id,payload,coalesce(result,''));
 return coalesce(result,'');
end $$;
revoke all on function public.saip_command(text,jsonb,text) from public,anon;
grant execute on function public.saip_command(text,jsonb,text) to authenticated;
