begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

insert into auth.users(id,email) values
 ('61111111-1111-4111-8111-111111111111','order-retailer@example.test'),
 ('62222222-2222-4222-8222-222222222222','order-uncle@example.test'),
 ('63333333-3333-4333-8333-333333333333','order-other@example.test');
insert into public.saip_records(collection,id,data,readers) values
 ('accounts','61111111-1111-4111-8111-111111111111','{"role":"retailer","complete":true,"name":"상점","bankName":"테스트은행","bankAccount":"111122223333","bankHolder":"상점"}',array['61111111-1111-4111-8111-111111111111']::uuid[]),
 ('accounts','62222222-2222-4222-8222-222222222222','{"role":"uncle","complete":true,"name":"삼촌","bankName":"테스트은행","bankAccount":"444455556666","bankHolder":"삼촌"}',array['62222222-2222-4222-8222-222222222222']::uuid[]),
 ('accounts','63333333-3333-4333-8333-333333333333','{"role":"retailer","complete":true,"name":"다른 상점"}',array['63333333-3333-4333-8333-333333333333']::uuid[]),
 ('requests','order-payment-request','{"retailerId":"61111111-1111-4111-8111-111111111111","uncleId":"62222222-2222-4222-8222-222222222222","status":"accepted","quantity":2,"version":0}',array['61111111-1111-4111-8111-111111111111','62222222-2222-4222-8222-222222222222']::uuid[]),
 ('connections','order-payment-connection','{"from":"61111111-1111-4111-8111-111111111111","to":"62222222-2222-4222-8222-222222222222","status":"accepted"}',array['61111111-1111-4111-8111-111111111111','62222222-2222-4222-8222-222222222222']::uuid[]);

update public.saip_records set data=data||'{"wholesaler":"테스트 도매처"}' where collection='requests' and id='order-payment-request';
create schema bo_compat;
create table bo_compat.payment_ids(key text primary key,value text);
insert into bo_compat.payment_ids select 'payment',saip_private.billing_command('billing.recordFieldPayment',
 '{"requestId":"order-payment-request","actualPaidAmount":10000,"cashAllocatedAmount":10000,"customerChargeAmount":10000,"directPaidAmount":0,"supplierFeeAmount":0,"settlementKind":"advance"}',
 '62222222-2222-4222-8222-222222222222');
insert into bo_compat.payment_ids select 'invoice',saip_private.billing_command('billing.createInvoiceDraft',
 jsonb_build_object('paymentIds',jsonb_build_array(value)),'62222222-2222-4222-8222-222222222222') from bo_compat.payment_ids where key='payment';
create function bo_compat.invoice_id() returns text language sql security definer set search_path=public,pg_temp as $$select value from bo_compat.payment_ids where key='invoice'$$;
create function bo_compat.invoice_version() returns integer language sql security definer set search_path=public,pg_temp as $$select (data->>'version')::integer from public.saip_records where collection='invoices' and id=bo_compat.invoice_id()$$;
create function bo_compat.report_payment(cents integer,actor uuid default '61111111-1111-4111-8111-111111111111') returns text language sql security definer set search_path=public,pg_temp as $$
 select saip_private.billing_command('billing.reportReceipt',jsonb_build_object('invoiceId',bo_compat.invoice_id(),'amount',cents),actor)
$$;


create function bo_compat.id(k text) returns text language sql security definer set search_path='' as $$ select value from bo_compat.payment_ids where key=k $$;
create function bo_compat.as_user(uid text) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','aal','aal1')::text,true);
 select null::void $$;
