-- 사입삼춘 landing page: lead capture (문의 / 사전 신청).
--
-- Applied to the live project on 2026-10-12 via the Management API (outside the
-- migration history). The app repo (agent-uncle) owns that history: see
-- supabase/README.md for the follow-up. The statements are idempotent.
--
-- Security model
-- - The site talks to PostgREST with the PUBLIC publishable (anon) key that the
--   mobile app already ships. RLS + privileges below are the only boundary.
-- - anon / authenticated may INSERT a limited set of columns. They cannot
--   SELECT, UPDATE or DELETE, so nobody can read leads back with the public key.
-- - id and created_at are not insertable by clients (column-level grant), so a
--   row's timestamp cannot be forged.
-- - Leads are read by the team via the dashboard / service_role only.
-- - Abuse note: the key is public, so anyone can POST rows directly. The CHECK
--   constraints cap every field's size; the site adds a honeypot + timing check.

create table if not exists public.landing_leads (
  id           uuid        primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  role         text        check (role in ('retailer', 'uncle', 'other')),
  name         text        not null check (char_length(name) between 1 and 60),
  business_name text       check (char_length(business_name) <= 80),
  contact      text        not null check (char_length(contact) between 5 and 120),
  market       text        check (market in ('동대문', '남대문', '기타')),
  message      text        check (char_length(message) <= 1000),
  source       text        check (char_length(source) <= 120),
  utm          jsonb       check (
                             utm is null
                             or (jsonb_typeof(utm) = 'object' and octet_length(utm::text) <= 2048)
                           ),
  consent      boolean     not null check (consent = true),
  user_agent   text        check (char_length(user_agent) <= 400)
);

comment on table public.landing_leads is
  '랜딩 페이지 문의·사전 신청. 공개 키(anon)로는 INSERT만 가능하고 조회·수정·삭제는 불가. 확인은 대시보드(service_role)에서만.';
comment on column public.landing_leads.role is 'retailer = 소매업자, uncle = 사입삼촌, other = 기타';
comment on column public.landing_leads.contact is '전화번호, 이메일 또는 카카오톡 ID (자유 형식, 5~120자)';
comment on column public.landing_leads.market is '사입 시장: 동대문, 남대문, 기타 (선택)';
comment on column public.landing_leads.source is '폼 위치 등 유입 지점 (예: hero, footer)';
comment on column public.landing_leads.utm is 'utm_source, utm_medium, utm_campaign, utm_term, utm_content';
comment on column public.landing_leads.consent is '개인정보 수집·이용 동의. true만 저장 가능';

create index if not exists landing_leads_created_at_idx
  on public.landing_leads (created_at desc);

alter table public.landing_leads enable row level security;

-- Supabase grants ALL on new public tables to anon/authenticated by default.
-- Start from nothing, then allow column-limited INSERT only.
revoke all on table public.landing_leads from public, anon, authenticated;

grant insert (
  role, name, business_name, contact, market, message, source, utm, consent, user_agent
) on table public.landing_leads to anon, authenticated;

drop policy if exists landing_leads_insert on public.landing_leads;
create policy landing_leads_insert
  on public.landing_leads
  for insert
  to anon, authenticated
  with check (true);

-- Deliberately no SELECT / UPDATE / DELETE policies.
