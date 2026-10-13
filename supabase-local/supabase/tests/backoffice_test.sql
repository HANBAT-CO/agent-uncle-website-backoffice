-- pgTAP port of supabase/backoffice/backoffice_checks.sql for the proposed backoffice layer
-- (migration 20261013090000_backoffice_admin_layer.sql). Self-contained: it creates its own app
-- fixtures through the real saip_command (as the app's workspace_test.sql does) and its own staff
-- at fixed UUIDs with @staff.test emails, so it runs on an empty DB (reset.sh --empty), on the
-- seeded DB (reset.sh) and later in the app repo. Everything is rolled back.
--   supabase-local/scripts/sb.sh test db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

-- ---------- helpers (rolled back with everything else) ----------
create schema bo_test;
grant usage on schema bo_test to public;
create table bo_test.v (k text primary key, v text not null);
grant all on bo_test.v to public;
create function bo_test.id(p_key text) returns text language sql stable as $$ select v from bo_test.v where k = p_key $$;
create function bo_test.as_user(p_uid text, p_aal text default 'aal1') returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
  select null::void $$;
create function bo_test.as_postgres() returns void language sql as $$
  select set_config('request.jwt.claims', '', true);
  select null::void $$;
grant execute on all functions in schema bo_test to public;

-- ---------- static guarantees ----------
select ok(not exists (
  select 1 from unnest(array['backoffice_admins','backoffice_audit_log','backoffice_account_reviews','backoffice_account_moderation',
     'backoffice_notes','backoffice_cases','backoffice_lead_status','app_remote_config','app_notices']) tb,
     unnest(array['anon','authenticated','service_role']) r, unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) p
  where has_table_privilege(r, 'public.' || tb, p)), 'no API role has any privilege on new tables');
select ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and (p.proname like 'backoffice\_%' or p.proname in ('is_backoffice_admin','app_write_blocked'))
    and has_function_privilege('anon', p.oid, 'EXECUTE')), 'anon cannot execute backoffice RPCs');
select ok(has_function_privilege('anon', 'public.app_bootstrap_config(text,text)', 'EXECUTE'), 'anon can call app_bootstrap_config');
select ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'backoffice_private'
    and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE'))),
  'backoffice_private not executable by clients');
select ok(not has_schema_privilege('authenticated', 'backoffice_private', 'USAGE'), 'backoffice_private schema closed');
select is((select count(*) from pg_policy where polrelid = 'public.saip_records'::regclass), 1::bigint, 'saip_records still has exactly one policy');
select ok(not has_table_privilege('authenticated', 'public.saip_records', 'INSERT')
          and not has_table_privilege('authenticated', 'public.saip_records', 'UPDATE'), 'saip_records still read-only for authenticated');
select is((select count(*) from pg_publication_tables where pubname = 'supabase_realtime'), 1::bigint, 'realtime publication unchanged');
select ok((select count(*) from public.app_remote_config where key in ('maintenance','min_app_version','feature_flags','support') and is_public) = 4,
  'seed config keys exist and are public');

-- ---------- people: app fixtures through the real commands ----------
insert into auth.users (id, email, aud, role, raw_user_meta_data, raw_app_meta_data, email_confirmed_at, created_at) values
 ('44444444-4444-4444-8444-444444444444', 'bo-retailer@app.test', 'authenticated', 'authenticated', '{"name":"백오피스 테스트 소매"}', '{"provider":"google"}', now(), now() - interval '3 days'),
 ('55555555-5555-4555-8555-555555555555', 'bo-uncle@app.test', 'authenticated', 'authenticated', '{"name":"백오피스 테스트 삼촌"}', '{"provider":"kakao"}', now(), now() - interval '3 days');
insert into storage.objects (bucket_id, name, metadata) values
 ('saip-attachments', '44444444-4444-4444-8444-444444444444/bo-doc-r', '{"size":100,"mimetype":"application/pdf"}'),
 ('saip-attachments', '44444444-4444-4444-8444-444444444444/bo-photo-r', '{"size":100,"mimetype":"image/png"}'),
 ('saip-attachments', '55555555-5555-4555-8555-555555555555/bo-doc-u', '{"size":100,"mimetype":"application/pdf"}');
insert into bo_test.v values
 ('retailer', '44444444-4444-4444-8444-444444444444'),
 ('uncle', '55555555-5555-4555-8555-555555555555'),
 ('doc', 'bo-doc-r'),
 ('docpath', '44444444-4444-4444-8444-444444444444/bo-doc-r'),
 ('req', 'bo-req-1'),
 ('lead', '77777777-7777-4777-8777-777777777777'),
 ('recheck', to_char((now() at time zone 'Asia/Seoul')::date + 3, 'YYYY-MM-DD'));