grant usage on schema bo_compat to authenticated;
grant execute on all functions in schema bo_compat to authenticated;
insert into auth.users(id,email,aud,role,email_confirmed_at) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','compat-owner@staff.test','authenticated','authenticated',now()),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','compat-operator@staff.test','authenticated','authenticated',now()),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','compat-viewer@staff.test','authenticated','authenticated',now());
insert into public.backoffice_admins(user_id,role,display_name,require_mfa) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner','호환 소유자',false),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','operator','호환 운영자',false),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','viewer','호환 조회자',false);
select saip_private.billing_command('billing.sendInvoice',jsonb_build_object('invoiceId',bo_compat.invoice_id()),'62222222-2222-4222-8222-222222222222');
update public.saip_records set data=data||'{"status":"completed","acquired":2,"delivered":2,"received":2}' where collection='requests' and id='order-payment-request';
insert into bo_compat.payment_ids select 'first',bo_compat.report_payment(6000);
insert into bo_compat.payment_ids select 'second',bo_compat.report_payment(4000);
insert into public.saip_records(collection,id,data,readers) values
 ('teams','compat-team','{"name":"운영 점검 팀","ownerId":"62222222-2222-4222-8222-222222222222","status":"active"}','{}'),
 ('teamChats','compat-chat','{"teamId":"compat-team","senderId":"62222222-2222-4222-8222-222222222222","body":"010-1234-5678로 문의","token":"secret-chat"}','{}'),
 ('teamChats','compat-deleted','{"teamId":"compat-team","body":"deleted-secret","deleted":true,"attachments":["private-file"]}','{}'),
 ('colleagueConnections','compat-peer','{"fromId":"62222222-2222-4222-8222-222222222222","toId":"63333333-3333-4333-8333-333333333333","status":"accepted"}','{}'),
 ('teamChats','compat-colleague','{"chatType":"colleague","senderId":"63333333-3333-4333-8333-333333333333","peerId":"62222222-2222-4222-8222-222222222222","body":"동료 문의"}','{}');
insert into saip_private.account_deletions(account_id) values('63333333-3333-4333-8333-333333333333');
delete from public.saip_records where collection='accounts' and id='63333333-3333-4333-8333-333333333333';
insert into saip_private.push_devices(id,owner_id,session_id,binding,platform,environment,token,activity_secret_hash) values
 ('64444444-4444-4444-8444-444444444444','61111111-1111-4111-8111-111111111111',gen_random_uuid(),gen_random_uuid(),'ios','development','secret-device-token','secret-hash');
insert into saip_private.push_outbox(device_id,binding,state,last_error,sending_token) select id,binding,'dead','secret-provider-error','secret-sending-token' from saip_private.push_devices where id='64444444-4444-4444-8444-444444444444';

