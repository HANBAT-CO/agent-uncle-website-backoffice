-- =============================================================================
-- 20261013090000_backoffice_admin_layer.sql                         PROPOSED
-- -----------------------------------------------------------------------------
-- Backoffice (/admin) data layer for 사입삼춘 (Agent Uncle) on the shared
-- Supabase project. Ship ONLY through the app repo (agent-uncle), which owns
-- supabase_migrations.schema_migrations: copy -> `supabase test db` -> app
-- team review -> `supabase db push`. Never run it from the website repo
-- against the live project.
-- Requires the live app schema (supabase_migrations on 2026-10-14):
--   202610110001..202610110006, 202610120001_signup_phone_availability,
--   202610130000_chat_message_actions_hotfix, 202610130004_wholesaler_requests,
--   and 20261011230000_landing_leads (applied outside the history).
-- Forward compatible with 202610130001_partner_directory,
--   202610130002_chat_message_actions and 202610130003_chat_content_filter
--   applied AFTER this file (verified locally): it reads only keys and
--   helpers those migrations keep (saip_private.s/n/b/pick/remaining/available/
--   valid_*/normalize_korean_phone), never redefines a saip_* object, and the
--   guard below bypasses migrations (auth.uid() is null there).
--
-- Guarantees
--  1. App users' access is unchanged. No new policy or grant on saip_records,
--     no change to any saip_* function or table, and anon / authenticated /
--     service_role get NO table privilege on the new tables. App-visible
--     effects are only:
--       a) trigger backoffice_guard_app_writes + one RESTRICTIVE storage
--          INSERT policy: a suspended account (or everyone, during a
--          maintenance write freeze) cannot write. The command aborts as a
--          whole with a P0001 carrying the operator's message. This covers
--          every saip_command write, including editMessage / deleteMessage
--          and wholesaler (도매처 주문서) requests; the guard fires before
--          saip_keep_participants / saip_prepare_wholesaler_record (trigger
--          name order) and changes no row;
--       b) the read-only RPC app_bootstrap_config() (anon + authenticated).
--  2. Staff never appear in saip_records.readers. Every staff read and write
--     goes through a SECURITY DEFINER RPC that starts with require_admin().
--  3. Staff writes never touch requests, deliveries, receipts, proposals,
--     issues, events, messages, notices or drafts. The only saip_records write
--     is the verification projection on an accounts row (keys saveProfile
--     cannot set), serialized with saip_command through 'saip-actor-{uid}'.
--  4. Every staff write and every sensitive read appends an immutable,
--     sha256 hash-chained audit row in the same transaction. Writes are
--     idempotent through p_operation_id (same contract as saip_command).
--  5. Idempotent file: if not exists / create or replace / drop-then-create /
--     on conflict do nothing. Realtime publication is NOT changed.
-- =============================================================================

set lock_timeout = '5s';

create schema if not exists backoffice_private;
revoke all on schema backoffice_private from public, anon, authenticated;

create or replace function backoffice_private.role_rank(p_role text) returns integer
language sql immutable set search_path = '' as $$
  select case p_role when 'owner' then 3 when 'operator' then 2 when 'viewer' then 1 else 0 end
$$;

-- =============================================================================
-- 1. Tables
-- =============================================================================

-- Staff. Seed the first owner once from the SQL editor (require_mfa false until
-- TOTP is enrolled, then flip it on):
--   insert into public.backoffice_admins(user_id, role, display_name, require_mfa)
--   values ('<auth.users.id>', 'owner', '대표', false);
create table if not exists public.backoffice_admins (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  role         text not null check (role in ('owner','operator','viewer')),
  display_name text not null default '' check (char_length(display_name) <= 60),
  require_mfa  boolean not null default true,
  created_at   timestamptz not null default now(),
  created_by   uuid,
  updated_at   timestamptz not null default now(),
  revoked_at   timestamptz
);
comment on table public.backoffice_admins is
  '백오피스 운영 계정. owner(관리자) > operator(운영자) > viewer(열람자). 변경은 backoffice_grant_admin / backoffice_revoke_admin RPC만.';

-- Append-only, hash-chained. Keep personal data OUT of before/after/result:
-- this log cannot be edited, so it must never need erasure.
create table if not exists public.backoffice_audit_log (
  id              bigint generated always as identity primary key,
  at              timestamptz not null default clock_timestamp(),
  actor_id        uuid not null,
  actor_role      text not null,
  action          text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  target_type     text not null check (char_length(target_type) between 1 and 40),
  target_id       text not null default '',
  reason          text not null default '' check (char_length(reason) <= 2000),
  before          jsonb,
  after           jsonb,
  operation_id    text check (operation_id is null or char_length(operation_id) between 1 and 200),
  request_hash    bytea,
  request_payload jsonb,
  result          jsonb,
  client          jsonb not null default '{}'::jsonb,
  prev_hash       bytea,
  row_hash        bytea not null,
  unique (actor_id, operation_id)
);
create index if not exists backoffice_audit_log_target on public.backoffice_audit_log (target_type, target_id, id desc);
create index if not exists backoffice_audit_log_actor on public.backoffice_audit_log (actor_id, id desc);
create index if not exists backoffice_audit_log_action on public.backoffice_audit_log (action, id desc);
comment on table public.backoffice_audit_log is
  '백오피스 감사 기록. 수정·삭제·TRUNCATE 불가. row_hash = sha256(prev_hash || 행 내용). 검증: backoffice_verify_audit_chain().';

create table if not exists public.backoffice_account_reviews (
  id            bigint generated always as identity primary key,
  account_id    uuid not null,
  document_id   text not null,
  decision      text not null check (decision in ('verified','rejected','reset')),
  user_message  text not null default '' check (char_length(user_message) <= 300),
  internal_note text not null default '' check (char_length(internal_note) <= 2000),
  checks        jsonb not null default '{}'::jsonb check (jsonb_typeof(checks) = 'object' and octet_length(checks::text) <= 4096),
  reviewed_by   uuid not null,
  reviewed_at   timestamptz not null default now()
);
create index if not exists backoffice_account_reviews_account on public.backoffice_account_reviews (account_id, id desc);

create table if not exists public.backoffice_account_moderation (
  account_id   uuid primary key,
  status       text not null check (status in ('active','suspended')),
  reason       text not null default '' check (char_length(reason) <= 2000),
  user_message text not null default '' check (char_length(user_message) <= 300),
  login_banned boolean not null default false,  -- true only if THIS layer set auth.users.banned_until
  updated_by   uuid not null,
  updated_at   timestamptz not null default now()
);

create table if not exists public.backoffice_notes (
  id          bigint generated always as identity primary key,
  target_type text not null check (target_type in ('account','request','delivery','issue','proposal','connection','lead','case')),
  target_id   text not null check (char_length(target_id) between 1 and 200),
  body        text not null check (char_length(btrim(body)) between 1 and 4000),
  author_id   uuid not null,
  created_at  timestamptz not null default now()
);
create index if not exists backoffice_notes_target on public.backoffice_notes (target_type, target_id, id desc);

-- Operator cases. Closing a case never changes in-app issue / proposal state.
create table if not exists public.backoffice_cases (
  id          uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('account','request','delivery','issue','proposal','connection','lead')),
  target_id   text not null check (char_length(target_id) between 1 and 200),
  title       text not null check (char_length(btrim(title)) between 1 and 120),
  severity    text not null default 'normal' check (severity in ('low','normal','high','urgent')),
  status      text not null default 'open' check (status in ('open','investigating','waiting','resolved','dismissed')),
  assignee_id uuid references public.backoffice_admins(user_id) on delete set null,
  created_by  uuid not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  resolved_at timestamptz,
  version     integer not null default 0
);
create unique index if not exists backoffice_cases_one_open_per_target on public.backoffice_cases (target_type, target_id)
  where status in ('open','investigating','waiting');
create index if not exists backoffice_cases_status on public.backoffice_cases (status, updated_at desc);

-- Follow-up state for landing leads (landing_leads itself stays insert-only).
create table if not exists public.backoffice_lead_status (
  lead_id     uuid primary key references public.landing_leads(id) on delete cascade,
  status      text not null check (status in ('new','contacted','qualified','converted','spam','closed')),
  assignee_id uuid references public.backoffice_admins(user_id) on delete set null,
  updated_by  uuid not null,
  updated_at  timestamptz not null default now()
);

-- Remote configuration. Only is_public keys reach the app (app_bootstrap_config).
create table if not exists public.app_remote_config (
  key         text primary key check (key ~ '^[a-z][a-z0-9_.]{1,63}$'),
  value       jsonb not null,
  is_public   boolean not null default false,
  write_role  text not null default 'owner' check (write_role in ('owner','operator')),
  description text not null default '' check (char_length(description) <= 500),
  version     integer not null default 0,
  updated_by  uuid,
  updated_at  timestamptz not null default now()
);

-- In-app notices (운영 공지). Not stored in saip_records.notices: the app routes
-- unknown notice kinds to a request page.
create table if not exists public.app_notices (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(btrim(title)) between 1 and 80),
  body        text not null check (char_length(btrim(body)) between 1 and 2000),
  audience    text not null check (audience in ('retailer','uncle','all')),
  severity    text not null default 'info' check (severity in ('info','important','critical')),
  link_url    text check (link_url is null or (link_url ~ '^https://' and char_length(link_url) <= 500)),
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz,
  active      boolean not null default false,
  dismissible boolean not null default true,
  version     integer not null default 0,
  created_by  uuid not null,
  created_at  timestamptz not null default now(),
  updated_by  uuid not null,
  updated_at  timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index if not exists app_notices_live on public.app_notices (starts_at desc) where active;

-- Admin lists sort saip_records by recency within a collection.
create index if not exists saip_records_collection_updated on public.saip_records (collection, updated_at desc);

-- =============================================================================
-- 2. Immutability (audit log, reviews, notes)
-- =============================================================================
create or replace function backoffice_private.reject_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception '% 기록은 수정하거나 삭제할 수 없어요.', tg_table_name using errcode = '42501';
end $$;

create or replace trigger backoffice_audit_log_immutable before update or delete on public.backoffice_audit_log
  for each row execute function backoffice_private.reject_change();
create or replace trigger backoffice_audit_log_no_truncate before truncate on public.backoffice_audit_log
  for each statement execute function backoffice_private.reject_change();
create or replace trigger backoffice_account_reviews_immutable before update or delete on public.backoffice_account_reviews
  for each row execute function backoffice_private.reject_change();
create or replace trigger backoffice_account_reviews_no_truncate before truncate on public.backoffice_account_reviews
  for each statement execute function backoffice_private.reject_change();
create or replace trigger backoffice_notes_immutable before update or delete on public.backoffice_notes
  for each row execute function backoffice_private.reject_change();
create or replace trigger backoffice_notes_no_truncate before truncate on public.backoffice_notes
  for each statement execute function backoffice_private.reject_change();

-- =============================================================================
-- 3. Private helpers (schema not exposed by PostgREST, EXECUTE revoked below)
-- =============================================================================

-- Caller identity for every admin RPC. 42501 (HTTP 403) when not allowed.
create or replace function backoffice_private.require_admin(p_min_role text)
returns public.backoffice_admins language plpgsql stable set search_path = '' as $$
declare a public.backoffice_admins;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요.' using errcode = '42501'; end if;
  select * into a from public.backoffice_admins where user_id = auth.uid() and revoked_at is null;
  if a.user_id is null
     or backoffice_private.role_rank(a.role) < greatest(backoffice_private.role_rank(p_min_role), 1) then
    raise exception '이 작업을 처리할 권한이 없어요.' using errcode = '42501';
  end if;
  if a.require_mfa and coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception '2단계 인증을 완료한 뒤 이용해 주세요.' using errcode = '42501';
  end if;
  return a;
end $$;

-- Staff IP / user agent (best effort). The Next.js server forwards the
-- browser's values as x-backoffice-client-ip / x-backoffice-user-agent; the
-- gateway's x-forwarded-for is then the server's address.
create or replace function backoffice_private.client_info() returns jsonb
language sql stable set search_path = '' as $$
  select coalesce((
    select jsonb_strip_nulls(jsonb_build_object(
      'ip', left(coalesce(nullif(btrim(h ->> 'x-backoffice-client-ip'), ''),
                          nullif(btrim(split_part(h ->> 'x-forwarded-for', ',', 1)), '')), 64),
      'userAgent', left(coalesce(h ->> 'x-backoffice-user-agent', h ->> 'user-agent'), 300),
      'gatewayIp', left(nullif(btrim(split_part(h ->> 'x-forwarded-for', ',', 1)), ''), 64),
      'clientInfo', left(h ->> 'x-client-info', 80)))
    from (select nullif(current_setting('request.headers', true), '')::jsonb as h) s
    where h is not null), '{}'::jsonb)
$$;

create or replace function backoffice_private.payload_hash(p jsonb) returns bytea
language sql stable set search_path = '' as $$
  select sha256(convert_to(coalesce(p, 'null'::jsonb)::text, 'UTF8'))
$$;

-- Idempotency: a retried operation returns its stored result; the same id with
-- different input fails. Compares a hash of the FULL input, so the stored
-- payload can be redacted (note bodies, internal notes stay out of the log).
create or replace function backoffice_private.replay(p_operation_id text, p_payload jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare e record;
begin
  if coalesce(p_operation_id, '') = '' or char_length(p_operation_id) > 200 then
    raise exception '작업 번호를 확인해 주세요.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('backoffice-actor-' || auth.uid()::text, 0));
  select l.request_hash, l.result into e from public.backoffice_audit_log l
   where l.actor_id = auth.uid() and l.operation_id = p_operation_id;
  if not found then return null; end if;
  if e.request_hash is distinct from backoffice_private.payload_hash(p_payload) then
    raise exception '같은 작업 번호로 다른 내용을 전송할 수 없어요.';
  end if;
  return coalesce(e.result, '{}'::jsonb);
end $$;

create or replace function backoffice_private.audit_hash(
  p_prev bytea, p_at timestamptz, p_actor uuid, p_role text, p_action text, p_target_type text, p_target_id text,
  p_reason text, p_before jsonb, p_after jsonb, p_operation_id text, p_request_hash bytea, p_result jsonb, p_client jsonb
) returns bytea language sql stable set search_path = '' as $$
  select sha256(coalesce(p_prev, '\x'::bytea) || convert_to(jsonb_build_array(
    to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), p_actor, p_role, p_action, p_target_type,
    p_target_id, p_reason, p_before, p_after, p_operation_id, encode(p_request_hash, 'hex'), p_result, p_client)::text, 'UTF8'))
$$;

create or replace function backoffice_private.audit(
  p_admin public.backoffice_admins, p_action text, p_target_type text, p_target_id text, p_reason text,
  p_before jsonb, p_after jsonb, p_operation_id text default null, p_payload jsonb default null,
  p_result jsonb default null, p_stored_payload jsonb default null
) returns bigint language plpgsql set search_path = '' as $$
declare ts timestamptz; prev bytea; new_id bigint;
  v_reason text := left(coalesce(p_reason, ''), 2000); v_target text := coalesce(p_target_id, '');
  v_op text := nullif(p_operation_id, '');
  v_hash bytea := case when nullif(p_operation_id, '') is null then null else backoffice_private.payload_hash(p_payload) end;
  v_client jsonb := backoffice_private.client_info();
begin
  -- One global chain; admin traffic is small, so serializing appends is fine.
  perform pg_advisory_xact_lock(hashtextextended('backoffice-audit-chain', 0));
  ts := clock_timestamp();
  select l.row_hash into prev from public.backoffice_audit_log l order by l.id desc limit 1;
  insert into public.backoffice_audit_log (at, actor_id, actor_role, action, target_type, target_id, reason, before, after,
      operation_id, request_hash, request_payload, result, client, prev_hash, row_hash)
  values (ts, p_admin.user_id, p_admin.role, p_action, p_target_type, v_target, v_reason, p_before, p_after,
      v_op, v_hash, coalesce(p_stored_payload, p_payload), p_result, v_client, prev,
      backoffice_private.audit_hash(prev, ts, p_admin.user_id, p_admin.role, p_action, p_target_type, v_target, v_reason,
        p_before, p_after, v_op, v_hash, p_result, v_client))
  returning id into new_id;
  return new_id;
end $$;

-- Sensitive reads: one audit row per actor + action + target + reason per 10
-- minutes (paging and auto-refresh do not flood the log).
create or replace function backoffice_private.audit_view(
  p_admin public.backoffice_admins, p_action text, p_target_type text, p_target_id text, p_reason text, p_after jsonb
) returns void language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.backoffice_audit_log l
             where l.actor_id = p_admin.user_id and l.action = p_action and l.target_type = p_target_type
               and l.target_id = coalesce(p_target_id, '') and l.reason = left(coalesce(p_reason, ''), 2000)
               and l.at > clock_timestamp() - interval '10 minutes') then
    return;
  end if;
  perform backoffice_private.audit(p_admin, p_action, p_target_type, p_target_id, p_reason, null, p_after);
end $$;

create or replace function backoffice_private.require_reason(p_reason text, p_min integer default 5) returns text
language plpgsql immutable set search_path = '' as $$
begin
  if char_length(btrim(coalesce(p_reason, ''))) < p_min or char_length(p_reason) > 2000 then
    raise exception '처리 사유를 %자 이상 2,000자 이하로 입력해 주세요.', p_min;
  end if;
  return btrim(p_reason);
end $$;

-- Tolerant casts: one malformed JSON value must never break an admin list.
create or replace function backoffice_private.ts(p text) returns timestamptz
language sql stable set search_path = '' as $$
  select case when nullif(p, '') is not null and pg_input_is_valid(p, 'timestamptz') then p::timestamptz end
$$;
create or replace function backoffice_private.day(p text) returns date
language sql stable set search_path = '' as $$
  select case when nullif(p, '') is not null and pg_input_is_valid(p, 'date') then p::date end
$$;
create or replace function backoffice_private.kst_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Seoul')::date
$$;
create or replace function backoffice_private.kst_start(p date) returns timestamptz
language sql stable set search_path = '' as $$
  select p::timestamp at time zone 'Asia/Seoul'
