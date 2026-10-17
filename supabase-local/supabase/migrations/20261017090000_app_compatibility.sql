-- App compatibility snapshot 2026-10-17. Apply AFTER all app migrations through
-- 202610160006_order_completion_confirmation.sql and the baseline backoffice layer.
-- No changes to customer commands or live data are issued by the web server.
begin;

create or replace function backoffice_private.request_state(p_id text, d jsonb) returns jsonb
language sql stable set search_path='' as $$
 select d || saip_private.order_payment_projection(p_id) || jsonb_build_object(
 'awaitingCompletionConfirmation', saip_private.s(d,'status')='accepted' and
 ((saip_private.s(d,'purchaseCompletedAt')<>'') <> (saip_private.s(d,'receiptConfirmedAt')<>'')))
$$;

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
    when saip_private.order_received(d) then case when saip_private.b(d, 'paymentReported') then '입금 완료' else '수령(입금 전)' end
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
    case when st = 'completed' and not saip_private.order_received(d) then 'completed_but_open' end,
    case when st = 'accepted' and oi = 0 and pid = '' and q - c - a + ac = 0 and rc = q - c and dl = q - c
         and (q = c or saip_private.s(d,'requestType') <> 'wholesaler' or
           (saip_private.s(d,'purchaseCompletedAt') <> '' and saip_private.s(d,'receiptConfirmedAt') <> ''))
         then 'finished_but_not_closed' end,
    case when st is null or st not in ('pending','accepted','rejected','cancelled','completed') then 'unknown_status' end
  ], null) from v
$$;

create or replace function backoffice_private.account_json(p_id text, d jsonb, p_full boolean) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', p_id, 'verification', backoffice_private.verification_state(d))
    || saip_private.pick(coalesce(d, '{}'::jsonb), array['role','name','label','complete','working','photoId',
         'documentId','documentStatus','verificationStatus','verificationNote','verifiedDocumentId',
         'verificationReviewedAt','pickupArea','deliveryArea','deadline','holiday','intro','salesChannel','markets',
         'transport','activityHours','activityStart','activityEnd','activityDays','terms','privacy',
         'notificationSettings','provider','codeExpires','version','demoBatch','nickname','publicCode','fee','deletionPending'])
    || jsonb_build_object('bankRegistered', saip_private.s(d,'bankName')<>'' and saip_private.s(d,'bankAccount')<>'' and saip_private.s(d,'bankHolder')<>'')
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
        case when not saip_private.b(d,'complete') and saip_private.s(d,'bankName')='' then 'bankName' end,
        case when not saip_private.b(d,'complete') and saip_private.s(d,'bankAccount')='' then 'bankAccount' end,
        case when not saip_private.b(d,'complete') and saip_private.s(d,'bankHolder')='' then 'bankHolder' end,
        case when saip_private.s(d,'bankAccount')<>'' and (saip_private.s(d,'bankAccount') !~ '^[0-9 -]+$' or regexp_replace(saip_private.s(d,'bankAccount'),'[^0-9]','','g') !~ '^[0-9]{8,20}$') then 'bankAccount:format' end,
        case when not saip_private.b(d, 'terms') then 'terms' end,
        case when not saip_private.b(d, 'privacy') then 'privacy' end], null)
  end
