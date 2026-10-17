-- 업데이트 정보는 사용자와 플랫폼별 공개 조건을 모두 확인한 뒤 표시 필드만 보낸다.
-- 플랫폼 하위 문서의 공개 조건을 지운 뒤 노출하는 방식은 사용하지 않는다.
create function saip_private.release_true(value jsonb) returns boolean
language sql immutable set search_path='' as $$
  select coalesce(value='true'::jsonb or
    (jsonb_typeof(value)='string' and lower(btrim(value#>>'{}'))='true'),false)
$$;

create or replace function saip_private.convenience_release_visible(source jsonb, actor uuid)
returns boolean language plpgsql stable set search_path='' as $$
declare
  account jsonb := saip_private.convenience_account(actor);
  k text; value jsonb; allowed text; instant timestamptz;
begin
  if actor is null or account is null or jsonb_typeof(source)<>'object'
    or not saip_private.release_true(account->'complete')
    or saip_private.release_true(account->'deletionPending')
    or not saip_private.release_true(source->'public') then return false; end if;
  if source->>'visibility'='private' or source->>'audience'='private' then return false; end if;
  foreach k in array array['published','available','enabled','released'] loop
    if source ? k and not saip_private.release_true(source->k) then return false; end if;
  end loop;
  foreach k in array array['publishedAt','releasedAt','availableAt','publicAt','startsAt'] loop
    value:=source->k;
    if value is null or value='null'::jsonb or value='""'::jsonb then continue; end if;
    if jsonb_typeof(value)<>'string' then return false; end if;
    if (value#>>'{}') !~ '^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,6})?(Z|[+-](0\d|1[0-5]):[0-5]\d)$'
      then return false; end if;
    begin instant:=(value#>>'{}')::timestamptz;
    exception when others then return false; end;
    if instant>statement_timestamp() then return false; end if;
  end loop;
  foreach k in array array['roles','eligibleRoles','targetRoles','audienceRoles',
    'userIds','eligibleUserIds','targetUserIds','audienceUserIds'] loop
    if not(source ? k) then continue; end if;
    value:=source->k;
    if jsonb_typeof(value)<>'array' then return false; end if;
    if exists(select 1 from jsonb_array_elements(value) e where jsonb_typeof(e)<>'string') then
      return false;
    end if;
    allowed:=case when k in('roles','eligibleRoles','targetRoles','audienceRoles')
      then account->>'role' else actor::text end;
    if jsonb_array_length(value)>0 and not(value ? allowed) then return false; end if;
  end loop;
  return true;
end $$;

create function saip_private.release_public_fields(source jsonb) returns jsonb
language sql immutable set search_path='' as $$
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb)
  from jsonb_each(source) where key in (
    'public','published','available','enabled','released','platform',
    'publishedAt','releasedAt','availableAt','publicAt','startsAt','createdAt',
    'buildNumber','build','versionCode','versionName','version','buildName',
    'title','headline','body','notes','whatsNew','description','summary',
    'storeUrl','updateUrl','appStoreUrl','playStoreUrl','url'
  ) and jsonb_typeof(value) in('string','number','boolean')
$$;

create function saip_private.project_app_release(source jsonb,actor uuid) returns jsonb
language plpgsql stable set search_path='' as $$
declare
  platform text := lower(btrim(coalesce(source->>'platform','')));
  payload jsonb; variants jsonb:='{}'; variant jsonb; merged jsonb; k text; target text;
begin
  if not saip_private.convenience_release_visible(source,actor) then return null; end if;
  if platform<>'' and platform not in('ios','android') then return null; end if;
  payload:=saip_private.release_public_fields(source);
  if not(source ?| array['platforms','ios','android']) then return payload; end if;
  foreach k in array array['ios','android'] loop
    if platform<>'' and platform<>k then continue; end if;
    variant:=case when source ? 'platforms' then source->'platforms'->k else source->k end;
    if jsonb_typeof(variant) is distinct from 'object' then continue; end if;
    merged:=source||variant;
    if not saip_private.convenience_release_visible(merged,actor) then continue; end if;
    target:=lower(btrim(coalesce(merged->>'platform','')));
    if target<>'' and target<>k then continue; end if;
    variants:=variants||jsonb_build_object(k,
      saip_private.release_public_fields(merged)||jsonb_build_object('platform',k));
  end loop;
  if variants='{}'::jsonb then return null; end if;
  return payload||jsonb_build_object('platforms',variants);
end $$;

create or replace function saip_private.convenience_snapshot_app_releases(actor uuid)
returns jsonb language sql stable set search_path='' as $$
  select coalesce(jsonb_object_agg(id,payload order by id),'{}'::jsonb)
  from (
    select id,saip_private.project_app_release(data,actor) payload
    from public.saip_records where collection='appReleases'
  ) eligible where payload is not null
$$;

-- 원본에 대상자 목록·운영 메모가 들어 있으므로 클라이언트의 직접 SELECT는 금지한다.
-- SECURITY DEFINER snapshot은 위의 투영 결과만 반환한다.
create policy release_projection_only on public.saip_records
  as restrictive for select to authenticated using(collection<>'appReleases');

revoke all on function saip_private.release_true(jsonb),
  saip_private.convenience_release_visible(jsonb,uuid),
  saip_private.release_public_fields(jsonb),saip_private.project_app_release(jsonb,uuid),
  saip_private.convenience_snapshot_app_releases(uuid) from public,anon,authenticated;