$$;

-- PII masking for the 'viewer' role.
create or replace function backoffice_private.mask_tail(p text, p_keep integer) returns text
language sql immutable set search_path = '' as $$
  select case when coalesce(btrim(p), '') = '' then '' else
    repeat('•', greatest(char_length(regexp_replace(p, '\D', '', 'g')) - p_keep, 0))
    || right(regexp_replace(p, '\D', '', 'g'), p_keep) end
$$;
create or replace function backoffice_private.mask_name(p text) returns text
language sql immutable set search_path = '' as $$
  select case when coalesce(btrim(p), '') = '' then ''
    else left(btrim(p), 1) || repeat('•', greatest(char_length(btrim(p)) - 1, 1)) end
$$;
create or replace function backoffice_private.mask_email(p text) returns text
language sql immutable set search_path = '' as $$
  select case when coalesce(p, '') not like '%@%' then backoffice_private.mask_name(p)
    else left(p, 1) || '•••@' || split_part(p, '@', 2) end
$$;
create or replace function backoffice_private.mask_address(p text) returns text
language sql immutable set search_path = '' as $$
  select case when coalesce(btrim(p), '') = '' then ''
    else split_part(btrim(p), ' ', 1) || case when position(' ' in btrim(p)) > 0 then ' …' else '' end end