set local role authenticated;
select bo_test.as_user(bo_test.id('retailer'));
select is(public.saip_command('bootstrap', '{}', 'bo-r-init'), bo_test.id('retailer'), 'fixture: retailer bootstrap');
select lives_ok($$select public.saip_command('chooseRole', '{"role":"retailer"}', 'bo-r-role')$$, 'fixture: retailer role');
select lives_ok($$select public.saip_command('registerAttachment', '{"id":"bo-doc-r","name":"사업자등록증.pdf"}', 'bo-r-doc')$$, 'fixture: retailer document');
select lives_ok($$select public.saip_command('registerAttachment', '{"id":"bo-photo-r","name":"상품.png"}', 'bo-r-photo')$$, 'fixture: request photo');
select lives_ok($$select public.saip_command('saveProfile', '{"complete":true,"values":{"name":"백오피스 테스트 소매","contact":"김담당","phone":"010-9381-7264","businessName":"테스트 상점","businessNumber":"1234567890","documentId":"bo-doc-r","address":"서울 마포구 망원로 1","addressDetail":"1층","salesChannel":"온라인","terms":true,"privacy":true}}', 'bo-r-profile')$$,
  'fixture: retailer signup complete');
insert into bo_test.v select 'code', public.saip_snapshot() -> 'accounts' -> bo_test.id('retailer') ->> 'code';

select bo_test.as_user(bo_test.id('uncle'));
select lives_ok($$select public.saip_command('bootstrap', '{}', 'bo-u-init')$$, 'fixture: uncle bootstrap');
select lives_ok($$select public.saip_command('chooseRole', '{"role":"uncle"}', 'bo-u-role')$$, 'fixture: uncle role');
select lives_ok($$select public.saip_command('registerAttachment', '{"id":"bo-doc-u","name":"사업자등록증.pdf"}', 'bo-u-doc')$$, 'fixture: uncle document');
select lives_ok($$select public.saip_command('saveProfile', '{"complete":true,"values":{"name":"박삼촌","contact":"박삼촌","phone":"01055556666","businessName":"동대문 사입","businessNumber":"1234567890","documentId":"bo-doc-u","pickupArea":"동대문","deliveryArea":"서울","deadline":"23:00","terms":true,"privacy":true}}', 'bo-u-profile')$$,
  'fixture: uncle signup complete');
insert into bo_test.v select 'connection', public.saip_command('connect',
  jsonb_build_object('peerId', bo_test.id('retailer'), 'code', bo_test.id('code')), 'bo-u-connect');

select bo_test.as_user(bo_test.id('retailer'));
select lives_ok(format('select public.saip_command(%L, %L, %L)', 'respondConnection',
  jsonb_build_object('id', bo_test.id('connection'), 'status', 'accepted', 'version', 0)::text, 'bo-r-accept'), 'fixture: connection accepted');
select lives_ok(format('select public.saip_command(%L, %L, %L)', 'saveDraft', jsonb_build_object('id', 'bo-req-1', 'values', jsonb_build_object(
  'uncleId', bo_test.id('uncle'), 'wholesaler', '테스트 도매', 'location', '테스트상가 2층', 'product', '백오피스 셔츠', 'option', '검정 M',
  'quantity', 10, 'address', '서울 마포구 망원로 1', 'addressDetail', '1층', 'photos', jsonb_build_array('bo-photo-r')))::text, 'bo-r-draft'), 'fixture: draft');
select is(public.saip_command('sendDraft', '{"id":"bo-req-1"}', 'bo-r-send'), 'bo-req-1', 'fixture: request sent');
select lives_ok(format('select public.saip_command(%L, %L, %L)', 'sendMessage', jsonb_build_object('id', 'bo-msg-1', 'peerId', bo_test.id('uncle'),
  'body', '오늘 픽업 가능할까요? 010-1234-5678로 연락 주세요', 'attachments', '[]'::jsonb, 'requestId', 'bo-req-1')::text, 'bo-r-msg'), 'fixture: chat message');

select bo_test.as_user(bo_test.id('uncle'));
select lives_ok($$select public.saip_command('act', '{"id":"bo-req-1","action":"accept","version":0}', 'bo-u-acc')$$, 'fixture: request accepted');
select lives_ok(format('select public.saip_command(%L, %L, %L)', 'act', jsonb_build_object('id', 'bo-req-1', 'action', 'result', 'version', 1,
  'values', jsonb_build_object('acquired', 6, 'backorder', 4, 'reason', '미송', 'recheck', bo_test.id('recheck')))::text, 'bo-u-result'),
  'fixture: partial result with back-order');