set local role anon;
select throws_ok($$select public.backoffice_list_workflow('invoices')$$,'42501',null,'anon cannot list new workflows');
select throws_ok($$select public.backoffice_process_payment('x','pay_uncle','x',0,'ref',1,'권한 테스트')$$,'42501',null,'anon cannot record payments');
reset role;
set local role authenticated;
select bo_compat.as_user('61111111-1111-4111-8111-111111111111');
select throws_ok($$select public.backoffice_list_workflow('invoices')$$,'42501',null,'customer cannot list workflow metadata');
select throws_ok($$select public.backoffice_push_health()$$,'42501',null,'customer cannot inspect delivery health');
select throws_ok($$select public.backoffice_process_payment('x','pay_uncle','x',0,'ref',1,'권한 테스트')$$,'42501',null,'customer cannot record payments');
select bo_compat.as_user('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
select lives_ok($$select public.backoffice_get_invoice(bo_compat.invoice_id())$$,'viewer can inspect invoice');
select throws_ok($$select public.backoffice_bank_access('62222222-2222-4222-8222-222222222222','정산 확인 요청')$$,'42501',null,'viewer cannot reveal bank');
select throws_ok($$select public.backoffice_team_chat('compat-team','고객 문의 확인')$$,'42501',null,'viewer cannot reveal chat');
select throws_ok($$select public.backoffice_workflow_detail('teamChats','compat-chat','고객 문의 확인')$$,'42501',null,'viewer cannot reveal content');
select throws_ok($$select public.backoffice_process_payment('x','confirm_receipt',bo_compat.id('first'),0,'ref',6000,'입금 확인 요청')$$,'42501',null,'viewer cannot confirm payment');
select ok(public.backoffice_get_invoice(bo_compat.invoice_id())->'payout'->'blockers' ? 'pending_receipts','pending receipts explain payout blocker');
select ok(public.backoffice_get_invoice(bo_compat.invoice_id())::text not like '%bankAccount%','invoice never exposes bank account');
select ok(public.backoffice_list_workflow('teamChats',p_related_id=>'compat-team')::text not like '%secret%','workflow metadata strips content and unknown secret fields');
select is((public.backoffice_list_workflow('teamChats',p_related_id=>'compat-team')->>'total')::int,2,'team metadata filter works');
select throws_ok($$select public.backoffice_list_workflow('accounts')$$,'P0001',null,'collection allowlist enforced');
select ok(exists(select 1 from jsonb_array_elements(public.backoffice_lifecycle()->'rows') r where r->>'id'='63333333-3333-4333-8333-333333333333' and (r->>'queued')::boolean),'deletion queue retains missing account record');
select ok(public.backoffice_push_health()::text not like '%secret%' and public.backoffice_push_health()::text not like '%session_id%','push health excludes credentials, sessions, provider errors');
select ok((public.backoffice_push_health()->'states'->>'dead')::int>=1,'push health counts failed delivery');
select bo_compat.as_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select throws_ok($$select public.backoffice_bank_access('62222222-2222-4222-8222-222222222222','짧음')$$,'P0001',null,'bank disclosure requires meaningful reason');
select is(public.backoffice_bank_access('62222222-2222-4222-8222-222222222222','지급 계좌 대조')->>'bankAccount','444455556666','operator can reveal audited bank account');
select ok(public.backoffice_team_chat('compat-team','고객 문의 확인')::text not like '%010-1234-5678%','team chat masks phone numbers');
select ok(public.backoffice_team_chat('compat-team','고객 문의 확인')::text not like '%deleted-secret%','deleted team body is not exposed');
select is((public.backoffice_team_chat('compat-peer','동료 문의 확인')->>'total')::int,1,'colleague reverse-direction chat is included');
select ok(public.backoffice_workflow_detail('teamChats','compat-deleted','삭제 내용 점검')::text not like '%deleted-secret%','detail cannot bypass deleted chat tombstone');
select throws_ok($$select public.backoffice_process_payment('wrong-amount','confirm_receipt',bo_compat.id('first'),0,'compat-in-1',5000,'은행 입금 확인')$$,'P0001',null,'wrong amount rejected');
select throws_ok($$select public.backoffice_process_payment('stale','confirm_receipt',bo_compat.id('first'),9,'compat-in-1',6000,'은행 입금 확인')$$,'P0001',null,'stale version rejected');
select lives_ok($$select public.backoffice_process_payment('compat-confirm','confirm_receipt',bo_compat.id('first'),0,'compat-in-1',6000,'은행 입금 확인')$$,'operator confirms bank receipt');
select lives_ok($$select public.backoffice_process_payment('compat-confirm','confirm_receipt',bo_compat.id('first'),0,'compat-in-1',6000,'은행 입금 확인')$$,'identical retry succeeds');
select throws_ok($$select public.backoffice_process_payment('compat-confirm','confirm_receipt',bo_compat.id('first'),0,'changed-reference',6000,'은행 입금 확인')$$,'P0001',null,'changed retry rejected');
select throws_ok($$select public.backoffice_process_payment('duplicate-ref','confirm_receipt',bo_compat.id('second'),0,'compat-in-1',4000,'은행 입금 확인')$$,'P0001',null,'duplicate bank reference rejected');
select lives_ok($$select public.backoffice_process_payment('compat-reject','reject_receipt',bo_compat.id('second'),0,'입금 없음 확인',4000,'은행 입금 반려')$$,'operator rejects unreceived transfer');
reset role;
select is((select count(*) from public.backoffice_audit_log where operation_id='compat-confirm'),1::bigint,'retries produce one audit row');
select ok(not exists(select 1 from public.backoffice_audit_log where action like 'payment.%' and request_payload ? 'reference'),'staff audit payload omits bank references');
select is((saip_private.get('invoices',bo_compat.invoice_id())->>'confirmedReceiptAmount')::int,6000,'replay does not double receipt amount');
select is(backoffice_private.request_label(backoffice_private.request_state('order-payment-request',saip_private.get('requests','order-payment-request'))),'수령(입금 전)','rejection restores unpaid request stage');
insert into bo_compat.payment_ids select 'third',bo_compat.report_payment(4000);
set local role authenticated;
select lives_ok($$select public.backoffice_process_payment('compat-confirm-3','confirm_receipt',bo_compat.id('third'),0,'compat-in-3',4000,'은행 입금 확인')$$,'operator confirms replacement receipt');
select is(public.backoffice_get_invoice(bo_compat.invoice_id())->'payout'->'blockers','[]'::jsonb,'valid fully confirmed invoice can be paid');
reset role;
update public.saip_records set data=data||'{"paidToId":"62222222-2222-4222-8222-222222222222"}' where collection='invoiceReceipts' and id=bo_compat.id('third');
set local role authenticated;
select ok(public.backoffice_get_invoice(bo_compat.invoice_id())->'payout'->'blockers' ? 'platform_receipts_insufficient','direct uncle payment not counted as platform funds');
select throws_ok($$select public.backoffice_process_payment('direct','pay_uncle',bo_compat.invoice_id(),bo_compat.invoice_version(),'compat-out-1',10000,'은행 지급 확인')$$,'P0001',null,'direct uncle receipt cannot fund payout');
reset role;
update public.saip_records set data=data||'{"paidToId":"platform"}' where collection='invoiceReceipts' and id=bo_compat.id('third');
update public.saip_records set data=data||'{"requiresReconciliation":true}' where collection='invoices' and id=bo_compat.invoice_id();
set local role authenticated;
select ok(public.backoffice_get_invoice(bo_compat.invoice_id())->'payout'->'blockers' ? 'reconciliation','reconciliation blocker explained');
select throws_ok($$select public.backoffice_process_payment('reconcile','pay_uncle',bo_compat.invoice_id(),bo_compat.invoice_version(),'compat-out-1',10000,'은행 지급 확인')$$,'P0001',null,'reconciliation prevents payout');
reset role;
update public.saip_records set data=data||'{"requiresReconciliation":false}' where collection='invoices' and id=bo_compat.invoice_id();
update public.saip_records set data=data||'{"bankAccount":"invalid"}' where collection='accounts' and id='62222222-2222-4222-8222-222222222222';
set local role authenticated;
select ok(public.backoffice_get_invoice(bo_compat.invoice_id())->'payout'->'blockers' ? 'payee_not_ready','invalid bank blocker explained');
select throws_ok($$select public.backoffice_process_payment('bank','pay_uncle',bo_compat.invoice_id(),bo_compat.invoice_version(),'compat-out-1',10000,'은행 지급 확인')$$,'P0001',null,'invalid bank prevents payout');
reset role;
update public.saip_records set data=data||'{"bankAccount":"444455556666"}' where collection='accounts' and id='62222222-2222-4222-8222-222222222222';
-- Preserve invoice visibility when retained records outlive an account/request.
create table bo_compat.saved_relations as select * from public.saip_records
 where (collection='accounts' and id='62222222-2222-4222-8222-222222222222')
 or (collection='requests' and id='order-payment-request');
delete from public.saip_records where collection='accounts' and id='62222222-2222-4222-8222-222222222222';
set local role authenticated;
select ok(public.backoffice_get_invoice(bo_compat.invoice_id())->'payout'->'blockers' ? 'payee_not_ready','missing payee remains inspectable with payout blocked');
select throws_ok($$select public.backoffice_process_payment('missing-payee','pay_uncle',bo_compat.invoice_id(),bo_compat.invoice_version(),'compat-out-1',10000,'은행 지급 확인')$$,'P0001',null,'missing payee cannot be paid');
reset role;
insert into public.saip_records select * from bo_compat.saved_relations where collection='accounts';
delete from public.saip_records where collection='requests' and id='order-payment-request';
set local role authenticated;
select ok(public.backoffice_get_invoice(bo_compat.invoice_id())->'payout'->'blockers' ? 'not_received','missing request remains inspectable with payout blocked');
select throws_ok($$select public.backoffice_process_payment('missing-request','pay_uncle',bo_compat.invoice_id(),bo_compat.invoice_version(),'compat-out-1',10000,'은행 지급 확인')$$,'P0001',null,'missing request cannot be paid');
reset role;
insert into public.saip_records select * from bo_compat.saved_relations where collection='requests';
insert into bo_compat.payment_ids values('payout-version',bo_compat.invoice_version()::text);
set local role authenticated;
select lives_ok($$select public.backoffice_process_payment('compat-payout','pay_uncle',bo_compat.invoice_id(),bo_compat.id('payout-version')::int,'compat-out-1',10000,'은행 지급 확인')$$,'operator records actual payout');
select lives_ok($$select public.backoffice_process_payment('compat-payout','pay_uncle',bo_compat.invoice_id(),bo_compat.id('payout-version')::int,'compat-out-1',10000,'은행 지급 확인')$$,'payout retry succeeds without duplicate');
select throws_ok($$select public.backoffice_process_payment('double-pay','pay_uncle',bo_compat.invoice_id(),bo_compat.invoice_version(),'compat-out-2',10000,'은행 지급 확인')$$,'P0001',null,'second payout rejected');
select ok(public.backoffice_get_invoice(bo_compat.invoice_id())->'payout'->'blockers' ? 'already_paid','payout complete blocker explained');
reset role;
select is((select count(*) from public.backoffice_audit_log where operation_id='compat-payout'),1::bigint,'payout retry audited once');
select bo_compat.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select ok(public.backoffice_verify_audit_chain()->>'ok'='true','audit chain remains intact');
select ok((backoffice_private.request_state('none','{"status":"accepted","purchaseCompletedAt":"2026-10-17T00:00:00Z"}')->>'awaitingCompletionConfirmation')::boolean,'single completion flag awaits other participant');
select ok(not (backoffice_private.request_state('none','{"status":"completed","purchaseCompletedAt":"2026-10-17T00:00:00Z","receiptConfirmedAt":"2026-10-17T00:00:00Z"}')->>'awaitingCompletionConfirmation')::boolean,'both completion flags stop waiting');
select isnt(backoffice_private.request_label('{"status":"completed","quantity":2,"acquired":2,"delivered":2,"received":1}'),'수령(입금 전)','malformed completed ledger never appears received');
select is(backoffice_private.request_title('{"requestType":"wholesaler","wholesalers":[{"wholesaler":"첫 도매"},{"wholesaler":"다음 도매"}]}'),'첫 도매 외 1곳','batch request title includes number of wholesalers');
insert into public.saip_records(collection,id,data,readers) values
 ('requests','compat-total-product','{"product":"compat-unit-totals","status":"accepted","quantity":5,"acquired":3,"delivered":2,"received":1}', '{}'),
 ('requests','compat-total-batch','{"requestType":"wholesaler","wholesalers":[{"wholesaler":"compat-unit-totals"}],"status":"accepted","quantity":2,"acquired":1,"delivered":1,"received":0}', '{}');
set local role authenticated;
select is((public.backoffice_list_requests(p_search=>'compat-unit-totals')->'totals'->'byType'->'product'->>'quantity')::int,5,'product quantities remain separate from wholesaler counts');
select is((public.backoffice_list_requests(p_search=>'compat-unit-totals')->'totals'->'byType'->'wholesaler'->>'quantity')::int,2,'wholesaler quantities remain separate from product counts');
reset role;
-- appReleases has no direct SELECT permission; expose only safe diagnostics.
delete from public.saip_records where collection='appReleases';
insert into public.saip_records(collection,id,data,readers) values
 ('appReleases','compat-release-a','{"public":true,"published":false,"title":"공개 조건 점검","visibility":"private","userIds":[],"targetUserIds":["secret-user"],"roles":"secret-role","targetRoles":["uncle"],"notes":"secret-notes","buildNumber":{"secret":"nested"},"ios":{"versionName":"ignored-legacy"},"platforms":{"ios":{"public":true,"published":true,"versionName":"2.1.0","buildNumber":21,"audienceUserIds":["secret-variant-user"],"internalNotes":"secret-internal"},"android":[]}}','{}'),
 ('appReleases','compat-release-b','{"public":true,"platforms":42,"ios":{"title":"ignored-fallback"}}','{}'),
 ('appReleases','compat-release-c','{"public":true,"platform":"android","versionCode":7,"version":"1.0.7","storeUrl":"https://play.google.com/store/apps/details?id=example"}','{}'),
 ('appReleases','compat-release-d','{"public":false,"ios":{"enabled":false,"userIds":null},"android":{"enabled":true}}','{}');
set local role anon;
select throws_ok($$select public.backoffice_list_app_releases()$$,'42501',null,'anon cannot list releases');
reset role;
set local role authenticated;
select bo_compat.as_user('61111111-1111-4111-8111-111111111111');
select throws_ok($$select public.backoffice_list_app_releases()$$,'42501',null,'customer cannot list unreleased metadata');
select bo_compat.as_user('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
select is(public.backoffice_list_app_releases()->>'total','4','viewer can inspect all release records including unpublished');
select ok(public.backoffice_list_app_releases()::text not like '%secret%','release metadata omits targeting IDs and internal notes recursively');
select is(public.backoffice_list_app_releases()->'rows'->0->'root'->'fields'->>'published','false','root publication restriction preserved despite enabled variant');
select is(public.backoffice_list_app_releases()->'rows'->0->'root'->>'privateAudience','true','private audience is diagnosed without raw audience');
select is(public.backoffice_list_app_releases()->'rows'->0->'root'->>'roleTargeting','invalid','invalid role condition cannot be hidden by another restriction');
select is(public.backoffice_list_app_releases()->'rows'->0->'root'->>'userTargeting','restricted','all user targeting aliases checked including nonempty restriction');
select is(public.backoffice_list_app_releases()->'rows'->0->'root'->'invalidFields','["buildNumber"]'::jsonb,'nested metadata is suppressed and field flagged');
select is(public.backoffice_list_app_releases()->'rows'->0->'variants'->'ios'->'fields'->>'versionName','2.1.0','platforms variants take precedence over legacy fields');
select is(public.backoffice_list_app_releases()->'rows'->0->'invalidVariants','["android"]'::jsonb,'malformed platform is diagnosed without exposing raw data');
select is(public.backoffice_list_app_releases()->'rows'->1->'variants','{}'::jsonb,'malformed platforms does not fall back to legacy ios');
select is(public.backoffice_list_app_releases()->'rows'->2->>'variantSource','shared','shared metadata without platform overrides supported');
select is(public.backoffice_list_app_releases()->'rows'->3->'variants'->'ios'->>'userTargeting','invalid','null targeting value blocks eligibility and is diagnosed');
select is(public.backoffice_list_app_releases(1,1)->'rows'->0->>'id','compat-release-b','release pagination has stable order');
select is(public.backoffice_list_app_releases(25,4)->'rows','[]'::jsonb,'release pagination ends with empty rows');
select throws_ok($$select backoffice_private.release_metadata('{}')$$,'42501',null,'release helper is not callable by authenticated users');
reset role;
select * from finish();
rollback;