$$;
-- Korean mobile numbers inside chat text keep only the last 4 digits.
create or replace function backoffice_private.mask_phones(p text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(coalesce(p, ''), '(01[016789])[- .]?\d{3,4}[- .]?(\d{4})', '\1-••••-\2', 'g')
$$;

create or replace function backoffice_private.like_pattern(p text) returns text
language sql immutable set search_path = '' as $$
  select '%' || replace(replace(replace(coalesce(btrim(p), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%'
$$;

create or replace function backoffice_private.is_uuid(p text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$$;

-- Business-document state. 'verified' holds only while the reviewed document
-- AND business number are still the current ones; otherwise 'stale'.
create or replace function backoffice_private.verification_state(d jsonb) returns text
language sql immutable set search_path = '' as $$
  select case
    when d is null then 'none'
    when saip_private.s(d, 'documentId') = '' then case when d ->> 'role' = 'retailer' then 'missing' else 'not_required' end
    when d ->> 'verificationStatus' = 'verified' then
      case when saip_private.s(d, 'verifiedDocumentId') = saip_private.s(d, 'documentId')
             and regexp_replace(saip_private.s(d, 'verifiedBusinessNumber'), '\D', '', 'g')
                 = regexp_replace(saip_private.s(d, 'businessNumber'), '\D', '', 'g')
           then 'verified' else 'stale' end
    when d ->> 'verificationStatus' = 'rejected' then 'rejected'
    else 'unverified' end
$$;

-- Account projection. Never the invite code; viewer gets masked contact data.
-- nickname / publicCode / fee are the partner-directory fields every app user
-- can see (saip_private.directory_public_profile, 202610130001); absent before it.
create or replace function backoffice_private.account_json(p_id text, d jsonb, p_full boolean) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', p_id, 'verification', backoffice_private.verification_state(d))
    || saip_private.pick(coalesce(d, '{}'::jsonb), array['role','name','label','complete','working','photoId',
         'documentId','documentStatus','verificationStatus','verificationNote','verifiedDocumentId',
         'verificationReviewedAt','pickupArea','deliveryArea','deadline','holiday','intro','salesChannel','markets',
         'transport','activityHours','activityStart','activityEnd','activityDays','terms','privacy',
         'notificationSettings','provider','codeExpires','version','demoBatch','nickname','publicCode','fee'])
    || case when p_full then saip_private.pick(coalesce(d, '{}'::jsonb), array['contact','phone','email','businessName',
         'businessNumber','verifiedBusinessNumber','address','addressDetail','deliveryNote'])
       else jsonb_build_object(
         'contact', backoffice_private.mask_name(d ->> 'contact'),
         'phone', backoffice_private.mask_tail(d ->> 'phone', 4),
         'email', backoffice_private.mask_email(d ->> 'email'),
         'businessName', backoffice_private.mask_name(d ->> 'businessName'),
         'businessNumber', backoffice_private.mask_tail(d ->> 'businessNumber', 3),
         'address', backoffice_private.mask_address(d ->> 'address'),
         'masked', true) end
$$;

create or replace function backoffice_private.account_brief(p_id text) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', p_id,
    'name', coalesce(nullif(a.data ->> 'name', ''), a.data ->> 'label', ''),
    'role', a.data ->> 'role', 'complete', saip_private.b(a.data, 'complete'),
    'demo', coalesce(a.data ? 'demoBatch', false))
  from (select 1) one
  left join public.saip_records a on a.collection = 'accounts' and a.id = p_id
$$;

-- Mirrors RequestRecord.statusLabel in lib/local/domain/models.dart (first match wins).
-- 완료 vs 수령: a completed request reads 수령 for 7 days after receivedAt
-- (202610130004; older rows fall back to updatedAt), then 완료.
create or replace function backoffice_private.request_label(d jsonb) returns text
language sql stable set search_path = '' as $$
  with v as (
    select d ->> 'status' as st, saip_private.n(d, 'openIssues') as oi, saip_private.s(d, 'proposalId') as pid,
      saip_private.b(d, 'needsReply') as nr, saip_private.n(d, 'delivered') as dl, saip_private.n(d, 'received') as rc,
      case when saip_private.b(d, 'resultShared') then greatest(saip_private.remaining(d), 0) else 0 end as bo,
      greatest(saip_private.available(d), 0) as av, saip_private.s(d, 'recheck') as rk,
      coalesce(backoffice_private.ts(d ->> 'receivedAt'), backoffice_private.ts(d ->> 'updatedAt')) as received_at)
  select case
    when st = 'rejected' then '거절'
    when st = 'cancelled' then '취소 종료'
    when st = 'completed' then case when received_at <= now() - interval '7 days' then '완료' else '수령' end
    when oi > 0 then '문제 확인 중'
    when pid <> '' then '변경·취소 협의 중'
    when st = 'pending' then '확인 대기'
    when nr then '답변 필요'
    when dl > rc then '수령 대기'
    when bo > 0 then case when rk <> '' and rk <= to_char(backoffice_private.kst_today(), 'YYYY-MM-DD')
                          then '미송 재확인' else '미송 대기' end
    when av > 0 then '픽업 완료'
    else '진행 중' end
  from v
$$;

-- 도매처 주문서 (requestType 'wholesaler', 202610130004): up to 10 wholesalers,
-- no product / option, quantity 1, 수령지 copied from the retailer's profile.
-- request_type: 'wholesaler' or 'product' (상품별 요청, no requestType key).
create or replace function backoffice_private.request_type(d jsonb) returns text
language sql immutable set search_path = '' as $$
  select case when d ->> 'requestType' = 'wholesaler' then 'wholesaler' else 'product' end
$$;

-- Mirrors requestWholesalers() in models.dart: a single-wholesaler request
-- reads as a one-entry list.
create or replace function backoffice_private.request_wholesalers(d jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(d -> 'wholesalers') = 'array' then coalesce((
      select jsonb_agg(jsonb_build_object(
               'wholesaler', case when jsonb_typeof(e -> 'wholesaler') = 'string' then btrim(e ->> 'wholesaler') else '' end,
               'location', case when jsonb_typeof(e -> 'location') = 'string' then btrim(e ->> 'location') else '' end) order by o)
      from jsonb_array_elements(d -> 'wholesalers') with ordinality x(e, o) where jsonb_typeof(e) = 'object'), '[]'::jsonb)
    else jsonb_build_array(jsonb_build_object('wholesaler', btrim(saip_private.s(d, 'wholesaler')),
           'location', btrim(saip_private.s(d, 'location')))) end
$$;

-- Mirrors requestTitle() in models.dart: the product, or the wholesaler names
-- ("A 외 2곳") for a 도매처 주문서.
create or replace function backoffice_private.request_title(d jsonb) returns text
language sql immutable set search_path = '' as $$
  select case
    when backoffice_private.request_type(d) = 'product' and btrim(saip_private.s(d, 'product')) <> '' then btrim(saip_private.s(d, 'product'))
    when n.names is null or cardinality(n.names) = 0 then '새 사입 요청'
    when cardinality(n.names) = 1 then n.names[1]
    else n.names[1] || ' 외 ' || (cardinality(n.names) - 1) || '곳' end
  from (select array_agg(e ->> 'wholesaler' order by o) filter (where e ->> 'wholesaler' <> '') names
        from jsonb_array_elements(backoffice_private.request_wholesalers(d)) with ordinality x(e, o)) n
$$;

-- Search text of a request: id, product, option and every wholesaler + location.
create or replace function backoffice_private.request_search_text(p_id text, d jsonb) returns text
language sql immutable set search_path = '' as $$
  select concat_ws(' ', p_id, d ->> 'product', d ->> 'option', d ->> 'wholesaler', d ->> 'location',
    (select string_agg(concat_ws(' ', e ->> 'wholesaler', e ->> 'location'), ' ')
     from jsonb_array_elements(backoffice_private.request_wholesalers(d)) e))
$$;

create or replace function backoffice_private.ledger(d jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'quantity', saip_private.n(d, 'quantity'), 'acquired', saip_private.n(d, 'acquired'),
    'delivered', saip_private.n(d, 'delivered'), 'received', saip_private.n(d, 'received'),
    'cancelled', saip_private.n(d, 'cancelled'), 'acquiredCancelled', saip_private.n(d, 'acquiredCancelled'),
    'held', saip_private.n(d, 'held'), 'openIssues', saip_private.n(d, 'openIssues'),
    'remaining', greatest(saip_private.remaining(d), 0), 'available', greatest(saip_private.available(d), 0),
    'backorder', case when saip_private.b(d, 'resultShared') then greatest(saip_private.remaining(d), 0) else 0 end)
$$;

-- Same conditions as saip_private.finish() as named codes. A non-empty result
-- on a live row means data was changed outside saip_command.
create or replace function backoffice_private.ledger_violations(d jsonb) returns text[]
language sql immutable set search_path = '' as $$
  with v as (
    select saip_private.n(d, 'quantity') q, saip_private.n(d, 'acquired') a, saip_private.n(d, 'delivered') dl,
      saip_private.n(d, 'received') rc, saip_private.n(d, 'cancelled') c, saip_private.n(d, 'acquiredCancelled') ac,
      saip_private.n(d, 'held') h, saip_private.n(d, 'openIssues') oi, saip_private.s(d, 'proposalId') pid,
      d ->> 'status' st)
  select array_remove(array[
    case when q <= 0 then 'quantity_not_positive' end,
    case when least(a, dl, rc, c, ac, oi) < 0 then 'negative_counter' end,
    case when rc > dl then 'received_gt_delivered' end,
    case when dl > a then 'delivered_gt_acquired' end,
    case when ac > c then 'acquired_cancelled_gt_cancelled' end,
    case when ac + dl > a then 'acquired_cancelled_plus_delivered_gt_acquired' end,
    case when h < 0 or h > a - ac - dl then 'held_out_of_range' end,
    case when c > q then 'cancelled_gt_quantity' end,
    case when q - c < a - ac then 'acquired_gt_open_quantity' end,
    case when st = 'completed' and (rc <> q - c or dl <> q - c or oi > 0 or pid <> '') then 'completed_but_open' end,
    case when st = 'accepted' and oi = 0 and pid = '' and q - c - a + ac = 0 and rc = q - c and dl = q - c
         then 'finished_but_not_closed' end,
    case when st is null or st not in ('pending','accepted','rejected','cancelled','completed') then 'unknown_status' end
  ], null) from v
$$;

-- Cross-record consistency for one request (deliveries / issues / proposals).
create or replace function backoffice_private.request_checks(p_id text, d jsonb) returns jsonb
language sql stable set search_path = '' as $$
  with dl as (
    select coalesce(sum(saip_private.n(data, 'quantity')), 0) q, coalesce(sum(saip_private.n(data, 'received')), 0) rc,
      count(*) filter (where not saip_private.b(data, 'receiptRecorded')) unconfirmed, count(*) n
    from public.saip_records where collection = 'deliveries' and data ->> 'requestId' = p_id),
  iss as (
    select count(*) filter (where data ->> 'status' <> 'resolved') open,
      coalesce(sum(saip_private.n(data, 'held')) filter (where data ->> 'status' <> 'resolved'), 0) held
    from public.saip_records where collection = 'issues' and data ->> 'requestId' = p_id),
  pr as (
    select count(*) filter (where data ->> 'status' = 'pending') pending,
      coalesce(sum(saip_private.n(data, 'held')) filter (where data ->> 'status' = 'pending'), 0) held,
      max(id) filter (where data ->> 'status' = 'pending') pending_id
    from public.saip_records where collection = 'proposals' and data ->> 'requestId' = p_id)
  select jsonb_build_object(
    'violations', to_jsonb(backoffice_private.ledger_violations(d) || array_remove(array[
      case when saip_private.n(d, 'delivered') <> dl.q then 'delivered_ne_sum_deliveries' end,
      case when saip_private.n(d, 'received') <> dl.rc then 'received_ne_sum_delivery_receipts' end,
      case when saip_private.n(d, 'openIssues') <> iss.open then 'open_issues_ne_unresolved_issues' end,
      case when saip_private.n(d, 'held') <> iss.held + pr.held then 'held_ne_issue_and_proposal_holds' end,
      case when pr.pending > 1 then 'multiple_pending_proposals' end,
      case when saip_private.s(d, 'proposalId') <> coalesce(pr.pending_id, '') then 'proposal_pointer_mismatch' end
    ], null)),
    'deliveries', dl.n, 'unconfirmedDeliveries', dl.unconfirmed,
    'unresolvedIssues', iss.open, 'pendingProposals', pr.pending)
  from dl, iss, pr
$$;

-- Mirrors the saveProfile(complete) checks of migration 202610110006.
create or replace function backoffice_private.missing_signup_fields(d jsonb) returns text[]
language sql stable set search_path = '' as $$
  select case
    when d is null then array['bootstrap']
    when coalesce(d ->> 'role', '') not in ('retailer','uncle') then array['role']
    else coalesce((
      select array_agg(k order by o) from unnest(case when d ->> 'role' = 'retailer'
        then array['name','contact','phone','businessName','businessNumber','documentId','address','addressDetail','salesChannel']
        else array['contact','phone','pickupArea','deliveryArea','deadline'] end) with ordinality u(k, o)
      where btrim(saip_private.s(d, k)) = ''), '{}'::text[])
      || array_remove(array[
        case when btrim(saip_private.s(d, 'phone')) <> '' and not saip_private.valid_korean_phone(d ->> 'phone') then 'phone:format' end,
        case when d ->> 'role' = 'retailer' and btrim(saip_private.s(d, 'businessNumber')) <> ''
              and not saip_private.valid_business_number(d ->> 'businessNumber') then 'businessNumber:format' end,
        case when d ->> 'role' = 'uncle' and btrim(saip_private.s(d, 'deadline')) <> ''
              and not saip_private.valid_hhmm(d ->> 'deadline') then 'deadline:format' end,
        case when not saip_private.b(d, 'terms') then 'terms' end,
        case when not saip_private.b(d, 'privacy') then 'privacy' end], null)
  end
$$;

create or replace function backoffice_private.semver(p text) returns integer[]
language sql immutable set search_path = '' as $$
  select case when coalesce(p, '') ~ '^\d{1,6}\.\d{1,6}\.\d{1,6}([+-][0-9A-Za-z.+-]*)?$'
    then string_to_array(substring(p from '^(\d+\.\d+\.\d+)'), '.')::integer[] end
$$;

create or replace function backoffice_private.maintenance_active(m jsonb) returns boolean
language sql stable set search_path = '' as $$
  select coalesce(jsonb_typeof(m -> 'enabled') = 'boolean' and (m ->> 'enabled')::boolean, false)
    and (backoffice_private.ts(m ->> 'startsAt') is null or backoffice_private.ts(m ->> 'startsAt') <= now())
    and (backoffice_private.ts(m ->> 'endsAt') is null or backoffice_private.ts(m ->> 'endsAt') > now())
$$;

create or replace function backoffice_private.write_freeze(m jsonb) returns boolean
language sql stable set search_path = '' as $$
  select backoffice_private.maintenance_active(m)
    and coalesce(jsonb_typeof(m -> 'blockWrites') = 'boolean' and (m ->> 'blockWrites')::boolean, false)
$$;

-- Shape validation for well-known remote-config keys.
create or replace function backoffice_private.validate_config(p_key text, p_value jsonb) returns void
language plpgsql stable set search_path = '' as $$
declare k text; v jsonb;
begin
  if coalesce(p_key, '') !~ '^[a-z][a-z0-9_.]{1,63}$' then
    raise exception '설정 키는 영문 소문자로 시작하는 2~64자(a-z, 0-9, _, .)여야 해요.';
  end if;
  if p_value is null or octet_length(p_value::text) > 16384 then
    raise exception '설정 값은 16KB 이하 JSON이어야 해요.';
  end if;
  if p_key = 'maintenance' then
    if jsonb_typeof(p_value) <> 'object' or jsonb_typeof(p_value -> 'enabled') is distinct from 'boolean'
       or jsonb_typeof(coalesce(p_value -> 'blockWrites', 'false'::jsonb)) <> 'boolean' then
      raise exception 'maintenance.enabled / blockWrites는 true 또는 false여야 해요.';
    end if;
    if coalesce((p_value ->> 'blockWrites')::boolean, false) and not (p_value ->> 'enabled')::boolean then
      raise exception '쓰기 차단은 점검 모드와 함께만 켤 수 있어요.';
    end if;
    if char_length(coalesce(p_value ->> 'title', '')) > 60 or char_length(coalesce(p_value ->> 'message', '')) > 500 then
      raise exception '점검 제목은 60자, 안내는 500자 이하로 입력해 주세요.';
    end if;
    if (nullif(p_value ->> 'startsAt', '') is not null and backoffice_private.ts(p_value ->> 'startsAt') is null)
       or (nullif(p_value ->> 'endsAt', '') is not null and backoffice_private.ts(p_value ->> 'endsAt') is null) then
      raise exception '점검 시작·종료 시각 형식을 확인해 주세요.';
    end if;
    if backoffice_private.ts(p_value ->> 'startsAt') >= backoffice_private.ts(p_value ->> 'endsAt') then
      raise exception '점검 종료 시각은 시작 시각보다 늦어야 해요.';
    end if;
  elsif p_key = 'min_app_version' then
    if jsonb_typeof(p_value) <> 'object' then raise exception 'min_app_version은 객체여야 해요.'; end if;
    for k, v in select e.key, e.value from jsonb_each(p_value) e loop
      if k = 'message' then
        if jsonb_typeof(v) <> 'string' or char_length(v #>> '{}') > 300 then
          raise exception '업데이트 안내 문구는 300자 이하 문자열이어야 해요.';
        end if;
        continue;
      end if;
      if k not in ('ios','android','web') or jsonb_typeof(v) <> 'object' then
        raise exception 'min_app_version에는 ios / android / web / message만 둘 수 있어요.';
      end if;
      if backoffice_private.semver(v ->> 'minimum') is null
         or backoffice_private.semver(coalesce(v ->> 'recommended', v ->> 'minimum')) is null then
        raise exception '% 버전은 1.2.3 형식이어야 해요.', k;
      end if;
      if backoffice_private.semver(v ->> 'minimum') > backoffice_private.semver(coalesce(v ->> 'recommended', v ->> 'minimum')) then
        raise exception '% 최소 버전이 권장 버전보다 높아요.', k;
      end if;
      if coalesce(v ->> 'storeUrl', '') <> '' and v ->> 'storeUrl' !~ '^https://' then
        raise exception '% 스토어 주소는 https 주소여야 해요.', k;
      end if;
    end loop;
  elsif p_key = 'feature_flags' then
    if jsonb_typeof(p_value) <> 'object'
       or exists (select 1 from jsonb_each(p_value) e where jsonb_typeof(e.value) <> 'boolean' or e.key !~ '^[a-zA-Z][a-zA-Z0-9_]{0,63}$') then
      raise exception '기능 스위치는 { "이름": true|false } 형식이어야 해요.';
    end if;
  elsif p_key = 'support' then
    if jsonb_typeof(p_value) <> 'object'
       or exists (select 1 from jsonb_each(p_value) e where jsonb_typeof(e.value) <> 'string' or char_length(e.value #>> '{}') > 200) then
      raise exception '고객센터 안내 값은 200자 이하 문자열이어야 해요.';
    end if;
  end if;
end $$;

-- Target existence for notes / cases.
create or replace function backoffice_private.assert_target(p_type text, p_id text) returns void
language plpgsql stable set search_path = '' as $$
declare c text := case p_type when 'request' then 'requests' when 'delivery' then 'deliveries' when 'issue' then 'issues'
                               when 'proposal' then 'proposals' when 'connection' then 'connections' end;
begin
  if p_type = 'account' then
    if not backoffice_private.is_uuid(p_id) or not exists (select 1 from auth.users where id = p_id::uuid) then
      raise exception '계정을 찾을 수 없어요.';
    end if;
  elsif p_type = 'lead' then
    if not backoffice_private.is_uuid(p_id) or not exists (select 1 from public.landing_leads where id = p_id::uuid) then
      raise exception '문의를 찾을 수 없어요.';
    end if;
  elsif p_type = 'case' then
    if not backoffice_private.is_uuid(p_id) or not exists (select 1 from public.backoffice_cases where id = p_id::uuid) then
      raise exception '케이스를 찾을 수 없어요.';
    end if;
  elsif c is not null then
    if not exists (select 1 from public.saip_records where collection = c and id = p_id) then
      raise exception '대상 기록을 찾을 수 없어요.';
    end if;
  else
    raise exception '지원하지 않는 대상이에요.';
  end if;
end $$;

create or replace function backoffice_private.assert_assignee(p_user uuid) returns void
language plpgsql stable set search_path = '' as $$
begin
  if p_user is not null and not exists (select 1 from public.backoffice_admins b where b.user_id = p_user
       and b.revoked_at is null and b.role in ('owner','operator')) then
    raise exception '담당자는 운영자 이상이어야 해요.';
  end if;
end $$;

-- Everything an operator should look at, most severe first (dashboard queue
-- and the anomaly screen share this list).
create or replace function backoffice_private.anomalies(p_include_demo boolean)
returns table (kind text, severity text, target_type text, target_id text, detail jsonb, since timestamptz)
language sql stable set search_path = '' as $$
  with r as (select collection c, id, data d, updated_at, backoffice_private.ts(data ->> 'createdAt') created_at
             from public.saip_records
             where collection not in ('drafts','messages','events','notices')
               and (p_include_demo or not (data ? 'demoBatch'))),
  demo_owner as (select id from public.saip_records where collection = 'accounts' and data ? 'demoBatch'),
  found as (
    select 'ledger_violation' kind, 'critical' severity, 'request' target_type, r.id target_id,
      jsonb_build_object('violations', backoffice_private.request_checks(r.id, r.d) -> 'violations') detail, r.updated_at since
    from r where r.c = 'requests' and jsonb_array_length(backoffice_private.request_checks(r.id, r.d) -> 'violations') > 0
    union all
    select 'recheck_overdue', 'high', 'request', r.id, jsonb_build_object('recheck', r.d ->> 'recheck', 'product', r.d ->> 'product',
      'title', backoffice_private.request_title(r.d)),
      backoffice_private.kst_start(backoffice_private.day(r.d ->> 'recheck'))
    from r where r.c = 'requests' and backoffice_private.request_label(r.d) = '미송 재확인'
    union all
    select 'receipt_unconfirmed', 'high', 'delivery', r.id, jsonb_build_object('requestId', r.d ->> 'requestId', 'quantity', r.d -> 'quantity'), r.created_at
    from r where r.c = 'deliveries' and not saip_private.b(r.d, 'receiptRecorded') and r.created_at < now() - interval '48 hours'
    union all
    select 'issue_unresolved', case when r.d ->> 'status' = 'open' then 'high' else 'normal' end, 'issue', r.id,
      jsonb_build_object('requestId', r.d ->> 'requestId', 'status', r.d ->> 'status', 'held', r.d -> 'held'), r.created_at
    from r where r.c = 'issues' and r.d ->> 'status' <> 'resolved' and r.created_at < now() - interval '3 days'
    union all
    select 'pending_request_stale', 'normal', 'request', r.id, jsonb_build_object('product', r.d ->> 'product', 'title', backoffice_private.request_title(r.d)), r.created_at
    from r where r.c = 'requests' and r.d ->> 'status' = 'pending' and r.created_at < now() - interval '24 hours'
    union all
    select 'proposal_stale', 'normal', 'proposal', r.id, jsonb_build_object('requestId', r.d ->> 'requestId', 'kind', r.d ->> 'kind'), r.created_at
    from r where r.c = 'proposals' and r.d ->> 'status' = 'pending' and r.created_at < now() - interval '2 days'
    union all
    select 'document_review_pending', 'normal', 'account', r.id, jsonb_build_object('state', backoffice_private.verification_state(r.d)), r.updated_at
    from r where r.c = 'accounts' and backoffice_private.verification_state(r.d) in ('unverified','stale')
    union all
    select 'connection_pending_stale', 'low', 'connection', r.id, jsonb_build_object('from', r.d ->> 'from', 'to', r.d ->> 'to'), r.created_at
    from r where r.c = 'connections' and r.d ->> 'status' = 'pending' and r.created_at < now() - interval '3 days'
    union all
    select 'signup_stalled', 'low', 'account', r.id, jsonb_build_object('stage', r.d ->> 'stage'), r.updated_at
    from r where r.c = 'signupProgress' and coalesce(r.d ->> 'stage', '') <> 'completed' and r.updated_at < now() - interval '3 days'
    union all
    -- Completed accounts sharing one phone (same normalization as
    -- saip_check_phone_available, 202610120001). Older signups were never checked.
    select 'phone_duplicate', 'low', 'account', p.id,
      jsonb_build_object('accounts', p.n, 'others', to_jsonb(array_remove(p.ids, p.id))), p.updated_at
    from (select x.id, x.updated_at, count(*) over w n, array_agg(x.id) over w ids
          from (select r.id, r.updated_at, saip_private.normalize_korean_phone(r.d ->> 'phone') phone from r
                where r.c = 'accounts' and r.d ->> 'complete' = 'true') x
          where x.phone <> ''
          window w as (partition by x.phone order by x.id rows between unbounded preceding and unbounded following)) p
    where p.n > 1
    union all
    select 'attachment_object_missing', 'high', 'attachment', r.id, jsonb_build_object('ownerId', r.d ->> 'ownerId'), r.updated_at
    from r where r.c = 'attachments'
      and not exists (select 1 from storage.objects o where o.bucket_id = 'saip-attachments' and o.name = r.d ->> 'path')
    union all
    select 'storage_object_unregistered', 'low', 'storage_object', o.name, jsonb_build_object('size', o.metadata -> 'size'), o.created_at
    from storage.objects o where o.bucket_id = 'saip-attachments' and o.created_at < now() - interval '24 hours'
      and (p_include_demo or split_part(o.name, '/', 1) not in (select id from demo_owner))
      and not exists (select 1 from public.saip_records x where x.collection = 'attachments' and x.data ->> 'path' = o.name)
    union all
    select 'auth_user_without_account', 'low', 'account', u.id::text, jsonb_build_object('createdAt', u.created_at), u.created_at
    from auth.users u where u.created_at < now() - interval '1 hour'
      and not exists (select 1 from public.saip_records x where x.collection = 'accounts' and x.id = u.id::text)
      and not exists (select 1 from public.backoffice_admins b where b.user_id = u.id)
    union all
    select 'lead_unhandled', 'normal', 'lead', l.id::text, jsonb_build_object('role', l.role, 'source', l.source), l.created_at
    from public.landing_leads l left join public.backoffice_lead_status s on s.lead_id = l.id
    where coalesce(s.status, 'new') = 'new' and l.created_at < now() - interval '24 hours'
      and coalesce(l.source, '') !~ '(e2e|timing-suspect)')
  select * from found
  order by case severity when 'critical' then 0 when 'high' then 1 when 'normal' then 2 else 3 end, since nulls last
  limit 500
$$;

-- =============================================================================
-- 4. Public helpers, enforcement
-- =============================================================================

-- For policies and the Next.js gate. Reveals only whether the CALLER is staff.
create or replace function public.is_backoffice_admin(min_role text default 'viewer') returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.backoffice_admins a
    where a.user_id = (select auth.uid()) and a.revoked_at is null
      and backoffice_private.role_rank(a.role) >= greatest(backoffice_private.role_rank(min_role), 1)
      and (not a.require_mfa or coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'))
$$;

create or replace function public.backoffice_whoami() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'userId', auth.uid(), 'email', (select u.email from auth.users u where u.id = auth.uid()),
    'admin', a.user_id is not null, 'role', a.role, 'displayName', a.display_name,
    'mfaRequired', coalesce(a.require_mfa, false), 'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'),
    'mfaEnrolled', exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified'),
    'ready', a.user_id is not null and (not a.require_mfa or coalesce(auth.jwt() ->> 'aal', '') = 'aal2'),
    'hasAppAccount', exists (select 1 from public.saip_records r where r.collection = 'accounts' and r.id = auth.uid()::text))
  from (select 1) one
  left join public.backoffice_admins a on a.user_id = auth.uid() and a.revoked_at is null
$$;

-- True when the CALLER may not write app data (suspended or write freeze).
create or replace function public.app_write_blocked() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    exists (select 1 from public.backoffice_account_moderation m where m.account_id = auth.uid() and m.status = 'suspended')
    or exists (select 1 from public.app_remote_config c where c.key = 'maintenance' and backoffice_private.write_freeze(c.value)))
$$;

-- Storage read for staff: operator+ AND an attachment.view audit row by the
-- same staff member for this exact object within 10 minutes. Signed URLs can
-- therefore only be minted right after the audited backoffice_attachment_access.
create or replace function public.backoffice_can_read_object(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_backoffice_admin('operator') and exists (
    select 1 from public.saip_records t
    join public.backoffice_audit_log l on l.target_type = 'attachment' and l.target_id = t.id
    where t.collection = 'attachments' and t.id = split_part(p_name, '/', 2) and t.data ->> 'path' = p_name
      and l.actor_id = auth.uid() and l.action = 'attachment.view' and l.at > now() - interval '10 minutes')
$$;

-- Runs inside saip_command's transaction, so a blocked command aborts as a
-- whole; the app shows the P0001 message and its outbox retries later with the
-- same operation id.
create or replace function backoffice_private.guard_app_writes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); m public.backoffice_account_moderation; mt jsonb;
begin
  if uid is null then return coalesce(new, old); end if;      -- SQL editor, service role, migrations
  if current_setting('backoffice.bypass_guard', true) = 'on'
     and exists (select 1 from public.backoffice_admins a where a.user_id = uid and a.revoked_at is null) then
    return coalesce(new, old);                                  -- admin RPC writing the verification projection
  end if;
  select * into m from public.backoffice_account_moderation where account_id = uid;
  if m.status = 'suspended' then
    raise exception '%', coalesce(nullif(btrim(m.user_message), ''), '이용이 제한된 계정이에요. 고객센터로 문의해 주세요.');
  end if;
  select value into mt from public.app_remote_config where key = 'maintenance';
  if backoffice_private.write_freeze(mt) then
    raise exception '%', coalesce(nullif(btrim(mt ->> 'message'), ''), '서비스 점검 중이에요. 점검이 끝난 뒤 다시 시도해 주세요.');
  end if;
  return coalesce(new, old);
end $$;
create or replace trigger backoffice_guard_app_writes before insert or update or delete on public.saip_records
  for each row execute function backoffice_private.guard_app_writes();

-- =============================================================================
-- 5. Admin read RPCs (viewer+, PII unmasked for operator+). Drafts are never
--    returned (the app promises "초안은 나만 볼 수 있어요").
-- =============================================================================

create or replace function public.backoffice_overview(p_include_demo boolean default false, p_days integer default 1)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare days integer := least(greatest(coalesce(p_days, 1), 1), 90); today date := backoffice_private.kst_today();
  since timestamptz; res jsonb;
begin
  perform backoffice_private.require_admin('viewer');
  since := backoffice_private.kst_start(today - (days - 1));
  with r as (
    select collection c, id, data d, updated_at, backoffice_private.ts(data ->> 'createdAt') created_at from public.saip_records
    where collection <> 'drafts' and (p_include_demo or not (data ? 'demoBatch'))),
  req as (select id, d, created_at, backoffice_private.request_label(d) label from r where c = 'requests')
  select jsonb_build_object(
    'generatedAt', now(), 'includeDemo', p_include_demo, 'days', days, 'since', since,
    'kpi', jsonb_build_object(
      'newRequests', (select count(*) from req where created_at >= since),
      'attention', (select count(*) from req where label in ('답변 필요','문제 확인 중')),
      'overdueRechecks', (select count(*) from req where label = '미송 재확인'),
      'deliveriesAwaitingReceipt', (select count(*) from r where c = 'deliveries' and not saip_private.b(d, 'receiptRecorded')),
      'incompleteSignups', (select count(*) from r where c = 'accounts' and not saip_private.b(d, 'complete')),
      'newLeads', (select count(*) from public.landing_leads l left join public.backoffice_lead_status s on s.lead_id = l.id
                   where coalesce(s.status, 'new') = 'new' and coalesce(l.source, '') !~ '(e2e|timing-suspect)')),
    'authUsers', (select count(*) from auth.users),
    'accounts', (select jsonb_build_object(
        'total', count(*),
        'retailer', count(*) filter (where d ->> 'role' = 'retailer'),
        'uncle', count(*) filter (where d ->> 'role' = 'uncle'),
        'noRole', count(*) filter (where coalesce(d ->> 'role', '') not in ('retailer','uncle')),
        'complete', count(*) filter (where saip_private.b(d, 'complete')),
        'documentSubmitted', count(*) filter (where d ->> 'documentStatus' = 'submitted'),
        'awaitingReview', count(*) filter (where backoffice_private.verification_state(d) in ('unverified','stale')),
        'verified', count(*) filter (where backoffice_private.verification_state(d) = 'verified'),
        'unclesWorking', count(*) filter (where d ->> 'role' = 'uncle' and saip_private.b(d, 'working')))
      from r where c = 'accounts'),
    'signupStages', coalesce((select jsonb_object_agg(k, n) from (select coalesce(d ->> 'stage', 'unknown') k, count(*) n
      from r where c = 'signupProgress' group by 1) s), '{}'::jsonb),
    'suspended', (select count(*) from public.backoffice_account_moderation where status = 'suspended'),
    'connections', coalesce((select jsonb_object_agg(k, n) from (select coalesce(d ->> 'status', 'unknown') k, count(*) n
      from r where c = 'connections' group by 1) s), '{}'::jsonb),
    'requestStatus', coalesce((select jsonb_object_agg(k, n) from (select coalesce(d ->> 'status', 'unknown') k, count(*) n
      from req group by 1) s), '{}'::jsonb),
    'requestLabels', coalesce((select jsonb_object_agg(label, n) from (select label, count(*) n from req group by 1) s), '{}'::jsonb),
    -- 'product' = 상품별 요청 (no requestType), 'wholesaler' = 도매처 주문서
    'requestTypes', coalesce((select jsonb_object_agg(k, n) from (select backoffice_private.request_type(d) k, count(*) n
      from req group by 1) s), '{}'::jsonb),
    'newRequestsByDay', (select jsonb_agg(jsonb_build_object('day', g.day, 'count',
        (select count(*) from req where (req.created_at at time zone 'Asia/Seoul')::date = g.day)) order by g.day)
      from (select (today - i) as day from generate_series(0, 13) i) g),
    'backorderAging', (select jsonb_build_object(
        '0-1', count(*) filter (where od <= 1), '2-3', count(*) filter (where od between 2 and 3),
        '4-7', count(*) filter (where od between 4 and 7), '8+', count(*) filter (where od >= 8))
      from (select today - backoffice_private.day(d ->> 'recheck') od from req where label = '미송 재확인') x),
    'issues', coalesce((select jsonb_object_agg(k, n) from (select coalesce(d ->> 'status', 'unknown') k, count(*) n
      from r where c = 'issues' group by 1) s), '{}'::jsonb),
    'proposalsPending', (select count(*) from r where c = 'proposals' and d ->> 'status' = 'pending'),
    'userMessages24h', (select count(*) from r where c = 'messages' and not saip_private.b(d, 'system')
                          and created_at > now() - interval '24 hours'),
    'attachments', (select jsonb_build_object('count', count(*), 'bytes', coalesce(sum(saip_private.n(d, 'size')::bigint), 0))
      from r where c = 'attachments'),
    'openCases', (select count(*) from public.backoffice_cases where status in ('open','investigating','waiting')),
    'leads', (select jsonb_build_object('total', count(*), 'inPeriod', count(*) filter (where l.created_at >= since),
                'unhandled', count(*) filter (where coalesce(s.status, 'new') = 'new'))
      from public.landing_leads l left join public.backoffice_lead_status s on s.lead_id = l.id),
    'liveNotices', (select count(*) from public.app_notices where active and starts_at <= now() and (ends_at is null or ends_at > now())),
    'maintenance', (select jsonb_build_object('active', backoffice_private.maintenance_active(value),
                      'blockWrites', backoffice_private.write_freeze(value)) from public.app_remote_config where key = 'maintenance'),
    'queue', coalesce((select jsonb_agg(jsonb_build_object('kind', q.kind, 'severity', q.severity, 'targetType', q.target_type,
        'targetId', q.target_id, 'detail', q.detail, 'since', q.since))
      from (select * from backoffice_private.anomalies(p_include_demo) where severity <> 'low' limit 10) q), '[]'::jsonb))
  into res;
  return res;
end $$;

create or replace function public.backoffice_list_accounts(
  p_search text default '', p_role text default null, p_state text default null, p_include_demo boolean default false,
  p_sort text default 'created_desc', p_limit integer default 50, p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare a public.backoffice_admins := backoffice_private.require_admin('viewer');
  full_access boolean := backoffice_private.role_rank(a.role) >= 2;
  lim integer := least(greatest(coalesce(p_limit, 50), 1), 200); off integer := greatest(coalesce(p_offset, 0), 0);
  pat text := backoffice_private.like_pattern(p_search); res jsonb;
begin
  with base as (
    select u.id uid, u.email, u.created_at, u.last_sign_in_at, u.banned_until,
      coalesce(acc.data ->> 'provider', u.raw_app_meta_data ->> 'provider', '') provider, acc.data d, sp.data spd,
      coalesce(m.status, 'active') mod_status,
      exists (select 1 from public.backoffice_admins ba where ba.user_id = u.id and ba.revoked_at is null) staff,
      backoffice_private.verification_state(acc.data) vstate
    from auth.users u
    left join public.saip_records acc on acc.collection = 'accounts' and acc.id = u.id::text
    left join public.saip_records sp on sp.collection = 'signupProgress' and sp.id = u.id::text
    left join public.backoffice_account_moderation m on m.account_id = u.id
    where (p_include_demo or acc.data is null or not (acc.data ? 'demoBatch'))
      and (p_role is null or (p_role = 'none' and coalesce(acc.data ->> 'role', '') not in ('retailer','uncle'))
           or acc.data ->> 'role' = p_role)
      and (coalesce(btrim(p_search), '') = '' or concat_ws(' ', u.id::text, acc.data ->> 'name', acc.data ->> 'label',
            acc.data ->> 'nickname', acc.data ->> 'publicCode',
            case when full_access then concat_ws(' ', u.email, acc.data ->> 'contact', acc.data ->> 'phone',
              regexp_replace(coalesce(acc.data ->> 'phone', ''), '\D', '', 'g'), acc.data ->> 'businessName',
              acc.data ->> 'businessNumber', regexp_replace(coalesce(acc.data ->> 'businessNumber', ''), '\D', '', 'g')) end) ilike pat)),
  filtered as (
    select * from base b where p_state is null or case p_state
      when 'no_account' then b.d is null and not b.staff
      when 'staff' then b.staff
      when 'role_pending' then b.d is not null and coalesce(b.d ->> 'role', '') not in ('retailer','uncle')
      when 'signup' then b.d is not null and not saip_private.b(b.d, 'complete')
      when 'complete' then saip_private.b(b.d, 'complete')
      when 'document_missing' then b.vstate = 'missing'
      when 'awaiting_review' then b.vstate in ('unverified','stale')
      when 'verified' then b.vstate = 'verified'
      when 'rejected' then b.vstate = 'rejected'
      when 'suspended' then b.mod_status = 'suspended'
      when 'login_banned' then coalesce(b.banned_until > now(), false)
      when 'working' then b.d ->> 'role' = 'uncle' and saip_private.b(b.d, 'working')
      when 'joined_today' then b.created_at >= backoffice_private.kst_start(backoffice_private.kst_today())
      else false end),
  page as (
    select f.*, row_number() over (order by
        case when p_sort = 'created_asc' then f.created_at end asc nulls last,
        case when p_sort = 'last_sign_in_desc' then f.last_sign_in_at end desc nulls last,
        case when p_sort = 'name_asc' then coalesce(nullif(f.d ->> 'name', ''), f.d ->> 'label', '') end asc,
        f.created_at desc, f.uid) rn
    from filtered f)
  select jsonb_build_object('total', (select count(*) from filtered), 'limit', lim, 'offset', off,
    'facets', (select jsonb_build_object(
        'retailer', count(*) filter (where d ->> 'role' = 'retailer'),
        'uncle', count(*) filter (where d ->> 'role' = 'uncle'),
        'noRole', count(*) filter (where d is not null and coalesce(d ->> 'role', '') not in ('retailer','uncle')),
        'signup', count(*) filter (where d is not null and not saip_private.b(d, 'complete')),
        'complete', count(*) filter (where saip_private.b(d, 'complete')),
        'documentMissing', count(*) filter (where vstate = 'missing'),
        'awaitingReview', count(*) filter (where vstate in ('unverified','stale')),
        'verified', count(*) filter (where vstate = 'verified'),
        'rejected', count(*) filter (where vstate = 'rejected'),
        'suspended', count(*) filter (where mod_status = 'suspended'),
        'noAccount', count(*) filter (where d is null and not staff),
        'staff', count(*) filter (where staff)) from base),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.uid,
        'email', case when full_access then p.email else backoffice_private.mask_email(p.email) end,
        'provider', p.provider, 'createdAt', p.created_at, 'lastSignInAt', p.last_sign_in_at,
        'loginBanned', coalesce(p.banned_until > now(), false), 'moderation', p.mod_status,
        'isStaff', p.staff, 'hasAccount', p.d is not null, 'role', p.d ->> 'role',
        'name', coalesce(nullif(p.d ->> 'name', ''), p.d ->> 'label'),
        'businessName', case when full_access then p.d ->> 'businessName' else backoffice_private.mask_name(p.d ->> 'businessName') end,
        'complete', saip_private.b(p.d, 'complete'), 'stage', p.spd ->> 'stage',
        'missing', case when saip_private.b(p.d, 'complete') then '[]'::jsonb
                        else to_jsonb(backoffice_private.missing_signup_fields(p.d)) end,
        'verification', p.vstate, 'documentStatus', coalesce(p.d ->> 'documentStatus', 'missing'),
        'working', saip_private.b(p.d, 'working'), 'markets', coalesce(p.d -> 'markets', '[]'::jsonb),
        'connections', (select count(*) from public.saip_records c where c.collection = 'connections'
                          and c.readers @> array[p.uid] and c.data ->> 'status' = 'accepted'),
        'activeRequests', (select count(*) from public.saip_records q where q.collection = 'requests'
                             and q.readers @> array[p.uid] and q.data ->> 'status' in ('pending','accepted')),
        'demo', coalesce(p.d ? 'demoBatch', false)) order by p.rn)
      from page p where p.rn > off and p.rn <= off + lim), '[]'::jsonb))
  into res;
  return res;
end $$;

-- Full account dossier. Unmasked (operator+) reads are audited ('account.view').
create or replace function public.backoffice_get_account(p_account_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare a public.backoffice_admins := backoffice_private.require_admin('viewer');
  full_access boolean := backoffice_private.role_rank(a.role) >= 2;
  uid text := p_account_id::text; u record; acc jsonb; res jsonb;
begin
  select id, email, created_at, last_sign_in_at, banned_until, email_confirmed_at,
         coalesce(raw_app_meta_data ->> 'provider', '') provider
    into u from auth.users where id = p_account_id;
  if u.id is null then raise exception '계정을 찾을 수 없어요.'; end if;
  select data into acc from public.saip_records where collection = 'accounts' and id = uid;
  res := jsonb_build_object(
    'account', case when acc is null then null else backoffice_private.account_json(uid, acc, full_access) end,
    'auth', jsonb_build_object('email', case when full_access then u.email else backoffice_private.mask_email(u.email) end,
      'provider', u.provider, 'createdAt', u.created_at, 'lastSignInAt', u.last_sign_in_at,
      'emailConfirmed', u.email_confirmed_at is not null, 'bannedUntil', u.banned_until,
      'isStaff', exists (select 1 from public.backoffice_admins ba where ba.user_id = p_account_id and ba.revoked_at is null)),
    'signup', jsonb_build_object(
      'stage', (select data ->> 'stage' from public.saip_records where collection = 'signupProgress' and id = uid),
      'updatedAt', (select data ->> 'updatedAt' from public.saip_records where collection = 'signupProgress' and id = uid),
      'missing', case when saip_private.b(acc, 'complete') then '[]'::jsonb else to_jsonb(backoffice_private.missing_signup_fields(acc)) end),
    'moderation', (select to_jsonb(m) - 'account_id' from public.backoffice_account_moderation m where m.account_id = p_account_id),
    'reviews', coalesce((select jsonb_agg(to_jsonb(r) - case when full_access then 'x' else 'internal_note' end order by r.id desc)
                         from public.backoffice_account_reviews r where r.account_id = p_account_id), '[]'::jsonb),
    'connections', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'status', c.data ->> 'status',
        'direction', case when c.data ->> 'from' = uid then 'sent' else 'received' end,
        'partner', backoffice_private.account_brief(case when c.data ->> 'from' = uid then c.data ->> 'to' else c.data ->> 'from' end),
        'createdAt', c.data ->> 'createdAt', 'version', saip_private.n(c.data, 'version'))
      order by c.data ->> 'createdAt' desc)
      from public.saip_records c where c.collection = 'connections' and c.readers @> array[p_account_id]), '[]'::jsonb),
    'requestStats', (select jsonb_build_object(
        'asRetailer', coalesce(jsonb_object_agg(k, n) filter (where side = 'retailer'), '{}'::jsonb),
        'asUncle', coalesce(jsonb_object_agg(k, n) filter (where side = 'uncle'), '{}'::jsonb))
      from (select case when q.data ->> 'retailerId' = uid then 'retailer' else 'uncle' end side, backoffice_private.request_label(q.data) k, count(*) n
            from public.saip_records q where q.collection = 'requests' and q.readers @> array[p_account_id] group by 1, 2) s),
    'recentRequests', coalesce((select jsonb_agg(x.j order by x.updated_at desc) from (
        select q.updated_at, jsonb_build_object('id', q.id, 'product', q.data ->> 'product', 'option', q.data ->> 'option',
          'requestType', backoffice_private.request_type(q.data), 'title', backoffice_private.request_title(q.data),
          'label', backoffice_private.request_label(q.data), 'ledger', backoffice_private.ledger(q.data),
          'partner', backoffice_private.account_brief(case when q.data ->> 'retailerId' = uid then q.data ->> 'uncleId' else q.data ->> 'retailerId' end),
          'createdAt', q.data ->> 'createdAt', 'updatedAt', q.updated_at) j
        from public.saip_records q where q.collection = 'requests' and q.readers @> array[p_account_id]
        order by q.updated_at desc limit 20) x), '[]'::jsonb),
    'draftCount', (select count(*) from public.saip_records where collection = 'drafts' and readers @> array[p_account_id]),
    'unreadNotices', (select count(*) from public.saip_records where collection = 'notices' and readers @> array[p_account_id]
                       and not saip_private.b(data, 'read')),
    'attachments', coalesce((select jsonb_agg(jsonb_build_object('id', t.id,
        'name', case when full_access then t.data ->> 'name' end, 'mime', t.data ->> 'mime',
        'size', saip_private.n(t.data, 'size'), 'createdAt', t.data ->> 'createdAt',
        'usage', array_remove(array[
          case when t.id = saip_private.s(acc, 'documentId') then 'businessDocument' end,
          case when t.id = saip_private.s(acc, 'photoId') then 'profilePhoto' end,
          case when exists (select 1 from public.saip_records q where q.collection = 'requests' and q.readers @> array[p_account_id]
                            and (q.data -> 'photos') ? t.id) then 'requestPhoto' end,
          case when exists (select 1 from public.saip_records q where q.collection = 'messages' and q.readers @> array[p_account_id]
                            and (q.data -> 'attachments') ? t.id) then 'chatPhoto' end], null))
      order by t.data ->> 'createdAt' desc)
      from public.saip_records t where t.collection = 'attachments' and t.data ->> 'ownerId' = uid), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(to_jsonb(n) order by n.id desc) from public.backoffice_notes n
                       where n.target_type = 'account' and n.target_id = uid), '[]'::jsonb),
    'cases', coalesce((select jsonb_agg(to_jsonb(c) order by c.updated_at desc) from public.backoffice_cases c
                       where c.target_type = 'account' and c.target_id = uid), '[]'::jsonb),
    'recentAudit', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'at', l.at, 'action', l.action, 'actorId', l.actor_id,
        'actorName', (select b.display_name from public.backoffice_admins b where b.user_id = l.actor_id), 'reason', l.reason) order by l.id desc)
      from (select * from public.backoffice_audit_log where target_type = 'account' and target_id = uid
            order by id desc limit 20) l), '[]'::jsonb));
  if full_access then
    perform backoffice_private.audit_view(a, 'account.view', 'account', uid, '', null);
  end if;
  return res;