-- ---------- people: staff (fixed UUIDs, @staff.test) and a landing lead ----------
reset role;
select bo_test.as_postgres();
insert into auth.users (id, email, aud, role, raw_app_meta_data, created_at) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'owner@staff.test', 'authenticated', 'authenticated', '{"provider":"google"}', now() - interval '2 days'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'operator@staff.test', 'authenticated', 'authenticated', '{"provider":"google"}', now() - interval '2 days'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'viewer@staff.test', 'authenticated', 'authenticated', '{"provider":"google"}', now() - interval '2 days'),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'mfa@staff.test', 'authenticated', 'authenticated', '{"provider":"google"}', now() - interval '2 days'),
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'owner2@staff.test', 'authenticated', 'authenticated', '{"provider":"google"}', now() - interval '2 days');
update auth.users set email_confirmed_at = now() where email like '%@staff.test' and email <> 'mfa@staff.test';
insert into public.backoffice_admins (user_id, role, display_name, require_mfa) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'owner', '대표', false),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'operator', '운영', false),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'viewer', '조회', false),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'operator', 'MFA', true);
insert into public.landing_leads (id, role, name, business_name, contact, market, message, source, consent) values
 (bo_test.id('lead')::uuid, 'retailer', '문의 테스트', '테스트 상점', '010-2222-3333', '동대문', '입점 문의드려요', 'landing-signup', true);
insert into auth.sessions (id, user_id, aal, created_at, updated_at) values (gen_random_uuid(), bo_test.id('retailer')::uuid, 'aal1', now(), now());
-- Remote-config versions at test start (the staff seed may already have bumped feature_flags).
insert into bo_test.v select 'v_' || key, version::text from public.app_remote_config
 where key in ('maintenance','min_app_version','feature_flags');

set local role authenticated;

-- ---------- app user cannot use admin RPCs ----------
select bo_test.as_user(bo_test.id('retailer'));
select throws_ok($$select public.backoffice_overview()$$, '42501', null, 'app user denied overview');
select throws_ok($$select public.backoffice_list_accounts()$$, '42501', null, 'app user denied accounts');
select ok(public.backoffice_whoami() @> '{"admin":false,"ready":false,"hasAppAccount":true}', 'whoami app user');
select ok(not public.is_backoffice_admin(), 'is_backoffice_admin false for app user');
select is(public.app_bootstrap_config('ios', '0.1.0+1') -> 'account' ->> 'status', 'active', 'bootstrap config for app user');
select ok(not (public.app_bootstrap_config('ios', '0.1.0') -> 'config' ? 'maintenance'), 'config payload has no duplicated gate keys');
reset role;
set local role anon;
select bo_test.as_postgres();
select throws_ok($$select public.backoffice_whoami()$$, '42501', null, 'anon cannot call whoami');
reset role;
set local role authenticated;

