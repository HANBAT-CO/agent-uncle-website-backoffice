-- Read-only overview of the LOCAL demo data. Run with: supabase-local/scripts/summary.sh
-- The status label replicates the app's RequestRecord.statusLabel (lib/local/domain/models.dart),
-- first match wins; "overdue" uses today's date in Asia/Seoul like the app on a Korean device.

\echo '== records per collection'
select collection, count(*) from public.saip_records group by 1 order by 1;

\echo '== requests per app status label'
with r as (
  select id, data d,
    coalesce((data->>'quantity')::int, 0) q, coalesce((data->>'acquired')::int, 0) a,
    coalesce((data->>'delivered')::int, 0) dl, coalesce((data->>'received')::int, 0) rc,
    coalesce((data->>'cancelled')::int, 0) c, coalesce((data->>'acquiredCancelled')::int, 0) ac,
    coalesce((data->>'held')::int, 0) h
  from public.saip_records where collection = 'requests'
), labelled as (
  select *, case
    when d->>'status' = 'rejected' then '거절'
    when d->>'status' = 'cancelled' then '취소 종료'
    when d->>'status' = 'completed' then '완료'
    when coalesce((d->>'openIssues')::int, 0) > 0 then '문제 확인 중'
    when coalesce(d->>'proposalId', '') <> '' then '변경·취소 협의 중'
    when d->>'status' = 'pending' then '확인 대기'
    when coalesce((d->>'needsReply')::boolean, false) then '답변 필요'
    when dl > rc then '수령 대기'
    when coalesce((d->>'resultShared')::boolean, false) and greatest(0, q - c - (a - ac)) > 0 then
      case when coalesce(d->>'recheck', '') <> '' and d->>'recheck' <= to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD')
           then '미송 재확인' else '미송 대기' end
    when greatest(0, a - ac - dl - h) > 0 then '픽업 완료'
    else '진행 중' end as label
  from r
)
select label, count(*) from labelled group by 1 order by 2 desc, 1;

\echo '== invariant violations (expect 0 rows): received <= delivered <= acquired, held/cancel bounds'
select id, d->>'status' status, q, a, dl, rc, c, ac, h from (
  select id, data d,
    coalesce((data->>'quantity')::int, 0) q, coalesce((data->>'acquired')::int, 0) a,
    coalesce((data->>'delivered')::int, 0) dl, coalesce((data->>'received')::int, 0) rc,
    coalesce((data->>'cancelled')::int, 0) c, coalesce((data->>'acquiredCancelled')::int, 0) ac,
    coalesce((data->>'held')::int, 0) h
  from public.saip_records where collection = 'requests') x
where not (q > 0 and rc <= dl and dl <= a and ac <= c and ac + dl <= a and h >= 0 and h <= a - ac - dl and c <= q and q - c >= a - ac);

\echo '== accounts'
select data->>'role' as role, coalesce((data->>'complete')::boolean, false) as complete, count(*) from public.saip_records
where collection = 'accounts' group by 1, 2 order by 1, 2;

\echo '== connections'
select data->>'status' as status, count(*) from public.saip_records where collection = 'connections' group by 1 order by 1;

\echo '== proposals / issues / deliveries'
select 'proposal ' || (data->>'kind') || ' ' || (data->>'status') as what, count(*) from public.saip_records where collection = 'proposals' group by 1
union all select 'issue ' || (data->>'status'), count(*) from public.saip_records where collection = 'issues' group by 1
union all select 'receipt ' || (data->>'kind') || case when (data->>'actual')::int <> (data->>'confirmed')::int or data->>'reason' <> '' then ' (with difference)' else '' end, count(*)
  from public.saip_records where collection = 'receipts' group by 1
union all select 'delivery ' || case when (data->>'receiptRecorded')::boolean then 'received' else 'awaiting receipt' end, count(*)
  from public.saip_records where collection = 'deliveries' group by 1
order by 1;

\echo '== messages / notices'
select case when (data->>'system')::boolean then 'message (업무 기록)' else 'message (chat)' end || case when (data->>'read')::boolean then ' read' else ' unread' end as what, count(*)
from public.saip_records where collection = 'messages' group by 1
union all select 'notice ' || (data->>'kind') || case when (data->>'read')::boolean then ' read' else ' unread' end, count(*)
from public.saip_records where collection = 'notices' group by 1 order by 1;

\echo '== landing_leads'
select coalesce(role, '-') role, coalesce(source, '-') source, count(*), min(created_at)::date first, max(created_at)::date last
from public.landing_leads group by 1, 2 order by 1, 2;

\echo '== auth users'
select case when raw_app_meta_data->>'backoffice_role' is not null then 'backoffice ' || (raw_app_meta_data->>'backoffice_role')
            else 'app user (' || coalesce(raw_app_meta_data->>'provider', '?') || ')' end as kind, count(*)
from auth.users group by 1 order by 1;

\echo '== simulated time range'
select min((data->>'createdAt')::timestamptz) at time zone 'Asia/Seoul' as first_kst, max((data->>'createdAt')::timestamptz) at time zone 'Asia/Seoul' as last_kst
from public.saip_records where data ? 'createdAt' and position('T' in data->>'createdAt') > 0;