end $$;

create or replace function public.backoffice_list_requests(
  p_labels text[] default null, p_attention text default null, p_account_id uuid default null, p_search text default '',
  p_from timestamptz default null, p_to timestamptz default null, p_include_demo boolean default false,
  p_sort text default 'updated_desc', p_limit integer default 50, p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare lim integer := least(greatest(coalesce(p_limit, 50), 1), 200); off integer := greatest(coalesce(p_offset, 0), 0);
  pat text := backoffice_private.like_pattern(p_search); today date := backoffice_private.kst_today(); res jsonb;
begin
  perform backoffice_private.require_admin('viewer');
  with base as (
    select r.id, r.data d, r.updated_at, backoffice_private.request_label(r.data) label,
      backoffice_private.ts(r.data ->> 'createdAt') created_at, backoffice_private.day(r.data ->> 'recheck') recheck,
      saip_private.b(r.data, 'resultShared') and saip_private.remaining(r.data) > 0 and r.data ->> 'status' = 'accepted' has_backorder
    from public.saip_records r
    where r.collection = 'requests' and (p_include_demo or not (r.data ? 'demoBatch'))
      and (p_account_id is null or r.readers @> array[p_account_id])
      and (p_from is null or backoffice_private.ts(r.data ->> 'createdAt') >= p_from)
      and (p_to is null or backoffice_private.ts(r.data ->> 'createdAt') < p_to)
      and (coalesce(btrim(p_search), '') = '' or backoffice_private.request_search_text(r.id, r.data) ilike pat)),
  scoped as (
    select * from base b where p_attention is null or case p_attention
      when 'needs_reply' then b.label = '답변 필요'
      when 'open_issue' then saip_private.n(b.d, 'openIssues') > 0
      when 'proposal' then saip_private.s(b.d, 'proposalId') <> ''
      when 'receipt_pending' then saip_private.n(b.d, 'delivered') > saip_private.n(b.d, 'received')
      when 'backorder' then b.has_backorder
      when 'recheck_due' then b.label = '미송 재확인'
      when 'recheck_today' then b.has_backorder and b.recheck = today
      when 'recheck_overdue' then b.has_backorder and b.recheck < today
      when 'pending_stale' then b.d ->> 'status' = 'pending' and b.created_at < now() - interval '24 hours'
      when 'violation' then cardinality(backoffice_private.ledger_violations(b.d)) > 0
      when 'has_photos' then jsonb_typeof(b.d -> 'photos') = 'array' and jsonb_array_length(b.d -> 'photos') > 0
      when 'wholesaler' then backoffice_private.request_type(b.d) = 'wholesaler'
      else false end),
  filtered as (select * from scoped s where p_labels is null or s.label = any(p_labels)),
  page as (
    select f.*, row_number() over (order by
        case when p_sort = 'created_desc' then f.created_at end desc nulls last,
        case when p_sort = 'created_asc' then f.created_at end asc nulls last,
        case when p_sort = 'recheck_asc' then f.recheck end asc nulls last,
        f.updated_at desc, f.id) rn
    from filtered f)
  select jsonb_build_object('total', (select count(*) from filtered), 'limit', lim, 'offset', off,
    'labels', coalesce((select jsonb_object_agg(label, n) from (select label, count(*) n from scoped group by 1) s), '{}'::jsonb),
    'totals', (select jsonb_build_object('quantity', coalesce(sum(saip_private.n(d, 'quantity')), 0),
        'acquired', coalesce(sum(saip_private.n(d, 'acquired')), 0), 'delivered', coalesce(sum(saip_private.n(d, 'delivered')), 0),
        'received', coalesce(sum(saip_private.n(d, 'received')), 0),
        'backorder', coalesce(sum(case when saip_private.b(d, 'resultShared') then greatest(saip_private.remaining(d), 0) else 0 end), 0))
      from filtered),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'status', p.d ->> 'status', 'label', p.label,
        'product', p.d ->> 'product', 'option', p.d ->> 'option', 'wholesaler', p.d ->> 'wholesaler', 'location', p.d ->> 'location',
        'requestType', backoffice_private.request_type(p.d), 'title', backoffice_private.request_title(p.d),
        'wholesalers', backoffice_private.request_wholesalers(p.d),
        'retailer', backoffice_private.account_brief(p.d ->> 'retailerId'), 'uncle', backoffice_private.account_brief(p.d ->> 'uncleId'),
        'ledger', backoffice_private.ledger(p.d), 'recheck', nullif(p.d ->> 'recheck', ''), 'recheckDays', p.recheck - today,
        'needsReply', saip_private.b(p.d, 'needsReply'), 'proposalId', saip_private.s(p.d, 'proposalId'),
        'photoCount', case when jsonb_typeof(p.d -> 'photos') = 'array' then jsonb_array_length(p.d -> 'photos') else 0 end,
        'violations', to_jsonb(backoffice_private.ledger_violations(p.d)),
        'lastEvent', (select jsonb_build_object('title', e.data ->> 'title', 'createdAt', e.data ->> 'createdAt')
                      from public.saip_records e where e.collection = 'events' and e.data ->> 'requestId' = p.id
                      order by backoffice_private.ts(e.data ->> 'createdAt') desc nulls last, e.id desc limit 1),
        'recheckNoticeAt', (select max(backoffice_private.ts(n.data ->> 'createdAt')) from public.saip_records n
                            where n.collection = 'notices' and n.data ->> 'requestId' = p.id and n.id like 'recheck-%'),
        'createdAt', p.d ->> 'createdAt', 'updatedAt', p.updated_at, 'version', saip_private.n(p.d, 'version'),
        'demo', p.d ? 'demoBatch') order by p.rn)
      from page p where p.rn > off and p.rn <= off + lim), '[]'::jsonb))
  into res;
  return res;
