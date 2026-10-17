-- 팀 가입·탈퇴와 청구 발행은 기존 기록의 열람자를 바꾼다.
-- 일반 put의 ID 충돌 보호는 유지하고 검증된 업무 함수만 정확한 한 번의
-- 변경을 허용한다. JWT/GUC에 담긴 클라이언트 값으로 허용하지 않는다.
-- 개별 기능 마이그레이션을 모두 적용한 뒤 전체 업무 컬렉션을 유지한다.
alter table public.saip_records drop constraint saip_records_collection_check;
alter table public.saip_records add constraint saip_records_collection_check check (
  collection in ('accounts','signupProgress','connections','drafts','requests',
    'deliveries','receipts','events','proposals','issues','messages','notices','attachments','chatBlocks',
    'fieldPayments','supplierPaymentAllocations','supplierRefunds',
    'invoices','invoiceAdjustments','invoiceReceipts','invoiceInquiries','reimbursements',
    'colleagueConnections','teams','teamInvites','teamChats','teamRounds','teamAreas',
    'teamJobs','teamPackages','teamHandoffs','teamReceipts',
    'favoriteWholesalers','appReleases','updateDismissals')
);

create table saip_private.workflow_reader_changes (
  transaction_id bigint not null,
  collection text not null,
  id text not null,
  previous_data jsonb not null,
  next_data jsonb not null,
  previous_readers uuid[] not null,
  next_readers uuid[] not null,
  primary key (transaction_id, collection, id)
);
revoke all on saip_private.workflow_reader_changes from public, anon, authenticated;

create or replace function saip_private.keep_record_participants()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.readers is distinct from new.readers then
    delete from saip_private.workflow_reader_changes
      where transaction_id=txid_current() and collection=old.collection and id=old.id
        and new.collection=old.collection and new.id=old.id
        and previous_data=old.data and next_data=new.data
        and previous_readers=old.readers and next_readers=new.readers;
    if not found then
      raise exception '다른 계정의 기록을 덮어쓸 수 없어요.';
    end if;
  end if;
  return new;
end $$;

create function saip_private.workflow_put(c text, i text, d jsonb, reader_ids uuid[])
returns void language plpgsql set search_path = '' as $$
declare previous record; k text;
begin
  if c not in ('fieldPayments','supplierPaymentAllocations','supplierRefunds',
    'invoices','invoiceAdjustments','invoiceReceipts','invoiceInquiries','reimbursements',
    'colleagueConnections','teams','teamInvites','teamChats','teamRounds','teamAreas',
    'teamJobs','teamPackages','teamHandoffs','teamReceipts','favoriteWholesalers',
    'appReleases','updateDismissals') then
    raise exception '업무 기록의 종류를 확인해 주세요.';
  end if;
  select * into previous from public.saip_records where collection=c and id=i for update;
  if found then
    -- 열람자는 달라져도 기록의 원본 거래·팀·작성자는 교체할 수 없다.
    foreach k in array array['teamId','retailerId','uncleId','requestId','roundId',
      'payeeId','payerId','fieldPaymentId','jobId','senderId','peerId','createdBy','createdAt'] loop
      -- 회차는 팀 업무의 배정 정보다. 원본 팀은 유지하면서 같은 팀의
      -- 활성 회차로 옮기는 것은 관리자 배정 명령에서 허용한다.
      if c = 'teamJobs' and k = 'roundId' then
        if previous.data->k is distinct from d->k then
          perform saip_private.team_require_round(d->>'teamId', d->>'roundId');
        end if;
        continue;
      end if;
      if previous.data->k is distinct from d->k then
        raise exception '기존 업무 기록의 원본을 다른 기록으로 바꿀 수 없어요.';
      end if;
    end loop;
    if previous.readers is distinct from reader_ids then
      insert into saip_private.workflow_reader_changes values
        (txid_current(),c,i,previous.data,d,previous.readers,reader_ids);
    end if;
  end if;
  perform saip_private.put(c,i,d,reader_ids);
  delete from saip_private.workflow_reader_changes
    where transaction_id=txid_current() and collection=c and id=i;
end $$;

-- 호출 전 각 명령의 참가자·관리자·원본 접근 검증을 거친 전용 저장 경로.
create or replace function saip_private.billing_put(collection_name text, record_id text, data jsonb)
returns void language plpgsql set search_path = '' as $$
begin
  perform saip_private.workflow_put(collection_name,record_id,
    data||jsonb_build_object('id',record_id),saip_private.billing_readers(data));
end $$;

create or replace function saip_private.team_put(c text,i text,d jsonb,reader_ids text[])
returns void language plpgsql set search_path = '' as $$
declare normalized text[] := saip_private.team_unique(reader_ids);
begin
  perform saip_private.workflow_put(c,i,d||jsonb_build_object('id',i,'readers',to_jsonb(normalized)),
    saip_private.team_uuid_array(normalized));
end $$;

revoke all on function saip_private.workflow_put(text,text,jsonb,uuid[]),
  saip_private.keep_record_participants(),saip_private.billing_put(text,text,jsonb),
  saip_private.team_put(text,text,jsonb,text[]) from public,anon,authenticated;