-- ---------- viewer ----------
select bo_test.as_user('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
select ok(public.backoffice_whoami() @> '{"admin":true,"role":"viewer","ready":true}', 'whoami viewer');
select ok((public.backoffice_overview(true) -> 'kpi') ? 'newRequests', 'overview kpi');
select is(jsonb_array_length(public.backoffice_overview(true) -> 'newRequestsByDay'), 14, 'overview 14-day series');
select ok((public.backoffice_list_accounts(p_include_demo => true) ->> 'total')::int >= 7, 'viewer lists accounts');
select ok(not exists (select 1 from jsonb_array_elements(public.backoffice_list_accounts(p_include_demo => true, p_limit => 200) -> 'rows') r
  where r ->> 'email' not like '_•••@%'), 'viewer emails masked');
select ok(exists (select 1 from jsonb_array_elements(public.backoffice_list_accounts(p_include_demo => true, p_limit => 200) -> 'rows') r
  where r ->> 'id' = bo_test.id('retailer') and r ->> 'email' = 'b•••@app.test'), 'viewer sees the masked fixture email');
select is((public.backoffice_list_accounts(p_search => '93817264') ->> 'total')::int, 0, 'viewer cannot search by phone');
select ok((public.backoffice_list_accounts(p_state => 'awaiting_review', p_include_demo => true) ->> 'total')::int >= 1, 'awaiting review filter');
select is(public.backoffice_get_account(bo_test.id('retailer')::uuid) -> 'account' ->> 'masked', 'true', 'viewer dossier masked');
select is(public.backoffice_get_account(bo_test.id('retailer')::uuid) -> 'account' ->> 'phone', '•••••••7264', 'viewer phone shows the last 4 digits only');
select ok(not (public.backoffice_get_account(bo_test.id('retailer')::uuid) -> 'account' ? 'code'), 'invite code never returned');
select is((public.backoffice_list_requests(p_labels => array['완료']) ->> 'total')::int,
          coalesce((public.backoffice_list_requests() -> 'labels' ->> '완료')::int, 0), 'label tab counts match');
select ok((public.backoffice_list_requests(p_attention => 'backorder') ->> 'total')::int >= 1, 'backorder filter');
select is(public.backoffice_get_request(bo_test.id('req')) -> 'request' ->> 'masked', 'true', 'viewer request masked');
select is(public.backoffice_get_request(bo_test.id('req')) -> 'request' ->> 'label', '미송 대기', 'request label mirrors the app');
select is(jsonb_array_length(public.backoffice_get_request(bo_test.id('req')) -> 'checks' -> 'violations'), 0, 'fixture request has no violations');
select ok((select bool_and((public.backoffice_list_records(c, p_include_demo => true) ->> 'total')::int >= 0)
  from unnest(array['connections','deliveries','receipts','proposals','issues','events','notices','attachments','signupProgress']) c),
  'list_records every collection');
select throws_ok($$select public.backoffice_list_records('drafts')$$, 'P0001', null, 'drafts never listed');
select throws_ok($$select public.backoffice_list_records('messages')$$, 'P0001', null, 'messages not listed');
select ok(not exists (select 1 from jsonb_array_elements(public.backoffice_list_records('notices', p_limit => 200) -> 'rows') r
  where r ->> 'kind' = 'chat' and r ->> 'title' <> '[채팅 알림]'), 'chat notice previews hidden');
select ok(not exists (select 1 from jsonb_array_elements(public.backoffice_list_records('attachments', p_limit => 200) -> 'rows') r
  where r ? 'name' or r ? 'path'), 'viewer attachment names hidden');
select ok((public.backoffice_list_conversations() ->> 'total')::int >= 1, 'conversation list');
select ok(not exists (select 1 from jsonb_array_elements(public.backoffice_list_conversations(p_limit => 200) -> 'rows') r
  where r::text like '%"body"%'), 'conversation list has no bodies');
select throws_ok($$select public.backoffice_get_conversation(bo_test.id('retailer')::uuid, bo_test.id('uncle')::uuid, '분쟁 확인을 위해')$$,
  '42501', null, 'viewer cannot read chats');
select throws_ok($$select public.backoffice_attachment_access(bo_test.id('doc'), '서류 검토 목적')$$, '42501', null, 'viewer cannot open files');
select throws_ok($$select public.backoffice_export('requests', '정기 점검용')$$, '42501', null, 'viewer cannot export');
select throws_ok($$select public.backoffice_list_audit()$$, '42501', null, 'viewer cannot read audit');
select throws_ok($$select public.backoffice_add_note('request', bo_test.id('req'), '메모', 'bo-v-note')$$, '42501', null, 'viewer cannot write notes');
select is(jsonb_typeof(public.backoffice_ledger_anomalies() -> 'items'), 'array', 'anomalies');
select is(jsonb_typeof(public.backoffice_search('테스트') -> 'accounts'), 'array', 'search');
select ok(exists (select 1 from jsonb_array_elements(public.backoffice_search('백오피스 셔츠') -> 'requests') x where x ->> 'id' = bo_test.id('req')),
  'search finds the request by product');
select ok(not exists (select 1 from jsonb_array_elements(public.backoffice_list_leads(p_limit => 200) -> 'rows') r where r ->> 'message' is not null),
  'viewer lead message hidden');
select ok(not exists (select 1 from jsonb_array_elements(public.backoffice_list_admins()) x where x ? 'email'), 'viewer sees no staff emails');

-- ---------- MFA ----------
select bo_test.as_user('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'aal1');
select throws_ok($$select public.backoffice_overview()$$, '42501', null, 'mfa required at aal1');
select ok(public.backoffice_whoami() @> '{"admin":true,"ready":false,"mfaRequired":true}', 'whoami not ready at aal1');
select bo_test.as_user('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'aal2');
select ok(public.backoffice_overview() ? 'kpi', 'mfa ok at aal2');

-- ---------- operator: sensitive reads ----------
select bo_test.as_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select ok(not (public.backoffice_get_account(bo_test.id('retailer')::uuid) -> 'account' ? 'masked'), 'operator dossier unmasked');
select is(public.backoffice_get_account(bo_test.id('retailer')::uuid) -> 'account' ->> 'phone', '010-9381-7264', 'operator sees the full phone');
select is((public.backoffice_list_audit(p_action => 'account.view', p_actor_id => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') ->> 'total')::int, 1,
  'account.view audited once (throttled)');
select is((public.backoffice_list_accounts(p_search => '93817264') ->> 'total')::int, 1, 'operator searches by phone');
select ok(not public.backoffice_can_read_object(bo_test.id('docpath')), 'no storage read before audited access');
select is(public.backoffice_attachment_access(bo_test.id('doc'), '사업자등록증 검토') ->> 'path', bo_test.id('docpath'), 'attachment access returns path');
select ok(public.backoffice_can_read_object(bo_test.id('docpath')), 'storage read allowed right after audited access');
select ok(jsonb_array_length(public.backoffice_get_conversation(bo_test.id('retailer')::uuid, bo_test.id('uncle')::uuid, '분쟁 확인을 위해') -> 'messages') >= 1,
  'operator reads chat with reason');
select ok(exists (select 1 from jsonb_array_elements(public.backoffice_get_conversation(bo_test.id('retailer')::uuid, bo_test.id('uncle')::uuid, '분쟁 확인을 위해') -> 'messages') m
    where m ->> 'body' like '%010-••••-5678%')
  and not exists (select 1 from jsonb_array_elements(public.backoffice_get_conversation(bo_test.id('retailer')::uuid, bo_test.id('uncle')::uuid, '분쟁 확인을 위해') -> 'messages') m
    where m ->> 'body' like '%1234-5678%'), 'phone numbers in chat masked');
select is((public.backoffice_list_audit(p_action => 'conversation', p_actor_id => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') ->> 'total')::int, 1,
  'conversation.view audited (throttled)');
select throws_ok($$select public.backoffice_get_conversation(bo_test.id('retailer')::uuid, bo_test.id('uncle')::uuid, '짧음')$$, 'P0001', null, 'chat reason required');
select ok((public.backoffice_export('requests', '정기 점검용 내보내기') ->> 'rowCount')::int >= 1, 'operator exports requests');
select throws_ok($$select public.backoffice_export('accounts', '정기 점검용 내보내기')$$, '42501', null, 'operator cannot export accounts');
select ok((public.backoffice_list_operations(p_account_id => bo_test.id('retailer')::uuid) ->> 'total')::int >= 1, 'operations ledger');
select ok(not exists (select 1 from jsonb_array_elements(public.backoffice_list_operations(p_limit => 200) -> 'rows') r where r ? 'args'),
  'operations never expose args');

-- ---------- document review ----------
select throws_ok($$select public.backoffice_review_document(bo_test.id('retailer')::uuid, 'wrong-doc', 'verified', p_operation_id => 'bo-rv-0')$$,
  'P0001', null, 'stale document id rejected');
select is(public.backoffice_review_document(bo_test.id('retailer')::uuid, bo_test.id('doc'), 'verified', p_operation_id => 'bo-rv-1') ->> 'verificationStatus',
  'verified', 'document verified');
select is(public.backoffice_review_document(bo_test.id('retailer')::uuid, bo_test.id('doc'), 'verified', p_operation_id => 'bo-rv-1') ->> 'verificationStatus',
  'verified', 'review replay returns stored result');
select throws_ok($$select public.backoffice_review_document(bo_test.id('retailer')::uuid, bo_test.id('doc'), 'reset', p_operation_id => 'bo-rv-1')$$,
  'P0001', '같은 작업 번호로 다른 내용을 전송할 수 없어요.', 'op id reuse with other payload rejected');
select bo_test.as_user('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
select is(public.backoffice_get_account(bo_test.id('retailer')::uuid) -> 'account' ->> 'verification', 'verified', 'verification state verified');
reset role;
select bo_test.as_postgres();
select ok((select readers = array[bo_test.id('retailer')::uuid] from public.saip_records where collection = 'accounts' and id = bo_test.id('retailer')),
  'readers unchanged after review');
set local role authenticated;
-- the user edits the business number: verified becomes stale; partners never see verification keys
select bo_test.as_user(bo_test.id('retailer'));
select lives_ok($$select public.saip_command('saveProfile', '{"values":{"businessNumber":"2222222222"}}', 'bo-r-bn')$$, 'retailer edits the business number');
select is(public.saip_snapshot() -> 'accounts' -> bo_test.id('retailer') ->> 'verificationStatus', 'verified', 'owner sees own verification keys');
select bo_test.as_user(bo_test.id('uncle'));
select ok(not exists (select 1 from jsonb_each(public.saip_snapshot() -> 'accounts') e
  where e.key <> bo_test.id('uncle') and (e.value ? 'verificationStatus' or e.value ? 'verifiedBusinessNumber')), 'partners never see verification keys');
select bo_test.as_user('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
select is(public.backoffice_get_account(bo_test.id('retailer')::uuid) -> 'account' ->> 'verification', 'stale', 'business number change makes verification stale');

-- ---------- suspension ----------
select bo_test.as_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select throws_ok($$select public.backoffice_set_account_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'suspended', '운영 계정 테스트', p_operation_id => 'bo-s-0')$$,
  '42501', null, 'operator cannot suspend staff');
select throws_ok($$select public.backoffice_set_account_status(bo_test.id('retailer')::uuid, 'suspended', '짧음', p_operation_id => 'bo-s-00')$$,
  'P0001', null, 'suspend needs reason');
select is(public.backoffice_set_account_status(bo_test.id('retailer')::uuid, 'suspended', '거래 분쟁 조사 중', '조사 중이라 잠시 이용이 제한돼요.', true, 'bo-s-1') ->> 'status',
  'suspended', 'suspended');
reset role;
select bo_test.as_postgres();
select ok((select banned_until > now() + interval '10 years' from auth.users where id = bo_test.id('retailer')::uuid), 'login banned');
select ok(not exists (select 1 from auth.sessions where user_id = bo_test.id('retailer')::uuid), 'sessions revoked');
set local role authenticated;
select bo_test.as_user(bo_test.id('retailer'));
select throws_ok($$select public.saip_command('renewCode', '{}', 'bo-r-renew-1')$$, 'P0001', '조사 중이라 잠시 이용이 제한돼요.', 'suspended user cannot write');
select ok(public.app_write_blocked(), 'app_write_blocked for suspended user');
select set_config('backoffice.bypass_guard', 'on', true);
select throws_ok($$select public.saip_command('renewCode', '{}', 'bo-r-renew-2')$$, 'P0001', null, 'bypass flag useless for non-staff');
select set_config('backoffice.bypass_guard', '', true);
select is(public.app_bootstrap_config('ios', '0.1.0') -> 'account' ->> 'status', 'suspended', 'bootstrap config shows suspension');
select throws_ok(format('insert into storage.objects (bucket_id, name, owner_id) values (%L, %L, %L)',
  'saip-attachments', bo_test.id('retailer') || '/bo-test-upload', bo_test.id('retailer')), '42501', null, 'suspended user cannot upload');
select bo_test.as_user(bo_test.id('uncle'));
select ok(public.saip_command('renewCode', '{}', 'bo-u-renew-1') is not null, 'counterpart keeps working');
select bo_test.as_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select is(public.backoffice_set_account_status(bo_test.id('retailer')::uuid, 'active', '조사 완료, 이상 없음', p_operation_id => 'bo-s-2') ->> 'status',
  'active', 'restored');
reset role;
select bo_test.as_postgres();
select ok((select banned_until is null from auth.users where id = bo_test.id('retailer')::uuid), 'ban lifted on restore');
set local role authenticated;
select bo_test.as_user(bo_test.id('retailer'));
select ok(public.saip_command('renewCode', '{}', 'bo-r-renew-3') is not null, 'restored user writes again');

-- ---------- maintenance write freeze ----------
select bo_test.as_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select throws_ok(format('select public.backoffice_set_config(%L, %L, %L, %s, p_operation_id => %L)', 'maintenance',
  '{"enabled":true,"blockWrites":true}', '정기 점검 시작', bo_test.id('v_maintenance'), 'bo-c-0'), '42501', null, 'operator cannot set maintenance');
select is((public.backoffice_set_config('feature_flags', '{"newRequest":true}', '새 요청 스위치 추가', bo_test.id('v_feature_flags')::int,
  p_operation_id => 'bo-c-ff') ->> 'version')::int, bo_test.id('v_feature_flags')::int + 1, 'operator sets feature flags');
select throws_ok(format('select public.backoffice_set_config(%L, %L, %L, %s, p_operation_id => %L)', 'feature_flags',
  '{"newRequest":"yes"}', '잘못된 값 테스트', bo_test.id('v_feature_flags')::int + 1, 'bo-c-ff2'), 'P0001', null, 'feature flag shape validated');
select throws_ok($$select public.backoffice_set_config('bo_new_key', '{}', '새 키 테스트용', null, p_operation_id => 'bo-c-new')$$,
  '42501', null, 'operator cannot create keys');
select bo_test.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select throws_ok(format('select public.backoffice_set_config(%L, %L, %L, %s, p_operation_id => %L)', 'maintenance',
  '{"enabled":false,"blockWrites":true}', '잘못된 점검 설정', bo_test.id('v_maintenance'), 'bo-c-1'), 'P0001', null, 'blockWrites requires enabled');
select is((public.backoffice_set_config('maintenance', '{"enabled":true,"blockWrites":true,"title":"점검","message":"10시까지 점검 중이에요."}',
  '정기 점검 시작', bo_test.id('v_maintenance')::int, p_operation_id => 'bo-c-2') ->> 'version')::int, bo_test.id('v_maintenance')::int + 1,
  'owner starts maintenance');
select bo_test.as_user(bo_test.id('uncle'));
select throws_ok($$select public.saip_command('renewCode', '{}', 'bo-u-renew-2')$$, 'P0001', '10시까지 점검 중이에요.', 'write freeze blocks app writes');
select ok(public.app_bootstrap_config('android', '0.1.0') -> 'maintenance' @> '{"active":true,"blockWrites":true}', 'bootstrap shows maintenance');
select bo_test.as_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select ok(public.backoffice_add_note('request', bo_test.id('req'), '점검 중에도 운영 메모는 남겨요', 'bo-n-maint') ? 'noteId', 'staff writes during freeze');
select bo_test.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select is((public.backoffice_set_config('maintenance', '{"enabled":false,"blockWrites":false}', '정기 점검 종료',
  bo_test.id('v_maintenance')::int + 1, p_operation_id => 'bo-c-3') ->> 'version')::int, bo_test.id('v_maintenance')::int + 2, 'owner ends maintenance');
select throws_ok(format('select public.backoffice_set_config(%L, %L, %L, %s, p_operation_id => %L)', 'maintenance',
  '{"enabled":false}', '버전 충돌 테스트', bo_test.id('v_maintenance')::int + 1, 'bo-c-4'), 'P0001', null, 'config optimistic version');
select ok(public.backoffice_set_config('min_app_version',
  '{"ios":{"minimum":"0.2.0","recommended":"0.3.0","storeUrl":"https://apps.apple.com/app/id1"},"message":"새 버전이 나왔어요."}',
  '필수 업데이트', bo_test.id('v_min_app_version')::int, p_operation_id => 'bo-c-5') ? 'version', 'owner sets min version');
select bo_test.as_user(bo_test.id('uncle'));
select ok(public.saip_command('renewCode', '{}', 'bo-u-renew-3') is not null, 'writes resume after maintenance');
select ok(public.app_bootstrap_config('ios', '0.1.0+1') -> 'update' @> '{"required":true,"recommended":true}', 'update required below minimum');
select ok(public.app_bootstrap_config('ios', '0.3.0') -> 'update' @> '{"required":false,"recommended":false}', 'no update at recommended');
select ok(public.app_bootstrap_config('android', '0.1.0') -> 'update' @> '{"required":false}', 'other platform unaffected');

-- ---------- notes, cases, idempotency with redacted payloads ----------
select bo_test.as_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select is(public.backoffice_add_note('request', bo_test.id('req'), '소매업자와 통화함', 'bo-n-1') ->> 'noteId',
          public.backoffice_add_note('request', bo_test.id('req'), '소매업자와 통화함', 'bo-n-1') ->> 'noteId', 'note replay returns same note');
select throws_ok($$select public.backoffice_add_note('request', bo_test.id('req'), '다른 내용', 'bo-n-1')$$, 'P0001', null, 'note op reuse rejected');
select ok(not exists (select 1 from jsonb_array_elements(public.backoffice_list_audit(p_action => 'note.add', p_limit => 200) -> 'rows') r
  where r::text like '%소매업자와 통화함%'), 'note body not in audit');
select throws_ok($$select public.backoffice_add_note('request', 'no-such-request', '메모', 'bo-n-2')$$, 'P0001', null, 'note target must exist');
insert into bo_test.v select 'case', public.backoffice_open_case('request', bo_test.id('req'), '수량 차이 확인', 'high',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '첫 메모', 'bo-k-1') ->> 'caseId';
select is(public.backoffice_open_case('request', bo_test.id('req'), '수량 차이 확인', 'high', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '첫 메모', 'bo-k-1') ->> 'caseId',
  bo_test.id('case'), 'case replay');
select throws_ok($$select public.backoffice_open_case('request', bo_test.id('req'), '중복 케이스', p_operation_id => 'bo-k-2')$$,
  'P0001', '이미 진행 중인 케이스가 있어요.', 'one open case per target');
select throws_ok($$select public.backoffice_open_case('request', bo_test.id('req'), '열람자 배정', 'normal', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', p_operation_id => 'bo-k-3')$$,
  'P0001', null, 'viewer cannot be assignee');
select is(public.backoffice_update_case(bo_test.id('case')::uuid, 0, 'resolved', p_note => '해결', p_operation_id => 'bo-k-4') ->> 'status', 'resolved', 'case resolved');
select throws_ok($$select public.backoffice_update_case(bo_test.id('case')::uuid, 0, 'open', p_operation_id => 'bo-k-5')$$, 'P0001', null, 'case optimistic version');

-- ---------- notices ----------
select throws_ok($$select public.backoffice_save_notice('긴급', '본문', 'all', p_severity => 'critical', p_operation_id => 'bo-nt-0')$$,
  '42501', null, 'critical notice needs owner');
select throws_ok($$select public.backoffice_save_notice('제목', '본문', 'all', p_link_url => 'http://x.test', p_operation_id => 'bo-nt-1')$$,
  'P0001', null, 'https only');
insert into bo_test.v select 'notice', public.backoffice_save_notice('소매업자 공지', '이번 주 일요일은 쉬어요.', 'retailer', p_active => true,
  p_operation_id => 'bo-nt-2') ->> 'noticeId';
select bo_test.as_user(bo_test.id('retailer'));
select ok(exists (select 1 from jsonb_array_elements(public.app_bootstrap_config('ios', '0.3.0') -> 'notices') n where n ->> 'id' = bo_test.id('notice')),
  'retailer sees retailer notice');
select bo_test.as_user(bo_test.id('uncle'));
select ok(not exists (select 1 from jsonb_array_elements(public.app_bootstrap_config('ios', '0.3.0') -> 'notices') n where n ->> 'id' = bo_test.id('notice')),
  'uncle does not see retailer notice');
reset role;
select bo_test.as_postgres();
set local role anon;
select ok(public.app_bootstrap_config('web', '0.1.0') -> 'account' = 'null'::jsonb
          and public.app_bootstrap_config('web', '0.1.0') -> 'notices' = '[]'::jsonb, 'anon gets gates only');
reset role;
set local role authenticated;

-- ---------- leads ----------
select bo_test.as_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select is(public.backoffice_set_lead_status(bo_test.id('lead')::uuid, 'contacted', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '전화 드림', 'bo-l-1') ->> 'status',
  'contacted', 'lead status');
select is(public.backoffice_set_lead_status(bo_test.id('lead')::uuid, 'contacted', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '전화 드림', 'bo-l-1') ->> 'status',
  'contacted', 'lead replay');
select ok((public.backoffice_list_leads(p_status => 'contacted') ->> 'total')::int >= 1, 'lead status filter');
select ok(exists (select 1 from jsonb_array_elements(public.backoffice_list_leads(p_status => 'contacted', p_limit => 200) -> 'rows') r
  where r ->> 'id' = bo_test.id('lead') and r ->> 'message' = '입점 문의드려요'), 'operator reads the lead message');

-- ---------- staff management ----------
select throws_ok($$select public.backoffice_grant_admin('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'owner', p_operation_id => 'bo-g-0')$$,
  '42501', null, 'operator cannot grant');
select bo_test.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select throws_ok($$select public.backoffice_grant_admin('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'viewer', p_operation_id => 'bo-g-1')$$,
  'P0001', null, 'no self change');
select throws_ok($$select public.backoffice_grant_admin(bo_test.id('retailer')::uuid, 'viewer', p_operation_id => 'bo-g-2')$$,
  'P0001', '앱 사용 계정과 분리된 운영 계정을 사용해 주세요.', 'app accounts refused by default');
select is(public.backoffice_lookup_user('OWNER2@staff.test') ->> 'userId', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'lookup by email (case-insensitive)');
select throws_ok($$select public.backoffice_grant_admin('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'viewer', p_operation_id => 'bo-g-unconfirmed')$$,
  'P0001', '이메일 인증을 마친 계정만 운영 계정으로 등록할 수 있어요.', 'unconfirmed email refused');
select is(public.backoffice_grant_admin('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'viewer', '새 열람자', false, false, 'bo-g-3') ->> 'role', 'viewer', 'grant viewer');
select is(public.backoffice_revoke_admin('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '테스트 종료로 해제', 'bo-g-4') ->> 'revoked', 'true', 'revoke');
select ok(exists (select 1 from jsonb_array_elements(public.backoffice_list_admins()) x where x ? 'email'), 'owner sees staff emails');
select ok((public.backoffice_export('accounts', '개인정보 점검 목적') ->> 'rowCount')::int >= 1, 'owner exports accounts');

-- ---------- audit chain ----------
select ok((public.backoffice_verify_audit_chain() ->> 'ok')::boolean, 'audit chain verifies');
reset role;
select bo_test.as_postgres();
select throws_ok($$update public.backoffice_audit_log set reason = 'x' where id = (select min(id) from public.backoffice_audit_log)$$,
  '42501', null, 'audit log immutable');
select throws_ok($$delete from public.backoffice_notes$$, '42501', null, 'notes immutable');
select throws_ok($$truncate public.backoffice_audit_log$$, '42501', null, 'audit log cannot be truncated');
alter table public.backoffice_audit_log disable trigger backoffice_audit_log_immutable;
update public.backoffice_audit_log set reason = 'tampered'
 where id = (select max(id) from public.backoffice_audit_log where actor_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
alter table public.backoffice_audit_log enable trigger backoffice_audit_log_immutable;
set local role authenticated;
select bo_test.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select ok(not (public.backoffice_verify_audit_chain() ->> 'ok')::boolean, 'tamper detected');

-- ---------- ledger violation detection ----------
reset role;
select bo_test.as_postgres();
update public.saip_records set data = data || jsonb_build_object('received', saip_private.n(data, 'delivered') + 5)
 where collection = 'requests' and id = bo_test.id('req');
set local role authenticated;
select bo_test.as_user('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
select ok(public.backoffice_get_request(bo_test.id('req')) -> 'checks' -> 'violations' ? 'received_gt_delivered', 'violation detected');
select ok((public.backoffice_list_requests(p_attention => 'violation') ->> 'total')::int >= 1, 'violation filter');
select ok(exists (select 1 from jsonb_array_elements(public.backoffice_ledger_anomalies() -> 'items') i
  where i ->> 'kind' = 'ledger_violation' and i ->> 'targetId' = bo_test.id('req')), 'anomaly listed');
select is(public.backoffice_overview() -> 'queue' -> 0 ->> 'kind', 'ledger_violation', 'dashboard queue shows violation first');
reset role;

select * from finish();
rollback;