end $$;

-- Full request dossier. Chat bodies are NOT included (backoffice_get_conversation).
create or replace function public.backoffice_get_request(p_request_id text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a public.backoffice_admins := backoffice_private.require_admin('viewer');
  full_access boolean := backoffice_private.role_rank(a.role) >= 2; r public.saip_records;
begin
  select * into r from public.saip_records where collection = 'requests' and id = p_request_id;
  if r.id is null then raise exception '요청을 찾을 수 없어요.'; end if;
  return jsonb_build_object(
    -- A 도매처 주문서 copies the retailer's deliveryNote into note (202610130004):
    -- contact data, so viewers get it blank like the account's deliveryNote.
    'request', (case when full_access then r.data else r.data || jsonb_build_object(
                  'address', backoffice_private.mask_address(r.data ->> 'address'), 'addressDetail', '', 'masked', true)
                  || case when backoffice_private.request_type(r.data) = 'wholesaler' then '{"note":""}'::jsonb else '{}'::jsonb end end)
               || jsonb_build_object('id', r.id, 'label', backoffice_private.request_label(r.data),
                    'requestType', backoffice_private.request_type(r.data), 'title', backoffice_private.request_title(r.data),
                    'wholesalers', backoffice_private.request_wholesalers(r.data),
                    'ledger', backoffice_private.ledger(r.data), 'updatedAt', r.updated_at, 'participants', to_jsonb(r.readers)),
    'retailer', backoffice_private.account_brief(r.data ->> 'retailerId'),
    'uncle', backoffice_private.account_brief(r.data ->> 'uncleId'),
    'checks', backoffice_private.request_checks(r.id, r.data),
    'deliveries', coalesce((select jsonb_agg((case when full_access then x.data else x.data || jsonb_build_object(
          'address', backoffice_private.mask_address(x.data ->> 'address'), 'addressDetail', '') end)
        || jsonb_build_object('id', x.id, 'round', x.rn) order by x.rn)
      from (select d.*, row_number() over (order by backoffice_private.ts(d.data ->> 'createdAt'), d.id) rn
            from public.saip_records d where d.collection = 'deliveries' and d.data ->> 'requestId' = r.id) x), '[]'::jsonb),
    'receipts', coalesce((select jsonb_agg(x.data || jsonb_build_object('id', x.id) order by backoffice_private.ts(x.data ->> 'createdAt'), x.id)
      from public.saip_records x where x.collection = 'receipts' and x.data ->> 'requestId' = r.id), '[]'::jsonb),
    'proposals', coalesce((select jsonb_agg((case when full_access then x.data else x.data || jsonb_build_object('values',
          coalesce(x.data -> 'values', '{}'::jsonb) - 'address' - 'addressDetail'
            - case when backoffice_private.request_type(r.data) = 'wholesaler' then 'note' else '' end) end) || jsonb_build_object('id', x.id)
        order by backoffice_private.ts(x.data ->> 'createdAt'), x.id)
      from public.saip_records x where x.collection = 'proposals' and x.data ->> 'requestId' = r.id), '[]'::jsonb),
    'issues', coalesce((select jsonb_agg(x.data || jsonb_build_object('id', x.id) order by backoffice_private.ts(x.data ->> 'createdAt'), x.id)
      from public.saip_records x where x.collection = 'issues' and x.data ->> 'requestId' = r.id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(case when full_access then x.data || jsonb_build_object('id', x.id)
          else jsonb_build_object('id', x.id, 'title', x.data ->> 'title', 'actorId', x.data ->> 'actorId',
            'deliveryId', x.data ->> 'deliveryId', 'createdAt', x.data ->> 'createdAt',
            'scope', case when x.data ? 'deliveryId' then 'delivery' else 'request' end,
            'status', x.data -> 'after' ->> 'status', 'ledgerBefore', backoffice_private.ledger(x.data -> 'before'),
            'ledger', backoffice_private.ledger(x.data -> 'after')) end
        order by backoffice_private.ts(x.data ->> 'createdAt'), x.id)
      from public.saip_records x where x.collection = 'events' and x.data ->> 'requestId' = r.id), '[]'::jsonb),
    'messages', (select jsonb_build_object('system', count(*) filter (where saip_private.b(x.data, 'system')),
        'user', count(*) filter (where not saip_private.b(x.data, 'system')),
        'unread', count(*) filter (where not saip_private.b(x.data, 'read')),
        -- deleteMessage clears requestId, so deleted messages leave this count.
        'edited', count(*) filter (where x.data ? 'editedAt' and not saip_private.b(x.data, 'deleted')))
      from public.saip_records x where x.collection = 'messages' and x.data ->> 'requestId' = r.id),
    'recheckNotices', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'createdAt', n.data ->> 'createdAt', 'read', saip_private.b(n.data, 'read'))
        order by n.id) from public.saip_records n where n.collection = 'notices' and n.data ->> 'requestId' = r.id and n.id like 'recheck-%'), '[]'::jsonb),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', case when full_access then t.data ->> 'name' end,
        'mime', t.data ->> 'mime', 'size', saip_private.n(t.data, 'size')))
      from public.saip_records t where t.collection = 'attachments'
        and t.id in (select jsonb_array_elements_text(case when jsonb_typeof(r.data -> 'photos') = 'array' then r.data -> 'photos' else '[]'::jsonb end))), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(to_jsonb(n) order by n.id desc) from public.backoffice_notes n
                       where n.target_type = 'request' and n.target_id = r.id), '[]'::jsonb),
    'cases', coalesce((select jsonb_agg(to_jsonb(c) order by c.updated_at desc) from public.backoffice_cases c
                       where c.target_type = 'request' and c.target_id = r.id), '[]'::jsonb));
end $$;

-- Read-only list for the other collections. drafts, messages (conversation
-- RPC), accounts and requests (dedicated RPCs) are excluded.
create or replace function public.backoffice_list_records(
  p_collection text, p_filter text default null, p_status text default null, p_request_id text default null,
  p_account_id uuid default null, p_include_demo boolean default false, p_limit integer default 50, p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare a public.backoffice_admins := backoffice_private.require_admin('viewer');
  full_access boolean := backoffice_private.role_rank(a.role) >= 2;
  lim integer := least(greatest(coalesce(p_limit, 50), 1), 200); off integer := greatest(coalesce(p_offset, 0), 0);
  day_start timestamptz := backoffice_private.kst_start(backoffice_private.kst_today()); res jsonb;
begin
  if p_collection is null or p_collection not in ('connections','deliveries','receipts','proposals','issues','events','notices','attachments','signupProgress') then
    raise exception '조회할 수 없는 기록 종류예요.';
  end if;
  with base as (
    select r.id, r.data d, r.updated_at, r.readers, backoffice_private.ts(r.data ->> 'createdAt') created_at
    from public.saip_records r
    where r.collection = p_collection and (p_include_demo or not (r.data ? 'demoBatch'))
      and (p_status is null or r.data ->> 'status' = p_status)
      and (p_request_id is null or r.data ->> 'requestId' = p_request_id)
      and (p_account_id is null or r.readers @> array[p_account_id])),
  filtered as (
    select * from base b where p_filter is null or case p_filter
      when 'awaiting_receipt' then not saip_private.b(b.d, 'receiptRecorded')
      when 'awaiting_receipt_48h' then not saip_private.b(b.d, 'receiptRecorded') and b.created_at < now() - interval '48 hours'
      when 'mismatch' then saip_private.b(b.d, 'receiptRecorded') and saip_private.n(b.d, 'actual') <> saip_private.n(b.d, 'quantity')
      when 'corrected' then b.d ? 'correctedAt'
      when 'pending' then b.d ->> 'status' = 'pending'
      when 'pending_3d' then b.d ->> 'status' = 'pending' and b.created_at < now() - interval '3 days'
      when 'today' then b.created_at >= day_start
      when 'unresolved' then coalesce(b.d ->> 'status', '') <> 'resolved'
      when 'unread' then not saip_private.b(b.d, 'read')
      when 'incomplete' then coalesce(b.d ->> 'stage', '') <> 'completed'
      else false end),
  page as (select f.*, row_number() over (order by f.created_at desc nulls last, f.updated_at desc, f.id) rn from filtered f)
  select jsonb_build_object('total', (select count(*) from filtered), 'limit', lim, 'offset', off,
    'facets', (select jsonb_build_object(
        'status', coalesce((select jsonb_object_agg(k, n) from (select coalesce(d ->> 'status', '') k, count(*) n from base group by 1) s), '{}'::jsonb),
        'awaitingReceipt', count(*) filter (where p_collection = 'deliveries' and not saip_private.b(d, 'receiptRecorded')),
        'awaitingReceipt48h', count(*) filter (where p_collection = 'deliveries' and not saip_private.b(d, 'receiptRecorded') and created_at < now() - interval '48 hours'),
        'mismatch', count(*) filter (where p_collection = 'deliveries' and saip_private.b(d, 'receiptRecorded') and saip_private.n(d, 'actual') <> saip_private.n(d, 'quantity')),
        'corrected', count(*) filter (where p_collection = 'deliveries' and d ? 'correctedAt'),
        'pending3d', count(*) filter (where d ->> 'status' = 'pending' and created_at < now() - interval '3 days'),
        'today', count(*) filter (where created_at >= day_start),
        'unread', count(*) filter (where p_collection = 'notices' and not saip_private.b(d, 'read'))) from base),
    'rows', coalesce((select jsonb_agg(
        (case
          -- chat notices carry the first 120 chars of a message: chat content stays
          -- behind the audited backoffice_get_conversation for every role.
          when p_collection = 'notices' and p.d ->> 'kind' = 'chat' then p.d || '{"title":"[채팅 알림]"}'::jsonb
          when full_access then p.d - 'path'
          when p_collection = 'attachments' then p.d - 'path' - 'name'
          when p_collection = 'deliveries' then p.d || jsonb_build_object('address', backoffice_private.mask_address(p.d ->> 'address'), 'addressDetail', '')
          when p_collection = 'proposals' then p.d || jsonb_build_object('values', coalesce(p.d -> 'values', '{}'::jsonb) - 'address' - 'addressDetail'
            - case when exists (select 1 from public.saip_records q where q.collection = 'requests' and q.id = p.d ->> 'requestId'
                                  and backoffice_private.request_type(q.data) = 'wholesaler') then 'note' else '' end)
          when p_collection = 'events' then jsonb_build_object('requestId', p.d ->> 'requestId', 'deliveryId', p.d ->> 'deliveryId',
            'actorId', p.d ->> 'actorId', 'title', p.d ->> 'title', 'createdAt', p.d ->> 'createdAt',
            'status', p.d -> 'after' ->> 'status', 'ledger', backoffice_private.ledger(p.d -> 'after'))
          else p.d - 'path' end)
        || jsonb_build_object('id', p.id, 'updatedAt', p.updated_at, 'participants', to_jsonb(p.readers),
             'parties', (select coalesce(jsonb_agg(backoffice_private.account_brief(x::text)), '[]'::jsonb) from unnest(p.readers) x),
             'request', case when p.d ? 'requestId' then (select jsonb_build_object('id', q.id, 'product', q.data ->> 'product',
                 'option', q.data ->> 'option', 'status', q.data ->> 'status', 'label', backoffice_private.request_label(q.data),
                 'requestType', backoffice_private.request_type(q.data), 'title', backoffice_private.request_title(q.data))
               from public.saip_records q where q.collection = 'requests' and q.id = p.d ->> 'requestId') end,
             'round', case when p_collection = 'deliveries' then (select count(*) from public.saip_records x
               where x.collection = 'deliveries' and x.data ->> 'requestId' = p.d ->> 'requestId'
                 and (backoffice_private.ts(x.data ->> 'createdAt') < p.created_at
                      or (backoffice_private.ts(x.data ->> 'createdAt') = p.created_at and x.id <= p.id))) end)
        order by p.rn)
      from page p where p.rn > off and p.rn <= off + lim), '[]'::jsonb))
  into res;
  return res;
end $$;

-- Conversation list: metadata only, never message bodies.
create or replace function public.backoffice_list_conversations(
  p_account_id uuid default null, p_include_demo boolean default false, p_limit integer default 50, p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare lim integer := least(greatest(coalesce(p_limit, 50), 1), 200); off integer := greatest(coalesce(p_offset, 0), 0); res jsonb;
begin
  perform backoffice_private.require_admin('viewer');
  with m as (
    select least(x.readers[1], x.readers[2]) a, greatest(x.readers[1], x.readers[2]) b, x.data d,
      backoffice_private.ts(x.data ->> 'createdAt') at
    from public.saip_records x
    where x.collection = 'messages' and cardinality(x.readers) = 2
      and (p_include_demo or not (x.data ? 'demoBatch'))
      and (p_account_id is null or x.readers @> array[p_account_id])),
  pairs as (
    select a, b, max(at) last_at, count(*) filter (where not saip_private.b(d, 'system')) user_messages,
      count(*) filter (where saip_private.b(d, 'system')) system_messages,
      count(distinct nullif(d ->> 'requestId', '')) linked_requests,
      count(*) filter (where not saip_private.b(d, 'read') and not saip_private.b(d, 'system')) unread,
      count(*) filter (where jsonb_typeof(d -> 'attachments') = 'array' and jsonb_array_length(d -> 'attachments') > 0) with_attachments,
      -- editMessage / deleteMessage (202610130000): the row stays, deleted ones with an empty body.
      count(*) filter (where d ? 'editedAt' and not saip_private.b(d, 'deleted')) edited,
      count(*) filter (where saip_private.b(d, 'deleted')) deleted
    from m group by a, b),
  page as (select p.*, row_number() over (order by p.last_at desc nulls last, p.a, p.b) rn from pairs p)
  select jsonb_build_object('total', (select count(*) from pairs), 'limit', lim, 'offset', off,
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'accountA', backoffice_private.account_brief(p.a::text), 'accountB', backoffice_private.account_brief(p.b::text),
        'lastAt', p.last_at, 'userMessages', p.user_messages, 'systemMessages', p.system_messages,
        'linkedRequests', p.linked_requests, 'unread', p.unread, 'withAttachments', p.with_attachments,
        'edited', p.edited, 'deleted', p.deleted,
        'connection', (select c.data ->> 'status' from public.saip_records c where c.collection = 'connections'
                       and c.readers @> array[p.a, p.b] order by backoffice_private.ts(c.data ->> 'createdAt') desc nulls last limit 1))
        order by p.rn)
      from page p where p.rn > off and p.rn <= off + lim), '[]'::jsonb))
  into res;
  return res;
end $$;

