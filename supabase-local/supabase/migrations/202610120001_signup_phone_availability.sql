-- 가입 연락처 조회 RPC를 거래처 디렉터리 배포와 분리해 복구한다.
-- 기존 계정 데이터와 업무 명령은 변경하지 않는다.
-- 후속 202610130001의 동일 함수 정의와 호환된다.

create or replace function saip_private.normalize_korean_phone(value text)
returns text
language sql
immutable
set search_path = '' as $$
  with digits as (
    select regexp_replace(btrim(coalesce(value,'')), '[^0-9]+', '', 'g') as raw
  )
  select case
    when raw = '' then ''
    when raw like '82%' then '0' || substr(raw, 3)
    else raw
  end
  from digits;
$$;
revoke all on function saip_private.normalize_korean_phone(text) from public, anon, authenticated;

create or replace function public.saip_check_phone_available(phone text)
returns boolean
language plpgsql
security definer
set search_path = '' as $$
declare
  actor uuid := auth.uid();
  normalized_phone text;
begin
  if actor is null then
    raise exception '로그인이 필요해요.';
  end if;

  if btrim(coalesce(phone, '')) = '' then
    return true;
  end if;
  if not saip_private.valid_korean_phone(phone) then
    raise exception '연락처를 010-1234-5678 형식으로 입력해 주세요.';
  end if;

  normalized_phone := saip_private.normalize_korean_phone(phone);

  return not exists(
    select 1
    from public.saip_records account_row
    where account_row.collection = 'accounts'
      and account_row.id <> actor::text
      and account_row.data->>'complete' = 'true'
      and saip_private.normalize_korean_phone(account_row.data->>'phone') = normalized_phone
  );
end;
$$;
revoke all on function public.saip_check_phone_available(text) from public, anon;
grant execute on function public.saip_check_phone_available(text) to authenticated;

notify pgrst, 'reload schema';
