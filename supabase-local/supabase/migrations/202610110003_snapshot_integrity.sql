-- Every statement in a snapshot RPC sees the same committed database version,
-- including authorization checks for partner profiles and shared attachments.
alter function public.saip_snapshot() stable;

-- IDs are client-generated for drafts, messages and attachments. Protect the
-- upsert boundary even when two different actors race to claim the same ID.
-- No supported business command transfers an existing record's participants.
create function saip_private.keep_record_participants()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.readers is distinct from new.readers then
    raise exception '다른 계정의 기록을 덮어쓸 수 없어요.';
  end if;
  return new;
end $$;
revoke all on function saip_private.keep_record_participants() from public, anon, authenticated;
create trigger saip_keep_participants before update on public.saip_records
for each row execute function saip_private.keep_record_participants();