-- 1:1 transcript (user + system messages). Operator+, reason required, audited.
-- Phone numbers inside message text are masked.
create or replace function public.backoffice_get_conversation(
  p_account_a uuid, p_account_b uuid, p_reason text, p_limit integer default 200, p_before timestamptz default null
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare a public.backoffice_admins := backoffice_private.require_admin('operator');
  why text := backoffice_private.require_reason(p_reason); lim integer := least(greatest(coalesce(p_limit, 200), 1), 500);
  res jsonb; total integer;
begin
  if p_account_a is null or p_account_b is null or p_account_a = p_account_b then raise exception '대화 당사자를 확인해 주세요.'; end if;
  select count(*) into total from public.saip_records x
   where x.collection = 'messages' and x.readers @> array[p_account_a, p_account_b]
     and (p_before is null or backoffice_private.ts(x.data ->> 'createdAt') < p_before);
  select jsonb_build_object('participants', jsonb_build_array(backoffice_private.account_brief(p_account_a::text),
      backoffice_private.account_brief(p_account_b::text)),
    'hasMore', total > lim,
    'messages', coalesce(jsonb_agg(jsonb_set(m.d, '{body}', to_jsonb(backoffice_private.mask_phones(m.d ->> 'body')))
                                   || jsonb_build_object('id', m.id) order by m.at, m.id), '[]'::jsonb))
  into res
  from (select x.id, x.data d, backoffice_private.ts(x.data ->> 'createdAt') at from public.saip_records x
        where x.collection = 'messages' and x.readers @> array[p_account_a, p_account_b]
          and (p_before is null or backoffice_private.ts(x.data ->> 'createdAt') < p_before)
        order by backoffice_private.ts(x.data ->> 'createdAt') desc nulls last, x.id desc limit lim) m;
  perform backoffice_private.audit_view(a, 'conversation.view', 'account', least(p_account_a, p_account_b)::text, why,
    jsonb_build_object('peerId', greatest(p_account_a, p_account_b), 'count', jsonb_array_length(res -> 'messages')));
  return res;
end $$;

-- Resolves an attachment for viewing. Returns the storage path; the backoffice
-- server then calls createSignedUrl(path, 60) with the staff session, allowed
-- by policy backoffice_attachment_read for 10 minutes after this audit row.
create or replace function public.backoffice_attachment_access(p_attachment_id text, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare a public.backoffice_admins := backoffice_private.require_admin('operator');
  why text := backoffice_private.require_reason(p_reason); t public.saip_records;
begin
  select * into t from public.saip_records where collection = 'attachments' and id = p_attachment_id;
  if t.id is null then raise exception '첨부파일을 찾을 수 없어요.'; end if;
  perform backoffice_private.audit_view(a, 'attachment.view', 'attachment', t.id, why,
    jsonb_build_object('ownerId', t.data ->> 'ownerId', 'mime', t.data ->> 'mime'));
  return jsonb_build_object('id', t.id, 'bucket', 'saip-attachments', 'path', t.data ->> 'path',
    'ownerId', t.data ->> 'ownerId', 'name', t.data ->> 'name', 'mime', t.data ->> 'mime',
    'size', saip_private.n(t.data, 'size'), 'createdAt', t.data ->> 'createdAt');
end $$;

create or replace function public.backoffice_ledger_anomalies(p_include_demo boolean default false) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare items jsonb;
begin
  perform backoffice_private.require_admin('viewer');
  select coalesce(jsonb_agg(jsonb_build_object('kind', x.kind, 'severity', x.severity, 'targetType', x.target_type,
      'targetId', x.target_id, 'detail', x.detail, 'since', x.since)), '[]'::jsonb)
  into items from backoffice_private.anomalies(p_include_demo) x;
  return jsonb_build_object('generatedAt', now(), 'items', items,
    'counts', coalesce((select jsonb_object_agg(k, n) from (select i ->> 'kind' k, count(*) n
                         from jsonb_array_elements(items) i group by 1) s), '{}'::jsonb));
end $$;

-- ⌘K: accounts, requests, leads. Viewers cannot search by phone or contact.
create or replace function public.backoffice_search(p_query text, p_limit integer default 5) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a public.backoffice_admins := backoffice_private.require_admin('viewer');
  full_access boolean := backoffice_private.role_rank(a.role) >= 2; q text := btrim(coalesce(p_query, ''));
  pat text := backoffice_private.like_pattern(p_query); digits text := regexp_replace(coalesce(p_query, ''), '\D', '', 'g');
  lim integer := least(greatest(coalesce(p_limit, 5), 1), 20);
begin
  if char_length(q) = 0 then return jsonb_build_object('accounts', '[]'::jsonb, 'requests', '[]'::jsonb, 'leads', '[]'::jsonb); end if;
  return jsonb_build_object(
    'accounts', coalesce((select jsonb_agg(x.j) from (
        select jsonb_build_object('id', acc.id, 'name', coalesce(nullif(acc.data ->> 'name', ''), acc.data ->> 'label'),
          'role', acc.data ->> 'role', 'complete', saip_private.b(acc.data, 'complete'),
          'businessName', case when full_access then acc.data ->> 'businessName' else backoffice_private.mask_name(acc.data ->> 'businessName') end,
          'phoneTail', case when full_access then right(regexp_replace(coalesce(acc.data ->> 'phone', ''), '\D', '', 'g'), 4) end) j
        from public.saip_records acc where acc.collection = 'accounts'
          and (concat_ws(' ', acc.id, acc.data ->> 'name', acc.data ->> 'label', acc.data ->> 'nickname', acc.data ->> 'publicCode',
                 case when full_access then concat_ws(' ', acc.data ->> 'businessName', acc.data ->> 'contact') end) ilike pat
               or (full_access and char_length(digits) >= 4
                   and regexp_replace(coalesce(acc.data ->> 'phone', ''), '\D', '', 'g') like '%' || digits))
        order by acc.updated_at desc limit lim) x), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(x.j) from (
        select jsonb_build_object('id', r.id, 'product', r.data ->> 'product', 'option', r.data ->> 'option',
          'requestType', backoffice_private.request_type(r.data), 'title', backoffice_private.request_title(r.data),
          'label', backoffice_private.request_label(r.data), 'retailer', backoffice_private.account_brief(r.data ->> 'retailerId') ->> 'name',
          'uncle', backoffice_private.account_brief(r.data ->> 'uncleId') ->> 'name') j
        from public.saip_records r where r.collection = 'requests'
          and backoffice_private.request_search_text(r.id, r.data) ilike pat
        order by r.updated_at desc limit lim) x), '[]'::jsonb),
    'leads', coalesce((select jsonb_agg(x.j) from (
        select jsonb_build_object('id', l.id, 'name', case when full_access then l.name else backoffice_private.mask_name(l.name) end,
          'businessName', l.business_name, 'role', l.role, 'createdAt', l.created_at) j
        from public.landing_leads l
        where concat_ws(' ', l.business_name, l.market, case when full_access then concat_ws(' ', l.name, l.contact) end) ilike pat
        order by l.created_at desc limit lim) x), '[]'::jsonb));
end $$;

create or replace function public.backoffice_list_leads(
  p_status text default null, p_search text default '', p_include_suspect boolean default true,
  p_limit integer default 50, p_offset integer default 0
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare a public.backoffice_admins := backoffice_private.require_admin('viewer');
  full_access boolean := backoffice_private.role_rank(a.role) >= 2;
  lim integer := least(greatest(coalesce(p_limit, 50), 1), 200); off integer := greatest(coalesce(p_offset, 0), 0);
  pat text := backoffice_private.like_pattern(p_search); res jsonb;
begin
  with base as (
    select l.*, coalesce(s.status, 'new') follow_status, s.assignee_id, s.updated_at status_updated_at,
      coalesce(l.source, '') ~ '(e2e|timing-suspect)' suspect
    from public.landing_leads l left join public.backoffice_lead_status s on s.lead_id = l.id
    where (coalesce(btrim(p_search), '') = '' or concat_ws(' ', l.business_name, l.market, l.source,
            case when full_access then concat_ws(' ', l.name, l.contact, l.message) end) ilike pat)
      and (p_include_suspect or not (coalesce(l.source, '') ~ '(e2e|timing-suspect)'))),
  filtered as (select * from base where p_status is null or follow_status = p_status),
  page as (select f.*, row_number() over (order by f.created_at desc, f.id) rn from filtered f)
  select jsonb_build_object('total', (select count(*) from filtered), 'limit', lim, 'offset', off,
    'facets', coalesce((select jsonb_object_agg(k, n) from (select follow_status k, count(*) n from base group by 1) s), '{}'::jsonb),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'createdAt', p.created_at, 'role', p.role,
        'name', case when full_access then p.name else backoffice_private.mask_name(p.name) end,
        'businessName', p.business_name,
        'contact', case when full_access then p.contact else backoffice_private.mask_tail(p.contact, 4) end,
        'market', p.market, 'message', case when full_access then p.message end,
        'source', p.source, 'utm', p.utm, 'suspect', p.suspect, 'status', p.follow_status,
        'assignee', (select jsonb_build_object('userId', b.user_id, 'displayName', b.display_name) from public.backoffice_admins b where b.user_id = p.assignee_id),
        'statusUpdatedAt', p.status_updated_at,
        'notes', (select count(*) from public.backoffice_notes n where n.target_type = 'lead' and n.target_id = p.id::text)) order by p.rn)
      from page p where p.rn > off and p.rn <= off + lim), '[]'::jsonb))
  into res;
  if full_access and jsonb_array_length(res -> 'rows') > 0 then
    perform backoffice_private.audit_view(a, 'lead.view_list', 'lead', coalesce(p_status, 'all'), '',
      jsonb_build_object('count', jsonb_array_length(res -> 'rows')));
  end if;
  return res;
end $$;

create or replace function public.backoffice_list_config() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform backoffice_private.require_admin('viewer');
  return coalesce((select jsonb_agg(to_jsonb(c) || jsonb_build_object('updatedByName',
      (select b.display_name from public.backoffice_admins b where b.user_id = c.updated_by)) order by c.key)
    from public.app_remote_config c), '[]'::jsonb);
end $$;

create or replace function public.backoffice_list_notices(p_include_inactive boolean default true) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform backoffice_private.require_admin('viewer');
  return coalesce((select jsonb_agg(to_jsonb(n) || jsonb_build_object('state', case
      when not n.active then 'draft' when n.ends_at is not null and n.ends_at <= now() then 'ended'
      when n.starts_at > now() then 'scheduled' else 'live' end) order by n.starts_at desc)
    from public.app_notices n where p_include_inactive or n.active), '[]'::jsonb);
end $$;

create or replace function public.backoffice_list_audit(
  p_action text default null, p_actor_id uuid default null, p_target_type text default null, p_target_id text default null,
  p_from timestamptz default null, p_to timestamptz default null, p_limit integer default 50, p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare lim integer := least(greatest(coalesce(p_limit, 50), 1), 200); off integer := greatest(coalesce(p_offset, 0), 0); res jsonb;
begin
  perform backoffice_private.require_admin('operator');
  with f as (select l.* from public.backoffice_audit_log l
      where (p_action is null or l.action = p_action or split_part(l.action, '.', 1) = p_action)
        and (p_actor_id is null or l.actor_id = p_actor_id) and (p_target_type is null or l.target_type = p_target_type)
        and (p_target_id is null or l.target_id = p_target_id) and (p_from is null or l.at >= p_from) and (p_to is null or l.at < p_to))
  select jsonb_build_object('total', (select count(*) from f), 'limit', lim, 'offset', off,
    'rows', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'at', x.at, 'actorId', x.actor_id, 'actorRole', x.actor_role,
        'actorName', (select b.display_name from public.backoffice_admins b where b.user_id = x.actor_id),
        'action', x.action, 'targetType', x.target_type, 'targetId', x.target_id, 'reason', x.reason,
        'before', x.before, 'after', x.after, 'operationId', x.operation_id, 'client', x.client) order by x.id desc)
      from (select * from f order by id desc limit lim offset off) x), '[]'::jsonb))
  into res;
  return res;
end $$;

-- App command ledger (saip_private.operations): command names and results only,
-- never args (they hold message bodies, drafts and profile data).
create or replace function public.backoffice_list_operations(
  p_account_id uuid default null, p_command text default null, p_limit integer default 50, p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare lim integer := least(greatest(coalesce(p_limit, 50), 1), 200); off integer := greatest(coalesce(p_offset, 0), 0); res jsonb;
begin
  perform backoffice_private.require_admin('operator');
  with f as (select o.actor, o.id, o.payload ->> 'command' command, o.result, o.created_at from saip_private.operations o
             where (p_account_id is null or o.actor = p_account_id) and (p_command is null or o.payload ->> 'command' = p_command))
  select jsonb_build_object('total', (select count(*) from f), 'limit', lim, 'offset', off,
    'commands', coalesce((select jsonb_object_agg(k, n) from (select command k, count(*) n from f group by 1) s), '{}'::jsonb),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('actor', backoffice_private.account_brief(x.actor::text),
        'operationId', x.id, 'command', x.command, 'result', left(x.result, 120), 'createdAt', x.created_at) order by x.created_at desc, x.id)
      from (select * from f order by created_at desc, id limit lim offset off) x), '[]'::jsonb))
  into res;
  return res;
end $$;

create or replace function public.backoffice_list_admins() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a public.backoffice_admins := backoffice_private.require_admin('viewer'); is_owner boolean := a.role = 'owner';
begin
  return coalesce((select jsonb_agg(jsonb_build_object('userId', b.user_id, 'role', b.role, 'displayName', b.display_name,
      'requireMfa', b.require_mfa, 'createdAt', b.created_at, 'revokedAt', b.revoked_at, 'isMe', b.user_id = a.user_id)
      || case when is_owner then jsonb_build_object('email', u.email, 'lastSignInAt', u.last_sign_in_at,
           'mfaFactors', (select count(*) from auth.mfa_factors f where f.user_id = b.user_id and f.status = 'verified'),
           'hasAppAccount', exists (select 1 from public.saip_records r where r.collection = 'accounts' and r.id = b.user_id::text))
         else '{}'::jsonb end
      order by b.revoked_at nulls first, backoffice_private.role_rank(b.role) desc, b.created_at)
    from public.backoffice_admins b left join auth.users u on u.id = b.user_id
    where b.revoked_at is null or is_owner), '[]'::jsonb);
end $$;

-- Owner: find the auth user a new staff member created by signing in once.
create or replace function public.backoffice_lookup_user(p_email text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare a public.backoffice_admins := backoffice_private.require_admin('owner'); u record;
begin
  select id, email, created_at, last_sign_in_at, email_confirmed_at, coalesce(raw_app_meta_data ->> 'provider', '') provider into u
    from auth.users where lower(email) = lower(btrim(coalesce(p_email, ''))) limit 1;
  if u.id is null then raise exception '이 이메일로 로그인한 계정이 없어요. 먼저 운영 화면에 한 번 로그인해 달라고 요청해 주세요.'; end if;
  perform backoffice_private.audit_view(a, 'admin.lookup', 'account', u.id::text, '', null);
  return jsonb_build_object('userId', u.id, 'email', u.email, 'provider', u.provider, 'createdAt', u.created_at,
    'lastSignInAt', u.last_sign_in_at, 'emailConfirmed', u.email_confirmed_at is not null,
    'providers', coalesce((select jsonb_agg(distinct i.provider) from auth.identities i where i.user_id = u.id), '[]'::jsonb),
    'hasAppAccount', exists (select 1 from public.saip_records r where r.collection = 'accounts' and r.id = u.id::text),
    'staff', (select jsonb_build_object('role', b.role, 'revokedAt', b.revoked_at) from public.backoffice_admins b where b.user_id = u.id));
end $$;

-- CSV-ready exports (the Next.js server writes the CSV). Business ledgers carry
-- no contact data; PII exports (accounts, leads) are owner-only. Always audited.
create or replace function public.backoffice_export(
  p_kind text, p_reason text, p_from timestamptz default null, p_to timestamptz default null, p_include_demo boolean default false
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare a public.backoffice_admins := backoffice_private.require_admin(case when p_kind in ('accounts','leads') then 'owner' else 'operator' end);
  why text := backoffice_private.require_reason(p_reason); v_rows jsonb; n integer;
begin
  if p_kind = 'requests' then
    select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'createdAt', r.data ->> 'createdAt', 'updatedAt', r.updated_at,
        'status', r.data ->> 'status', 'label', backoffice_private.request_label(r.data),
        'retailerId', r.data ->> 'retailerId', 'retailerName', backoffice_private.account_brief(r.data ->> 'retailerId') ->> 'name',
        'uncleId', r.data ->> 'uncleId', 'uncleName', backoffice_private.account_brief(r.data ->> 'uncleId') ->> 'name',
        'wholesaler', r.data ->> 'wholesaler', 'location', r.data ->> 'location', 'product', r.data ->> 'product',
        'option', r.data ->> 'option', 'recheck', r.data ->> 'recheck',
        'requestType', backoffice_private.request_type(r.data), 'title', backoffice_private.request_title(r.data),
        'wholesalers', (select string_agg(concat_ws(' / ', nullif(e ->> 'wholesaler', ''), nullif(e ->> 'location', '')), ' · ')
                        from jsonb_array_elements(backoffice_private.request_wholesalers(r.data)) e)) || backoffice_private.ledger(r.data)
      order by r.ord), '[]'::jsonb) into v_rows
    from (select x.*, backoffice_private.ts(x.data ->> 'createdAt') ord from public.saip_records x where x.collection = 'requests'
            and (p_include_demo or not (x.data ? 'demoBatch'))
            and (p_from is null or backoffice_private.ts(x.data ->> 'createdAt') >= p_from)
            and (p_to is null or backoffice_private.ts(x.data ->> 'createdAt') < p_to)
          order by backoffice_private.ts(x.data ->> 'createdAt') limit 5000) r;
  elsif p_kind in ('deliveries','receipts','issues','proposals') then
    select coalesce(jsonb_agg((x.data - 'address' - 'addressDetail' - 'values') || jsonb_build_object('id', x.id) order by x.ord), '[]'::jsonb) into v_rows
    from (select y.*, backoffice_private.ts(y.data ->> 'createdAt') ord from public.saip_records y where y.collection = p_kind
            and (p_include_demo or not (y.data ? 'demoBatch'))
            and (p_from is null or backoffice_private.ts(y.data ->> 'createdAt') >= p_from)
            and (p_to is null or backoffice_private.ts(y.data ->> 'createdAt') < p_to)
          order by backoffice_private.ts(y.data ->> 'createdAt') limit 5000) x;
  elsif p_kind = 'accounts' then
    select coalesce(jsonb_agg(backoffice_private.account_json(x.id, x.data, true) - 'notificationSettings' order by x.id), '[]'::jsonb) into v_rows
    from (select * from public.saip_records where collection = 'accounts'
            and (p_include_demo or not (data ? 'demoBatch')) order by id limit 5000) x;
  elsif p_kind = 'leads' then
    select coalesce(jsonb_agg(to_jsonb(l) - 'user_agent' order by l.created_at), '[]'::jsonb) into v_rows
    from (select * from public.landing_leads
            where (p_from is null or created_at >= p_from) and (p_to is null or created_at < p_to)
            order by created_at limit 5000) l;
  else
    raise exception '지원하지 않는 내보내기 종류예요.';
  end if;
  n := jsonb_array_length(v_rows);
  perform backoffice_private.audit(a, 'export.' || p_kind, 'export', p_kind, why, null,
    jsonb_build_object('rows', n, 'from', p_from, 'to', p_to, 'includeDemo', p_include_demo));
  return jsonb_build_object('kind', p_kind, 'generatedAt', now(), 'rowCount', n, 'truncated', n >= 5000, 'rows', v_rows);
end $$;