$$;

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
  req as (select id, d, created_at, backoffice_private.request_label(backoffice_private.request_state(id, d)) label from r where c = 'requests')
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
      from (select case when q.data ->> 'retailerId' = uid then 'retailer' else 'uncle' end side, backoffice_private.request_label(backoffice_private.request_state(q.id, q.data)) k, count(*) n
            from public.saip_records q where q.collection = 'requests' and q.readers @> array[p_account_id] group by 1, 2) s),
    'recentRequests', coalesce((select jsonb_agg(x.j order by x.updated_at desc) from (
        select q.updated_at, jsonb_build_object('id', q.id, 'product', q.data ->> 'product', 'option', q.data ->> 'option',
          'requestType', backoffice_private.request_type(q.data), 'title', backoffice_private.request_title(q.data),
          'label', backoffice_private.request_label(backoffice_private.request_state(q.id, q.data)), 'ledger', backoffice_private.ledger(q.data),
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
    select r.id, backoffice_private.request_state(r.id, r.data) d, r.updated_at, backoffice_private.request_label(backoffice_private.request_state(r.id, r.data)) label,
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
      when 'completion_pending' then saip_private.b(b.d,'awaitingCompletionConfirmation')
      when 'payment_pending' then saip_private.order_received(b.d) and not saip_private.b(b.d,'paymentConfirmed')
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
        'backorder', coalesce(sum(case when saip_private.b(d, 'resultShared') then greatest(saip_private.remaining(d), 0) else 0 end), 0),
        'byType', coalesce((select jsonb_object_agg(t.kind,t.amounts) from (
          select backoffice_private.request_type(g.d) kind, jsonb_build_object(
            'quantity',sum(saip_private.n(g.d,'quantity')), 'acquired',sum(saip_private.n(g.d,'acquired')),
            'delivered',sum(saip_private.n(g.d,'delivered')), 'received',sum(saip_private.n(g.d,'received')),
            'backorder',sum(case when saip_private.b(g.d,'resultShared') then greatest(saip_private.remaining(g.d),0) else 0 end)) amounts
          from filtered g group by backoffice_private.request_type(g.d)) t),'{}'::jsonb))
      from filtered),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'status', p.d ->> 'status', 'label', p.label,
        'product', p.d ->> 'product', 'option', p.d ->> 'option', 'wholesaler', p.d ->> 'wholesaler', 'location', p.d ->> 'location',
        'paymentReported', saip_private.b(p.d,'paymentReported'), 'paymentConfirmed', saip_private.b(p.d,'paymentConfirmed'),
        'awaitingCompletionConfirmation', saip_private.b(p.d,'awaitingCompletionConfirmation'),
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
               || saip_private.order_payment_projection(r.id) || jsonb_build_object('id', r.id, 'label', backoffice_private.request_label(backoffice_private.request_state(r.id, r.data)),
                    'awaitingCompletionConfirmation', saip_private.b(backoffice_private.request_state(r.id,r.data),'awaitingCompletionConfirmation'),
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
                 'option', q.data ->> 'option', 'status', q.data ->> 'status', 'label', backoffice_private.request_label(backoffice_private.request_state(q.id, q.data)),
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
          'label', backoffice_private.request_label(backoffice_private.request_state(r.id, r.data)), 'retailer', backoffice_private.account_brief(r.data ->> 'retailerId') ->> 'name',
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

create or replace function public.backoffice_export(
  p_kind text, p_reason text, p_from timestamptz default null, p_to timestamptz default null, p_include_demo boolean default false
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare a public.backoffice_admins := backoffice_private.require_admin(case when p_kind in ('accounts','leads') then 'owner' else 'operator' end);
  why text := backoffice_private.require_reason(p_reason); v_rows jsonb; n integer;
begin
  if p_kind = 'requests' then
    select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'createdAt', r.data ->> 'createdAt', 'updatedAt', r.updated_at,
        'status', r.data ->> 'status', 'label', backoffice_private.request_label(backoffice_private.request_state(r.id, r.data)),
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

-- Engine copied byte-for-byte except name and entry-point gate from pinned app order_payment migration.
create or replace function backoffice_private.process_platform_payment(operation_id text,action text,record_id text,
  expected_version integer,bank_reference text,amount integer default null) returns text
language plpgsql security definer set search_path='' as $$
declare prior record; payload jsonb; invoice jsonb; receipt jsonb; invoice_id text; recipient jsonb; request_ids text[];
begin
  if operation_id is null or btrim(operation_id)='' or length(operation_id)>200
    or bank_reference is null or btrim(bank_reference)='' or length(bank_reference)>300
    or expected_version is null or action is null or action not in('confirm_receipt','reject_receipt','pay_uncle') then
    raise exception '작업 번호·버전·은행 확인 기록을 입력해 주세요.';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('saip-account-lifecycle',0));
  perform pg_advisory_xact_lock(hashtextextended('saip-workflow',0));
  payload:=jsonb_build_object('action',action,'recordId',record_id,'version',expected_version,
    'reference',bank_reference,'amount',amount);
  select * into prior from saip_private.platform_payment_operations where id=operation_id;
  if found then
    if prior.payload<>payload then raise exception '같은 작업 번호로 다른 내용을 전송할 수 없어요.'; end if;
    return prior.result;
  end if;
  if action in('confirm_receipt','reject_receipt') then
    receipt:=saip_private.get('invoiceReceipts',record_id);
    if saip_private.s(receipt,'paidToId')<>'platform' or saip_private.s(receipt,'status')<>'reported' then
      raise exception '확인 대기 중인 운영 계좌 송금 알림만 처리할 수 있어요.';
    end if;
    perform saip_private.version(receipt,expected_version);
    invoice_id:=receipt->>'invoiceId';
    invoice:=saip_private.get('invoices',invoice_id);
    if saip_private.b(invoice,'platformPayoutComplete') or saip_private.b(invoice,'requiresReconciliation') then
      raise exception '지급 완료 또는 재정산 대상 청구서를 확인해 주세요.';
    end if;
    if action='confirm_receipt' and (amount is null or amount<>saip_private.n(receipt,'amount')) then
      raise exception '실제 입금액과 신고 금액을 확인해 주세요.';
    end if;
    if action='confirm_receipt' and exists(select 1 from saip_private.platform_payment_operations o
      where o.payload->>'action'='confirm_receipt' and o.payload->>'reference'=bank_reference) then
      raise exception '이미 반영한 은행 입금 기록이에요.';
    end if;
    perform saip_private.billing_put('invoiceReceipts',record_id,receipt||jsonb_build_object(
      'status',case when action='confirm_receipt' then 'confirmed' else 'rejected' end,
      'confirmedBy','platform','confirmedAt',clock_timestamp(),'updatedAt',clock_timestamp(),
      'version',saip_private.n(receipt,'version')+1));
    perform saip_private.billing_rebuild_invoice(invoice_id);
  else
    invoice_id:=record_id; invoice:=saip_private.get('invoices',invoice_id);
    perform saip_private.version(invoice,expected_version);
    request_ids:=saip_private.invoice_request_ids(invoice_id,invoice);
    if saip_private.s(invoice,'status')='draft' or saip_private.b(invoice,'platformPayoutComplete')
      or saip_private.b(invoice,'requiresReconciliation') or saip_private.n(invoice,'missingAmountCount')>0
      or saip_private.n(invoice,'inquiryOpenCount')>0 or saip_private.n(invoice,'pendingReceiptCount')>0
      or saip_private.n(invoice,'refundRequiredAmount')>0 or cardinality(request_ids)=0
      or exists(select 1 from unnest(request_ids) id where not saip_private.order_received(saip_private.get('requests',id)))
      or amount is null or amount<=0 or amount<>saip_private.n(invoice,'adjustedTotalAmount') then
      raise exception '수령·청구·입금·문의 상태와 지급 금액을 확인해 주세요.';
    end if;
    -- 기존 삼촌 직접 회수는 운영 계좌 입금으로 간주하지 않는다.
    if (select coalesce(sum(saip_private.n(data,'amount')),0) from public.saip_records
        where collection='invoiceReceipts' and data->>'invoiceId'=invoice_id
          and data->>'paidToId'='platform' and data->>'status'='confirmed')<amount then
      raise exception '운영 계좌의 전액 입금 확인이 필요해요.';
    end if;
    recipient:=saip_private.get('accounts',invoice->>'payeeId');
    if saip_private.s(recipient,'role')<>'uncle' or not saip_private.b(recipient,'complete')
      or saip_private.b(recipient,'deletionPending') or saip_private.s(recipient,'bankName')=''
      or length(saip_private.s(recipient,'bankName'))>50
      or length(saip_private.s(recipient,'bankHolder'))>100
      or saip_private.s(recipient,'bankAccount') !~ '^[0-9 -]+$'
      or regexp_replace(saip_private.s(recipient,'bankAccount'),'[^0-9]','','g') !~ '^[0-9]{8,20}$'
      or saip_private.s(recipient,'bankHolder')='' then
      raise exception '지급받을 사입삼촌의 정산 계좌를 확인해 주세요.';
    end if;
    if exists(select 1 from saip_private.platform_payment_operations o
      where o.payload->>'action'='pay_uncle' and o.payload->>'reference'=bank_reference) then
      raise exception '이미 반영한 은행 지급 기록이에요.';
    end if;
    perform saip_private.billing_put('invoices',invoice_id,invoice||jsonb_build_object(
      'platformPayoutComplete',true,'platformPayoutAmount',amount,'platformPayoutAt',clock_timestamp(),
      'platformPayoutRecipientId',invoice->>'payeeId','version',saip_private.n(invoice,'version')+1));
  end if;
  insert into saip_private.platform_payment_operations(id,payload,result,recipient_account)
    values(operation_id,payload,invoice_id,case when recipient is null then null else
      saip_private.pick(recipient,array['bankName','bankAccount','bankHolder']) end);
  return invoice_id;
end $$;

create or replace function public.saip_process_platform_payment(operation_id text,action text,record_id text,
 expected_version integer,bank_reference text,amount integer default null) returns text
language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception '운영자 전용 작업이에요.'; end if;
 return backoffice_private.process_platform_payment(operation_id,action,record_id,expected_version,bank_reference,amount);
end $$;
revoke all on function public.saip_process_platform_payment(text,text,text,integer,text,integer) from public,anon,authenticated;
grant execute on function public.saip_process_platform_payment(text,text,text,integer,text,integer) to service_role;


-- Only known operational fields cross the staff API. Arbitrary future fields stay private.
create or replace function backoffice_private.operation_fields(c text) returns text[]
language sql immutable set search_path='' as $$ select case c
when 'invoices' then array['retailerId','teamId','roundId','payeeId','managerIds','fieldPaymentIds','allocationIds','label','status','principalAmount','deliveryFeeAmount','baseTotalAmount','adjustmentTotalAmount','adjustedTotalAmount','reportedReceiptAmount','confirmedReceiptAmount','confirmedRefundAmount','pendingReceiptCount','pendingReceiptAmount','missingAmountCount','needsReviewCount','remainingDueAmount','refundRequiredAmount','inquiryOpenCount','requiresReconciliation','sentAt','platformPayoutComplete','platformPayoutAmount','platformPayoutAt','platformPayoutRecipientId','createdAt','updatedAt','version']
when 'fieldPayments' then array['requestId','retailerId','uncleId','teamId','roundId','wholesaler','payerId','payeeId','fundingSource','settlementKind','actualPaidAmount','cashAllocatedAmount','allocatedAmount','unallocatedAmount','customerChargeAmount','directPaidAmount','supplierFeeAmount','missingAmount','allocationIds','invoiceId','reimbursementId','createdAt','updatedAt','version','cashAllocatedAmountMissing','customerChargeAmountMissing','directPaidAmountMissing','supplierFeeAmountMissing']
when 'supplierPaymentAllocations' then array['paymentId','requestId','retailerId','uncleId','teamId','roundId','invoiceId','payerId','payeeId','cashAllocatedAmount','customerChargeAmount','directPaidAmount','supplierFeeAmount','allocatedAmount','createdAt','updatedAt','version']
when 'invoiceReceipts' then array['invoiceId','reporterId','paidToId','amount','status','confirmedAt','confirmedBy','createdAt','updatedAt','version']
when 'invoiceAdjustments' then array['invoiceId','kind','amount','actorId','previousAmount','finalAmount','createdAt','updatedAt','version']
when 'invoiceInquiries' then array['invoiceId','requesterId','recipientId','messageId','status','resolvedAt','resolvedBy','createdAt','updatedAt','version']
when 'reimbursements' then array['invoiceId','fieldPaymentId','kind','fromId','toId','totalAmount','settledAmount','status','settlementIds','createdAt','updatedAt','version']
when 'supplierRefunds' then array['paymentId','invoiceId','actualRecipientId','amount','reimbursementId','createdAt','updatedAt','version']
when 'colleagueConnections' then array['fromId','toId','from','to','status','createdAt','updatedAt','version']
when 'teams' then array['name','description','ownerId','status','memberIds','adminIds','createdAt','updatedAt','version']
when 'teamInvites' then array['teamId','inviterId','inviteeId','kind','status','createdAt','updatedAt','version']
when 'teamChats' then array['teamId','senderId','kind','requestId','jobId','status','editedAt','deleted','createdAt','updatedAt','version','chatType','peerId']
when 'teamRounds' then array['teamId','label','operatingDate','receiverLabel','status','createdBy','createdAt','updatedAt','version']
when 'teamAreas' then array['teamId','name','primaryMemberId','backupMemberId','primaryWorking','backupWorking','primaryCapacity','backupCapacity','primaryCutoffAt','backupCutoffAt','matchKeywords','createdAt','updatedAt','version']
when 'teamJobs' then array['teamId','requestId','roundId','areaId','pickupAssigneeId','finalAssigneeId','status','wholesalerIndex','scopeConfirmed','expectedPackageCount','hasBackorder','issueIds','createdAt','updatedAt','version','wholesalerName','wholesalerLocation','retailerId','requestUncleId']
when 'teamPackages' then array['teamId','jobId','requestId','packageLabel','quantity','unit','currentHolderId','pickupAssigneeId','finalAssigneeId','retailerId','wholesalerName','activeHandoffId','status','createdAt','updatedAt','version']
when 'teamHandoffs' then array['teamId','fromId','toId','wholesalerName','packageIds','pendingPackageIds','acceptedPackageIds','status','createdAt','updatedAt','version']
when 'teamReceipts' then array['teamId','packageIds','confirmedBy','createdAt','updatedAt','version']

when 'favoriteWholesalers' then array['ownerId','wholesaler','location','paymentMode','label','createdAt','updatedAt','version']
when 'chatBlocks' then array['ownerId','peerId','blocked','createdAt']
else null end $$;

create or replace function public.backoffice_list_workflow(
 p_collection text, p_query text default null, p_status text default null,
 p_related_id text default null, p_include_demo boolean default false,
 p_limit integer default 50, p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare lim integer:=least(greatest(coalesce(p_limit,50),1),100); off integer:=greatest(coalesce(p_offset,0),0);
 keys text[]; res jsonb;
begin
 perform backoffice_private.require_admin('viewer');
 keys:=backoffice_private.operation_fields(p_collection);
 if keys is null then raise exception '조회할 수 없는 업무 기록이에요.'; end if;
 with visible as (
  select r.id, r.updated_at, saip_private.pick(r.data, keys) d from public.saip_records r
  where r.collection=p_collection and (p_include_demo or not(r.data ? 'demoBatch'))
    and (nullif(p_status,'') is null or r.data->>'status'=p_status)
    and (nullif(p_related_id,'') is null or r.id=p_related_id or p_related_id=any(r.readers::text[])
      or exists(select 1 from jsonb_each_text(saip_private.pick(r.data,array[
       'invoiceId','requestId','teamId','jobId','roundId','fieldPaymentId','paymentId','reimbursementId','activeHandoffId'])) kv where kv.value=p_related_id))),
 filtered as (select * from visible where nullif(btrim(p_query),'') is null
   or id ilike '%'||left(p_query,200)||'%' or d::text ilike '%'||left(p_query,200)||'%'),
 page as (select * from filtered order by updated_at desc,id limit lim offset off)
 select jsonb_build_object('total',(select count(*) from filtered),'limit',lim,'offset',off,
   'rows',coalesce((select jsonb_agg(jsonb_build_object('id',id,'updatedAt',updated_at,'data',d)
    order by updated_at desc,id) from page),'[]'::jsonb)) into res;
 return res;
end $$;

create or replace function public.backoffice_get_invoice(p_invoice_id text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare d jsonb; ids text[]; res jsonb; recipient jsonb; platform_amount bigint; blockers text[];
begin
 perform backoffice_private.require_admin('viewer');
 d:=saip_private.get('invoices',p_invoice_id);
 if d is null then raise exception '청구서를 찾을 수 없어요.'; end if;
 ids:=saip_private.invoice_request_ids(p_invoice_id,d);
 -- Retained financial records must remain inspectable after a related account
 -- or request disappears. Missing relations block payment instead of hiding it.
 select data into recipient from public.saip_records where collection='accounts' and id=d->>'payeeId';
 select coalesce(sum(saip_private.n(data,'amount')),0) into platform_amount
 from public.saip_records where collection='invoiceReceipts' and data->>'invoiceId'=p_invoice_id
 and data->>'paidToId'='platform' and data->>'status'='confirmed';
 -- Diagnostic projection only; the locked payment engine revalidates every condition at write time.
 blockers:=array_remove(array[
  case when saip_private.s(d,'status')='draft' then 'draft' end,
  case when saip_private.b(d,'platformPayoutComplete') then 'already_paid' end,
  case when saip_private.b(d,'requiresReconciliation') then 'reconciliation' end,
  case when saip_private.n(d,'missingAmountCount')>0 then 'missing_amount' end,
  case when saip_private.n(d,'inquiryOpenCount')>0 then 'open_inquiries' end,
  case when saip_private.n(d,'pendingReceiptCount')>0 then 'pending_receipts' end,
  case when saip_private.n(d,'refundRequiredAmount')>0 then 'refund_required' end,
  case when cardinality(ids)=0 then 'no_requests' end,
  case when exists(select 1 from unnest(ids) linked(id)
   left join public.saip_records r on r.collection='requests' and r.id=linked.id
   where r.id is null or not saip_private.order_received(r.data)) then 'not_received' end,
  case when saip_private.n(d,'adjustedTotalAmount')<=0 then 'invalid_amount' end,
  case when platform_amount<saip_private.n(d,'adjustedTotalAmount') then 'platform_receipts_insufficient' end,
  case when recipient is null or saip_private.s(recipient,'role')<>'uncle' or not saip_private.b(recipient,'complete')
   or saip_private.b(recipient,'deletionPending') or saip_private.s(recipient,'bankName')=''
   or length(saip_private.s(recipient,'bankName'))>50 or length(saip_private.s(recipient,'bankHolder'))>100
   or saip_private.s(recipient,'bankHolder')='' or saip_private.s(recipient,'bankAccount') !~ '^[0-9 -]+$'
   or regexp_replace(saip_private.s(recipient,'bankAccount'),'[^0-9]','','g') !~ '^[0-9]{8,20}$' then 'payee_not_ready' end
 ],null);
 select jsonb_build_object('id',p_invoice_id,'invoice',saip_private.pick(d,backoffice_private.operation_fields('invoices')),
 'payout',jsonb_build_object('blockers',blockers,'confirmedPlatformAmount',platform_amount),
 'retailer',backoffice_private.account_brief(d->>'retailerId'),'payee',backoffice_private.account_brief(d->>'payeeId'),
 'requests',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'title',backoffice_private.request_title(r.data),
   'label',backoffice_private.request_label(backoffice_private.request_state(r.id,r.data)),'received',saip_private.order_received(r.data)))
   from public.saip_records r where r.collection='requests' and r.id=any(ids)),'[]'::jsonb),
 'records',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'collection',r.collection,
   'data',saip_private.pick(r.data,backoffice_private.operation_fields(r.collection))) order by r.updated_at desc,r.id)
   from public.saip_records r where r.collection in('invoiceReceipts','invoiceAdjustments','invoiceInquiries','fieldPayments','supplierPaymentAllocations','supplierRefunds','reimbursements')
     and r.data->>'invoiceId'=p_invoice_id),'[]'::jsonb)) into res;
 return res;
