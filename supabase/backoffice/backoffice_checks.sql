\set ON_ERROR_STOP 1
-- Run with supabase/backoffice/run-checks.sh (BEGIN; migration x2; these checks; ROLLBACK).
-- Behaviour checks for the proposed backoffice layer on the LOCAL stack (PG17 + real
-- Supabase auth/storage/roles + seeded demo data). Wrapped in BEGIN ... ROLLBACK by the runner.
create schema t; grant usage on schema t to public;
create table t.v(k text primary key, v text); grant all on t.v to public;
create function t.expect_error(q text, code text, label text) returns text language plpgsql as $$
begin
  begin execute q; exception when others then
    if sqlstate = code then return 'PASS ' || label || ' [' || sqlstate || '] ' || left(sqlerrm, 90); end if;
    raise exception 'FAIL % expected % got % %', label, code, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL % expected error % but succeeded', label, code;
end $$;
create function t.ok(cond boolean, label text) returns text language plpgsql as $$
begin if cond is distinct from true then raise exception 'FAIL %', label; end if; return 'PASS ' || label; end $$;
create function t.as_user(uid text, aal text default 'aal1') returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, false) $$;
create function t.id(k text) returns text language sql stable as $$ select v from t.v where k = $1 $$;
grant execute on all functions in schema t to public;

-- ---------- static guarantees ----------
select t.ok(not exists (
  select 1 from unnest(array['backoffice_admins','backoffice_audit_log','backoffice_account_reviews','backoffice_account_moderation',
     'backoffice_notes','backoffice_cases','backoffice_lead_status','app_remote_config','app_notices']) tb,
     unnest(array['anon','authenticated','service_role']) r, unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) p
  where has_table_privilege(r, 'public.' || tb, p)), 'no API role has any privilege on new tables');
select t.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and (p.proname like 'backoffice\_%' or p.proname in ('is_backoffice_admin','app_write_blocked'))
    and has_function_privilege('anon', p.oid, 'EXECUTE')), 'anon cannot execute backoffice RPCs');
select t.ok(has_function_privilege('anon', 'public.app_bootstrap_config(text,text)', 'EXECUTE'), 'anon can call app_bootstrap_config');
select t.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'backoffice_private' and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE'))),
  'backoffice_private not executable by clients');
select t.ok(not has_schema_privilege('authenticated', 'backoffice_private', 'USAGE'), 'backoffice_private schema closed');
select t.ok((select array_agg(polname::text order by polname) from pg_policy where polrelid = 'public.saip_records'::regclass and polcmd = 'r') = array['participant_read','release_projection_only'], 'app participant and release policies preserved');
select t.ok(not has_table_privilege('authenticated', 'public.saip_records', 'INSERT') and not has_table_privilege('authenticated', 'public.saip_records', 'UPDATE'),
  'saip_records still read-only for authenticated');
select t.ok((select count(*) from pg_publication_tables where pubname = 'supabase_realtime') = 1, 'realtime publication unchanged');

-- ---------- people ----------
insert into auth.users(id, email, aud, role, raw_app_meta_data, created_at) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner@staff.test','authenticated','authenticated','{"provider":"google"}', now() - interval '2 days'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','operator@staff.test','authenticated','authenticated','{"provider":"google"}', now() - interval '2 days'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','viewer@staff.test','authenticated','authenticated','{"provider":"google"}', now() - interval '2 days'),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','mfa@staff.test','authenticated','authenticated','{"provider":"google"}', now() - interval '2 days'),
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','owner2@staff.test','authenticated','authenticated','{"provider":"google"}', now() - interval '2 days');
update auth.users set email_confirmed_at = now() where email like '%@staff.test' and email <> 'mfa@staff.test';
insert into public.backoffice_admins(user_id, role, display_name, require_mfa) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner','대표',false),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','operator','운영',false),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','viewer','조회',false),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','operator','MFA',true);
insert into t.v select 'retailer', id::text from auth.users where email = 'mangwon.select@demo.agentuncle.local';
insert into t.v select 'uncle', id::text from auth.users where email = 'dm.park@demo.agentuncle.local';
insert into t.v select 'doc', data->>'documentId' from public.saip_records where collection='accounts' and id = t.id('retailer');
insert into t.v select 'docpath', data->>'path' from public.saip_records where collection='attachments' and id = t.id('doc');
-- The staff seed (supabase-local/seed/backoffice-staff.mjs) may already have opened a case on a demo
-- request and bumped config versions, so pick a request without an open case and read the versions.
insert into t.v select 'req', id from public.saip_records r where collection='requests' and readers @> array[t.id('retailer')::uuid]
  and not exists (select 1 from public.backoffice_cases c where c.target_type = 'request' and c.target_id = r.id
                  and c.status in ('open','investigating','waiting'))
  order by updated_at desc limit 1;