create or replace function public.backoffice_verify_audit_chain() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare prev bytea; e record; n bigint := 0;
begin
  perform backoffice_private.require_admin('owner');
  for e in select * from public.backoffice_audit_log order by id loop
    if e.prev_hash is distinct from prev or e.row_hash <> backoffice_private.audit_hash(prev, e.at, e.actor_id, e.actor_role,
         e.action, e.target_type, e.target_id, e.reason, e.before, e.after, e.operation_id, e.request_hash, e.result, e.client) then
      return jsonb_build_object('ok', false, 'brokenAtId', e.id, 'checked', n);
    end if;
    prev := e.row_hash; n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'checked', n, 'headHash', encode(prev, 'hex'), 'verifiedAt', now());
end $$;

-- =============================================================================
-- 6. Admin action RPCs. Contract: require_admin -> replay(op, payload) ->
--    validate -> lock -> write -> audit (same transaction) -> result (stored
--    and returned again on retry). 42501 = permission, P0001 = Korean message.
-- =============================================================================

-- 사업자등록증 review. Writes ONLY verification keys saveProfile cannot set. A
-- re-upload resets verificationStatus to 'unverified' through the app's rule;
-- a changed business number turns 'verified' into 'stale' (verification_state).
create or replace function public.backoffice_review_document(
  p_account_id uuid, p_document_id text, p_decision text, p_user_message text default '',
  p_internal_note text default '', p_checks jsonb default '{}'::jsonb, p_operation_id text default ''
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare a public.backoffice_admins := backoffice_private.require_admin('operator');
  payload jsonb := jsonb_build_object('accountId', p_account_id, 'documentId', p_document_id, 'decision', p_decision,
    'userMessage', p_user_message, 'internalNote', p_internal_note, 'checks', p_checks);
  prior jsonb; acc public.saip_records; att jsonb; status_v text; before_v jsonb; after_v jsonb; review_id bigint; res jsonb;
begin
  prior := backoffice_private.replay(p_operation_id, payload);
  if prior is not null then return prior; end if;
  if p_decision is null or p_decision not in ('verified','rejected','reset') then raise exception '검토 결과를 선택해 주세요.'; end if;
  if p_decision = 'rejected' and btrim(coalesce(p_user_message, '')) = '' then raise exception '재제출 안내 문구를 입력해 주세요.'; end if;
  if char_length(coalesce(p_user_message, '')) > 300 or char_length(coalesce(p_internal_note, '')) > 2000
     or jsonb_typeof(coalesce(p_checks, '{}'::jsonb)) <> 'object' or octet_length(coalesce(p_checks, '{}'::jsonb)::text) > 4096 then
    raise exception '검토 내용의 길이를 확인해 주세요.';
  end if;
  if p_account_id is null then raise exception '계정을 찾을 수 없어요.'; end if;
  if p_account_id = auth.uid() then raise exception '본인 계정은 처리할 수 없어요.'; end if;
  -- Same advisory key saip_command takes first for this user: no lost update
  -- against the user's concurrent saveProfile.
  perform pg_advisory_xact_lock(hashtextextended('saip-actor-' || p_account_id::text, 0));
  select * into acc from public.saip_records where collection = 'accounts' and id = p_account_id::text for update;
  if acc.id is null then raise exception '계정을 찾을 수 없어요.'; end if;
  if saip_private.s(acc.data, 'documentId') = '' then raise exception '제출된 사업자등록증이 없어요.'; end if;
  if saip_private.s(acc.data, 'documentId') <> coalesce(p_document_id, '') then
    raise exception '사용자가 서류를 다시 제출했어요. 최신 서류를 확인해 주세요.';
  end if;
  select data into att from public.saip_records where collection = 'attachments' and id = p_document_id;
  if att is null or att ->> 'ownerId' <> p_account_id::text then raise exception '서류 첨부 기록을 확인해 주세요.'; end if;
  if p_decision = 'verified' and not exists (select 1 from public.backoffice_audit_log l where l.actor_id = a.user_id
       and l.action = 'attachment.view' and l.target_type = 'attachment' and l.target_id = p_document_id
       and l.at > now() - interval '24 hours') then
    raise exception '서류 원본을 확인한 뒤 승인해 주세요.';
  end if;
  status_v := case p_decision when 'verified' then 'verified' when 'rejected' then 'rejected' else 'unverified' end;
  before_v := saip_private.pick(acc.data, array['verificationStatus','verifiedDocumentId','verificationReviewedAt','documentStatus','documentId'])
    || jsonb_build_object('state', backoffice_private.verification_state(acc.data));
  perform set_config('backoffice.bypass_guard', 'on', true);
  update public.saip_records
     set data = acc.data || jsonb_build_object('verificationStatus', status_v,
           'verificationNote', case when p_decision = 'rejected' then btrim(p_user_message) else '' end,
           'verifiedDocumentId', case when p_decision = 'verified' then p_document_id else '' end,
           'verifiedBusinessNumber', case when p_decision = 'verified' then saip_private.s(acc.data, 'businessNumber') else '' end,
           'verificationReviewedAt', clock_timestamp(), 'version', saip_private.n(acc.data, 'version') + 1),
         updated_at = clock_timestamp()
   where collection = 'accounts' and id = acc.id;
  perform set_config('backoffice.bypass_guard', 'off', true);
  insert into public.backoffice_account_reviews (account_id, document_id, decision, user_message, internal_note, checks, reviewed_by)
  values (p_account_id, p_document_id, p_decision, btrim(coalesce(p_user_message, '')), coalesce(p_internal_note, ''),
          coalesce(p_checks, '{}'::jsonb), a.user_id)
  returning id into review_id;
  after_v := jsonb_build_object('verificationStatus', status_v, 'documentId', p_document_id,
    'state', case p_decision when 'verified' then 'verified' when 'rejected' then 'rejected' else 'unverified' end);
  res := jsonb_build_object('accountId', p_account_id, 'verificationStatus', status_v, 'reviewId', review_id);
  perform backoffice_private.audit(a, 'account.review_document', 'account', p_account_id::text, p_decision,
    before_v, after_v, p_operation_id, payload, res, payload - 'internalNote' - 'userMessage');
  return res;
end $$;

-- Suspend / restore. Business records are untouched; the guard blocks the
-- account's writes at once, the optional login ban stops new sessions and
-- refreshes (an issued access token stays valid for reads <= jwt_expiry).
create or replace function public.backoffice_set_account_status(
  p_account_id uuid, p_status text, p_reason text, p_user_message text default '',
  p_ban_login boolean default true, p_operation_id text default ''
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare a public.backoffice_admins := backoffice_private.require_admin('operator');
  payload jsonb := jsonb_build_object('accountId', p_account_id, 'status', p_status, 'reason', p_reason,
    'userMessage', p_user_message, 'banLogin', p_ban_login);
  prior jsonb; why text; m public.backoffice_account_moderation; banned timestamptz; ban_now boolean := false;
  before_v jsonb; after_v jsonb; res jsonb;
begin
  prior := backoffice_private.replay(p_operation_id, payload);
  if prior is not null then return prior; end if;
  why := backoffice_private.require_reason(p_reason);
  if p_status is null or p_status not in ('active','suspended') then raise exception '계정 상태를 확인해 주세요.'; end if;
  if char_length(coalesce(p_user_message, '')) > 300 then raise exception '사용자 안내 문구는 300자 이하로 입력해 주세요.'; end if;
  if p_account_id is null then raise exception '계정을 찾을 수 없어요.'; end if;
  if p_account_id = auth.uid() then raise exception '본인 계정은 처리할 수 없어요.'; end if;
  if exists (select 1 from public.backoffice_admins b where b.user_id = p_account_id and b.revoked_at is null) and a.role <> 'owner' then
    raise exception '운영 계정은 관리자만 처리할 수 있어요.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('saip-actor-' || p_account_id::text, 0));
  select banned_until into banned from auth.users where id = p_account_id for update;
  if not found then raise exception '계정을 찾을 수 없어요.'; end if;
  select * into m from public.backoffice_account_moderation where account_id = p_account_id for update;
  if coalesce(m.status, 'active') = p_status then raise exception '이미 같은 상태예요.'; end if;
  before_v := jsonb_build_object('status', coalesce(m.status, 'active'), 'loginBanned', coalesce(m.login_banned, false),
    'bannedUntil', banned);
  if p_status = 'suspended' then
    ban_now := coalesce(p_ban_login, true) and (banned is null or banned <= now());
    insert into public.backoffice_account_moderation (account_id, status, reason, user_message, login_banned, updated_by, updated_at)
    values (p_account_id, 'suspended', why, btrim(coalesce(p_user_message, '')), ban_now, a.user_id, now())
    on conflict (account_id) do update set status = excluded.status, reason = excluded.reason,
      user_message = excluded.user_message, login_banned = excluded.login_banned,
      updated_by = excluded.updated_by, updated_at = excluded.updated_at;
    if ban_now then
      -- Same effect as auth.admin.updateUserById(id, { ban_duration: '876600h' }).
      update auth.users set banned_until = now() + interval '876600 hours', updated_at = now() where id = p_account_id;
      delete from auth.sessions where user_id = p_account_id;   -- cascades to refresh tokens
    end if;
  else
    update public.backoffice_account_moderation set status = 'active', reason = why, user_message = '',
      login_banned = false, updated_by = a.user_id, updated_at = now() where account_id = p_account_id;
    -- Only lift a ban this layer created (the demo seed accounts were banned elsewhere).
    if coalesce(m.login_banned, false) then
      update auth.users set banned_until = null, updated_at = now() where id = p_account_id;
    end if;
  end if;
  after_v := jsonb_build_object('status', p_status, 'loginBanned', ban_now,
    'bannedUntil', (select banned_until from auth.users where id = p_account_id));
  res := jsonb_build_object('accountId', p_account_id, 'status', p_status, 'loginBanned', ban_now);
  perform backoffice_private.audit(a, case when p_status = 'suspended' then 'account.suspend' else 'account.restore' end,
    'account', p_account_id::text, why, before_v, after_v, p_operation_id, payload, res, payload - 'userMessage');
  return res;
end $$;

create or replace function public.backoffice_add_note(p_target_type text, p_target_id text, p_body text, p_operation_id text default '')
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare a public.backoffice_admins := backoffice_private.require_admin('operator');
  payload jsonb := jsonb_build_object('targetType', p_target_type, 'targetId', p_target_id, 'body', p_body);
  prior jsonb; note_id bigint; res jsonb;
begin
  prior := backoffice_private.replay(p_operation_id, payload);
  if prior is not null then return prior; end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 4000 then raise exception '메모는 1~4,000자로 입력해 주세요.'; end if;
  perform backoffice_private.assert_target(p_target_type, p_target_id);
  insert into public.backoffice_notes (target_type, target_id, body, author_id)
  values (p_target_type, p_target_id, btrim(p_body), a.user_id) returning id into note_id;
  res := jsonb_build_object('noteId', note_id);
  perform backoffice_private.audit(a, 'note.add', p_target_type, p_target_id, '', null,
    jsonb_build_object('noteId', note_id), p_operation_id, payload, res, payload - 'body');
  return res;
end $$;

create or replace function public.backoffice_open_case(
  p_target_type text, p_target_id text, p_title text, p_severity text default 'normal',
  p_assignee_id uuid default null, p_note text default '', p_operation_id text default ''
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare a public.backoffice_admins := backoffice_private.require_admin('operator');
  payload jsonb := jsonb_build_object('targetType', p_target_type, 'targetId', p_target_id, 'title', p_title,
    'severity', p_severity, 'assigneeId', p_assignee_id, 'note', p_note);
  prior jsonb; case_id uuid; res jsonb;
begin
  prior := backoffice_private.replay(p_operation_id, payload);
  if prior is not null then return prior; end if;
  if p_target_type = 'case' then raise exception '케이스에는 케이스를 열 수 없어요.'; end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 120 then raise exception '케이스 제목은 1~120자로 입력해 주세요.'; end if;
  if coalesce(p_severity, 'normal') not in ('low','normal','high','urgent') then raise exception '중요도를 선택해 주세요.'; end if;
  if char_length(coalesce(p_note, '')) > 4000 then raise exception '메모는 4,000자 이하로 입력해 주세요.'; end if;
  perform backoffice_private.assert_target(p_target_type, p_target_id);
  perform backoffice_private.assert_assignee(p_assignee_id);
  perform pg_advisory_xact_lock(hashtextextended('backoffice-case-' || p_target_type || '-' || p_target_id, 0));
  if exists (select 1 from public.backoffice_cases c where c.target_type = p_target_type and c.target_id = p_target_id
             and c.status in ('open','investigating','waiting')) then
    raise exception '이미 진행 중인 케이스가 있어요.';
  end if;
  insert into public.backoffice_cases (target_type, target_id, title, severity, assignee_id, created_by)
  values (p_target_type, p_target_id, btrim(p_title), coalesce(p_severity, 'normal'), p_assignee_id, a.user_id)
  returning id into case_id;
  if btrim(coalesce(p_note, '')) <> '' then
    insert into public.backoffice_notes (target_type, target_id, body, author_id) values ('case', case_id::text, btrim(p_note), a.user_id);
  end if;
  res := jsonb_build_object('caseId', case_id);
  perform backoffice_private.audit(a, 'case.open', p_target_type, p_target_id, '', null,
    jsonb_build_object('caseId', case_id, 'severity', coalesce(p_severity, 'normal'), 'assigneeId', p_assignee_id),
    p_operation_id, payload, res, payload - 'note' - 'title');
  return res;
end $$;

create or replace function public.backoffice_update_case(
  p_case_id uuid, p_version integer, p_status text default null, p_severity text default null,
  p_assignee_id uuid default null, p_clear_assignee boolean default false, p_note text default '', p_operation_id text default ''
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare a public.backoffice_admins := backoffice_private.require_admin('operator');
  payload jsonb := jsonb_build_object('caseId', p_case_id, 'version', p_version, 'status', p_status, 'severity', p_severity,
    'assigneeId', p_assignee_id, 'clearAssignee', p_clear_assignee, 'note', p_note);
  prior jsonb; c public.backoffice_cases; n public.backoffice_cases; res jsonb;
begin
  prior := backoffice_private.replay(p_operation_id, payload);
  if prior is not null then return prior; end if;
  select * into c from public.backoffice_cases where id = p_case_id for update;
  if c.id is null then raise exception '케이스를 찾을 수 없어요.'; end if;
  if p_version is null or c.version <> p_version then raise exception '다른 운영자가 케이스를 변경했어요. 최신 내용을 확인해 주세요.'; end if;
  if coalesce(p_status, c.status) not in ('open','investigating','waiting','resolved','dismissed')
     or coalesce(p_severity, c.severity) not in ('low','normal','high','urgent') then
    raise exception '케이스 상태와 중요도를 확인해 주세요.';
  end if;
  if c.status in ('resolved','dismissed') and coalesce(p_status, c.status) in ('resolved','dismissed') then
    raise exception '종료된 케이스예요. 다시 열려면 상태를 바꿔 주세요.';
  end if;
  if char_length(coalesce(p_note, '')) > 4000 then raise exception '메모는 4,000자 이하로 입력해 주세요.'; end if;
  perform backoffice_private.assert_assignee(p_assignee_id);
  if c.status in ('resolved','dismissed') and coalesce(p_status, c.status) in ('open','investigating','waiting')
     and exists (select 1 from public.backoffice_cases o where o.target_type = c.target_type and o.target_id = c.target_id
                 and o.id <> c.id and o.status in ('open','investigating','waiting')) then
    raise exception '이미 진행 중인 케이스가 있어요.';
  end if;
  update public.backoffice_cases set
      status = coalesce(p_status, status), severity = coalesce(p_severity, severity),
      assignee_id = case when coalesce(p_clear_assignee, false) then null else coalesce(p_assignee_id, assignee_id) end,
      resolved_at = case when coalesce(p_status, status) in ('resolved','dismissed') then coalesce(resolved_at, now()) else null end,
      updated_at = now(), version = version + 1
    where id = p_case_id returning * into n;
  if btrim(coalesce(p_note, '')) <> '' then
    insert into public.backoffice_notes (target_type, target_id, body, author_id) values ('case', p_case_id::text, btrim(p_note), a.user_id);
  end if;
  res := jsonb_build_object('caseId', p_case_id, 'version', n.version, 'status', n.status);
  perform backoffice_private.audit(a, 'case.update', 'case', p_case_id::text, '',
    jsonb_build_object('status', c.status, 'severity', c.severity, 'assigneeId', c.assignee_id),
    jsonb_build_object('status', n.status, 'severity', n.severity, 'assigneeId', n.assignee_id),
    p_operation_id, payload, res, payload - 'note');
  return res;
end $$;

-- Create (p_notice_id null) or update a notice. Deactivate with p_active=false;
-- notices are never deleted. Critical notices need the owner role.
create or replace function public.backoffice_save_notice(
  p_title text, p_body text, p_audience text, p_notice_id uuid default null, p_version integer default null,
  p_severity text default 'info', p_link_url text default null, p_starts_at timestamptz default null,
  p_ends_at timestamptz default null, p_active boolean default false, p_dismissible boolean default true,
  p_operation_id text default ''
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare a public.backoffice_admins := backoffice_private.require_admin('operator');
  payload jsonb := jsonb_build_object('noticeId', p_notice_id, 'version', p_version, 'title', p_title, 'body', p_body,
    'audience', p_audience, 'severity', p_severity, 'linkUrl', p_link_url, 'startsAt', p_starts_at, 'endsAt', p_ends_at,
    'active', p_active, 'dismissible', p_dismissible);
  prior jsonb; old_n public.app_notices; new_n public.app_notices; res jsonb;
begin
  prior := backoffice_private.replay(p_operation_id, payload);
  if prior is not null then return prior; end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 80 then raise exception '공지 제목은 1~80자로 입력해 주세요.'; end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 2000 then raise exception '공지 내용은 1~2,000자로 입력해 주세요.'; end if;
  if coalesce(p_audience, '') not in ('retailer','uncle','all') then raise exception '공지 대상을 선택해 주세요.'; end if;
  if coalesce(p_severity, 'info') not in ('info','important','critical') then raise exception '공지 중요도를 선택해 주세요.'; end if;
  if nullif(btrim(coalesce(p_link_url, '')), '') !~ '^https://' or char_length(coalesce(p_link_url, '')) > 500 then
    raise exception '링크는 500자 이하 https 주소만 넣을 수 있어요.';
  end if;
  if p_severity = 'critical' and a.role <> 'owner' then
    raise exception '긴급 공지는 관리자만 저장할 수 있어요.' using errcode = '42501';
  end if;
  if p_notice_id is null then
    if p_ends_at is not null and p_ends_at <= coalesce(p_starts_at, now()) then raise exception '종료 시각은 시작 시각보다 늦어야 해요.'; end if;
    insert into public.app_notices (title, body, audience, severity, link_url, starts_at, ends_at, active, dismissible, created_by, updated_by)
    values (btrim(p_title), btrim(p_body), p_audience, coalesce(p_severity, 'info'), nullif(btrim(coalesce(p_link_url, '')), ''),
            coalesce(p_starts_at, now()), p_ends_at, coalesce(p_active, false), coalesce(p_dismissible, true), a.user_id, a.user_id)
    returning * into new_n;
  else
    select * into old_n from public.app_notices where id = p_notice_id for update;
    if old_n.id is null then raise exception '공지를 찾을 수 없어요.'; end if;
    if p_version is null or old_n.version <> p_version then raise exception '다른 운영자가 공지를 변경했어요. 최신 내용을 확인해 주세요.'; end if;
    if old_n.severity = 'critical' and a.role <> 'owner' then
      raise exception '긴급 공지는 관리자만 저장할 수 있어요.' using errcode = '42501';
    end if;
    if p_ends_at is not null and p_ends_at <= coalesce(p_starts_at, old_n.starts_at) then raise exception '종료 시각은 시작 시각보다 늦어야 해요.'; end if;
    update public.app_notices set title = btrim(p_title), body = btrim(p_body), audience = p_audience,
        severity = coalesce(p_severity, 'info'), link_url = nullif(btrim(coalesce(p_link_url, '')), ''),
        starts_at = coalesce(p_starts_at, old_n.starts_at), ends_at = p_ends_at, active = coalesce(p_active, false),
        dismissible = coalesce(p_dismissible, true), version = old_n.version + 1, updated_by = a.user_id, updated_at = now()
      where id = p_notice_id returning * into new_n;
  end if;
  res := jsonb_build_object('noticeId', new_n.id, 'version', new_n.version, 'active', new_n.active);
  perform backoffice_private.audit(a, case when p_notice_id is null then 'notice.create' else 'notice.update' end,
    'notice', new_n.id::text, '',
    case when old_n.id is null then null else to_jsonb(old_n) - 'created_by' - 'updated_by' end,
    to_jsonb(new_n) - 'created_by' - 'updated_by', p_operation_id, payload, res);
  return res;
end $$;

-- Change one remote-config key. write_role 'owner' keys (maintenance,
-- min_app_version), new keys and visibility changes need the owner role.
create or replace function public.backoffice_set_config(
  p_key text, p_value jsonb, p_reason text, p_version integer default null, p_is_public boolean default null,
  p_description text default null, p_operation_id text default ''
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare a public.backoffice_admins := backoffice_private.require_admin('operator');
  payload jsonb := jsonb_build_object('key', p_key, 'value', p_value, 'reason', p_reason, 'version', p_version,
    'isPublic', p_is_public, 'description', p_description);
  prior jsonb; why text; old_c public.app_remote_config; new_c public.app_remote_config; res jsonb;
begin
  prior := backoffice_private.replay(p_operation_id, payload);
  if prior is not null then return prior; end if;
  why := backoffice_private.require_reason(p_reason);
  perform backoffice_private.validate_config(p_key, p_value);
  if char_length(coalesce(p_description, '')) > 500 then raise exception '설명은 500자 이하로 입력해 주세요.'; end if;
  select * into old_c from public.app_remote_config where key = p_key for update;
  if old_c.key is null then
    if a.role <> 'owner' then raise exception '새 설정 키는 관리자만 만들 수 있어요.' using errcode = '42501'; end if;
  else
    if backoffice_private.role_rank(a.role) < backoffice_private.role_rank(old_c.write_role) then
      raise exception '이 설정은 관리자만 변경할 수 있어요.' using errcode = '42501';
    end if;
    if p_version is null or old_c.version <> p_version then raise exception '다른 운영자가 설정을 변경했어요. 최신 값을 확인해 주세요.'; end if;
    if p_is_public is not null and p_is_public <> old_c.is_public and a.role <> 'owner' then
      raise exception '공개 범위는 관리자만 바꿀 수 있어요.' using errcode = '42501';
    end if;
  end if;
  insert into public.app_remote_config (key, value, is_public, write_role, description, version, updated_by, updated_at)
  values (p_key, p_value, coalesce(p_is_public, false), 'owner', coalesce(p_description, ''), 0, a.user_id, now())
  on conflict (key) do update set value = excluded.value,
      is_public = coalesce(p_is_public, public.app_remote_config.is_public),
      description = coalesce(p_description, public.app_remote_config.description),
      version = public.app_remote_config.version + 1, updated_by = excluded.updated_by, updated_at = excluded.updated_at
  returning * into new_c;
  res := jsonb_build_object('key', new_c.key, 'version', new_c.version);
  perform backoffice_private.audit(a, 'config.set', 'config', p_key, why,
    case when old_c.key is null then null else jsonb_build_object('value', old_c.value, 'isPublic', old_c.is_public, 'version', old_c.version) end,
    jsonb_build_object('value', new_c.value, 'isPublic', new_c.is_public, 'version', new_c.version), p_operation_id, payload, res);
  return res;
end $$;

-- Staff management (owner only). Upsert = grant or change role. Owners cannot
-- change or revoke themselves, and the last owner always stays.
create or replace function public.backoffice_grant_admin(
  p_user_id uuid, p_role text, p_display_name text default '', p_require_mfa boolean default true,
  p_allow_app_account boolean default false, p_operation_id text default ''
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare a public.backoffice_admins := backoffice_private.require_admin('owner');
  payload jsonb := jsonb_build_object('userId', p_user_id, 'role', p_role, 'displayName', p_display_name,
    'requireMfa', p_require_mfa, 'allowAppAccount', p_allow_app_account);
  prior jsonb; old_a public.backoffice_admins; new_a public.backoffice_admins; res jsonb;
begin
  prior := backoffice_private.replay(p_operation_id, payload);
  if prior is not null then return prior; end if;
  if p_role is null or p_role not in ('owner','operator','viewer') then raise exception '역할을 확인해 주세요.'; end if;
  if char_length(coalesce(p_display_name, '')) > 60 then raise exception '이름은 60자 이하로 입력해 주세요.'; end if;
  if p_user_id = auth.uid() then raise exception '본인 권한은 다른 관리자가 변경해야 해요.'; end if;
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then raise exception '인증 계정을 찾을 수 없어요.'; end if;
  if (select email_confirmed_at from auth.users where id = p_user_id) is null then
    raise exception '이메일 인증을 마친 계정만 운영 계정으로 등록할 수 있어요.';
  end if;
  if not coalesce(p_allow_app_account, false)
     and exists (select 1 from public.saip_records where collection = 'accounts' and id = p_user_id::text) then
    raise exception '앱 사용 계정과 분리된 운영 계정을 사용해 주세요.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('backoffice-admins', 0));
  select * into old_a from public.backoffice_admins where user_id = p_user_id for update;
  if old_a.role = 'owner' and old_a.revoked_at is null and p_role <> 'owner'
     and (select count(*) from public.backoffice_admins where role = 'owner' and revoked_at is null) <= 1 then
    raise exception '마지막 관리자는 역할을 낮출 수 없어요.';
  end if;
  insert into public.backoffice_admins (user_id, role, display_name, require_mfa, created_by)
  values (p_user_id, p_role, btrim(coalesce(p_display_name, '')), coalesce(p_require_mfa, true), a.user_id)
  on conflict (user_id) do update set role = excluded.role, display_name = excluded.display_name,
    require_mfa = excluded.require_mfa, revoked_at = null, updated_at = now()
  returning * into new_a;
  res := jsonb_build_object('userId', p_user_id, 'role', new_a.role);
  perform backoffice_private.audit(a, 'admin.grant', 'admin', p_user_id::text, '',
    case when old_a.user_id is null then null else jsonb_build_object('role', old_a.role, 'requireMfa', old_a.require_mfa, 'revokedAt', old_a.revoked_at) end,
    jsonb_build_object('role', new_a.role, 'requireMfa', new_a.require_mfa), p_operation_id, payload, res);
  return res;
end $$;

create or replace function public.backoffice_revoke_admin(p_user_id uuid, p_reason text, p_operation_id text default '')
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare a public.backoffice_admins := backoffice_private.require_admin('owner');
  payload jsonb := jsonb_build_object('userId', p_user_id, 'reason', p_reason);
  prior jsonb; why text; old_a public.backoffice_admins; res jsonb;
begin
  prior := backoffice_private.replay(p_operation_id, payload);
  if prior is not null then return prior; end if;
  why := backoffice_private.require_reason(p_reason);
  if p_user_id = auth.uid() then raise exception '본인 권한은 다른 관리자가 변경해야 해요.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('backoffice-admins', 0));
  select * into old_a from public.backoffice_admins where user_id = p_user_id and revoked_at is null for update;
  if old_a.user_id is null then raise exception '활성 운영 계정이 아니에요.'; end if;
  if old_a.role = 'owner' and (select count(*) from public.backoffice_admins where role = 'owner' and revoked_at is null) <= 1 then
    raise exception '마지막 관리자는 해제할 수 없어요.';
  end if;
  update public.backoffice_admins set revoked_at = now(), updated_at = now() where user_id = p_user_id;
  res := jsonb_build_object('userId', p_user_id, 'revoked', true);
  perform backoffice_private.audit(a, 'admin.revoke', 'admin', p_user_id::text, why,
    jsonb_build_object('role', old_a.role), jsonb_build_object('revoked', true), p_operation_id, payload, res);
  return res;
end $$;

create or replace function public.backoffice_set_lead_status(
  p_lead_id uuid, p_status text, p_assignee_id uuid default null, p_note text default '', p_operation_id text default ''
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare a public.backoffice_admins := backoffice_private.require_admin('operator');
  payload jsonb := jsonb_build_object('leadId', p_lead_id, 'status', p_status, 'assigneeId', p_assignee_id, 'note', p_note);
  prior jsonb; old_s public.backoffice_lead_status; res jsonb;
begin
  prior := backoffice_private.replay(p_operation_id, payload);
  if prior is not null then return prior; end if;
  if p_status is null or p_status not in ('new','contacted','qualified','converted','spam','closed') then raise exception '문의 상태를 확인해 주세요.'; end if;
  if char_length(coalesce(p_note, '')) > 4000 then raise exception '메모는 4,000자 이하로 입력해 주세요.'; end if;
  if p_lead_id is null or not exists (select 1 from public.landing_leads where id = p_lead_id) then raise exception '문의를 찾을 수 없어요.'; end if;
  perform backoffice_private.assert_assignee(p_assignee_id);
  select * into old_s from public.backoffice_lead_status where lead_id = p_lead_id for update;
  insert into public.backoffice_lead_status (lead_id, status, assignee_id, updated_by, updated_at)
  values (p_lead_id, p_status, p_assignee_id, a.user_id, now())
  on conflict (lead_id) do update set status = excluded.status, assignee_id = excluded.assignee_id,
    updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  if btrim(coalesce(p_note, '')) <> '' then
    insert into public.backoffice_notes (target_type, target_id, body, author_id) values ('lead', p_lead_id::text, btrim(p_note), a.user_id);
  end if;
  res := jsonb_build_object('leadId', p_lead_id, 'status', p_status);
  perform backoffice_private.audit(a, 'lead.set_status', 'lead', p_lead_id::text, '',
    jsonb_build_object('status', coalesce(old_s.status, 'new'), 'assigneeId', old_s.assignee_id),
    jsonb_build_object('status', p_status, 'assigneeId', p_assignee_id), p_operation_id, payload, res, payload - 'note');
  return res;
end $$;

-- =============================================================================
-- 7. App-facing read surface (consumed by a later app-repo change)
-- =============================================================================

-- One call on start / login / resume / every ~5 min. anon gets public config,
-- maintenance and the update gate; authenticated also gets its own account
-- status and the live notices for its role. Nothing about other users.
create or replace function public.app_bootstrap_config(p_platform text default null, p_app_version text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); cfg jsonb; mt jsonb; mv jsonb; plat jsonb; cur integer[] := backoffice_private.semver(p_app_version);
  my_role text; m public.backoffice_account_moderation; notices jsonb := '[]'::jsonb;
begin
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into cfg from public.app_remote_config where is_public;
  mt := coalesce(cfg -> 'maintenance', '{}'::jsonb);
  mv := coalesce(cfg -> 'min_app_version', '{}'::jsonb);
  plat := case when p_platform in ('ios','android','web') then mv -> p_platform end;
  if uid is not null then
    select data ->> 'role' into my_role from public.saip_records where collection = 'accounts' and id = uid::text;
    select * into m from public.backoffice_account_moderation where account_id = uid;
    select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'title', n.title, 'body', n.body, 'audience', n.audience,
        'severity', n.severity, 'linkUrl', n.link_url, 'startsAt', n.starts_at, 'endsAt', n.ends_at,
        'dismissible', n.dismissible, 'version', n.version, 'updatedAt', n.updated_at)
      order by case n.severity when 'critical' then 0 when 'important' then 1 else 2 end, n.starts_at desc), '[]'::jsonb)
    into notices from public.app_notices n
    where n.active and n.starts_at <= now() and (n.ends_at is null or n.ends_at > now())
      and (n.audience = 'all' or n.audience = my_role);
  end if;
  return jsonb_build_object(
    'serverTime', now(),
    'config', cfg - 'maintenance' - 'min_app_version',
    'maintenance', jsonb_build_object('active', backoffice_private.maintenance_active(mt),
      'blockWrites', backoffice_private.write_freeze(mt),
      'title', coalesce(mt ->> 'title', ''), 'message', coalesce(mt ->> 'message', ''), 'endsAt', mt -> 'endsAt'),
    'update', jsonb_build_object('platform', p_platform, 'current', p_app_version,
      'required', coalesce(cur < backoffice_private.semver(plat ->> 'minimum'), false),
      'recommended', coalesce(cur < backoffice_private.semver(coalesce(plat ->> 'recommended', plat ->> 'minimum')), false),
      'minimum', plat ->> 'minimum', 'latest', coalesce(plat ->> 'recommended', plat ->> 'minimum'),
      'storeUrl', coalesce(plat ->> 'storeUrl', ''), 'message', coalesce(mv ->> 'message', '')),
    'account', case when uid is null then null else jsonb_build_object('status', coalesce(m.status, 'active'),
      'message', case when m.status = 'suspended' then coalesce(nullif(m.user_message, ''), '이용이 제한된 계정이에요. 고객센터로 문의해 주세요.') else '' end) end,
    'notices', notices);
end $$;

insert into public.app_remote_config (key, value, is_public, write_role, description) values
  ('maintenance', '{"enabled":false,"blockWrites":false,"title":"","message":"","startsAt":null,"endsAt":null}', true, 'owner',
   '점검 모드. enabled=true면 앱이 점검 화면을 보여 주고, blockWrites=true면 서버가 모든 앱 쓰기를 거부해요.'),
  ('min_app_version', '{"ios":{"minimum":"0.1.0","recommended":"0.1.0","storeUrl":""},"android":{"minimum":"0.1.0","recommended":"0.1.0","storeUrl":""},"web":{"minimum":"0.1.0","recommended":"0.1.0","storeUrl":""},"message":""}',
   true, 'owner', '플랫폼별 최소(강제) / 권장 버전. 현재 앱 버전 0.1.0+1.'),
  ('feature_flags', '{}', true, 'operator', '앱 기능 스위치 { "이름": true|false }. 앱은 키가 없으면 기본값을 써요.'),
  ('support', '{"kakaoChannel":"","email":"","phone":"","hours":""}', true, 'operator', '앱 내 정보 화면의 고객센터 안내.')
on conflict (key) do nothing;

-- =============================================================================
-- 8. Privileges, RLS, storage
-- =============================================================================

-- New tables: RLS on, and NO privilege for any API role (default privileges
-- grant ALL to anon/authenticated/service_role). Writes only via RPCs above or
-- the SQL editor (postgres).
do $$
declare t text; s text;
begin
  foreach t in array array['backoffice_admins','backoffice_audit_log','backoffice_account_reviews','backoffice_account_moderation',
                           'backoffice_notes','backoffice_cases','backoffice_lead_status','app_remote_config','app_notices'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', t);
  end loop;
  foreach t in array array['backoffice_audit_log','backoffice_account_reviews','backoffice_notes'] loop
    s := pg_get_serial_sequence('public.' || t, 'id');
    if s is not null then execute format('revoke all on sequence %s from public, anon, authenticated, service_role', s); end if;
  end loop;
end $$;

-- Storage. Staff read (operator+, only right after an audited access) and the
-- suspension / write-freeze upload guard. App users' read rules are unchanged:
-- for them the staff predicate is false.
drop policy if exists backoffice_attachment_read on storage.objects;
create policy backoffice_attachment_read on storage.objects for select to authenticated
  using (bucket_id = 'saip-attachments' and (select public.is_backoffice_admin('operator'))
         and public.backoffice_can_read_object(name));
drop policy if exists app_attachment_write_guard on storage.objects;
create policy app_attachment_write_guard on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'saip-attachments' or not (select public.app_write_blocked()));

-- Functions: nothing in backoffice_private is callable by clients; every public
-- backoffice_* RPC is EXECUTE for authenticated only (each re-checks the caller
-- with require_admin); app_bootstrap_config is also anon.
revoke all on all functions in schema backoffice_private from public, anon, authenticated;
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and (p.proname like 'backoffice\_%' or p.proname in ('is_backoffice_admin','app_write_blocked','app_bootstrap_config'))
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
grant execute on function public.app_bootstrap_config(text, text) to anon;

reset lock_timeout;
