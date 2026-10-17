create or replace function saip_private.convenience_now()
returns timestamptz
language sql
volatile
set search_path = ''
as $$
  select clock_timestamp()
$$;

create or replace function saip_private.convenience_texts(value jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(elem order by elem), '{}'::text[])
  from (
    select distinct btrim(entry) as elem
    from jsonb_array_elements_text(
      case when jsonb_typeof(value) = 'array' then value else '[]'::jsonb end
    ) as entry
    where btrim(entry) <> ''
  ) dedup
$$;

create or replace function saip_private.convenience_first_text(source jsonb, keys text[])
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  key text;
  value text;
begin
  foreach key in array keys loop
    value := btrim(coalesce(source->>key, ''));
    if value <> '' then
      return value;
    end if;
  end loop;
  return '';
end;
$$;

create or replace function saip_private.convenience_text_array(source jsonb, keys text[])
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  key text;
  value jsonb;
begin
  foreach key in array keys loop
    value := source->key;
    if jsonb_typeof(value) = 'array' then
      return saip_private.convenience_texts(value);
    end if;
  end loop;
  return '{}'::text[];
end;
$$;

create or replace function saip_private.convenience_truthy(source jsonb, keys text[])
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  key text;
  value jsonb;
  text_value text;
begin
  foreach key in array keys loop
    if not (source ? key) then
      continue;
    end if;
    value := source->key;
    if jsonb_typeof(value) = 'boolean' then
      return value = 'true'::jsonb;
    end if;
    if jsonb_typeof(value) = 'string' then
      text_value := lower(btrim(source->>key));
      if text_value = 'true' then
        return true;
      elsif text_value = 'false' then
        return false;
      end if;
    end if;
  end loop;
  return false;
end;
$$;

create or replace function saip_private.convenience_has_any_key(source jsonb, keys text[])
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  key text;
begin
  foreach key in array keys loop
    if source ? key then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

