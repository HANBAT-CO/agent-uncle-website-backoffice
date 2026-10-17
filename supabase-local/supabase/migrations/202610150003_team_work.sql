alter table public.saip_records drop constraint saip_records_collection_check;
alter table public.saip_records add constraint saip_records_collection_check check (
  collection in (
    'accounts','signupProgress','connections','drafts','requests',
    'deliveries','receipts','events','proposals','issues','messages','notices','attachments','chatBlocks',
    'colleagueConnections','teams','teamInvites','teamChats','teamRounds','teamAreas','teamJobs','teamPackages','teamHandoffs','teamReceipts'
  )
);

create function saip_private.team_texts(j jsonb, k text) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array(select jsonb_array_elements_text(coalesce(j->k,'[]'::jsonb))), array[]::text[])
$$;

create function saip_private.team_unique(input_values text[]) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array(
    select distinct btrim(value)
    from unnest(coalesce(input_values,array[]::text[])) value
    where btrim(value)<>''
    order by 1
  ), array[]::text[])
$$;

create function saip_private.team_uuid_array(input_values text[]) returns uuid[]
language sql immutable set search_path = '' as $$
  select coalesce(array(
    select value::uuid
    from unnest(saip_private.team_unique(input_values)) value
  ), array[]::uuid[])
$$;