insert into t.v select 'lead', id::text from public.landing_leads order by created_at limit 1;
insert into t.v select 'v_' || key, version::text from public.app_remote_config where key in ('maintenance','min_app_version','feature_flags');
insert into auth.sessions(id, user_id, aal, created_at, updated_at) values (gen_random_uuid(), t.id('retailer')::uuid, 'aal1', now(), now());

set role authenticated;

-- ---------- app user cannot use admin RPCs ----------
select t.as_user(t.id('retailer'));
select t.expect_error($$select public.backoffice_overview()$$, '42501', 'app user denied overview');
select t.expect_error($$select public.backoffice_list_accounts()$$, '42501', 'app user denied accounts');
select t.ok(public.backoffice_whoami() @> '{"admin":false,"ready":false,"hasAppAccount":true}', 'whoami app user');
select t.ok(not public.is_backoffice_admin(), 'is_backoffice_admin false for app user');
select t.ok(public.app_bootstrap_config('ios','0.1.0+1') -> 'account' ->> 'status' = 'active', 'bootstrap config for app user');
select t.ok(not (public.app_bootstrap_config('ios','0.1.0') -> 'config' ? 'maintenance'), 'config payload has no duplicated gate keys');

-- ---------- viewer ----------
select t.as_user('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
select t.ok(public.backoffice_whoami() @> '{"admin":true,"role":"viewer","ready":true}', 'whoami viewer');
select t.ok((public.backoffice_overview(true) -> 'kpi') ? 'newRequests', 'overview kpi');
select t.ok(jsonb_array_length(public.backoffice_overview(true) -> 'newRequestsByDay') = 14, 'overview 14-day series');
select t.ok((public.backoffice_list_accounts(p_include_demo => true) ->> 'total')::int >= 20, 'viewer lists accounts');
select t.ok(not exists (select 1 from jsonb_array_elements(public.backoffice_list_accounts(p_include_demo => true) -> 'rows') r
  where r ->> 'email' like '%demo.agentuncle.local' and r ->> 'email' not like '_•••@%'), 'viewer emails masked');
select t.ok((public.backoffice_list_accounts(p_search => '5678') ->> 'total')::int = 0, 'viewer cannot search by phone');
select t.ok((public.backoffice_list_accounts(p_state => 'awaiting_review', p_include_demo => true) ->> 'total')::int >= 1, 'awaiting review filter');
select t.ok(public.backoffice_get_account(t.id('retailer')::uuid) -> 'account' ->> 'masked' = 'true', 'viewer dossier masked');
select t.ok(not (public.backoffice_get_account(t.id('retailer')::uuid) -> 'account' ? 'code'), 'invite code never returned');
select t.ok((public.backoffice_list_requests(p_labels => array['수령(입금 전)']) ->> 'total')::int
            = (public.backoffice_list_requests() -> 'labels' ->> '수령(입금 전)')::int, 'label tab counts match');
select t.ok((public.backoffice_list_requests(p_attention => 'backorder') ->> 'total')::int >= 1, 'backorder filter');
select t.ok(public.backoffice_get_request(t.id('req')) -> 'request' ->> 'masked' = 'true', 'viewer request masked');
select t.ok(jsonb_array_length(public.backoffice_get_request(t.id('req')) -> 'checks' -> 'violations') = 0, 'seeded request has no violations');
select t.ok((select bool_and((public.backoffice_list_records(c, p_include_demo => true) ->> 'total')::int >= 0)
  from unnest(array['connections','deliveries','receipts','proposals','issues','events','notices','attachments','signupProgress']) c), 'list_records every collection');
select t.expect_error($$select public.backoffice_list_records('drafts')$$, 'P0001', 'drafts never listed');
select t.expect_error($$select public.backoffice_list_records('messages')$$, 'P0001', 'messages not listed');
select t.ok(not exists (select 1 from jsonb_array_elements(public.backoffice_list_records('notices', p_limit => 200) -> 'rows') r
  where r ->> 'kind' = 'chat' and r ->> 'title' <> '[채팅 알림]'), 'chat notice previews hidden');
select t.ok(not exists (select 1 from jsonb_array_elements(public.backoffice_list_records('attachments') -> 'rows') r
  where r ? 'name' or r ? 'path'), 'viewer attachment names hidden');
select t.ok((public.backoffice_list_conversations() ->> 'total')::int >= 1, 'conversation list');
select t.ok(not exists (select 1 from jsonb_array_elements(public.backoffice_list_conversations() -> 'rows') r where r::text like '%"body"%'), 'conversation list has no bodies');
select t.expect_error($$select public.backoffice_get_conversation(t.id('retailer')::uuid, t.id('uncle')::uuid, '분쟁 확인을 위해')$$, '42501', 'viewer cannot read chats');
select t.expect_error($$select public.backoffice_attachment_access(t.id('doc'), '서류 검토 목적')$$, '42501', 'viewer cannot open files');
select t.expect_error($$select public.backoffice_export('requests', '정기 점검용')$$, '42501', 'viewer cannot export');
select t.expect_error($$select public.backoffice_list_audit()$$, '42501', 'viewer cannot read audit');
select t.expect_error($$select public.backoffice_add_note('request', t.id('req'), '메모', 'v-note')$$, '42501', 'viewer cannot write notes');
select t.ok(jsonb_typeof(public.backoffice_ledger_anomalies() -> 'items') = 'array', 'anomalies');
select t.ok(jsonb_typeof(public.backoffice_search('셀렉트') -> 'accounts') = 'array', 'search');
select t.ok((public.backoffice_list_leads() -> 'rows' -> 0 ->> 'message') is null, 'viewer lead message hidden');
select t.ok(not exists (select 1 from jsonb_array_elements(public.backoffice_list_admins()) x where x ? 'email'), 'viewer sees no staff emails');

-- ---------- MFA ----------
select t.as_user('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'aal1');
select t.expect_error($$select public.backoffice_overview()$$, '42501', 'mfa required at aal1');
select t.ok(public.backoffice_whoami() @> '{"admin":true,"ready":false,"mfaRequired":true}', 'whoami not ready at aal1');
select t.as_user('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'aal2');
select t.ok(public.backoffice_overview() ? 'kpi', 'mfa ok at aal2');

-- ---------- operator: sensitive reads ----------
select t.as_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select t.ok(not (public.backoffice_get_account(t.id('retailer')::uuid) -> 'account' ? 'masked'), 'operator dossier unmasked');
select public.backoffice_get_account(t.id('retailer')::uuid);
select t.ok((public.backoffice_list_audit(p_action => 'account.view', p_actor_id => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') ->> 'total')::int = 1, 'account.view audited once (throttled)');
select t.ok(not public.backoffice_can_read_object(t.id('docpath')), 'no storage read before audited access');
select t.ok(public.backoffice_attachment_access(t.id('doc'), '사업자등록증 검토') ->> 'path' = t.id('docpath'), 'attachment access returns path');
select t.ok(public.backoffice_can_read_object(t.id('docpath')), 'storage read allowed right after audited access');
select t.ok(jsonb_array_length(public.backoffice_get_conversation(t.id('retailer')::uuid, t.id('uncle')::uuid, '분쟁 확인을 위해') -> 'messages') >= 0, 'operator reads chat with reason');
select t.ok((public.backoffice_list_audit(p_action => 'conversation', p_actor_id => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') ->> 'total')::int = 1, 'conversation.view audited');
select t.expect_error($$select public.backoffice_get_conversation(t.id('retailer')::uuid, t.id('uncle')::uuid, '짧음')$$, 'P0001', 'chat reason required');
select t.ok((public.backoffice_export('requests', '정기 점검용 내보내기') ->> 'rowCount')::int >= 1, 'operator exports requests');
select t.expect_error($$select public.backoffice_export('accounts', '정기 점검용 내보내기')$$, '42501', 'operator cannot export accounts');
select t.ok((public.backoffice_list_operations(p_account_id => t.id('retailer')::uuid) ->> 'total')::int >= 1, 'operations ledger');
select t.ok(not exists (select 1 from jsonb_array_elements(public.backoffice_list_operations() -> 'rows') r where r ? 'args'), 'operations never expose args');

-- ---------- document review ----------
select t.expect_error($$select public.backoffice_review_document(t.id('retailer')::uuid, 'wrong-doc', 'verified', p_operation_id => 'rv-0')$$, 'P0001', 'stale document id rejected');
select t.ok(public.backoffice_review_document(t.id('retailer')::uuid, t.id('doc'), 'verified', p_operation_id => 'rv-1') ->> 'verificationStatus' = 'verified', 'document verified');
select t.ok(public.backoffice_review_document(t.id('retailer')::uuid, t.id('doc'), 'verified', p_operation_id => 'rv-1') ->> 'verificationStatus' = 'verified', 'review replay returns stored result');
select t.expect_error($$select public.backoffice_review_document(t.id('retailer')::uuid, t.id('doc'), 'reset', p_operation_id => 'rv-1')$$, 'P0001', 'op id reuse with other payload rejected');
select t.as_user('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
select t.ok((public.backoffice_get_account(t.id('retailer')::uuid) -> 'account' ->> 'verification') = 'verified', 'verification state verified');
select t.as_user('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
reset role;
select set_config('request.jwt.claims', '', false);
select t.ok((select readers = array[t.id('retailer')::uuid] from public.saip_records where collection='accounts' and id = t.id('retailer')), 'readers unchanged after review');
set role authenticated;
-- the user edits the business number: verified becomes stale; partners never see verification keys
select t.as_user(t.id('retailer'));
select public.saip_command('saveProfile', '{"values":{"businessNumber":"2222222222"}}', 'bo-test-bn');
select t.ok(public.saip_snapshot() -> 'accounts' -> t.id('retailer') ->> 'verificationStatus' = 'verified', 'owner sees own verification keys');
select t.as_user(t.id('uncle'));
select t.ok(not exists (select 1 from jsonb_each(public.saip_snapshot() -> 'accounts') e
  where e.key <> t.id('uncle') and (e.value ? 'verificationStatus' or e.value ? 'verifiedBusinessNumber')), 'partners never see verification keys');
select t.as_user('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
select t.ok((public.backoffice_get_account(t.id('retailer')::uuid) -> 'account' ->> 'verification') = 'stale', 'business number change makes verification stale');

-- ---------- suspension ----------
select t.as_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select t.expect_error($$select public.backoffice_set_account_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'suspended', '운영 계정 테스트', p_operation_id => 's-0')$$, '42501', 'operator cannot suspend staff');
select t.expect_error($$select public.backoffice_set_account_status(t.id('retailer')::uuid, 'suspended', '짧음', p_operation_id => 's-00')$$, 'P0001', 'suspend needs reason');
select t.ok(public.backoffice_set_account_status(t.id('retailer')::uuid, 'suspended', '거래 분쟁 조사 중', '조사 중이라 잠시 이용이 제한돼요.', true, 's-1') ->> 'status' = 'suspended', 'suspended');
reset role;
select set_config('request.jwt.claims', '', false);
select t.ok((select banned_until > now() + interval '10 years' from auth.users where id = t.id('retailer')::uuid), 'login banned');
select t.ok(not exists (select 1 from auth.sessions where user_id = t.id('retailer')::uuid), 'sessions revoked');
set role authenticated;
select t.as_user(t.id('retailer'));
select t.expect_error($$select public.saip_command('renewCode', '{}', 'bo-test-renew-1')$$, 'P0001', 'suspended user cannot write');
select t.ok(public.app_write_blocked(), 'app_write_blocked for suspended user');
select set_config('backoffice.bypass_guard', 'on', false);
select t.expect_error($$select public.saip_command('renewCode', '{}', 'bo-test-renew-2')$$, 'P0001', 'bypass flag useless for non-staff');
select set_config('backoffice.bypass_guard', '', false);
select t.ok(public.app_bootstrap_config('ios', '0.1.0') -> 'account' ->> 'status' = 'suspended', 'bootstrap config shows suspension');
select t.expect_error($$insert into storage.objects(bucket_id, name, owner_id) values ('saip-attachments', t.id('retailer') || '/bo-test-upload', t.id('retailer'))$$, '42501', 'suspended user cannot upload');
select t.as_user(t.id('uncle'));
select t.ok(public.saip_command('renewCode', '{}', 'bo-test-renew-uncle') is not null, 'counterpart keeps working');
select t.as_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select t.ok(public.backoffice_set_account_status(t.id('retailer')::uuid, 'active', '조사 완료, 이상 없음', p_operation_id => 's-2') ->> 'status' = 'active', 'restored');
reset role;
select set_config('request.jwt.claims', '', false);
select t.ok((select banned_until is null from auth.users where id = t.id('retailer')::uuid), 'ban lifted on restore');
set role authenticated;
select t.as_user(t.id('retailer'));
select t.ok(public.saip_command('renewCode', '{}', 'bo-test-renew-3') is not null, 'restored user writes again');

-- ---------- maintenance write freeze ----------
select t.as_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select t.expect_error($$select public.backoffice_set_config('maintenance', '{"enabled":true,"blockWrites":true}', '정기 점검 시작', t.id('v_maintenance')::int, p_operation_id => 'c-0')$$, '42501', 'operator cannot set maintenance');
select t.ok((public.backoffice_set_config('feature_flags', '{"newRequest":true}', '새 요청 스위치 추가', t.id('v_feature_flags')::int, p_operation_id => 'c-ff') ->> 'version')::int = t.id('v_feature_flags')::int + 1, 'operator sets feature flags');
select t.expect_error($$select public.backoffice_set_config('feature_flags', '{"newRequest":"yes"}', '잘못된 값 테스트', t.id('v_feature_flags')::int + 1, p_operation_id => 'c-ff2')$$, 'P0001', 'feature flag shape validated');
select t.expect_error($$select public.backoffice_set_config('new_key', '{}', '새 키 테스트용', null, p_operation_id => 'c-new')$$, '42501', 'operator cannot create keys');
select t.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select t.expect_error($$select public.backoffice_set_config('maintenance', '{"enabled":false,"blockWrites":true}', '잘못된 점검 설정', t.id('v_maintenance')::int, p_operation_id => 'c-1')$$, 'P0001', 'blockWrites requires enabled');
select t.ok((public.backoffice_set_config('maintenance', '{"enabled":true,"blockWrites":true,"title":"점검","message":"10시까지 점검 중이에요."}', '정기 점검 시작', t.id('v_maintenance')::int, p_operation_id => 'c-2') ->> 'version')::int = t.id('v_maintenance')::int + 1, 'owner starts maintenance');
select t.as_user(t.id('uncle'));
select t.expect_error($$select public.saip_command('renewCode', '{}', 'bo-test-renew-4')$$, 'P0001', 'write freeze blocks app writes');
select t.ok(public.app_bootstrap_config('android', '0.1.0') -> 'maintenance' @> '{"active":true,"blockWrites":true}', 'bootstrap shows maintenance');
select t.as_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select t.ok(public.backoffice_add_note('request', t.id('req'), '점검 중에도 운영 메모는 남겨요', 'n-maint') ? 'noteId', 'staff writes during freeze');
select t.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select t.ok((public.backoffice_set_config('maintenance', '{"enabled":false,"blockWrites":false}', '정기 점검 종료', t.id('v_maintenance')::int + 1, p_operation_id => 'c-3') ->> 'version')::int = t.id('v_maintenance')::int + 2, 'owner ends maintenance');
select t.expect_error($$select public.backoffice_set_config('maintenance', '{"enabled":false}', '버전 충돌 테스트', t.id('v_maintenance')::int + 1, p_operation_id => 'c-4')$$, 'P0001', 'config optimistic version');
select t.ok(public.backoffice_set_config('min_app_version', '{"ios":{"minimum":"0.2.0","recommended":"0.3.0","storeUrl":"https://apps.apple.com/app/id1"},"message":"새 버전이 나왔어요."}', '필수 업데이트', t.id('v_min_app_version')::int, p_operation_id => 'c-5') ? 'version', 'owner sets min version');
select t.as_user(t.id('uncle'));
select t.ok(public.saip_command('renewCode', '{}', 'bo-test-renew-5') is not null, 'writes resume after maintenance');
select t.ok(public.app_bootstrap_config('ios', '0.1.0+1') -> 'update' @> '{"required":true,"recommended":true}', 'update required below minimum');
select t.ok(public.app_bootstrap_config('ios', '0.3.0') -> 'update' @> '{"required":false,"recommended":false}', 'no update at recommended');
select t.ok(public.app_bootstrap_config('android', '0.1.0') -> 'update' @> '{"required":false}', 'other platform unaffected');

-- ---------- live app schema: 도매처 주문서 (202610130004), message menu (202610130000), phone check (202610120001) ----------
reset role;
select set_config('request.jwt.claims', '', false);
create function t.expect_message(q text, msg text, label text) returns text language plpgsql as $f$
begin
  begin execute q; exception when others then
    if sqlerrm = msg then return 'PASS ' || label || ' [' || sqlstate || '] ' || left(sqlerrm, 90); end if;
    raise exception 'FAIL % expected "%" got % %', label, msg, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL % expected an error but succeeded', label;
end $f$;
grant execute on function t.expect_message(text, text, text) to public;
insert into t.v select 'deliveryNote', data ->> 'deliveryNote' from public.saip_records where collection = 'accounts' and id = t.id('retailer');
select t.ok((select tgname from pg_trigger where tgrelid = 'public.saip_records'::regclass and not tgisinternal order by tgname limit 1)
  = 'backoffice_guard_app_writes', 'guard is the first saip_records trigger');
select t.ok(backoffice_private.request_label('{"status":"completed","quantity":2,"acquired":2,"delivered":2,"received":2}') = '수령(입금 전)', 'received without payment remains unpaid');
select t.ok(backoffice_private.request_label('{"status":"completed","quantity":2,"acquired":2,"delivered":2,"received":2,"receivedAt":"2020-01-01"}') = '수령(입금 전)', 'age never implies payment');
select t.ok(backoffice_private.request_label('{"status":"completed","quantity":2,"acquired":2,"delivered":2,"received":2,"paymentReported":true}') = '입금 완료', 'receipt plus reported payment completes the request');
select t.ok(backoffice_private.request_title('{"requestType":"wholesaler","product":"","wholesalers":[{"wholesaler":"A","location":"1층"},{"wholesaler":"B","location":"2층"}]}') = 'A 외 1곳'
  and backoffice_private.request_title('{"product":"셔츠","wholesaler":"A"}') = '셔츠', 'request title mirrors the app');
set role authenticated;
select t.as_user(t.id('retailer'));
select t.ok(public.saip_command('saveDraft', jsonb_build_object('id', 'bo-check-w1', 'values', jsonb_build_object('uncleId', t.id('uncle'),
  'requestType', 'wholesaler', 'wholesalers', jsonb_build_array(jsonb_build_object('wholesaler', '르블랑', 'location', '제일평화 3층 318호'),
    jsonb_build_object('wholesaler', '라인바이', 'location', '제일평화 3층 305호')))), 'bo-check-w1-draft') = 'bo-check-w1'
  and public.saip_command('sendDraft', '{"id":"bo-check-w1"}', 'bo-check-w1-send') = 'bo-check-w1', 'wholesaler request sent with the guard installed');
select t.ok(public.saip_command('sendMessage', jsonb_build_object('id', 'bo-check-m1', 'peerId', t.id('uncle'), 'body', '수정 전 010-1111-2222', 'attachments', '[]'::jsonb), 'bo-check-m1') = 'bo-check-m1'
  and public.saip_command('editMessage', '{"id":"bo-check-m1","body":"수정 후 010-3333-4444","version":0}', 'bo-check-m1-edit') = 'bo-check-m1', 'editMessage with the guard installed');
select t.ok(public.saip_command('sendMessage', jsonb_build_object('id', 'bo-check-m2', 'peerId', t.id('uncle'), 'body', '지울 메시지', 'attachments', '[]'::jsonb), 'bo-check-m2') = 'bo-check-m2'
  and public.saip_command('deleteMessage', '{"id":"bo-check-m2","version":0}', 'bo-check-m2-del') = 'bo-check-m2', 'deleteMessage with the guard installed');
select t.ok(public.saip_check_phone_available('010-0000-0000'), 'phone availability check unaffected');
select t.as_user('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
select t.ok(exists (select 1 from jsonb_array_elements(public.backoffice_list_requests(p_attention => 'wholesaler', p_limit => 200) -> 'rows') r
  where r ->> 'id' = 'bo-check-w1' and r ->> 'requestType' = 'wholesaler' and r ->> 'title' = '르블랑 외 1곳'
    and jsonb_array_length(r -> 'wholesalers') = 2 and r ->> 'label' = '확인 대기'), 'wholesaler request listed with type, title and wholesalers');
select t.ok(exists (select 1 from jsonb_array_elements(public.backoffice_search('라인바이') -> 'requests') x where x ->> 'id' = 'bo-check-w1'),
  'search finds a request by its second wholesaler');
select t.ok(public.backoffice_get_request('bo-check-w1') -> 'request' @> '{"masked":true,"note":"","addressDetail":""}', 'viewer: profile delivery note of a wholesaler request blank');
select t.ok((select (r ->> 'edited')::int >= 1 and (r ->> 'deleted')::int >= 1 from jsonb_array_elements(public.backoffice_list_conversations(p_account_id => t.id('retailer')::uuid, p_limit => 200) -> 'rows') r
  where t.id('uncle') in (r -> 'accountA' ->> 'id', r -> 'accountB' ->> 'id')), 'conversation list counts edited and deleted messages');
select t.as_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select t.ok(public.backoffice_get_request('bo-check-w1') -> 'request' ->> 'note' = t.id('deliveryNote')
  and t.id('deliveryNote') <> '', 'operator sees the copied delivery note');
select t.ok((select bool_and(case m ->> 'id' when 'bo-check-m1' then m ->> 'body' = '수정 후 010-••••-4444' and m ? 'editedAt'
                                       when 'bo-check-m2' then m ->> 'body' = '' and (m ->> 'deleted')::boolean end) and count(*) = 2
  from jsonb_array_elements(public.backoffice_get_conversation(t.id('retailer')::uuid, t.id('uncle')::uuid, '메시지 수정 이력 확인') -> 'messages') m
  where m ->> 'id' in ('bo-check-m1','bo-check-m2')), 'transcript shows the edited body (masked) and the deleted message blank');
select t.ok(public.backoffice_set_account_status(t.id('retailer')::uuid, 'suspended', '메시지 수정 차단 확인', '이용이 잠시 제한됐어요.', false, 's-w1') ->> 'status' = 'suspended', 'suspended again');
select t.as_user(t.id('retailer'));
select t.expect_message($$select public.saip_command('editMessage', '{"id":"bo-check-m1","body":"정지 중 수정","version":1}', 'bo-check-m1-edit2')$$, '이용이 잠시 제한됐어요.', 'suspended user cannot edit a message');
select t.expect_message($$select public.saip_command('deleteMessage', '{"id":"bo-check-m1","version":1}', 'bo-check-m1-del')$$, '이용이 잠시 제한됐어요.', 'suspended user cannot delete a message');
select t.expect_message($$select public.saip_command('updateRequest', jsonb_build_object('id', 'bo-check-w1', 'version', 0, 'values', jsonb_build_object('requestType', 'wholesaler',
  'wholesalers', jsonb_build_array(jsonb_build_object('wholesaler', '르블랑', 'location', '제일평화 3층 318호')))), 'bo-check-w1-upd')$$, '이용이 잠시 제한됐어요.', 'suspended user cannot change a wholesaler request');
select t.as_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select t.ok(public.backoffice_set_account_status(t.id('retailer')::uuid, 'active', '확인 완료, 정지 해제', p_operation_id => 's-w2') ->> 'status' = 'active', 'restored again');
select t.as_user(t.id('retailer'));
select t.ok(public.saip_command('editMessage', '{"id":"bo-check-m1","body":"해제 후 수정","version":1}', 'bo-check-m1-edit3') = 'bo-check-m1', 'restored user edits again');
reset role;
select set_config('request.jwt.claims', '', false);
insert into auth.users (id, email, aud, role) values ('99999999-9999-4999-8999-999999999999', 'dup-phone@app.test', 'authenticated', 'authenticated');
insert into public.saip_records (collection, id, data, readers) values ('accounts', '99999999-9999-4999-8999-999999999999',
  jsonb_build_object('role', 'retailer', 'complete', true, 'phone', '+82 ' || substr(regexp_replace((select data ->> 'phone' from public.saip_records
    where collection = 'accounts' and id = t.id('retailer')), '\D', '', 'g'), 2)), array['99999999-9999-4999-8999-999999999999'::uuid]);
set role authenticated;
select t.as_user('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
select t.ok((select count(*) from jsonb_array_elements(public.backoffice_ledger_anomalies(true) -> 'items') i
  where i ->> 'kind' = 'phone_duplicate' and i ->> 'targetId' in (t.id('retailer'), '99999999-9999-4999-8999-999999999999')) = 2, 'duplicate phones listed for both accounts');

-- ---------- notes, cases, idempotency with redacted payloads ----------
select t.as_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select t.ok((public.backoffice_add_note('request', t.id('req'), '고객과 통화함', 'n-1') ->> 'noteId')
          = (public.backoffice_add_note('request', t.id('req'), '고객과 통화함', 'n-1') ->> 'noteId'), 'note replay returns same note');
select t.expect_error($$select public.backoffice_add_note('request', t.id('req'), '다른 내용', 'n-1')$$, 'P0001', 'note op reuse rejected');
select t.ok(not exists (select 1 from jsonb_array_elements(public.backoffice_list_audit(p_action => 'note.add') -> 'rows') r where r::text like '%고객과 통화함%'), 'note body not in audit');
select t.expect_error($$select public.backoffice_add_note('request', 'no-such-request', '메모', 'n-2')$$, 'P0001', 'note target must exist');
insert into t.v select 'case', public.backoffice_open_case('request', t.id('req'), '수량 차이 확인', 'high', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '첫 메모', 'k-1') ->> 'caseId';
select t.ok((public.backoffice_open_case('request', t.id('req'), '수량 차이 확인', 'high', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '첫 메모', 'k-1') ->> 'caseId') = t.id('case'), 'case replay');
select t.expect_error($$select public.backoffice_open_case('request', t.id('req'), '중복 케이스', p_operation_id => 'k-2')$$, 'P0001', 'one open case per target');
select t.expect_error($$select public.backoffice_open_case('request', t.id('req'), '열람자 배정', 'normal', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', p_operation_id => 'k-3')$$, 'P0001', 'viewer cannot be assignee');
select t.ok(public.backoffice_update_case(t.id('case')::uuid, 0, 'resolved', p_note => '해결', p_operation_id => 'k-4') ->> 'status' = 'resolved', 'case resolved');
select t.expect_error($$select public.backoffice_update_case(t.id('case')::uuid, 0, 'open', p_operation_id => 'k-5')$$, 'P0001', 'case optimistic version');

-- ---------- notices ----------
select t.expect_error($$select public.backoffice_save_notice('긴급', '본문', 'all', p_severity => 'critical', p_operation_id => 'nt-0')$$, '42501', 'critical notice needs owner');
select t.expect_error($$select public.backoffice_save_notice('제목', '본문', 'all', p_link_url => 'http://x.test', p_operation_id => 'nt-1')$$, 'P0001', 'https only');
insert into t.v select 'notice', public.backoffice_save_notice('소매업자 공지', '이번 주 일요일은 쉬어요.', 'retailer', p_active => true, p_operation_id => 'nt-2') ->> 'noticeId';
select t.as_user(t.id('retailer'));
select t.ok(exists (select 1 from jsonb_array_elements(public.app_bootstrap_config('ios', '0.3.0') -> 'notices') n where n ->> 'id' = t.id('notice')), 'retailer sees retailer notice');
select t.as_user(t.id('uncle'));
select t.ok(not exists (select 1 from jsonb_array_elements(public.app_bootstrap_config('ios', '0.3.0') -> 'notices') n where n ->> 'id' = t.id('notice')), 'uncle does not see retailer notice');
reset role;
select set_config('request.jwt.claims', '', false);
set role anon;
select t.ok(public.app_bootstrap_config('web', '0.1.0') -> 'account' = 'null'::jsonb and public.app_bootstrap_config('web', '0.1.0') -> 'notices' = '[]'::jsonb, 'anon gets gates only');
reset role;
set role authenticated;

-- ---------- leads ----------
select t.as_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select t.ok(public.backoffice_set_lead_status(t.id('lead')::uuid, 'contacted', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '전화 드림', 'l-1') ->> 'status' = 'contacted', 'lead status');
select t.ok((public.backoffice_set_lead_status(t.id('lead')::uuid, 'contacted', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '전화 드림', 'l-1') ->> 'status') = 'contacted', 'lead replay');
select t.ok((public.backoffice_list_leads(p_status => 'contacted') ->> 'total')::int >= 1, 'lead status filter');

-- ---------- staff management ----------
select t.expect_error($$select public.backoffice_grant_admin('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'owner', p_operation_id => 'g-0')$$, '42501', 'operator cannot grant');
select t.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select t.expect_error($$select public.backoffice_grant_admin('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'viewer', p_operation_id => 'g-1')$$, 'P0001', 'no self change');
select t.expect_error($$select public.backoffice_grant_admin(t.id('retailer')::uuid, 'viewer', p_operation_id => 'g-2')$$, 'P0001', 'app accounts refused by default');
select t.ok(public.backoffice_lookup_user('OWNER2@staff.test') ->> 'userId' = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'lookup by email (case-insensitive)');
select t.expect_error($$select public.backoffice_grant_admin('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'viewer', p_operation_id => 'g-unconfirmed')$$, 'P0001', 'unconfirmed email refused');
select t.ok(public.backoffice_grant_admin('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'viewer', '새 열람자', false, false, 'g-3') ->> 'role' = 'viewer', 'grant viewer');
select t.ok(public.backoffice_revoke_admin('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '테스트 종료로 해제', 'g-4') ->> 'revoked' = 'true', 'revoke');
select t.ok(exists (select 1 from jsonb_array_elements(public.backoffice_list_admins()) x where x ? 'email'), 'owner sees staff emails');
select t.ok((public.backoffice_export('accounts', '개인정보 점검 목적') ->> 'rowCount')::int >= 1, 'owner exports accounts');

-- ---------- audit chain ----------
select t.ok((public.backoffice_verify_audit_chain() ->> 'ok')::boolean, 'audit chain verifies');
reset role;
select set_config('request.jwt.claims', '', false);
select t.expect_error($$update public.backoffice_audit_log set reason = 'x' where id = (select min(id) from public.backoffice_audit_log)$$, '42501', 'audit log immutable');
select t.expect_error($$delete from public.backoffice_notes$$, '42501', 'notes immutable');
alter table public.backoffice_audit_log disable trigger backoffice_audit_log_immutable;
update public.backoffice_audit_log set reason = 'tampered' where id = (select id from public.backoffice_audit_log order by id offset 2 limit 1);
alter table public.backoffice_audit_log enable trigger backoffice_audit_log_immutable;
set role authenticated;
select t.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select t.ok(not (public.backoffice_verify_audit_chain() ->> 'ok')::boolean, 'tamper detected');

-- ---------- ledger violation detection ----------
reset role;
select set_config('request.jwt.claims', '', false);
update public.saip_records set data = data || jsonb_build_object('received', saip_private.n(data, 'delivered') + 5) where collection = 'requests' and id = t.id('req');
set role authenticated;
select t.as_user('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
select t.ok(public.backoffice_get_request(t.id('req')) -> 'checks' -> 'violations' ? 'received_gt_delivered', 'violation detected');
select t.ok((public.backoffice_list_requests(p_attention => 'violation') ->> 'total')::int >= 1, 'violation filter');
select t.ok(exists (select 1 from jsonb_array_elements(public.backoffice_ledger_anomalies() -> 'items') i where i ->> 'kind' = 'ledger_violation'), 'anomaly listed');
select t.ok(exists (select 1 from jsonb_array_elements(public.backoffice_overview() -> 'queue') i where i ->> 'kind' = 'ledger_violation'), 'dashboard queue shows violation first');
reset role;
select 'ALL CHECKS PASSED' as result;
