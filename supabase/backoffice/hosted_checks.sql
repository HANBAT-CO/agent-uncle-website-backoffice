-- Read-only post-rollout checks. No fixtures, staff impersonation or customer writes.
-- Run with the authenticated Supabase CLI against the explicitly selected project.
begin read only;
set local statement_timeout = '30s';

do $checks$
declare missing integer; broken integer;
begin
  select count(*) into missing
  from unnest(array['202610160005','202610160006','20261017090000']) as required(version)
  where not exists (select 1 from supabase_migrations.schema_migrations m where m.version=required.version);
  if missing <> 0 then raise exception 'Required migration history is missing'; end if;

  select count(*) into missing
  from unnest(array[
    'public.backoffice_list_workflow(text,text,text,text,boolean,integer,integer)',
    'public.backoffice_get_invoice(text)',
    'public.backoffice_process_payment(text,text,text,integer,text,integer,text)',
    'public.backoffice_bank_access(text,text)',
    'public.backoffice_team_chat(text,text,integer,integer)',
    'public.backoffice_lifecycle(integer,integer)',
    'public.backoffice_push_health()',
    'public.backoffice_list_app_releases(integer,integer)',
    'public.backoffice_workflow_detail(text,text,text)'
  ]) as required(signature)
  left join pg_proc p on p.oid=to_regprocedure(required.signature)
  where p.oid is null or not p.prosecdef
    or not coalesce(p.proconfig @> array['search_path=""'], false)
    or has_function_privilege('anon',p.oid,'EXECUTE')
    or not has_function_privilege('authenticated',p.oid,'EXECUTE');
  if missing <> 0 then raise exception 'New RPC existence or privilege check failed'; end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('backoffice_private','saip_private')
      and (has_function_privilege('anon',p.oid,'EXECUTE')
        or has_function_privilege('authenticated',p.oid,'EXECUTE'))
  ) then raise exception 'A private helper is executable by a client role'; end if;

  if not has_function_privilege('service_role',
      'public.saip_process_platform_payment(text,text,text,integer,text,integer)','EXECUTE')
    or has_function_privilege('anon',
      'public.saip_process_platform_payment(text,text,text,integer,text,integer)','EXECUTE')
    or has_function_privilege('authenticated',
      'public.saip_process_platform_payment(text,text,text,integer,text,integer)','EXECUTE')
  then raise exception 'Service payment RPC privilege check failed'; end if;

  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and not c.relrowsecurity
      and (c.relname like 'saip_%' or c.relname like 'backoffice_%' or c.relname='landing_leads')
  ) then raise exception 'Application or backoffice table has RLS disabled'; end if;

  with chain as (
    select l.*,lag(row_hash) over(order by id) as expected_prev
    from public.backoffice_audit_log l
  )
  select count(*) into broken from chain e
  where e.prev_hash is distinct from e.expected_prev
    or e.row_hash is distinct from backoffice_private.audit_hash(
      e.expected_prev,e.at,e.actor_id,e.actor_role,e.action,e.target_type,e.target_id,
      e.reason,e.before,e.after,e.operation_id,e.request_hash,e.result,e.client);
  if broken <> 0 then raise exception 'Audit chain integrity check failed'; end if;

  -- Exercise current production request projections without returning customer records.
  if exists (
    select 1 from public.saip_records r where r.collection='requests'
      and coalesce(backoffice_private.request_label(backoffice_private.request_state(r.id,r.data)),'')=''
  ) then raise exception 'Request projection produced an empty label'; end if;
end $checks$;

-- An authenticated database role without a signed-in staff identity must be denied.
select set_config('request.jwt.claims','{}',true);
select set_config('request.jwt.claim.sub','',true);
set local role authenticated;
do $access$
declare statement text; denied boolean;
begin
  foreach statement in array array[
    $q$select public.backoffice_list_workflow('invoices')$q$,
    $q$select public.backoffice_get_invoice('rollout-check-missing')$q$,
    $q$select public.backoffice_process_payment('rollout-check','confirm_receipt','rollout-check-missing',1,'rollout-check',1,'운영 반영 권한 검사')$q$,
    $q$select public.backoffice_bank_access('rollout-check-missing','운영 반영 권한 검사')$q$,
    $q$select public.backoffice_team_chat('rollout-check-missing','운영 반영 권한 검사')$q$,
    $q$select public.backoffice_lifecycle()$q$,
    $q$select public.backoffice_push_health()$q$,
    $q$select public.backoffice_list_app_releases()$q$,
    $q$select public.backoffice_workflow_detail('invoices','rollout-check-missing','운영 반영 권한 검사')$q$
  ] loop
    denied:=false;
    begin
      execute statement;
    exception when insufficient_privilege then
      denied:=true;
    end;
    if not denied then raise exception 'RPC accepted a session without a staff identity: %',statement; end if;
  end loop;
end $access$;
reset role;
select jsonb_build_object(
  'ok',true,
  'requiredMigrations',3,
  'newRpcPermissionChecks',9,
  'unauthorizedRpcCallsDenied',9,
  'privateHelpersProtected',true,
  'servicePaymentRpcProtected',true,
  'rlsEnabled',true,
  'auditChainValid',true,
  'requestProjectionsValid',true
) as result;
rollback;