create function saip_private.team_slug(value text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  output text := '';
  ch text;
  idx integer := 1;
  hyphen boolean := false;
begin
  value := lower(coalesce(value,''));
  while idx <= char_length(value) loop
    ch := substr(value, idx, 1);
    if ch ~ '[a-z0-9가-힣]' then
      output := output || ch;
      hyphen := false;
    elsif output <> '' and not hyphen then
      output := output || '-';
      hyphen := true;
    end if;
    idx := idx + 1;
  end loop;
  output := regexp_replace(output, '-+$', '');
  if output = '' then return 'item'; end if;
  return output;
end $$;

create function saip_private.team_put(c text, i text, d jsonb, reader_ids text[]) returns void
language plpgsql set search_path = '' as $$
declare
  normalized text[] := saip_private.team_unique(reader_ids);
begin
  perform saip_private.put(
    c,
    i,
    d || jsonb_build_object('id', i, 'readers', to_jsonb(normalized)),
    saip_private.team_uuid_array(normalized)
  );
end $$;

create function saip_private.team_require_account(user_id uuid) returns jsonb
language plpgsql set search_path = '' as $$
begin
  return saip_private.get('accounts', user_id::text);
end $$;

create function saip_private.team_require_uncle(user_id uuid) returns jsonb
language plpgsql set search_path = '' as $$
declare
  account jsonb;
begin
  account := saip_private.team_require_account(user_id);
  if saip_private.s(account,'role') <> 'uncle' or not saip_private.b(account,'complete') then
    raise exception '사입삼촌만 팀 기능을 사용할 수 있어요.';
  end if;
  return account;
end $$;

create function saip_private.team_active_team_id(user_id uuid) returns text
language sql stable set search_path = '' as $$
  select id
  from public.saip_records
  where collection = 'teams'
    and data->>'status' = 'active'
    and user_id::text = any(saip_private.team_texts(data,'memberIds'))
  order by updated_at desc, id desc
  limit 1
$$;

create function saip_private.team_get_locked(c text, i text) returns jsonb
language plpgsql set search_path = '' as $$
declare
  row_data jsonb;
begin
  select data into row_data from public.saip_records where collection = c and id = i for update;
  if row_data is null then
    raise exception '기록을 찾을 수 없어요. 목록을 다시 확인해 주세요.';
  end if;
  return row_data;
end $$;

create function saip_private.team_require_team(team_id text, user_id uuid) returns jsonb
language plpgsql set search_path = '' as $$
declare
  team jsonb;
begin
  team := saip_private.team_get_locked('teams', team_id);
  if saip_private.s(team,'status') <> 'active'
     or not (user_id::text = any(saip_private.team_texts(team,'memberIds'))) then
    raise exception '이 팀의 공동 업무를 볼 수 없어요.';
  end if;
  return team;
end $$;

create function saip_private.team_require_member(team jsonb, member_id text) returns void
language plpgsql set search_path = '' as $$
begin
  if member_id = '' or not (member_id = any(saip_private.team_texts(team,'memberIds'))) then
    raise exception '같은 팀의 삼촌만 선택해 주세요.';
  end if;
end $$;

create function saip_private.team_require_admin(team jsonb, user_id uuid) returns void
language plpgsql set search_path = '' as $$
begin
  if not (user_id::text = any(saip_private.team_texts(team,'adminIds'))) then
    raise exception '팀장이나 운영자만 처리할 수 있어요.';
  end if;
end $$;

create function saip_private.team_require_round(team_id text, round_id text) returns void
language plpgsql set search_path = '' as $$
declare
  round_row jsonb;
begin
  if coalesce(round_id, '') = '' then return; end if;
  select data into round_row from public.saip_records
  where collection = 'teamRounds' and id = round_id for update;
  if round_row is null or round_row->>'teamId' is distinct from team_id
     or coalesce(round_row->>'status', 'active') <> 'active' then
    raise exception '같은 팀의 활성 회차만 선택해 주세요.';
  end if;
end $$;

create function saip_private.team_require_area(team_id text, area_id text) returns void
language plpgsql set search_path = '' as $$
begin
  if coalesce(area_id, '') = '' then return; end if;
  if not exists(select 1 from public.saip_records
    where collection = 'teamAreas' and id = area_id and data->>'teamId' = team_id) then
    raise exception '같은 팀의 구역만 선택해 주세요.';
  end if;
end $$;

create function saip_private.team_colleague_id(a uuid, b uuid) returns text
language sql immutable set search_path = '' as $$
  select 'colleague:' || least(a::text,b::text) || ':' || greatest(a::text,b::text)
$$;

create function saip_private.team_accepted_colleague(a uuid, b uuid) returns jsonb
language plpgsql set search_path = '' as $$
declare
  row_data jsonb;
begin
  select data into row_data
  from public.saip_records
  where collection = 'colleagueConnections'
    and id = saip_private.team_colleague_id(a, b)
    and data->>'status' = 'accepted';
  return row_data;
end $$;

create function saip_private.team_sync_readers(team_id text) returns void
language plpgsql set search_path = '' as $$
declare
  team jsonb;
  reader_ids text[];
  entry record;
  extra text[];
  next_data jsonb;
begin
  team := saip_private.team_get_locked('teams', team_id);
  reader_ids := saip_private.team_texts(team,'memberIds');
  perform saip_private.team_put('teams', team_id, team, reader_ids);
  for entry in
    select collection, id, data
    from public.saip_records
    where collection = any(array['teamInvites','teamChats','teamRounds','teamAreas','teamJobs','teamPackages','teamHandoffs','teamReceipts'])
      and data->>'teamId' = team_id
    for update
  loop
    if entry.collection = 'teamInvites' then
      extra := saip_private.team_unique(array_cat(reader_ids, array[coalesce(entry.data->>'inviteeId','')]));
    elsif entry.collection = 'teamReceipts' then
      extra := saip_private.team_unique(array_cat(reader_ids, array[coalesce(entry.data->>'confirmedBy','')]));
    else
      extra := reader_ids;
    end if;
    next_data := entry.data;
    if entry.data ? 'readerIds' then
      next_data := next_data || jsonb_build_object('readerIds', to_jsonb(extra));
    end if;
    perform saip_private.team_put(entry.collection, entry.id, next_data, extra);
  end loop;
end $$;

create function saip_private.team_account_label(user_id text) returns text
language plpgsql stable set search_path = '' as $$
declare
  account jsonb;
  nickname text;
  label text;
begin
  if btrim(coalesce(user_id,'')) = '' then
    return '미지정';
  end if;
  select data into account from public.saip_records where collection = 'accounts' and id = user_id;
  if account is null then
    return user_id;
  end if;
  nickname := btrim(coalesce(account->>'nickname',''));
  if nickname <> '' then
    return nickname;
  end if;
  label := btrim(coalesce(account->>'name', account->>'label', user_id));
  return case when label = '' then user_id else label end;
end $$;

create function saip_private.team_join_nonempty(input_values text[], separator text default ' · ') returns text
language sql immutable set search_path = '' as $$
  select coalesce(
    array_to_string(
      array(
        select btrim(value)
        from unnest(coalesce(input_values, array[]::text[])) value
        where btrim(value) <> ''
      ),
      separator
    ),
    ''
  )
$$;

create function saip_private.team_job_area_label(job jsonb) returns text
language plpgsql stable set search_path = '' as $$
declare
  area_id text := btrim(coalesce(job->>'areaId',''));
  area jsonb;
begin
  if area_id = '' then
    return '미지정';
  end if;
  select data into area from public.saip_records where collection = 'teamAreas' and id = area_id;
  if area is null then
    return area_id;
  end if;
  return coalesce(nullif(btrim(area->>'name'),''), area_id);
end $$;

create function saip_private.team_job_target_label(job jsonb) returns text
language sql immutable set search_path = '' as $$
  select coalesce(
    nullif(
      saip_private.team_join_nonempty(array[
        coalesce(job->>'retailerName',''),
        coalesce(job->>'wholesalerName',''),
        coalesce(job->>'wholesalerLocation','')
      ]),
      ''
    ),
    '대상 미확인'
  )
$$;

create function saip_private.team_package_summary(package_row jsonb) returns text
language sql immutable set search_path = '' as $$
  select coalesce(nullif(btrim(coalesce(package_row->>'packageLabel','')),''), coalesce(package_row->>'id',''))
    || ' '
    || coalesce(package_row->>'quantity','0')
    || coalesce(nullif(package_row->>'unit',''),'묶음')
$$;

create function saip_private.team_package_summary_list(package_ids text[]) returns text
language plpgsql stable set search_path = '' as $$
declare
  package_id text;
  package_row jsonb;
  summaries text[] := array[]::text[];
begin
  foreach package_id in array coalesce(package_ids, array[]::text[]) loop
    select data into package_row from public.saip_records where collection = 'teamPackages' and id = package_id;
    if package_row is null then
      continue;
    end if;
    summaries := array_append(summaries, saip_private.team_package_summary(package_row));
  end loop;
  if array_length(summaries, 1) is null then
    return '없음';
  end if;
  return array_to_string(summaries, ', ');
end $$;

create function saip_private.team_single_request_id_for_packages(package_ids text[]) returns text
language plpgsql stable set search_path = '' as $$
declare
  package_id text;
  package_row jsonb;
  request_ids text[] := array[]::text[];
begin
  foreach package_id in array coalesce(package_ids, array[]::text[]) loop
    select data into package_row from public.saip_records where collection = 'teamPackages' and id = package_id;
    if package_row is null then
      continue;
    end if;
    request_ids := saip_private.team_unique(array_cat(request_ids, array[coalesce(package_row->>'requestId','')]));
  end loop;
  if array_length(request_ids, 1) = 1 then
    return request_ids[1];
  end if;
  return '';
end $$;

create function saip_private.team_put_source_card(
  team_id text,
  actor uuid,
  card_id text,
  source_type text,
  source_id text,
  request_id text,
  card_type text,
  body text,
  reader_ids text[],
  unread_target_ids text[] default array[]::text[]
) returns void
language plpgsql set search_path = '' as $$
declare
  normalized_readers text[] := saip_private.team_unique(reader_ids);
  normalized_unread text[] := saip_private.team_unique(unread_target_ids);
begin
  if exists(select 1 from public.saip_records where collection = 'teamChats' and id = card_id) then
    return;
  end if;
  perform saip_private.team_put('teamChats', card_id, jsonb_build_object(
    'teamId', team_id,
    'chatType', 'team',
    'kind', 'system',
    'senderId', actor::text,
    'sourceType', source_type,
    'sourceId', source_id,
    'requestId', coalesce(request_id,''),
    'cardType', card_type,
    'body', body,
    'createdAt', clock_timestamp(),
    'updatedAt', clock_timestamp(),
    'version', 0,
    'readBy', to_jsonb(coalesce(array(
      select reader
      from unnest(normalized_readers) reader
      where reader = actor::text
         or not (reader = any(normalized_unread))
    ), array[]::text[]))
  ), normalized_readers);
end $$;

create function saip_private.team_job_started(job jsonb) returns boolean
language plpgsql stable set search_path = '' as $$
begin
  if coalesce(job->>'status', 'queued') not in ('queued','assigned') then
    return true;
  end if;
  if exists(
    select 1 from public.saip_records
    where collection = 'teamPackages'
      and data->>'jobId' = coalesce(job->>'id','')
  ) then
    return true;
  end if;
  if exists(
    select 1 from public.saip_records
    where collection = 'fieldPayments'
      and data->>'requestId' = coalesce(job->>'requestId','')
      and data->>'teamId' = coalesce(job->>'teamId','')
  ) then
    return true;
  end if;
  return false;
end $$;

create function saip_private.team_member_load(member_id text) returns integer
language sql stable set search_path = '' as $$
  select count(*)::integer
  from public.saip_records
  where collection = 'teamJobs'
    and coalesce(data->>'status','') not in ('archived','received')
    and member_id = any(array[coalesce(data->>'pickupAssigneeId',''), coalesce(data->>'finalAssigneeId','')])
$$;

create function saip_private.team_before_cutoff(value text) returns boolean
language plpgsql stable set search_path = '' as $$
declare
  trimmed text := btrim(coalesce(value, ''));
  parsed timestamptz;
  parts text[];
  cutoff timestamptz;
begin
  if trimmed = '' then
    return true;
  end if;
  if position('T' in trimmed) > 0 then
    begin
      parsed := trimmed::timestamptz;
    exception when others then
      return true;
    end;
    return clock_timestamp() <= parsed;
  end if;
  parts := string_to_array(trimmed, ':');
  if coalesce(array_length(parts, 1), 0) <> 2 then
    return true;
  end if;
  begin
    cutoff := date_trunc('day', clock_timestamp())
      + make_interval(hours => parts[1]::integer, mins => parts[2]::integer);
  exception when others then
    return true;
  end;
  return clock_timestamp() <= cutoff;
end $$;

create function saip_private.team_member_available_for_area(area jsonb, member_id text, primary_role boolean) returns boolean
language plpgsql stable set search_path = '' as $$
declare
  working_key text := case when primary_role then 'primaryWorking' else 'backupWorking' end;
  capacity_key text := case when primary_role then 'primaryCapacity' else 'backupCapacity' end;
  cutoff_key text := case when primary_role then 'primaryCutoffAt' else 'backupCutoffAt' end;
  capacity integer := greatest(coalesce((area->>capacity_key)::integer, 0), 0);
begin
  if btrim(coalesce(member_id, '')) = '' then
    return false;
  end if;
  if not coalesce((area->>working_key)::boolean, false) then
    return false;
  end if;
  if not saip_private.team_before_cutoff(area->>cutoff_key) then
    return false;
  end if;
  if capacity > 0 and saip_private.team_member_load(member_id) >= capacity then
    return false;
  end if;
  return true;
end $$;

create function saip_private.team_area_matches_job(area jsonb, job jsonb) returns boolean
language plpgsql stable set search_path = '' as $$
declare
  haystack text := lower(coalesce(job->>'wholesalerName','') || ' ' || coalesce(job->>'wholesalerLocation',''));
  keywords text[] := saip_private.team_texts(area, 'matchKeywords');
  keyword text;
begin
  if array_length(keywords, 1) is null then
    keywords := array[coalesce(area->>'name','')];
  else
    keywords := saip_private.team_unique(array_cat(array[coalesce(area->>'name','')], keywords));
  end if;
  foreach keyword in array keywords loop
    if btrim(coalesce(keyword, '')) <> '' and position(lower(btrim(keyword)) in haystack) > 0 then
      return true;
    end if;
  end loop;
  return false;
end $$;

create function saip_private.team_block_if_pending(team_id text, user_id uuid) returns void
language plpgsql set search_path = '' as $$
declare
  row_data jsonb;
begin
  for row_data in
    select data from public.saip_records where collection = 'teamJobs' and data->>'teamId' = team_id
  loop
    if row_data->>'status' <> 'received'
       and user_id::text = any(array[coalesce(row_data->>'pickupAssigneeId',''), coalesce(row_data->>'finalAssigneeId','')]) then
      raise exception '진행 중인 배정이 남아 있어 팀을 바로 나갈 수 없어요. 인계와 정산을 먼저 끝내 주세요.';
    end if;
  end loop;
  for row_data in
    select data from public.saip_records where collection = 'teamPackages' and data->>'teamId' = team_id
  loop
    if row_data->>'status' = any(array['queued','assigned','picked','held','delivery_ready','handoff_requested','handoff_partial','delivered'])
       and user_id::text = any(array[coalesce(row_data->>'currentHolderId',''), coalesce(row_data->>'finalAssigneeId','')]) then
      raise exception '보관 중이거나 전달 전인 물건이 남아 있어 팀을 바로 나갈 수 없어요. 실제 인계를 먼저 확인해 주세요.';
    end if;
  end loop;
  for row_data in
    select data from public.saip_records where collection = 'teamHandoffs' and data->>'teamId' = team_id
  loop
    if row_data->>'status' = any(array['pending','partial'])
       and user_id::text = any(array[coalesce(row_data->>'fromId',''), coalesce(row_data->>'toId','')]) then
      raise exception '인계 확인이 끝나지 않아 팀을 바로 나갈 수 없어요. 실제 받은 물건을 먼저 확인해 주세요.';
    end if;
  end loop;
  if exists(select 1 from public.saip_records
    where collection = 'reimbursements' and data->>'teamId' = team_id
      and coalesce(data->>'status', '') <> 'settled'
      and user_id::text = any(array[data->>'fromId', data->>'toId'])) then
    raise exception '개인 대납이나 팀 정산이 아직 남아 있어 팀을 바로 나갈 수 없어요. 먼저 반환과 회수를 끝내 주세요.';
  end if;
end $$;

create function saip_private.team_require_accepted_request(request_id text) returns jsonb
language plpgsql set search_path = '' as $$
declare
  request_row jsonb;
begin
  request_row := saip_private.team_get_locked('requests', request_id);
  if request_row->>'status' <> 'accepted' then
    raise exception '실제로 수락되어 진행 중인 요청만 팀 업무로 정리할 수 있어요.';
  end if;
  return request_row;
end $$;

create function saip_private.team_pickup_seed(request_row jsonb, team jsonb, args jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  uncle_id text := coalesce(request_row->>'uncleId','');
  retailer jsonb;
  rows jsonb := request_row->'wholesalers';
  selected jsonb;
  wholesaler_index integer;
  requested_name text := btrim(coalesce(args->>'wholesalerName',''));
begin
  perform saip_private.team_require_member(team, uncle_id);
  select data into retailer from public.saip_records
  where collection = 'accounts' and id = request_row->>'retailerId';
  if jsonb_typeof(rows) = 'array' and jsonb_array_length(rows) > 0 then
    wholesaler_index := coalesce((args->>'wholesalerIndex')::integer, 0);
    if wholesaler_index < 0 or wholesaler_index >= jsonb_array_length(rows) then
      raise exception '요청에 없는 도매처라 팀 업무로 옮길 수 없어요.';
    end if;
    selected := rows -> wholesaler_index;
  else
    if coalesce(request_row->>'wholesaler','') = '' then
      raise exception '도매처 정보가 없는 요청은 팀 업무로 정리할 수 없어요.';
    end if;
    wholesaler_index := 0;
    selected := jsonb_build_object(
      'wholesaler', coalesce(request_row->>'wholesaler',''),
      'location', coalesce(request_row->>'location','')
    );
  end if;
  if coalesce(selected->>'wholesaler','') = '' then
    raise exception '도매처 정보가 없는 요청은 팀 업무로 정리할 수 없어요.';
  end if;
  if requested_name <> '' and requested_name <> selected->>'wholesaler' then
    raise exception '요청에 없는 도매처라 팀 업무로 옮길 수 없어요.';
  end if;
  return jsonb_build_object(
    'retailerId', coalesce(request_row->>'retailerId',''),
    'retailerName', coalesce(
      nullif(btrim(request_row->>'receivingShop'), ''),
      nullif(btrim(request_row->>'businessName'), ''),
      nullif(btrim(request_row->>'name'), ''),
      nullif(btrim(retailer->>'businessName'), ''),
      nullif(btrim(retailer->>'name'), ''),
      nullif(btrim(retailer->>'label'), ''),
      '소매 상호'
    ),
    'wholesalerName', selected->>'wholesaler',
    'wholesalerLocation', coalesce(selected->>'location',''),
    'requestUncleId', uncle_id,
    'wholesalerIndex', wholesaler_index
  );
end $$;

create function saip_private.team_recompute_job_status(job_id text) returns void
language plpgsql set search_path = '' as $$
declare
  job jsonb;
  statuses text[];
  next_status text;
begin
  select data into job from public.saip_records where collection = 'teamJobs' and id = job_id for update;
  if job is null then return; end if;
  select coalesce(array_agg(data->>'status'), array[]::text[]) into statuses
  from public.saip_records where collection = 'teamPackages' and data->>'jobId' = job_id;
  if array_length(statuses, 1) is null then return; end if;
  if not exists(select 1 from unnest(statuses) status where status <> 'received') then
    next_status := case when saip_private.b(job, 'scopeConfirmed')
      and not saip_private.b(job, 'hasBackorder')
      and saip_private.n(job, 'expectedPackageCount') > 0
      and saip_private.n(job, 'expectedPackageCount') = cardinality(statuses)
      and not exists(select 1 from public.saip_records
        where collection = 'issues' and data->>'jobId' = job_id
          and coalesce(data->>'status', 'open') <> 'resolved')
      then 'received' else 'issue' end;
  elsif not exists(select 1 from unnest(statuses) status where status <> all(array['delivered','received'])) then
    next_status := 'delivered';
  elsif exists(select 1 from unnest(statuses) status where status = 'handoff_requested') then
    next_status := 'handoff_requested';
  elsif exists(select 1 from unnest(statuses) status where status = 'delivery_ready') then
    next_status := 'delivery_ready';
  elsif exists(select 1 from unnest(statuses) status where status = any(array['picked','held'])) then
    next_status := 'picked';
  else
    next_status := coalesce(job->>'status','assigned');
  end if;
  perform saip_private.team_put(
    'teamJobs',
    job_id,
    job || jsonb_build_object(
      'status', next_status,
      'updatedAt', clock_timestamp(),
      'version', saip_private.n(job,'version') + 1
    ),
    saip_private.team_texts(job,'readers')
  );
end $$;

create function saip_private.team_command(command text, args jsonb, actor uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  normalized text := case when command like 'wf.%' then substr(command, 4) else command end;
  invite_status text;
  result text := '';
  peer_id text;
  team_id text;
  team jsonb;
  previous jsonb;
  invite jsonb;
  active_team_id text;
  members text[];
  admins text[];
  colleague_id text;
  row_data jsonb;
  round_id text;
  area_id text;
  label text;
  body text;
  read_by text[];
  request_id text;
  request_row jsonb;
  seed jsonb;
  job_id text;
  job jsonb;
  pickup_assignee_id text;
  final_assignee_id text;
  package_id text;
  package_row jsonb;
  handoff_id text;
  handoff jsonb;
  package_ids text[];
  accepted_ids text[];
  pending_ids text[];
  confirmed_ids text[];
  package_team_id text;
  note text;
  retailer_account jsonb;
  previous_holder text;
  next_holder text;
  next_status text;
  version_text text;
  package_version integer;
  card_id text;
  reason text;
  request_ids text[];
  expected_package_count integer;
  entry record;
begin
  if actor is null then raise exception '로그인이 필요해요.'; end if;
  if args is null or jsonb_typeof(args) <> 'object' then
    raise exception '작업 정보를 확인해 주세요.';
  end if;

  if normalized <> 'recordPackageReceipt' then
    perform saip_private.team_require_uncle(actor);
  end if;

  case normalized
    when 'connectColleague' then
      peer_id := btrim(coalesce(args->>'peerId',''));
      if peer_id = '' then raise exception 'peerId 값을 확인해 주세요.'; end if;
      if peer_id = actor::text then raise exception '본인을 사입 동료로 추가할 수 없어요.'; end if;
      perform saip_private.team_require_account(peer_id::uuid);
      perform saip_private.team_require_uncle(peer_id::uuid);
      colleague_id := saip_private.team_colleague_id(actor, peer_id::uuid);
      select data into previous from public.saip_records where collection = 'colleagueConnections' and id = colleague_id for update;
      if previous is not null and coalesce(previous->>'status','') = any(array['pending','accepted']) then
        if previous->>'status' = 'accepted' then
          raise exception '이미 연결된 사입 동료예요.';
        end if;
        raise exception '이미 수락을 기다리고 있어요.';
      end if;
      perform saip_private.team_put('colleagueConnections', colleague_id, jsonb_build_object(
        'fromId', actor::text,
        'toId', peer_id,
        'status', 'pending',
        'createdAt', coalesce(previous->>'createdAt', clock_timestamp()::text),
        'updatedAt', clock_timestamp(),
        'version', coalesce(saip_private.n(previous,'version'), 0) + 1
      ), array[actor::text, peer_id]);
      result := colleague_id;

    when 'respondColleagueConnection' then
      result := btrim(coalesce(args->>'id',''));
      invite_status := btrim(coalesce(args->>'status',''));
      if result = '' then raise exception 'id 값을 확인해 주세요.'; end if;
      if invite_status not in ('accepted','declined') then raise exception '연결 응답 상태를 다시 확인해 주세요.'; end if;
      row_data := saip_private.team_get_locked('colleagueConnections', result);
      perform saip_private.version(row_data, nullif(args->>'version','')::integer);
      if coalesce(row_data->>'toId','') <> actor::text or coalesce(row_data->>'status','') <> 'pending' then
        raise exception '받은 연결 요청만 처리할 수 있어요.';
      end if;
      perform saip_private.team_put('colleagueConnections', result, row_data || jsonb_build_object(
        'status', invite_status,
        'updatedAt', clock_timestamp(),
        'version', saip_private.n(row_data,'version') + 1
      ), saip_private.team_texts(row_data,'readers'));

    when 'createTeam' then
      if saip_private.team_active_team_id(actor) is not null then
        raise exception '한 번에 하나의 활성 팀만 운영할 수 있어요. 먼저 기존 팀을 정리해 주세요.';
      end if;
      label := btrim(coalesce(args->>'name',''));
      if label = '' then raise exception 'name 값을 확인해 주세요.'; end if;
      team_id := nullif(btrim(coalesce(args->>'teamId','')), '');
      if team_id is null then team_id := 'team:' || saip_private.team_slug(label) || ':' || replace(gen_random_uuid()::text, '-', ''); end if;
      if exists(select 1 from public.saip_records where collection = 'teams' and id = team_id) then
        raise exception '이미 사용 중인 팀 식별자예요. 새 팀으로 다시 만들어 주세요.';
      end if;
      perform saip_private.team_put('teams', team_id, jsonb_build_object(
        'name', label,
        'description', coalesce(args->>'description',''),
        'ownerId', actor::text,
        'adminIds', to_jsonb(array[actor::text]),
        'memberIds', to_jsonb(array[actor::text]),
        'status', 'active',
        'createdAt', clock_timestamp(),
        'updatedAt', clock_timestamp(),
        'version', 0
      ), array[actor::text]);
      perform saip_private.team_put('teamChats', 'team-chat:' || team_id, jsonb_build_object(
        'teamId', team_id,
        'chatType', 'team',
        'kind', 'system',
        'senderId', actor::text,
        'body', '팀이 만들어졌어요. 초대 전까지 팀장만 볼 수 있어요.',
        'createdAt', clock_timestamp(),
        'updatedAt', clock_timestamp(),
        'version', 0,
        'readBy', to_jsonb(array[actor::text])
      ), array[actor::text]);
      result := team_id;

    when 'inviteTeamMember' then
      team_id := btrim(coalesce(args->>'teamId',''));
      peer_id := btrim(coalesce(args->>'inviteeId',''));
      if team_id = '' or peer_id = '' then raise exception 'teamId 값을 확인해 주세요.'; end if;
      team := saip_private.team_require_team(team_id, actor);
      perform saip_private.team_require_admin(team, actor);
      perform saip_private.team_require_uncle(peer_id::uuid);
      if peer_id = actor::text then raise exception '본인에게 팀 초대를 보낼 수 없어요.'; end if;
      if peer_id = any(saip_private.team_texts(team,'memberIds')) then raise exception '이미 같은 팀에 참여 중인 동료예요.'; end if;
      if saip_private.team_accepted_colleague(actor, peer_id::uuid) is null then
        raise exception '연결된 사입 동료에게만 요청하거나 대화할 수 있어요.';
      end if;
      active_team_id := saip_private.team_active_team_id(peer_id::uuid);
      if active_team_id is not null and active_team_id <> team_id then
        raise exception '상대방이 이미 다른 팀에서 활동 중이에요.';
      end if;
      result := 'team-invite:' || team_id || ':' || peer_id;
      select data into previous from public.saip_records where collection = 'teamInvites' and id = result for update;
      if previous is not null and coalesce(previous->>'status','') = 'pending' then
        raise exception '이미 응답을 기다리는 팀 초대예요.';
      end if;
      perform saip_private.team_put('teamInvites', result, jsonb_build_object(
        'teamId', team_id,
        'inviterId', actor::text,
        'inviteeId', peer_id,
        'kind', 'invite',
        'status', 'pending',
        'note', coalesce(args->>'note',''),
        'createdAt', coalesce(previous->>'createdAt', clock_timestamp()::text),
        'updatedAt', clock_timestamp(),
        'version', coalesce(saip_private.n(previous,'version'), 0) + 1
      ), saip_private.team_unique(array_cat(saip_private.team_texts(team,'memberIds'), array[peer_id])));

    when 'requestTeamMembership' then
      team_id := btrim(coalesce(args->>'teamId',''));
      if team_id = '' then raise exception 'teamId 값을 확인해 주세요.'; end if;
      team := saip_private.team_get_locked('teams', team_id);
      if coalesce(team->>'status', 'active') <> 'active' then
        raise exception '이미 정리된 팀에는 참여 요청을 보낼 수 없어요.';
      end if;
      if actor::text = any(saip_private.team_texts(team, 'memberIds')) then
        raise exception '이미 이 팀에 참여 중이에요.';
      end if;
      if saip_private.team_active_team_id(actor) is not null then
        raise exception '한 번에 하나의 활성 팀만 참여할 수 있어요.';
      end if;
      peer_id := coalesce(nullif(btrim(args->>'approverId'), ''), team->>'ownerId');
      perform saip_private.team_require_member(team, peer_id);
      if saip_private.team_accepted_colleague(actor, peer_id::uuid) is null then
        raise exception '연결된 사입 동료에게만 요청하거나 대화할 수 있어요.';
      end if;
      result := 'team-membership:' || team_id || ':' || actor::text;
      select data into previous from public.saip_records where collection = 'teamInvites' and id = result for update;
      if previous is not null and previous->>'status' = 'pending' then
        raise exception '이미 응답을 기다리는 팀 참여 요청이에요.';
      end if;
      perform saip_private.team_put('teamInvites', result, jsonb_build_object(
        'teamId', team_id, 'inviterId', actor::text, 'inviteeId', actor::text,
        'approverId', peer_id, 'kind', 'membership_request', 'status', 'pending',
        'note', coalesce(args->>'note', ''),
        'createdAt', coalesce(previous->>'createdAt', clock_timestamp()::text),
        'updatedAt', clock_timestamp(),
        'version', coalesce(saip_private.n(previous, 'version'), 0) + 1
      ), saip_private.team_unique(array_cat(saip_private.team_texts(team, 'memberIds'), array[actor::text])));

    when 'respondTeamInvite' then
      result := btrim(coalesce(args->>'id',''));
      invite_status := btrim(coalesce(args->>'status',''));
      if result = '' then raise exception 'id 값을 확인해 주세요.'; end if;
      if invite_status not in ('accepted','declined') then raise exception '팀 초대 응답 상태를 다시 확인해 주세요.'; end if;
      invite := saip_private.team_get_locked('teamInvites', result);
      perform saip_private.version(invite, nullif(args->>'version','')::integer);
      if coalesce(invite->>'status','') <> 'pending' then
        raise exception '대기 중인 요청만 처리할 수 있어요.';
      end if;
      team_id := invite->>'teamId';
      team := saip_private.team_get_locked('teams', team_id);
      if coalesce(team->>'status','') <> 'active' then raise exception '이미 정리된 팀이라 참여할 수 없어요.'; end if;
      if coalesce(invite->>'kind', 'invite') = 'membership_request' then
        perform saip_private.team_require_team(team_id, actor);
        perform saip_private.team_require_admin(team, actor);
      elsif coalesce(invite->>'inviteeId','') <> actor::text then
        raise exception '받은 팀 초대만 처리할 수 있어요.';
      end if;
      if invite_status = 'accepted' then
        peer_id := invite->>'inviteeId';
        perform saip_private.team_require_uncle(peer_id::uuid);
        active_team_id := saip_private.team_active_team_id(peer_id::uuid);
        if active_team_id is not null and active_team_id <> team_id then
          raise exception '한 번에 하나의 활성 팀만 참여할 수 있어요.';
        end if;
        members := saip_private.team_unique(array_cat(saip_private.team_texts(team,'memberIds'), array[peer_id]));
        perform saip_private.team_put('teams', team_id, team || jsonb_build_object(
          'memberIds', to_jsonb(members),
          'updatedAt', clock_timestamp(),
          'version', saip_private.n(team,'version') + 1
        ), members);
        perform saip_private.team_sync_readers(team_id);
      end if;
      perform saip_private.team_put('teamInvites', result, invite || jsonb_build_object(
        'status', invite_status,
        'respondedBy', actor::text,
        'updatedAt', clock_timestamp(),
        'version', saip_private.n(invite,'version') + 1
      ), saip_private.team_texts(invite,'readers'));
      if invite_status = 'accepted' then
        perform saip_private.team_sync_readers(team_id);
      end if;
      result := team_id;

    when 'leaveTeam' then
      team_id := btrim(coalesce(args->>'teamId',''));
      if team_id = '' then raise exception 'teamId 값을 확인해 주세요.'; end if;
      team := saip_private.team_require_team(team_id, actor);
      if nullif(args->>'version','') is not null then
        perform saip_private.version(team, (args->>'version')::integer);
      end if;
      perform saip_private.team_block_if_pending(team_id, actor);
      members := array_remove(saip_private.team_texts(team,'memberIds'), actor::text);
      admins := array_remove(saip_private.team_texts(team,'adminIds'), actor::text);
      if coalesce(team->>'ownerId','') = actor::text and array_length(members, 1) is not null then
        raise exception '팀장은 먼저 물건과 권한을 넘긴 뒤 팀 정리를 완료해 주세요.';
      end if;
      perform saip_private.team_put('teams', team_id, team || jsonb_build_object(
        'memberIds', to_jsonb(coalesce(members, array[]::text[])),
        'adminIds', to_jsonb(coalesce(admins, array[]::text[])),
        'status', case when array_length(members, 1) is null then 'archived' else coalesce(team->>'status','active') end,
        'updatedAt', clock_timestamp(),
        'version', saip_private.n(team,'version') + 1
      ), coalesce(members, array[]::text[]));
      perform saip_private.team_sync_readers(team_id);
      result := team_id;

    when 'sendColleagueMessage' then
      peer_id := btrim(coalesce(args->>'peerId',''));
      body := btrim(coalesce(args->>'body',''));
      if peer_id = '' or body = '' then raise exception 'peerId 값을 확인해 주세요.'; end if;
      if saip_private.team_accepted_colleague(actor, peer_id::uuid) is null then
        raise exception '연결된 사입 동료에게만 요청하거나 대화할 수 있어요.';
      end if;
      result := nullif(btrim(coalesce(args->>'id','')), '');
      if result is null then result := 'colleague-chat:' || replace(gen_random_uuid()::text, '-', ''); end if;
      if exists(select 1 from public.saip_records where collection = 'teamChats' and id = result) then return result; end if;
      perform saip_private.team_put('teamChats', result, jsonb_build_object(
        'chatType', 'colleague',
        'senderId', actor::text,
        'peerId', peer_id,
        'body', body,
        'kind', 'text',
        'createdAt', clock_timestamp(),
        'updatedAt', clock_timestamp(),
        'version', 0,
        'readBy', to_jsonb(array[actor::text])
      ), array[actor::text, peer_id]);

    when 'markColleagueChatRead' then
      peer_id := btrim(coalesce(args->>'peerId',''));
      if peer_id = '' then raise exception 'peerId 값을 확인해 주세요.'; end if;
      for entry in
        select data, id from public.saip_records where collection = 'teamChats' for update
      loop
        row_data := entry.data;
        result := entry.id;
        if coalesce(row_data->>'chatType','') <> 'colleague' then continue; end if;
        if not (actor::text = any(array[coalesce(row_data->>'senderId',''), coalesce(row_data->>'peerId','')])
           and peer_id = any(array[coalesce(row_data->>'senderId',''), coalesce(row_data->>'peerId','')])) then continue; end if;
        read_by := saip_private.team_unique(array_cat(saip_private.team_texts(row_data,'readBy'), array[actor::text]));
        perform saip_private.team_put('teamChats', result, row_data || jsonb_build_object(
          'readBy', to_jsonb(read_by),
          'updatedAt', clock_timestamp(),
          'version', saip_private.n(row_data,'version') + 1
        ), saip_private.team_texts(row_data,'readers'));
      end loop;
      result := peer_id;

    when 'sendTeamMessage' then
      team_id := btrim(coalesce(args->>'teamId',''));
      body := btrim(coalesce(args->>'body',''));
      if team_id = '' or body = '' then raise exception 'teamId 값을 확인해 주세요.'; end if;
      team := saip_private.team_require_team(team_id, actor);
      result := nullif(btrim(coalesce(args->>'id','')), '');
      if result is null then result := 'team-chat:' || replace(gen_random_uuid()::text, '-', ''); end if;
      if exists(select 1 from public.saip_records where collection = 'teamChats' and id = result) then return result; end if;
      perform saip_private.team_put('teamChats', result, jsonb_build_object(
        'teamId', team_id,
        'chatType', 'team',
        'senderId', actor::text,
        'body', body,
        'kind', 'text',
        'createdAt', clock_timestamp(),
        'updatedAt', clock_timestamp(),
        'version', 0,
        'readBy', to_jsonb(array[actor::text])
      ), saip_private.team_texts(team,'memberIds'));

    when 'markTeamChatRead' then
      team_id := btrim(coalesce(args->>'teamId',''));
      if team_id = '' then raise exception 'teamId 값을 확인해 주세요.'; end if;
      perform saip_private.team_require_team(team_id, actor);
      for entry in
        select data, id from public.saip_records where collection = 'teamChats' and data->>'teamId' = team_id for update
      loop
        row_data := entry.data;
        result := entry.id;
        if coalesce(row_data->>'chatType','') <> 'team' then continue; end if;
        read_by := saip_private.team_unique(array_cat(saip_private.team_texts(row_data,'readBy'), array[actor::text]));
        perform saip_private.team_put('teamChats', result, row_data || jsonb_build_object(
          'readBy', to_jsonb(read_by),
          'updatedAt', clock_timestamp(),
          'version', saip_private.n(row_data,'version') + 1
        ), saip_private.team_texts(row_data,'readers'));
      end loop;
      result := team_id;

    when 'createTeamRound' then
      team_id := btrim(coalesce(args->>'teamId',''));
      label := btrim(coalesce(args->>'label',''));
      if team_id = '' or label = '' then raise exception 'teamId 값을 확인해 주세요.'; end if;
      team := saip_private.team_require_team(team_id, actor);
      perform saip_private.team_require_admin(team, actor);
      result := nullif(btrim(coalesce(args->>'id','')), '');
      if result is null then result := 'team-round:' || team_id || ':' || saip_private.team_slug(label) || ':' || replace(gen_random_uuid()::text, '-', ''); end if;
      if exists(select 1 from public.saip_records where collection = 'teamRounds' and id = result) then
        raise exception '이미 사용 중인 회차 식별자예요. 새 회차로 다시 만들어 주세요.';
      end if;
      perform saip_private.team_put('teamRounds', result, jsonb_build_object(
        'teamId', team_id,
        'label', label,
        'operatingDate', coalesce(args->>'operatingDate',''),
        'receiverLabel', coalesce(args->>'receiverLabel',''),
        'status', 'active',
        'createdBy', actor::text,
        'createdAt', clock_timestamp(),
        'updatedAt', clock_timestamp(),
        'version', 0
      ), saip_private.team_texts(team,'memberIds'));

    when 'assignTeamArea' then
      team_id := btrim(coalesce(args->>'teamId',''));
      label := btrim(coalesce(args->>'name',''));
      if team_id = '' or label = '' then raise exception 'teamId 값을 확인해 주세요.'; end if;
      team := saip_private.team_require_team(team_id, actor);
      perform saip_private.team_require_admin(team, actor);
      peer_id := btrim(coalesce(args->>'primaryMemberId',''));
      if peer_id = '' then raise exception 'primaryMemberId 값을 확인해 주세요.'; end if;
      perform saip_private.team_require_member(team, peer_id);
      if btrim(coalesce(args->>'backupMemberId','')) <> '' then
        perform saip_private.team_require_member(team, btrim(args->>'backupMemberId'));
      end if;
      result := nullif(btrim(coalesce(args->>'id','')), '');
      if result is null then result := 'team-area:' || team_id || ':' || saip_private.team_slug(label); end if;
      select data into previous from public.saip_records where collection = 'teamAreas' and id = result for update;
      if previous is not null then
        if previous->>'teamId' is distinct from team_id then
          raise exception '다른 팀의 구역을 변경할 수 없어요.';
        end if;
        perform saip_private.version(previous, nullif(args->>'version','')::integer);
      end if;
      perform saip_private.team_put('teamAreas', result, coalesce(previous,'{}'::jsonb) || jsonb_build_object(
        'teamId', team_id,
        'name', label,
        'primaryMemberId', peer_id,
        'backupMemberId', coalesce(args->>'backupMemberId',''),
        'primaryWorking', coalesce((args->>'primaryWorking')::boolean, true),
        'backupWorking', coalesce((args->>'backupWorking')::boolean, false),
        'primaryCapacity', coalesce((args->>'primaryCapacity')::integer, (previous->>'primaryCapacity')::integer, 0),
        'backupCapacity', coalesce((args->>'backupCapacity')::integer, (previous->>'backupCapacity')::integer, 0),
        'primaryCutoffAt', coalesce(nullif(btrim(args->>'primaryCutoffAt'), ''), previous->>'primaryCutoffAt', ''),
        'backupCutoffAt', coalesce(nullif(btrim(args->>'backupCutoffAt'), ''), previous->>'backupCutoffAt', ''),
        'matchKeywords', to_jsonb(saip_private.team_unique(
          saip_private.team_texts(previous, 'matchKeywords')
          || saip_private.team_texts(args, 'matchKeywords')
          || string_to_array(coalesce(args->>'matchKeywordsText', ''), ',')
        )),
        'updatedAt', clock_timestamp(),
        'createdAt', coalesce(previous->>'createdAt', clock_timestamp()::text),
        'version', coalesce(saip_private.n(previous,'version'), 0) + 1
      ), saip_private.team_texts(team,'memberIds'));

    when 'createPickupJob' then
      team_id := btrim(coalesce(args->>'teamId',''));
      request_id := btrim(coalesce(args->>'requestId',''));
      if team_id = '' or request_id = '' then raise exception 'teamId 값을 확인해 주세요.'; end if;
      team := saip_private.team_require_team(team_id, actor);
      perform saip_private.team_require_admin(team, actor);
      request_row := saip_private.team_require_accepted_request(request_id);
      seed := saip_private.team_pickup_seed(request_row, team, args);
      result := nullif(btrim(coalesce(args->>'id','')), '');
      if result is null then result := 'team-job:' || team_id || ':' || request_id || ':' || (seed->>'wholesalerIndex'); end if;
      select data into previous from public.saip_records where collection = 'teamJobs' and id = result for update;
      if previous is not null then
        raise exception '이미 사용 중인 업무 식별자예요. 기존 기록을 확인해 주세요.';
      end if;
      if exists(select 1 from public.saip_records where collection = 'teamJobs'
        and data->>'requestId' = request_id
        and coalesce((data->>'wholesalerIndex')::integer, 0) = (seed->>'wholesalerIndex')::integer
        and coalesce(data->>'status','') not in ('archived','received')) then
        raise exception '같은 요청의 같은 도매처는 한 번만 팀 업무로 정리할 수 있어요.';
      end if;
      round_id := btrim(coalesce(args->>'roundId', ''));
      area_id := btrim(coalesce(args->>'areaId', ''));
      perform saip_private.team_require_round(team_id, round_id);
      perform saip_private.team_require_area(team_id, area_id);
      pickup_assignee_id := btrim(coalesce(args->>'pickupAssigneeId', ''));
      final_assignee_id := btrim(coalesce(args->>'finalAssigneeId', ''));
      if pickup_assignee_id <> '' then perform saip_private.team_require_member(team, pickup_assignee_id); end if;
      if final_assignee_id <> '' then perform saip_private.team_require_member(team, final_assignee_id); end if;
      perform saip_private.team_put('teamJobs', result, jsonb_build_object(
        'teamId', team_id,
        'requestId', request_id,
        'roundId', round_id,
        'areaId', area_id,
        'wholesalerName', seed->>'wholesalerName',
        'wholesalerLocation', seed->>'wholesalerLocation',
        'retailerId', seed->>'retailerId',
        'retailerName', seed->>'retailerName',
        'requestUncleId', seed->>'requestUncleId',
        'wholesalerIndex', seed->'wholesalerIndex',
        'pickupAssigneeId', pickup_assignee_id,
        'finalAssigneeId', final_assignee_id,
        'assignmentReason', coalesce(args->>'assignmentReason',''),
        'autoAssignReason', '',
        'scopeConfirmed', false,
        'expectedPackageCount', 0,
        'hasBackorder', false,
        'note', coalesce(args->>'note',''),
        'status', 'queued',
        'createdBy', actor::text,
        'createdAt', clock_timestamp(),
        'updatedAt', clock_timestamp(),
        'version', 0
      ), saip_private.team_texts(team,'memberIds'));

    when 'assignPickupJob' then
      result := btrim(coalesce(args->>'id',''));
      if result = '' then raise exception 'id 값을 확인해 주세요.'; end if;
      job := saip_private.team_get_locked('teamJobs', result);
      perform saip_private.version(job, nullif(args->>'version','')::integer);
      team := saip_private.team_require_team(job->>'teamId', actor);
      perform saip_private.team_require_admin(team, actor);
      pickup_assignee_id := btrim(coalesce(args->>'pickupAssigneeId',''));
      final_assignee_id := btrim(coalesce(args->>'finalAssigneeId',''));
      if pickup_assignee_id = '' or final_assignee_id = '' then raise exception 'pickupAssigneeId 값을 확인해 주세요.'; end if;
      perform saip_private.team_require_member(team, pickup_assignee_id);
      perform saip_private.team_require_member(team, final_assignee_id);
      if coalesce(job->>'pickupAssigneeId','') <> ''
         and coalesce(job->>'pickupAssigneeId','') <> pickup_assignee_id
         and saip_private.team_job_started(job) then
        raise exception '이미 픽업을 시작했거나 현장 지급이 생긴 업무는 자동 재배정할 수 없어요. 남은 작업만 따로 처리해 주세요.';
      end if;
      round_id := coalesce(nullif(btrim(args->>'roundId'), ''), job->>'roundId', '');
      area_id := coalesce(nullif(btrim(args->>'areaId'), ''), job->>'areaId', '');
      perform saip_private.team_require_round(job->>'teamId', round_id);
      perform saip_private.team_require_area(job->>'teamId', area_id);
      job := job || jsonb_build_object(
        'roundId', round_id,
        'areaId', area_id,
        'pickupAssigneeId', pickup_assignee_id,
        'finalAssigneeId', final_assignee_id,
        'assignmentReason', coalesce(nullif(args->>'assignmentReason',''), job->>'assignmentReason', ''),
        'autoAssignReason', '',
        'status', case when saip_private.team_job_started(job) then job->>'status' else 'assigned' end,
        'updatedAt', clock_timestamp(),
        'version', saip_private.n(job,'version') + 1
      );
      perform saip_private.team_put('teamJobs', result, job, saip_private.team_texts(job,'readers'));
      reason := coalesce(nullif(job->>'assignmentReason',''), '수동 배정');
      card_id := 'team-card:pickupJob:' || result || ':pickupAssignment:v' || coalesce(job->>'version','0');
      body := '배정 결과'
        || E'\n- 구역: ' || saip_private.team_job_area_label(job)
        || E'\n- 픽업 담당: ' || saip_private.team_account_label(job->>'pickupAssigneeId')
        || E'\n- 전달 담당: ' || saip_private.team_account_label(job->>'finalAssigneeId')
        || E'\n- 대상: ' || saip_private.team_job_target_label(job)
        || E'\n- 사유: ' || reason;
      perform saip_private.team_put_source_card(
        job->>'teamId',
        actor,
        card_id,
        'pickupJob',
        result,
        coalesce(job->>'requestId',''),
        'pickupAssignment',
        body,
        saip_private.team_texts(team,'memberIds'),
        array[coalesce(job->>'pickupAssigneeId','')]
      );

    when 'autoAssignTeamRound' then
      team_id := btrim(coalesce(args->>'teamId',''));
      round_id := btrim(coalesce(args->>'roundId',''));
      if team_id = '' or round_id = '' then raise exception 'teamId 값을 확인해 주세요.'; end if;
      team := saip_private.team_require_team(team_id, actor);
      perform saip_private.team_require_admin(team, actor);
      perform saip_private.team_require_round(team_id, round_id);
      for entry in
        select id, data
        from public.saip_records
        where collection = 'teamJobs'
          and data->>'teamId' = team_id
          and data->>'roundId' = round_id
        order by updated_at asc, id asc
      loop
        job := saip_private.team_get_locked('teamJobs', entry.id);
        if coalesce(job->>'status', 'queued') <> 'queued'
           or btrim(coalesce(job->>'pickupAssigneeId','')) <> '' then
          continue;
        end if;
        if saip_private.team_job_started(job) then
          reason := '이미 픽업을 시작했거나 현장 지급이 있어 자동 재배정할 수 없어요.';
          job := job || jsonb_build_object(
            'autoAssignReason', reason,
            'updatedAt', clock_timestamp(),
            'version', saip_private.n(job,'version') + 1
          );
          perform saip_private.team_put('teamJobs', entry.id, job, saip_private.team_texts(job,'readers'));
          card_id := 'team-card:pickupJob:' || entry.id || ':pickupPending:v' || coalesce(job->>'version','0');
          body := '남은 업무'
            || E'\n- 구역: ' || saip_private.team_job_area_label(job)
            || E'\n- 대상: ' || saip_private.team_job_target_label(job)
            || E'\n- 사유: ' || reason;
          perform saip_private.team_put_source_card(
            team_id,
            actor,
            card_id,
            'pickupJob',
            entry.id,
            coalesce(job->>'requestId',''),
            'pickupPending',
            body,
            saip_private.team_texts(team,'memberIds'),
            saip_private.team_texts(team,'adminIds')
          );
          continue;
        end if;

        members := array[]::text[];
        for row_data in
          select data
          from public.saip_records
          where collection = 'teamAreas'
            and data->>'teamId' = team_id
          order by updated_at asc, id asc
        loop
          if saip_private.team_area_matches_job(row_data, job) then
            members := array_append(members, coalesce(row_data->>'id',''));
            previous := row_data;
          end if;
        end loop;

        if coalesce(array_length(members, 1), 0) <> 1 then
          reason := case
            when coalesce(array_length(members, 1), 0) = 0 then '도매처 위치와 정확히 맞는 구역이 없어 자동 배정하지 않았어요.'
            else '도매처 위치와 맞는 구역이 여러 개라 수동 확인이 필요해요.'
          end;
          job := job || jsonb_build_object(
            'autoAssignReason', reason,
            'updatedAt', clock_timestamp(),
            'version', saip_private.n(job,'version') + 1
          );
          perform saip_private.team_put('teamJobs', entry.id, job, saip_private.team_texts(job,'readers'));
          card_id := 'team-card:pickupJob:' || entry.id || ':pickupPending:v' || coalesce(job->>'version','0');
          body := '남은 업무'
            || E'\n- 구역: ' || saip_private.team_job_area_label(job)
            || E'\n- 대상: ' || saip_private.team_job_target_label(job)
            || E'\n- 사유: ' || reason;
          perform saip_private.team_put_source_card(
            team_id,
            actor,
            card_id,
            'pickupJob',
            entry.id,
            coalesce(job->>'requestId',''),
            'pickupPending',
            body,
            saip_private.team_texts(team,'memberIds'),
            saip_private.team_texts(team,'adminIds')
          );
          continue;
        end if;

        area_id := members[1];
        peer_id := btrim(coalesce(previous->>'primaryMemberId',''));
        pickup_assignee_id := '';
        reason := '';
        if saip_private.team_member_available_for_area(previous, peer_id, true) then
          pickup_assignee_id := peer_id;
          reason := coalesce(previous->>'name','') || ' 주담당 자동 배정';
        elsif saip_private.team_member_available_for_area(previous, btrim(coalesce(previous->>'backupMemberId','')), false) then
          pickup_assignee_id := btrim(coalesce(previous->>'backupMemberId',''));
          reason := coalesce(previous->>'name','') || ' 대체 담당 자동 배정';
        end if;

        if pickup_assignee_id = '' then
          reason := '근무 중이면서 마감 전이고 작업량 여유가 있는 담당자가 없어 자동 배정하지 않았어요.';
          job := job || jsonb_build_object(
            'areaId', area_id,
            'autoAssignReason', reason,
            'updatedAt', clock_timestamp(),
            'version', saip_private.n(job,'version') + 1
          );
          perform saip_private.team_put('teamJobs', entry.id, job, saip_private.team_texts(job,'readers'));
          card_id := 'team-card:pickupJob:' || entry.id || ':pickupPending:v' || coalesce(job->>'version','0');
          body := '남은 업무'
            || E'\n- 구역: ' || saip_private.team_job_area_label(job)
            || E'\n- 대상: ' || saip_private.team_job_target_label(job)
            || E'\n- 사유: ' || reason;
          perform saip_private.team_put_source_card(
            team_id,
            actor,
            card_id,
            'pickupJob',
            entry.id,
            coalesce(job->>'requestId',''),
            'pickupPending',
            body,
            saip_private.team_texts(team,'memberIds'),
            saip_private.team_texts(team,'adminIds')
          );
          continue;
        end if;

        final_assignee_id := coalesce(nullif(job->>'requestUncleId',''), pickup_assignee_id);
        job := job || jsonb_build_object(
          'areaId', area_id,
          'pickupAssigneeId', pickup_assignee_id,
          'finalAssigneeId', final_assignee_id,
          'assignmentReason', reason,
          'autoAssignReason', '',
          'status', 'assigned',
          'updatedAt', clock_timestamp(),
          'version', saip_private.n(job,'version') + 1
        );
        perform saip_private.team_put('teamJobs', entry.id, job, saip_private.team_texts(job,'readers'));
        card_id := 'team-card:pickupJob:' || entry.id || ':pickupAssignment:v' || coalesce(job->>'version','0');
        body := '배정 결과'
          || E'\n- 구역: ' || saip_private.team_job_area_label(job)
          || E'\n- 픽업 담당: ' || saip_private.team_account_label(job->>'pickupAssigneeId')
          || E'\n- 전달 담당: ' || saip_private.team_account_label(job->>'finalAssigneeId')
          || E'\n- 대상: ' || saip_private.team_job_target_label(job)
          || E'\n- 사유: ' || reason;
        perform saip_private.team_put_source_card(
          team_id,
          actor,
          card_id,
          'pickupJob',
          entry.id,
          coalesce(job->>'requestId',''),
          'pickupAssignment',
          body,
          saip_private.team_texts(team,'memberIds'),
          array[pickup_assignee_id]
        );
      end loop;
      result := round_id;

    when 'updatePickupScope' then
      result := btrim(coalesce(args->>'id', ''));
      if result = '' then raise exception 'id 값을 확인해 주세요.'; end if;
      job := saip_private.team_get_locked('teamJobs', result);
      perform saip_private.version(job, nullif(args->>'version', '')::integer);
      perform saip_private.team_require_team(job->>'teamId', actor);
      if coalesce(args->>'expectedPackageCount', '') !~ '^[0-9]+$' then
        raise exception 'expectedPackageCount 값을 확인해 주세요.';
      end if;
      expected_package_count := (args->>'expectedPackageCount')::integer;
      if expected_package_count > 0 and expected_package_count < (
        select count(*) from public.saip_records where collection = 'teamPackages' and data->>'jobId' = result
      ) then
        raise exception '이미 기록한 포장 수보다 적게 확정할 수 없어요. 기존 포장 기록을 먼저 확인해 주세요.';
      end if;
      if coalesce((args->>'scopeConfirmed')::boolean, false) and expected_package_count <= 0 then
        raise exception '포장 식별 수를 입력한 뒤 범위를 확정해 주세요.';
      end if;
      perform saip_private.team_put('teamJobs', result, job || jsonb_build_object(
        'scopeConfirmed', coalesce((args->>'scopeConfirmed')::boolean, false),
        'expectedPackageCount', expected_package_count,
        'hasBackorder', coalesce((args->>'hasBackorder')::boolean, false),
        'scopeNote', coalesce(args->>'note', ''),
        'updatedAt', clock_timestamp(), 'version', saip_private.n(job, 'version') + 1
      ), saip_private.team_texts(job, 'readers'));
      perform saip_private.team_recompute_job_status(result);

    when 'recordPackageCustody' then
      job_id := btrim(coalesce(args->>'jobId',''));
      if job_id = '' then raise exception 'jobId 값을 확인해 주세요.'; end if;
      job := saip_private.team_get_locked('teamJobs', job_id);
      team := saip_private.team_require_team(job->>'teamId', actor);
      pickup_assignee_id := coalesce(job->>'pickupAssigneeId', '');
      if pickup_assignee_id = '' or pickup_assignee_id <> actor::text then
        raise exception '실제로 배정된 픽업 담당 삼촌만 현장 포장을 기록할 수 있어요.';
      end if;
      package_id := nullif(btrim(coalesce(args->>'id','')), '');
      if package_id is null then package_id := 'team-package:' || replace(gen_random_uuid()::text, '-', ''); end if;
      select data into previous from public.saip_records where collection = 'teamPackages' and id = package_id for update;
      if previous is not null then
        perform saip_private.version(previous, nullif(args->>'version','')::integer);
        if previous->>'jobId' is distinct from job_id then
          raise exception '이미 다른 업무에 묶인 포장 기록은 옮길 수 없어요. 새 포장으로 따로 기록해 주세요.';
        end if;
        if coalesce(previous->>'currentHolderId','') <> actor::text then
          raise exception '현재 보관 중인 삼촌만 포장 상태를 바로 바꿀 수 있어요. 인계는 별도 확인이 필요해요.';
        end if;
        if previous->>'status' in ('archived', 'delivered', 'received') then
          raise exception '이미 전달이 끝난 포장 상태는 초기화하거나 다른 업무로 옮길 수 없어요.';
        end if;
        if exists(select 1 from public.saip_records where collection = 'teamHandoffs'
          and id = previous->>'activeHandoffId' and data->>'status' in ('pending', 'partial')) then
          raise exception '인계 확인 중인 포장은 수정할 수 없어요. 인계 확인을 먼저 끝내 주세요.';
        end if;
      end if;
      label := btrim(coalesce(args->>'packageLabel',''));
      if label = '' then raise exception 'packageLabel 값을 확인해 주세요.'; end if;
      if coalesce((args->>'quantity')::integer, 0) < 1 then
        raise exception 'quantity 값을 확인해 주세요.';
      end if;
      final_assignee_id := coalesce(nullif(args->>'finalAssigneeId',''), job->>'finalAssigneeId', '');
      if final_assignee_id <> '' then perform saip_private.team_require_member(team, final_assignee_id); end if;
      perform saip_private.team_put('teamPackages', package_id, coalesce(previous,'{}'::jsonb) || jsonb_build_object(
        'teamId', job->>'teamId',
        'jobId', job_id,
        'requestId', job->>'requestId',
        'packageLabel', label,
        'quantity', coalesce((args->>'quantity')::integer, 0),
        'unit', coalesce(nullif(args->>'unit',''), '묶음'),
        'currentHolderId', actor::text,
        'pickupAssigneeId', pickup_assignee_id,
        'finalAssigneeId', final_assignee_id,
        'retailerId', coalesce(job->>'retailerId',''),
        'retailerName', coalesce(job->>'retailerName',''),
        'wholesalerName', coalesce(job->>'wholesalerName',''),
        'activeHandoffId', '',
        'status', case when final_assignee_id = actor::text then 'delivery_ready' else 'picked' end,
        'note', coalesce(args->>'note',''),
        'createdAt', coalesce(previous->>'createdAt', clock_timestamp()::text),
        'updatedAt', clock_timestamp(),
        'version', coalesce(saip_private.n(previous,'version'), 0) + 1
      ), saip_private.team_texts(team,'memberIds'));
      perform saip_private.team_recompute_job_status(job_id);
      result := package_id;

    when 'requestPackageHandoff' then
      team_id := btrim(coalesce(args->>'teamId',''));
      peer_id := btrim(coalesce(args->>'toId',''));
      if team_id = '' or peer_id = '' then raise exception 'teamId 값을 확인해 주세요.'; end if;
      team := saip_private.team_require_team(team_id, actor);
      perform saip_private.team_require_member(team, peer_id);
      package_ids := saip_private.team_unique(saip_private.team_texts(args,'packageIds'));
      if array_length(package_ids,1) is null then raise exception '인계할 포장을 한 개 이상 선택해 주세요.'; end if;
      label := '';
      foreach package_id in array package_ids loop
        package_row := saip_private.team_get_locked('teamPackages', package_id);
        if coalesce(package_row->>'teamId','') <> team_id or coalesce(package_row->>'currentHolderId','') <> actor::text then
          raise exception '현재 내가 보관 중인 포장만 인계 요청할 수 있어요.';
        end if;
        if coalesce(package_row->>'status','') in ('delivered','received') then
          raise exception '이미 전달한 포장은 다시 인계 요청할 수 없어요.';
        end if;
        label := case when label = '' then coalesce(package_row->>'wholesalerName','') else label end;
        if label <> coalesce(package_row->>'wholesalerName','') then
          raise exception '같은 도매처에서 실제 받은 포장만 한 번에 인계 요청할 수 있어요.';
        end if;
        if coalesce(package_row->>'activeHandoffId','') <> '' then
          handoff := (select data from public.saip_records where collection='teamHandoffs' and id = package_row->>'activeHandoffId');
          if handoff is not null and coalesce(handoff->>'status','') in ('pending','partial') then
            raise exception '이미 확인 대기 중인 인계 요청이 있어요. 오래된 카드인지 먼저 확인해 주세요.';
          end if;
        end if;
      end loop;
      result := nullif(btrim(coalesce(args->>'id','')), '');
      if result is null then result := 'team-handoff:' || replace(gen_random_uuid()::text, '-', ''); end if;
      if exists(select 1 from public.saip_records where collection = 'teamHandoffs' and id = result) then
        raise exception '이미 사용 중인 인계 식별자예요. 기존 인계 기록을 확인해 주세요.';
      end if;
      handoff := jsonb_build_object(
        'teamId', team_id,
        'fromId', actor::text,
        'toId', peer_id,
        'wholesalerName', label,
        'packageIds', to_jsonb(package_ids),
        'pendingPackageIds', to_jsonb(package_ids),
        'acceptedPackageIds', '[]'::jsonb,
        'status', 'pending',
        'note', coalesce(args->>'note',''),
        'createdAt', clock_timestamp(),
        'updatedAt', clock_timestamp(),
        'version', 0
      );
      perform saip_private.team_put('teamHandoffs', result, handoff, saip_private.team_texts(team,'memberIds'));
      foreach package_id in array package_ids loop
        package_row := saip_private.team_get_locked('teamPackages', package_id);
        perform saip_private.team_put('teamPackages', package_id, package_row || jsonb_build_object(
          'activeHandoffId', result,
          'status', 'handoff_requested',
          'updatedAt', clock_timestamp(),
          'version', saip_private.n(package_row,'version') + 1
        ), saip_private.team_texts(package_row,'readers'));
        perform saip_private.team_recompute_job_status(package_row->>'jobId');
      end loop;
      card_id := 'team-card:handoff:' || result || ':handoffRequest:v0';
      body := '인계 요청'
        || E'\n- 도매처: ' || coalesce(nullif(label,''), '미확인')
        || E'\n- 발신: ' || saip_private.team_account_label(actor::text)
        || E'\n- 수신: ' || saip_private.team_account_label(peer_id)
        || E'\n- 포장: ' || saip_private.team_package_summary_list(package_ids);
      perform saip_private.team_put_source_card(
        team_id,
        actor,
        card_id,
        'handoff',
        result,
        saip_private.team_single_request_id_for_packages(package_ids),
        'handoffRequest',
        body,
        saip_private.team_texts(team,'memberIds'),
        array[peer_id]
      );

    when 'confirmPackageHandoff' then
      result := btrim(coalesce(args->>'id',''));
      if result = '' then raise exception 'id 값을 확인해 주세요.'; end if;
      handoff := saip_private.team_get_locked('teamHandoffs', result);
      perform saip_private.version(handoff, nullif(args->>'version','')::integer);
      team := saip_private.team_require_team(handoff->>'teamId', actor);
      if coalesce(handoff->>'toId','') <> actor::text or coalesce(handoff->>'status','') not in ('pending','partial') then
        raise exception '받는 팀원만 실제 인계 수령을 확인할 수 있어요.';
      end if;
      confirmed_ids := saip_private.team_unique(saip_private.team_texts(args,'packageIds'));
      if array_length(confirmed_ids,1) is null then raise exception '실제로 받은 포장을 한 개 이상 선택해 주세요.'; end if;
      package_ids := saip_private.team_texts(handoff,'packageIds');
      foreach package_id in array confirmed_ids loop
        if not package_id = any(package_ids) then
          raise exception '해당 인계 요청의 포장만 확인할 수 있어요.';
        end if;
      end loop;
      accepted_ids := saip_private.team_unique(array_cat(saip_private.team_texts(handoff,'acceptedPackageIds'), confirmed_ids));
      pending_ids := saip_private.team_texts(handoff,'pendingPackageIds');
      foreach package_id in array confirmed_ids loop
        version_text := nullif(coalesce(args->'versions'->>package_id, ''), '');
        if version_text is null or version_text !~ '^[0-9]+$' then
          raise exception '선택한 포장의 버전 정보를 다시 확인해 주세요. 최신 화면에서 다시 시도해 주세요.';
        end if;
        package_version := version_text::integer;
        pending_ids := array_remove(pending_ids, package_id);
        package_row := saip_private.team_get_locked('teamPackages', package_id);
        perform saip_private.version(package_row, package_version);
        if coalesce(package_row->>'teamId','') <> coalesce(team->>'id','') then
          raise exception '같은 팀의 포장만 확인할 수 있어요.';
        end if;
        if coalesce(package_row->>'activeHandoffId','') <> result
           or coalesce(package_row->>'currentHolderId','') <> coalesce(handoff->>'fromId','') then
          raise exception '이미 다른 인계로 바뀌었어요. 최신 인계 상태를 다시 확인해 주세요.';
        end if;
        perform saip_private.team_put('teamPackages', package_id, package_row || jsonb_build_object(
          'currentHolderId', actor::text,
          'activeHandoffId', '',
          'status', case when coalesce(package_row->>'finalAssigneeId','') = actor::text then 'delivery_ready' else 'held' end,
          'updatedAt', clock_timestamp(),
          'version', saip_private.n(package_row,'version') + 1
        ), saip_private.team_texts(package_row,'readers'));
        perform saip_private.team_recompute_job_status(package_row->>'jobId');
      end loop;
      handoff := handoff || jsonb_build_object(
        'status', case when array_length(pending_ids,1) is null then 'confirmed' else 'partial' end,
        'acceptedPackageIds', to_jsonb(saip_private.team_unique(accepted_ids)),
        'pendingPackageIds', to_jsonb(coalesce(pending_ids, array[]::text[])),
        'confirmedBy', actor::text,
        'confirmedAt', clock_timestamp(),
        'updatedAt', clock_timestamp(),
        'version', saip_private.n(handoff,'version') + 1,
        'note', coalesce(nullif(args->>'note',''), handoff->>'note', '')
      );
      perform saip_private.team_put('teamHandoffs', result, handoff, saip_private.team_texts(team,'memberIds'));
      reason := case when array_length(pending_ids,1) is null then 'handoffConfirmed' else 'handoffPartial' end;
      card_id := 'team-card:handoff:' || result || ':' || reason || ':v' || coalesce(handoff->>'version','0');
      body := case when reason = 'handoffPartial' then '인계 일부 수령' else '인계 수령 완료' end
        || E'\n- 도매처: ' || coalesce(nullif(handoff->>'wholesalerName',''), '미확인')
        || E'\n- 발신: ' || saip_private.team_account_label(handoff->>'fromId')
        || E'\n- 수신: ' || saip_private.team_account_label(handoff->>'toId')
        || E'\n- 받은 포장: ' || saip_private.team_package_summary_list(accepted_ids)
        || E'\n- 남은 포장: ' || saip_private.team_package_summary_list(pending_ids);
      perform saip_private.team_put_source_card(
        handoff->>'teamId',
        actor,
        card_id,
        'handoff',
        result,
        saip_private.team_single_request_id_for_packages(saip_private.team_texts(handoff,'packageIds')),
        reason,
        body,
        saip_private.team_texts(team,'memberIds'),
        case when reason = 'handoffPartial' then array[coalesce(handoff->>'fromId','')] else array[]::text[] end
      );

    when 'recordPackageDelivery' then
      package_ids := saip_private.team_unique(saip_private.team_texts(args,'packageIds'));
      if array_length(package_ids,1) is null then raise exception '전달한 포장을 한 개 이상 선택해 주세요.'; end if;
      foreach package_id in array package_ids loop
        version_text := nullif(coalesce(args->'versions'->>package_id, ''), '');
        if version_text is null or version_text !~ '^[0-9]+$' then
          raise exception '선택한 포장의 버전 정보를 다시 확인해 주세요. 최신 화면에서 다시 시도해 주세요.';
        end if;
        package_version := version_text::integer;
        package_row := saip_private.team_get_locked('teamPackages', package_id);
        perform saip_private.version(package_row, package_version);
        team := saip_private.team_require_team(package_row->>'teamId', actor);
        perform saip_private.team_require_member(team, actor::text);
        if coalesce(package_row->>'currentHolderId','') <> actor::text or coalesce(package_row->>'finalAssigneeId','') <> actor::text then
          raise exception '실제로 보관하고 고객에게 전달할 권한이 있는 포장만 처리할 수 있어요.';
        end if;
        if coalesce(package_row->>'status','') not in ('delivery_ready','held','picked') then
          raise exception '아직 전달 준비가 되지 않은 포장이 있어요.';
        end if;
        package_row := package_row || jsonb_build_object(
          'status', 'delivered',
          'deliveredAt', clock_timestamp(),
          'deliveredBy', actor::text,
          'recipientLabel', coalesce(nullif(args->>'recipientLabel',''), package_row->>'retailerName', ''),
          'deliveryNote', coalesce(args->>'note',''),
          'updatedAt', clock_timestamp(),
          'version', saip_private.n(package_row,'version') + 1
        );
        perform saip_private.team_put('teamPackages', package_id, package_row, saip_private.team_texts(package_row,'readers'));
        perform saip_private.team_recompute_job_status(package_row->>'jobId');
        card_id := 'team-card:package:' || package_id || ':packageDelivered:v' || coalesce(package_row->>'version','0');
        body := '고객 전달 처리'
          || E'\n- 전달 담당: ' || saip_private.team_account_label(actor::text)
          || E'\n- 대상: ' || coalesce(nullif(package_row->>'recipientLabel',''), package_row->>'retailerName', '고객 미확인')
          || E'\n- 포장: ' || saip_private.team_package_summary(package_row)
          || E'\n- 도매처: ' || coalesce(nullif(package_row->>'wholesalerName',''), '미확인');
        perform saip_private.team_put_source_card(
          package_row->>'teamId',
          actor,
          card_id,
          'package',
          package_id,
          coalesce(package_row->>'requestId',''),
          'packageDelivered',
          body,
          saip_private.team_texts(team,'memberIds'),
          array[]::text[]
        );
      end loop;
      result := package_ids[1];

    when 'recordPackageReceipt' then
      package_ids := saip_private.team_unique(saip_private.team_texts(args,'packageIds'));
      if array_length(package_ids,1) is null then raise exception '수령 확인한 포장을 한 개 이상 선택해 주세요.'; end if;
      retailer_account := saip_private.team_require_account(actor);
      if coalesce(retailer_account->>'role','') <> 'retailer' or not coalesce((retailer_account->>'complete')::boolean, false) then
        raise exception '소매업자 본인만 실제 수령 확인을 남길 수 있어요.';
      end if;
      team_id := null;
      foreach package_id in array package_ids loop
        version_text := nullif(coalesce(args->'versions'->>package_id, ''), '');
        if version_text is null or version_text !~ '^[0-9]+$' then
          raise exception '선택한 포장의 버전 정보를 다시 확인해 주세요. 최신 화면에서 다시 시도해 주세요.';
        end if;
        package_version := version_text::integer;
        package_row := saip_private.team_get_locked('teamPackages', package_id);
        perform saip_private.version(package_row, package_version);
        team_id := coalesce(team_id, package_row->>'teamId');
        if package_row->>'teamId' <> team_id then
          raise exception '같은 팀에서 전달한 포장만 한 번에 수령 확인할 수 있어요.';
        end if;
        if coalesce(package_row->>'retailerId','') <> actor::text or coalesce(package_row->>'status','') <> 'delivered' then
          raise exception '내가 전달받은 포장만 실제 수령 확인할 수 있어요.';
        end if;
        perform saip_private.team_put('teamPackages', package_id, package_row || jsonb_build_object(
          'status', 'received',
          'receivedAt', clock_timestamp(),
          'receivedBy', actor::text,
          'receiptNote', coalesce(args->>'note',''),
          'updatedAt', clock_timestamp(),
          'version', saip_private.n(package_row,'version') + 1
        ), saip_private.team_texts(package_row,'readers'));
        perform saip_private.team_recompute_job_status(package_row->>'jobId');
      end loop;
      team := saip_private.team_get_locked('teams', team_id);
      result := nullif(btrim(coalesce(args->>'id','')), '');
      if result is null then result := 'team-receipt:' || replace(gen_random_uuid()::text, '-', ''); end if;
      perform saip_private.team_put('teamReceipts', result, jsonb_build_object(
        'teamId', team_id,
        'packageIds', to_jsonb(package_ids),
        'confirmedBy', actor::text,
        'note', coalesce(args->>'note',''),
        'createdAt', clock_timestamp(),
        'updatedAt', clock_timestamp(),
        'version', 0
      ), saip_private.team_unique(array_cat(saip_private.team_texts(team,'memberIds'), array[actor::text])));

    when 'recoverPackageCustody' then
      package_id := btrim(coalesce(args->>'packageId',''));
      if package_id = '' then raise exception 'packageId 값을 확인해 주세요.'; end if;
      package_row := saip_private.team_get_locked('teamPackages', package_id);
      perform saip_private.version(package_row, nullif(args->>'version','')::integer);
      team := saip_private.team_require_team(package_row->>'teamId', actor);
      perform saip_private.team_require_admin(team, actor);
      if not coalesce((package_row->>'requiresReconciliation')::boolean, false)
         or coalesce(package_row->>'reconciliationReason','') <> 'account_deleted' then
        raise exception '탈퇴 계정 인수 정리가 필요한 포장만 예외 인계로 회수할 수 있어요.';
      end if;
      if coalesce(package_row->>'status','') in ('delivered','received') then
        raise exception '고객 전달이나 수령 확인이 끝난 포장은 예외 인계로 회수할 수 없어요.';
      end if;
      previous_holder := coalesce(package_row->>'currentHolderId', '');
      if previous_holder = '' then
        raise exception '이전 보관자 정보를 다시 확인해 주세요.';
      end if;
      if nullif(args->>'previousHolderId','') is not null
         and nullif(args->>'previousHolderId','') <> previous_holder then
        raise exception '최신 보관자 정보가 달라졌어요. 최신 화면에서 다시 시도해 주세요.';
      end if;
      select data into row_data from public.saip_records where collection='accounts' and id=previous_holder;
      if row_data is not null
         and coalesce((row_data->>'complete')::boolean, false)
         and not coalesce((row_data->>'deletionPending')::boolean, false) then
        raise exception '비활성화되었거나 탈퇴한 이전 보관자에게서만 예외 인계를 회수할 수 있어요.';
      end if;
      next_holder := btrim(coalesce(args->>'nextHolderId',''));
      perform saip_private.team_require_member(team, next_holder);
      row_data := saip_private.team_require_account(next_holder::uuid);
      if not coalesce((row_data->>'complete')::boolean, false)
         or coalesce((row_data->>'deletionPending')::boolean, false) then
        raise exception '활동 중인 팀원에게만 회수 포장을 다시 맡길 수 있어요.';
      end if;
      note := btrim(coalesce(args->>'note',''));
      if note = '' then raise exception 'note 값을 확인해 주세요.'; end if;
      next_status := case when coalesce(package_row->>'finalAssigneeId','') = next_holder then 'delivery_ready' else 'held' end;
      perform saip_private.team_put('teamPackages', package_id, package_row || jsonb_build_object(
        'currentHolderId', next_holder,
        'activeHandoffId', '',
        'status', next_status,
        'requiresReconciliation', false,
        'reconciliationResolvedAt', clock_timestamp(),
        'reconciliationResolvedBy', actor::text,
        'recoveredAt', clock_timestamp(),
        'recoveredBy', actor::text,
        'recoveredFromId', previous_holder,
        'recoveryNote', note,
        'updatedAt', clock_timestamp(),
        'version', saip_private.n(package_row,'version') + 1
      ), saip_private.team_texts(package_row,'readers'));
      perform saip_private.team_recompute_job_status(package_row->>'jobId');
      result := package_id;

    else
      raise exception '지원하지 않는 팀 명령이에요: %', normalized;
  end case;

  return result;
end $$;

revoke all on function
  saip_private.team_texts(jsonb,text),
  saip_private.team_unique(text[]),
  saip_private.team_uuid_array(text[]),
  saip_private.team_slug(text),
  saip_private.team_put(text,text,jsonb,text[]),
  saip_private.team_require_account(uuid),
  saip_private.team_require_uncle(uuid),
  saip_private.team_active_team_id(uuid),
  saip_private.team_get_locked(text,text),
  saip_private.team_require_team(text,uuid),
  saip_private.team_require_member(jsonb,text),
  saip_private.team_require_admin(jsonb,uuid),
  saip_private.team_require_round(text,text),
  saip_private.team_require_area(text,text),
  saip_private.team_colleague_id(uuid,uuid),
  saip_private.team_accepted_colleague(uuid,uuid),
  saip_private.team_sync_readers(text),
  saip_private.team_block_if_pending(text,uuid),
  saip_private.team_require_accepted_request(text),
  saip_private.team_pickup_seed(jsonb,jsonb,jsonb),
  saip_private.team_recompute_job_status(text),
  saip_private.team_command(text,jsonb,uuid)
from public, anon, authenticated;
