-- Read-only schema fingerprint used by verify-schema.mjs.
-- It runs unchanged on the LOCAL stack (psql) and on the LIVE project (Management API
-- read-only endpoint). SELECT only: no DDL, no DML, no function calls with side effects.
-- ACLs are exploded and grantors dropped so that "who applied the SQL" does not count.
with
roles_of_interest(r) as (values ('anon'), ('authenticated'), ('service_role'), ('PUBLIC')),
rel as (
  select n.nspname as s, c.relname as t, c.oid, c.relkind, c.relrowsecurity, c.relforcerowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'saip_private') and c.relkind in ('r', 'p', 'v', 'm', 'f')
),
tables as (
  select jsonb_object_agg(rel.s || '.' || rel.t, jsonb_build_object(
    'kind', rel.relkind,
    'rls', rel.relrowsecurity,
    'force_rls', rel.relforcerowsecurity,
    'columns', (
      select jsonb_agg(jsonb_build_array(a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull,
               pg_get_expr(d.adbin, d.adrelid)) order by a.attnum)
      from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = rel.oid and a.attnum > 0 and not a.attisdropped),
    'constraints', (
      select coalesce(jsonb_agg(jsonb_build_array(con.conname, con.contype, pg_get_constraintdef(con.oid)) order by con.conname), '[]')
      from pg_constraint con where con.conrelid = rel.oid),
    'indexes', (
      select coalesce(jsonb_agg(jsonb_build_array(i.indexname, i.indexdef) order by i.indexname), '[]')
      from pg_indexes i where i.schemaname = rel.s and i.tablename = rel.t),
    'table_grants', (
      select coalesce(jsonb_agg(distinct coalesce(r.rolname, 'PUBLIC') || ':' || a.privilege_type), '[]')
      from aclexplode(rel_acl.acl) a left join pg_roles r on r.oid = a.grantee
      where coalesce(r.rolname, 'PUBLIC') in (select r from roles_of_interest)),
    'column_grants', (
      select coalesce(jsonb_agg(distinct coalesce(r.rolname, 'PUBLIC') || ':' || a.privilege_type || ':' || att.attname), '[]')
      from pg_attribute att, aclexplode(att.attacl) a left join pg_roles r on r.oid = a.grantee
      where att.attrelid = rel.oid and att.attnum > 0 and not att.attisdropped and att.attacl is not null
        and coalesce(r.rolname, 'PUBLIC') in (select r from roles_of_interest)),
    'triggers', (
      select coalesce(jsonb_agg(pg_get_triggerdef(tg.oid) order by tg.tgname), '[]')
      from pg_trigger tg where tg.tgrelid = rel.oid and not tg.tgisinternal)
  )) as v
  from rel
  cross join lateral (select coalesce(c.relacl, acldefault('r', c.relowner)) as acl from pg_class c where c.oid = rel.oid) rel_acl
),
functions as (
  select jsonb_object_agg(n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
    jsonb_build_object(
      'def_md5', md5(pg_get_functiondef(p.oid)),
      'security_definer', p.prosecdef,
      'volatility', p.provolatile,
      'config', p.proconfig,
      'execute', (
        select coalesce(jsonb_agg(distinct coalesce(r.rolname, 'PUBLIC') order by coalesce(r.rolname, 'PUBLIC')), '[]')
        from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a left join pg_roles r on r.oid = a.grantee
        where a.privilege_type = 'EXECUTE' and coalesce(r.rolname, 'PUBLIC') in (select r from roles_of_interest))
    )) as v
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'saip_private') and p.prokind in ('f', 'p')
),
policies as (
  select jsonb_object_agg(schemaname || '.' || tablename || '.' || policyname, jsonb_build_object(
    'permissive', permissive, 'roles', to_jsonb(roles), 'cmd', cmd, 'qual', qual, 'with_check', with_check)) as v
  from pg_policies
  where schemaname in ('public', 'saip_private') or (schemaname = 'storage' and tablename in ('objects', 'buckets'))
),
schemas as (
  select jsonb_object_agg(n.nspname, jsonb_build_object(
    'usage', (
      select coalesce(jsonb_agg(distinct coalesce(r.rolname, 'PUBLIC') order by coalesce(r.rolname, 'PUBLIC')), '[]')
      from aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a left join pg_roles r on r.oid = a.grantee
      where a.privilege_type = 'USAGE' and coalesce(r.rolname, 'PUBLIC') in (select r from roles_of_interest)))) as v
  from pg_namespace n where n.nspname in ('public', 'saip_private')
),
buckets as (
  select coalesce(jsonb_object_agg(id, jsonb_build_object('public', public, 'file_size_limit', file_size_limit,
    'allowed_mime_types', to_jsonb(allowed_mime_types))), '{}') as v
  from storage.buckets
),
publication as (
  select coalesce(jsonb_agg(schemaname || '.' || tablename order by schemaname, tablename), '[]') as v
  from pg_publication_tables where pubname = 'supabase_realtime'
),
migrations as (
  select coalesce(jsonb_agg(version || '_' || coalesce(name, '') order by version), '[]') as v
  from supabase_migrations.schema_migrations
),
extensions as (
  select jsonb_object_agg(extname, extversion) as v from pg_extension
),
event_triggers as (
  select coalesce(jsonb_object_agg(e.evtname, jsonb_build_object('event', e.evtevent, 'function', fn.nspname || '.' || f.proname,
    'enabled', e.evtenabled, 'tags', to_jsonb(e.evttags), 'owner', pg_get_userbyid(e.evtowner))), '{}') as v
  from pg_event_trigger e join pg_proc f on f.oid = e.evtfoid join pg_namespace fn on fn.oid = f.pronamespace
)
select jsonb_build_object(
  'server_version', current_setting('server_version'),
  'schemas', (select v from schemas),
  'tables', (select v from tables),
  'functions', (select v from functions),
  'policies', (select v from policies),
  'buckets', (select v from buckets),
  'realtime_publication', (select v from publication),
  'migrations', (select v from migrations),
  'extensions', (select v from extensions),
  'event_triggers', (select v from event_triggers)
)::text as fingerprint;