end $$;

create or replace function public.backoffice_process_payment(p_operation_id text,p_action text,p_record_id text,
 p_expected_version integer,p_bank_reference text,p_amount integer,p_reason text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare a public.backoffice_admins:=backoffice_private.require_admin('operator');
 why text:=backoffice_private.require_reason(p_reason); payload jsonb; prior jsonb; res jsonb; invoice_id text; before_d jsonb; collection_v text;
begin
 payload:=jsonb_build_object('action',p_action,'recordId',p_record_id,'version',p_expected_version,
  'reference',btrim(p_bank_reference),'amount',p_amount,'reason',why);
 prior:=backoffice_private.replay(p_operation_id,payload);
 if prior is not null then return prior; end if;
 -- Mirror the app lock order before capturing the audited before image.
 perform pg_advisory_xact_lock_shared(hashtextextended('saip-account-lifecycle',0));
 perform pg_advisory_xact_lock(hashtextextended('saip-workflow',0));
 collection_v:=case when p_action='pay_uncle' then 'invoices' else 'invoiceReceipts' end;
 before_d:=saip_private.pick(saip_private.get(collection_v,p_record_id),backoffice_private.operation_fields(collection_v));
 invoice_id:=backoffice_private.process_platform_payment(
  'backoffice:'||a.user_id::text||':'||encode(backoffice_private.payload_hash(to_jsonb(p_operation_id)),'hex'),
  p_action,p_record_id,p_expected_version,btrim(p_bank_reference),p_amount);
 res:=jsonb_build_object('invoiceId',invoice_id);
 perform backoffice_private.audit(a,'payment.'||p_action,'invoice',invoice_id,why,before_d,
  saip_private.pick(saip_private.get(collection_v,p_record_id),backoffice_private.operation_fields(collection_v)),
  p_operation_id,payload,res,payload-'reference');
 return res;
end $$;

create or replace function public.backoffice_bank_access(p_account_id text,p_reason text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare a public.backoffice_admins:=backoffice_private.require_admin('operator');
 why text:=backoffice_private.require_reason(p_reason); d jsonb;
begin
 d:=saip_private.get('accounts',p_account_id);
 if d is null then raise exception '계정을 찾을 수 없어요.'; end if;
 perform backoffice_private.audit_view(a,'bank.view','account',p_account_id,why,jsonb_build_object('fields',array['bankName','bankAccount','bankHolder']));
 return saip_private.pick(d,array['bankName','bankAccount','bankHolder','deletionPending'])||jsonb_build_object('accountId',p_account_id);
end $$;

create or replace function public.backoffice_team_chat(p_team_id text,p_reason text,p_limit integer default 50,p_offset integer default 0)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare a public.backoffice_admins:=backoffice_private.require_admin('operator');
 why text:=backoffice_private.require_reason(p_reason); res jsonb; peer jsonb;
 lim integer:=least(greatest(coalesce(p_limit,50),1),100); off integer:=greatest(coalesce(p_offset,0),0);
begin
 select data into peer from public.saip_records where collection='colleagueConnections' and id=p_team_id;
 if peer is null and not exists(select 1 from public.saip_records where collection='teams' and id=p_team_id) then raise exception '팀 또는 동료 연결을 찾을 수 없어요.'; end if;
 perform backoffice_private.audit_view(a,'team_chat.view','team',p_team_id,why,jsonb_build_object('limit',lim));
 with rows as (select id,updated_at,data from public.saip_records where collection='teamChats' and (data->>'teamId'=p_team_id or (peer is not null and data->>'chatType'='colleague' and ((data->>'senderId'=peer->>'fromId' and data->>'peerId'=peer->>'toId') or (data->>'senderId'=peer->>'toId' and data->>'peerId'=peer->>'fromId'))))),
 page as (select * from rows order by updated_at desc,id limit lim offset off)
 select jsonb_build_object('total',(select count(*) from rows),'limit',lim,'offset',off,'rows',coalesce((
 select jsonb_agg(jsonb_build_object('id',id,'updatedAt',updated_at,'data',
  saip_private.pick(data,backoffice_private.operation_fields('teamChats')) ||
  case when saip_private.b(data,'deleted') then jsonb_build_object('body','삭제된 메시지')
   else jsonb_build_object('body',backoffice_private.mask_phones(data->>'body')) end) order by updated_at desc,id) from page),'[]'::jsonb)) into res;
 return res;
end $$;

create or replace function public.backoffice_lifecycle(p_limit integer default 50,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare lim integer:=least(greatest(coalesce(p_limit,50),1),100); off integer:=greatest(coalesce(p_offset,0),0); res jsonb;
begin
 perform backoffice_private.require_admin('viewer');
 with pending as (
  select r.id,backoffice_private.account_brief(r.id) account,d.started_at,
   exists(select 1 from saip_private.account_deletions x where x.account_id::text=r.id) queued
  from public.saip_records r left join saip_private.account_deletions d on d.account_id::text=r.id
  where r.collection='accounts' and (saip_private.b(r.data,'deletionPending') or d.account_id is not null)
  union all select d.account_id::text,backoffice_private.account_brief(d.account_id::text),d.started_at,true
  from saip_private.account_deletions d where not exists(select 1 from public.saip_records r where r.collection='accounts' and r.id=d.account_id::text)),
 page as (select * from pending order by started_at nulls last,id limit lim offset off)
 select jsonb_build_object('total',(select count(*) from pending),'limit',lim,'offset',off,
 'rows',coalesce((select jsonb_agg(to_jsonb(page) order by started_at nulls last,id) from page),'[]'::jsonb)) into res;
 return res;
end $$;

create or replace function public.backoffice_push_health() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform backoffice_private.require_admin('viewer');
 return jsonb_build_object('generatedAt',now(),
  'devices',(select count(*) from saip_private.push_devices),
  'enabledDevices',(select count(*) from saip_private.push_devices where enabled),
  'liveActivities',(select count(*) from saip_private.push_activities where not ended and expires_at>now()),
  'states',coalesce((select jsonb_object_agg(state,n) from(select state,count(*) n from saip_private.push_outbox group by state)s),'{}'::jsonb),
  'overdue',(select count(*) from saip_private.push_outbox where state='pending' and available_at<now()-interval '5 minutes'),
  'failures',coalesce((select jsonb_agg(jsonb_build_object('id',id,'state',state,'attempts',attempts,
   'createdAt',created_at,'availableAt',available_at,'expiresAt',expires_at,'hasError',last_error is not null)
   order by created_at desc,id) from(select * from saip_private.push_outbox where state='dead' order by created_at desc,id limit 50)s),'[]'::jsonb));
end $$;


create or replace function public.backoffice_workflow_detail(p_collection text,p_id text,p_reason text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare a public.backoffice_admins:=backoffice_private.require_admin('operator');
 why text:=backoffice_private.require_reason(p_reason); d jsonb; contents jsonb; keys text[];
begin
 keys:=backoffice_private.operation_fields(p_collection);
 if keys is null then raise exception '조회할 수 없는 업무 기록이에요.'; end if;
 select data into d from public.saip_records where collection=p_collection and id=p_id;
 if d is null then raise exception '기록을 찾을 수 없어요.'; end if;
 select coalesce(jsonb_object_agg(key,backoffice_private.mask_phones(value)),'{}'::jsonb) into contents
 from jsonb_each_text(saip_private.pick(d,array['note','reason','resolutionNote','assignmentReason','autoAssignReason','body']));
 if saip_private.b(d,'deleted') then contents:=jsonb_build_object('body','삭제된 메시지'); end if;
 perform backoffice_private.audit_view(a,'workflow.view',p_collection,p_id,why,'{}');
 return jsonb_build_object('id',p_id,'data',saip_private.pick(d,keys),'contents',contents);
end $$;
revoke all on function public.backoffice_workflow_detail(text,text,text) from public,anon;
grant execute on function public.backoffice_workflow_detail(text,text,text) to authenticated;

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
    'messages', coalesce(jsonb_agg(case when saip_private.b(m.d,'deleted') then (m.d-'attachments')||jsonb_build_object('body','','attachments','[]'::jsonb) else jsonb_set(m.d,'{body}',to_jsonb(coalesce(backoffice_private.mask_phones(m.d->>'body'),''))) end
                                   || jsonb_build_object('id', m.id) order by m.at, m.id), '[]'::jsonb))
  into res
  from (select x.id, saip_private.pick(x.data,array['body','senderId','recipientId','requestId','invoiceId','system','read','status','attachments','createdAt','editedAt','deleted']) d, backoffice_private.ts(x.data ->> 'createdAt') at from public.saip_records x
        where x.collection = 'messages' and x.readers @> array[p_account_a, p_account_b]
          and (p_before is null or backoffice_private.ts(x.data ->> 'createdAt') < p_before)
        order by backoffice_private.ts(x.data ->> 'createdAt') desc nulls last, x.id desc limit lim) m;
  perform backoffice_private.audit_view(a, 'conversation.view', 'account', least(p_account_a, p_account_b)::text, why,
    jsonb_build_object('peerId', greatest(p_account_a, p_account_b), 'count', jsonb_array_length(res -> 'messages')));
  return res;
end $$;

-- Release records include private targeting lists and unpublished notes. Return
-- metadata and targeting diagnostics only, never the raw source or audience IDs.
create or replace function backoffice_private.release_metadata(source jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare fields jsonb:='{}'; invalid text[]:='{}'; k text; v jsonb;
 role_targeting text:='none'; user_targeting text:='none'; targeting text;
 keys text[]:=array['public','published','available','enabled','released','platform',
  'publishedAt','releasedAt','availableAt','publicAt','startsAt','createdAt',
  'buildNumber','build','versionCode','versionName','version','buildName',
  'title','headline','storeUrl','updateUrl','appStoreUrl','playStoreUrl','url'];
begin
 if jsonb_typeof(source)='object' then
  foreach k in array keys loop
   if not(source ? k) then continue; end if;
   v:=source->k;
   if jsonb_typeof(v) in('string','number','boolean') then
    fields:=fields||jsonb_build_object(k,v);
   else invalid:=array_append(invalid,k); end if;
  end loop;
  foreach k in array array['roles','eligibleRoles','targetRoles','audienceRoles',
    'userIds','eligibleUserIds','targetUserIds','audienceUserIds'] loop
   if not(source ? k) then continue; end if;
   v:=source->k;
   if jsonb_typeof(v) is distinct from 'array' then targeting:='invalid';
   elsif exists(select 1 from jsonb_array_elements(v) e where jsonb_typeof(e)<>'string') then targeting:='invalid';
   elsif jsonb_array_length(v)>0 then targeting:='restricted';
   else targeting:='none'; end if;
   if k in('roles','eligibleRoles','targetRoles','audienceRoles') then
    if role_targeting<>'invalid' and targeting<>'none' then role_targeting:=targeting; end if;
   else
    if user_targeting<>'invalid' and targeting<>'none' then user_targeting:=targeting; end if;
   end if;
  end loop;
 end if;
 return jsonb_build_object('fields',fields,'validObject',coalesce(jsonb_typeof(source)='object',false),
  'invalidFields',invalid,'roleTargeting',role_targeting,'userTargeting',user_targeting,
  'privateAudience',coalesce(source->>'visibility'='private' or source->>'audience'='private',false));
end $$;

create or replace function public.backoffice_list_app_releases(p_limit integer default 25,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare lim integer:=least(greatest(coalesce(p_limit,25),1),100); off integer:=greatest(coalesce(p_offset,0),0);
 rows jsonb:='[]'; variants jsonb; invalid text[]; source_kind text; r record; k text; v jsonb;
begin
 perform backoffice_private.require_admin('viewer');
 for r in select id,data,updated_at from public.saip_records where collection='appReleases'
  order by updated_at desc,id limit lim offset off loop
  variants:='{}'; invalid:='{}'; source_kind:='shared';
  if jsonb_typeof(r.data)='object' then
   if r.data ? 'platforms' then source_kind:='platforms';
    if jsonb_typeof(r.data->'platforms') is distinct from 'object' then invalid:=array_append(invalid,'platforms'); end if;
   elsif r.data ?| array['ios','android'] then source_kind:='legacy'; end if;
   if source_kind<>'shared' then
    foreach k in array array['ios','android'] loop
     v:=case when source_kind='platforms' then r.data->'platforms'->k else r.data->k end;
     if v is null then continue; end if;
     if jsonb_typeof(v)='object' then variants:=variants||jsonb_build_object(k,backoffice_private.release_metadata(v));
     else invalid:=array_append(invalid,k); end if;
    end loop;
   end if;
  end if;
  rows:=rows||jsonb_build_array(jsonb_build_object('id',r.id,'updatedAt',r.updated_at,
   'root',backoffice_private.release_metadata(r.data),'variantSource',source_kind,
   'variants',variants,'invalidVariants',invalid));
 end loop;
 return jsonb_build_object('total',(select count(*) from public.saip_records where collection='appReleases'),
  'limit',lim,'offset',off,'rows',rows);
end $$;

-- No staff role may execute private helpers directly.
revoke all on all functions in schema backoffice_private from public,anon,authenticated;
revoke all on function public.backoffice_list_workflow(text,text,text,text,boolean,integer,integer),
 public.backoffice_get_invoice(text), public.backoffice_process_payment(text,text,text,integer,text,integer,text),
 public.backoffice_bank_access(text,text), public.backoffice_team_chat(text,text,integer,integer),
 public.backoffice_lifecycle(integer,integer), public.backoffice_push_health(), public.backoffice_list_app_releases(integer,integer) from public,anon;
grant execute on function public.backoffice_list_workflow(text,text,text,text,boolean,integer,integer),
 public.backoffice_get_invoice(text), public.backoffice_process_payment(text,text,text,integer,text,integer,text),
 public.backoffice_bank_access(text,text), public.backoffice_team_chat(text,text,integer,integer),
 public.backoffice_lifecycle(integer,integer), public.backoffice_push_health(), public.backoffice_list_app_releases(integer,integer) to authenticated;
commit;