create or replace function saip_private.convenience_payment_mode(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case btrim(coalesce(value, ''))
    when 'advance' then 'advance'
    when 'advance_request' then 'advance'
    when 'direct' then 'direct'
    when 'direct_paid' then 'direct'
    when 'review' then 'review'
    when 'needs_check' then 'review'
    else 'review'
  end
$$;

create or replace function saip_private.convenience_published_at(source jsonb)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  key text;
  value text;
begin
  foreach key in array array['publishedAt', 'releasedAt', 'availableAt', 'publicAt'] loop
    value := btrim(coalesce(source->>key, ''));
    if value = '' then
      continue;
    end if;
    begin
      return value::timestamptz;
    exception when others then
      continue;
    end;
  end loop;
  return null;
end;
$$;

create or replace function saip_private.convenience_release_platform_valid(source jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  platform text := lower(btrim(coalesce(source->>'platform', '')));
  platforms jsonb := source->'platforms';
begin
  if platform <> '' and platform not in ('ios', 'android') then
    return false;
  end if;
  if jsonb_typeof(platforms) = 'object' then
    return (platforms ? 'ios') or (platforms ? 'android');
  end if;
  if jsonb_typeof(source->'ios') = 'object' or jsonb_typeof(source->'android') = 'object' then
    return true;
  end if;
  return true;
end;
$$;

create or replace function saip_private.convenience_account(actor uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  account jsonb;
begin
  if actor is null then
    return null;
  end if;

  select data into account
  from public.saip_records
  where collection = 'accounts' and id = actor::text;

  return account;
end;
$$;

create or replace function saip_private.convenience_require_retailer(actor uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  account jsonb := saip_private.convenience_account(actor);
begin
  if account is null
     or coalesce(account->>'role', '') <> 'retailer'
     or coalesce(account->>'complete', 'false') <> 'true'
     or coalesce(account->>'deletionPending', 'false') = 'true' then
    raise exception '소매업자만 즐겨찾기 도매처를 관리할 수 있어요.';
  end if;
end;
$$;

create or replace function saip_private.convenience_release_visible(source jsonb, actor uuid)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  account jsonb := saip_private.convenience_account(actor);
  role_name text := coalesce(account->>'role', '');
  roles text[];
  user_ids text[];
  published_at timestamptz;
begin
  if actor is null or account is null then
    return false;
  end if;
  if coalesce(account->>'complete', 'false') <> 'true'
     or coalesce(account->>'deletionPending', 'false') = 'true' then
    return false;
  end if;
  if coalesce(source->>'visibility', source->>'audience', '') = 'private' then
    return false;
  end if;
  if not saip_private.convenience_truthy(source, array['public']) then
    return false;
  end if;
  if not saip_private.convenience_release_platform_valid(source) then
    return false;
  end if;

  published_at := saip_private.convenience_published_at(source);
  if published_at is not null and published_at > saip_private.convenience_now() then
    return false;
  end if;
  if saip_private.convenience_has_any_key(source, array['published', 'available', 'enabled', 'released'])
     and not saip_private.convenience_truthy(source, array['published', 'available', 'enabled', 'released']) then
    return false;
  end if;

  roles := saip_private.convenience_text_array(
    source,
    array['roles', 'eligibleRoles', 'targetRoles', 'audienceRoles']
  );
  if cardinality(roles) > 0 and not (role_name = any(roles)) then
    return false;
  end if;

  user_ids := saip_private.convenience_text_array(
    source,
    array['userIds', 'eligibleUserIds', 'targetUserIds', 'audienceUserIds']
  );
  if cardinality(user_ids) > 0 and not (actor::text = any(user_ids)) then
    return false;
  end if;

  return true;
end;
$$;

create or replace function saip_private.convenience_strip_release_audience(source jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  payload jsonb := coalesce(source, '{}'::jsonb)
    - 'roles'
    - 'eligibleRoles'
    - 'targetRoles'
    - 'audienceRoles'
    - 'userIds'
    - 'eligibleUserIds'
    - 'targetUserIds'
    - 'audienceUserIds'
    - 'visibility'
    - 'audience'
    - 'readers';
  nested_platforms jsonb := '{}'::jsonb;
  key text;
begin
  if jsonb_typeof(source->'platforms') = 'object' then
    foreach key in array array['ios', 'android'] loop
      if jsonb_typeof(source->'platforms'->key) = 'object' then
        nested_platforms := nested_platforms || jsonb_build_object(
          key,
          saip_private.convenience_strip_release_audience(source->'platforms'->key)
        );
      end if;
    end loop;
    payload := payload - 'platforms';
    if nested_platforms <> '{}'::jsonb then
      payload := payload || jsonb_build_object('platforms', nested_platforms);
    end if;
  end if;

  foreach key in array array['ios', 'android'] loop
    if jsonb_typeof(source->key) = 'object' then
      payload := payload || jsonb_build_object(
        key,
        saip_private.convenience_strip_release_audience(source->key)
      );
    end if;
  end loop;

  return jsonb_strip_nulls(payload);
end;
$$;

create or replace function saip_private.convenience_snapshot_app_releases(actor uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(
    jsonb_object_agg(id, sanitized order by id),
    '{}'::jsonb
  )
  from (
    select
      id,
      saip_private.convenience_strip_release_audience(data) as sanitized
    from public.saip_records
    where collection = 'appReleases'
      and saip_private.convenience_release_visible(data, actor)
  ) eligible
$$;

create or replace function saip_private.convenience_upsert_favorite(
  command_args jsonb,
  actor uuid
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  favorite_id text := btrim(coalesce(command_args->>'favoriteId', ''));
  wholesaler_name text := btrim(coalesce(command_args->>'wholesaler', ''));
  location_name text := btrim(coalesce(command_args->>'location', ''));
  payment_mode text := saip_private.convenience_payment_mode(command_args->>'paymentMode');
  current_row jsonb;
begin
  perform saip_private.convenience_require_retailer(actor);

  if wholesaler_name = '' or location_name = '' then
    raise exception '도매처 이름과 위치를 확인해 주세요.';
  end if;

  if favorite_id = '' then
    select id, data into favorite_id, current_row
    from public.saip_records
    where collection = 'favoriteWholesalers'
      and data->>'ownerId' = actor::text
      and btrim(coalesce(data->>'wholesaler', '')) = wholesaler_name
      and btrim(coalesce(data->>'location', '')) = location_name
    order by id
    limit 1;
  else
    select data into current_row
    from public.saip_records
    where collection = 'favoriteWholesalers' and id = favorite_id
    for update;
  end if;

  if coalesce(favorite_id, '') = '' then
    favorite_id := md5(actor::text || ':' || wholesaler_name || ':' || location_name);
  end if;
  if current_row is not null and current_row->>'ownerId' <> actor::text then
    raise exception '본인 즐겨찾기만 수정할 수 있어요.';
  end if;

  perform saip_private.put(
    'favoriteWholesalers',
    favorite_id,
    jsonb_build_object(
      'id', favorite_id,
      'ownerId', actor::text,
      'wholesaler', wholesaler_name,
      'location', location_name,
      'paymentMode', payment_mode,
      'label', case
        when location_name <> '' then wholesaler_name || ' · ' || location_name
        else wholesaler_name
      end,
      'createdAt', coalesce(current_row->>'createdAt', saip_private.convenience_now()::text),
      'updatedAt', saip_private.convenience_now()::text,
      'version', coalesce((current_row->>'version')::integer, 0) + 1,
      'readers', jsonb_build_array(actor::text)
    ),
    array[actor]
  );

  return favorite_id;
end;
$$;

create or replace function saip_private.convenience_delete_favorite(
  command_args jsonb,
  actor uuid
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  favorite_id text := btrim(coalesce(command_args->>'favoriteId', ''));
  deleted_id text;
begin
  perform saip_private.convenience_require_retailer(actor);
  if favorite_id = '' then
    raise exception 'favoriteId 값을 확인해 주세요.';
  end if;

  delete from public.saip_records
  where collection = 'favoriteWholesalers'
    and id = favorite_id
    and data->>'ownerId' = actor::text
  returning id into deleted_id;

  if deleted_id is null then
    raise exception '본인 즐겨찾기만 삭제할 수 있어요.';
  end if;

  return deleted_id;
end;
$$;

create or replace function saip_private.convenience_command(command text, args jsonb, actor uuid)
returns text
language plpgsql
set search_path = ''
as $$
begin
  case command
    when 'convenience.upsertFavoriteWholesaler', 'upsertFavoriteWholesaler' then
      return saip_private.convenience_upsert_favorite(coalesce(args, '{}'::jsonb), actor);
    when 'convenience.deleteFavoriteWholesaler', 'deleteFavoriteWholesaler' then
      return saip_private.convenience_delete_favorite(coalesce(args, '{}'::jsonb), actor);
    else
      raise exception '지원하지 않는 편의 기능 명령이에요: %', command;
  end case;
end;
$$;

alter function saip_private.saip_snapshot() rename to snapshot_before_convenience_projection;
create function saip_private.saip_snapshot()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_set(
    saip_private.snapshot_before_convenience_projection(),
    '{appReleases}',
    saip_private.convenience_snapshot_app_releases(auth.uid()),
    true
  )
$$;

revoke all on function
  saip_private.convenience_command(text, jsonb, uuid),
  saip_private.convenience_upsert_favorite(jsonb, uuid),
  saip_private.convenience_delete_favorite(jsonb, uuid),
  saip_private.convenience_snapshot_app_releases(uuid),
  saip_private.saip_snapshot(),
  saip_private.snapshot_before_convenience_projection()
from public, anon, authenticated;
