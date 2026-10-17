-- 수령과 입금을 분리하고, 고객 입금 → 운영 확인 → 삼촌 지급을 기록한다.
create function saip_private.order_received(r jsonb) returns boolean
language sql immutable set search_path='' as $$
  select saip_private.s(r,'status')='completed' and saip_private.n(r,'received')>0
    and saip_private.n(r,'received')=saip_private.n(r,'delivered')
    and saip_private.n(r,'received')=saip_private.n(r,'quantity')-saip_private.n(r,'cancelled')
    and saip_private.n(r,'held')=0 and saip_private.n(r,'openIssues')=0
    and not saip_private.b(r,'needsReply') and saip_private.s(r,'proposalId')=''
    and greatest(0,saip_private.n(r,'quantity')-saip_private.n(r,'cancelled')-
      saip_private.n(r,'acquired')+saip_private.n(r,'acquiredCancelled'))=0
    and greatest(0,saip_private.n(r,'acquired')-saip_private.n(r,'acquiredCancelled')-
      saip_private.n(r,'delivered')-saip_private.n(r,'held'))=0
$$;

create function saip_private.invoice_request_ids(invoice_id text, invoice jsonb) returns text[]
language sql stable set search_path='' as $$
  select coalesce(array_agg(distinct request_id order by request_id),'{}'::text[]) from (
    select data->>'requestId' request_id from public.saip_records
    where collection='supplierPaymentAllocations' and data->>'invoiceId'=invoice_id
    union
    select p.data->>'requestId' from public.saip_records p
    where p.collection='fieldPayments' and p.id=any(saip_private.billing_text_array(invoice->'fieldPaymentIds'))
      and p.data->>'retailerId'=invoice->>'retailerId'
      and not exists(select 1 from public.saip_records a where a.collection='supplierPaymentAllocations'
        and a.data->>'invoiceId'=invoice_id and a.data->>'paymentId'=p.id)
  ) linked where coalesce(request_id,'')<>''
$$;

create function saip_private.order_payment_projection(request_id text) returns jsonb
language plpgsql stable set search_path='' as $$
declare ids jsonb:='[]'; invoice record; issued boolean:=true; seen boolean:=false;
  reported boolean:=true; confirmed boolean:=true; paid boolean:=true;
begin
  for invoice in select id,data from public.saip_records where collection='invoices'
    and request_id=any(saip_private.invoice_request_ids(id,data)) loop
    seen:=true;
    issued:=issued and saip_private.s(invoice.data,'status')<>'draft' and saip_private.n(invoice.data,'missingAmountCount')=0
      and not saip_private.b(invoice.data,'requiresReconciliation');
    if saip_private.s(invoice.data,'status')<>'draft' then ids:=ids||jsonb_build_array(invoice.id); end if;
    reported:=reported and saip_private.n(invoice.data,'reportedReceiptAmount')>=saip_private.n(invoice.data,'adjustedTotalAmount');
    confirmed:=confirmed and saip_private.n(invoice.data,'confirmedReceiptAmount')>=saip_private.n(invoice.data,'adjustedTotalAmount');
    paid:=paid and saip_private.b(invoice.data,'platformPayoutComplete');
  end loop;
  if exists(select 1 from public.saip_records a where a.collection='supplierPaymentAllocations'
      and a.data->>'requestId'=request_id and saip_private.s(a.data,'invoiceId')='')
    or exists(select 1 from public.saip_records p where p.collection='fieldPayments'
      and p.data->>'requestId'=request_id and (saip_private.n(p.data,'unallocatedAmount')>0
        or (saip_private.s(p.data,'invoiceId')='' and not exists(
          select 1 from public.saip_records a where a.collection='supplierPaymentAllocations'
          and a.data->>'paymentId'=p.id and saip_private.s(a.data,'invoiceId')<>'')))) then issued:=false; end if;
  return jsonb_build_object('paymentInvoiceIds',ids,'paymentReported',seen and issued and reported,
    'paymentConfirmed',seen and issued and confirmed,'platformPayoutComplete',seen and issued and paid);
end $$;

alter function saip_private.saip_snapshot() rename to snapshot_before_order_payment;
create function saip_private.saip_snapshot() returns jsonb
language plpgsql stable set search_path='' as $$
declare result jsonb:=saip_private.snapshot_before_order_payment(); r record;
begin
  for r in select key,value from jsonb_each(coalesce(result->'requests','{}')) loop
    result:=jsonb_set(result,array['requests',r.key],r.value||saip_private.order_payment_projection(r.key));
  end loop;
  for r in select key,value from jsonb_each(coalesce(result->'invoices','{}')) loop
    result:=jsonb_set(result,array['invoices',r.key],r.value||jsonb_build_object(
      'requestIds',to_jsonb(saip_private.invoice_request_ids(r.key,r.value))));
  end loop;
  return result;
end $$;

-- 신규 가입 시 필수. 기존 완료 계정은 비어 있는 계좌를 유지할 수 있지만 일부만 저장할 수 없다.
alter function saip_private.saip_command(text,jsonb,text) rename to command_before_order_payment;
create function saip_private.saip_command(command text,args jsonb default '{}',operation_id text default '')
returns text language plpgsql set search_path='' as $$
declare actor uuid:=auth.uid(); me jsonb; bank jsonb; k text; result text; prior record;
begin
  perform pg_advisory_xact_lock(hashtextextended('saip-workflow',0));
  if command<>'saveProfile' then return saip_private.command_before_order_payment(command,args,operation_id); end if;
  -- 이전 성공을 재시도할 때 더 최근 계좌를 과거 입력으로 덮어쓰지 않는다.
  select * into prior from saip_private.operations o where o.actor=auth.uid() and o.id=operation_id;
  if found then
    if prior.payload<>jsonb_build_object('command',command,'args',args) then
      raise exception '같은 작업 번호로 다른 내용을 전송할 수 없어요.';
    end if;
    return prior.result;
  end if;
  me:=saip_private.get('accounts',actor::text);
  bank:=saip_private.pick(me||coalesce(args->'values','{}'),array['bankName','bankAccount','bankHolder']);
  foreach k in array array['bankName','bankAccount','bankHolder'] loop
    if bank ? k then
      if jsonb_typeof(bank->k)<>'string' then raise exception '계좌 정보를 확인해 주세요.'; end if;
      bank:=jsonb_set(bank,array[k],to_jsonb(btrim(bank->>k)));
    end if;
  end loop;
  if saip_private.b(args,'complete') or saip_private.b(me,'complete') then
    if not saip_private.b(me,'complete') or saip_private.s(bank,'bankName')<>''
      or saip_private.s(bank,'bankAccount')<>'' or saip_private.s(bank,'bankHolder')<>'' then
      foreach k in array array['bankName','bankAccount','bankHolder'] loop
        if saip_private.s(bank,k)='' then raise exception '% 항목을 입력해 주세요.',
          case k when 'bankName' then '은행명' when 'bankAccount' then '계좌번호' else '예금주명' end; end if;
      end loop;
      if length(bank->>'bankName')>50 or length(bank->>'bankHolder')>100
        or (bank->>'bankAccount') !~ '^[0-9 -]+$'
        or regexp_replace(bank->>'bankAccount','[^0-9]','','g') !~ '^[0-9]{8,20}$' then
        raise exception '은행명·계좌번호·예금주명을 확인해 주세요.';
      end if;
    end if;
  end if;
  result:=saip_private.command_before_order_payment(command,args,operation_id);
  update public.saip_records set data=data||bank where collection='accounts' and id=actor::text;
  return result;
end $$;

create or replace function saip_private.billing_request_accepted(request_id text) returns jsonb
language plpgsql set search_path='' as $$
declare r jsonb:=saip_private.billing_request_locked(request_id);
begin
  if saip_private.s(r,'status') not in('accepted','completed') then
    raise exception '실제로 수락되어 진행 중인 요청만 청구에 연결할 수 있어요.';
  end if;
  return r;
end $$;

alter function saip_private.billing_command(text,jsonb,uuid) rename to billing_command_before_platform_payment;
create function saip_private.billing_command(command text,args jsonb,actor uuid) returns text
language plpgsql set search_path='' as $$
declare invoice_id text:=args->>'invoiceId'; invoice jsonb; receipt jsonb; rid text; request_ids text[]; amount integer;
begin
  if command='billing.confirmReceipt' then
    receipt:=saip_private.get('invoiceReceipts',args->>'receiptId');
    if saip_private.s(receipt,'paidToId')='platform' then
      raise exception '운영 계좌 입금은 운영자만 확인할 수 있어요.';
    end if;
  end if;
  if command<>'billing.reportReceipt' then
    return saip_private.billing_command_before_platform_payment(command,args,actor);
  end if;
  perform saip_private.billing_require_role(actor,'retailer');
  select data into invoice from public.saip_records where collection='invoices' and id=invoice_id for update;
  if invoice is null or saip_private.s(invoice,'retailerId')<>actor::text then
    raise exception '이 청구서에 대한 송금 알림만 남길 수 있어요.';
  end if;
  if saip_private.s(invoice,'status')='draft' then
    raise exception '아직 발행되지 않은 청구서에는 송금 알림을 남길 수 없어요.';
  end if;
  if saip_private.b(invoice,'requiresReconciliation') or saip_private.n(invoice,'missingAmountCount')>0 then
    raise exception '청구 금액을 다시 확인 중이에요. 정리가 끝난 후 입금해 주세요.';
  end if;
  request_ids:=saip_private.invoice_request_ids(invoice_id,invoice);
  if cardinality(request_ids)=0 or exists(select 1 from unnest(request_ids) id
    where not saip_private.order_received(saip_private.get('requests',id))) then
    raise exception '청구서에 포함된 상품을 모두 수령 확인한 후 입금해 주세요.';
  end if;
  if coalesce(nullif(btrim(args->>'paidToId'),''),'platform')<>'platform' then
    raise exception '소매업자 입금은 안내된 운영 계좌로만 처리해 주세요.';
  end if;
  amount:=coalesce((args->>'amount')::integer,0);
  if amount<1 then raise exception 'amount 값을 확인해 주세요.'; end if;
  if amount>saip_private.n(invoice,'adjustedTotalAmount')-saip_private.n(invoice,'reportedReceiptAmount') then
    raise exception '이미 신고한 금액을 제외한 남은 입금액을 확인해 주세요.';
  end if;
  rid:=coalesce(nullif(btrim(args->>'id'),''),saip_private.billing_new_id('invoice-receipt'));
  if exists(select 1 from public.saip_records where collection='invoiceReceipts' and id=rid) then
    raise exception '이미 남긴 송금 알림이에요.';
  end if;
  perform saip_private.billing_put('invoiceReceipts',rid,jsonb_build_object('invoiceId',invoice_id,
    'reporterId',actor::text,'paidToId','platform','bankName','우리은행','bankAccount','1002-364-917884','bankHolder','강이수',
    'amount',amount,'note',coalesce(args->>'note',''),'status','reported','reimbursementId','',
    'readers',to_jsonb(saip_private.billing_invoice_readers(invoice,true)),
    'createdAt',clock_timestamp(),'updatedAt',clock_timestamp(),'version',0));
  perform saip_private.billing_rebuild_invoice(invoice_id);
  return rid;
end $$;

-- 서비스 전용 감사 장부. 클라이언트에는 삼촌 계좌나 은행 거래 참조를 노출하지 않는다.
create table saip_private.platform_payment_operations (
  id text primary key, payload jsonb not null, result text not null,
  recipient_account jsonb, created_at timestamptz not null default now()
);
revoke all on saip_private.platform_payment_operations from public,anon,authenticated;

create function public.saip_process_platform_payment(operation_id text,action text,record_id text,
  expected_version integer,bank_reference text,amount integer default null) returns text
language plpgsql security definer set search_path='' as $$
declare prior record; payload jsonb; invoice jsonb; receipt jsonb; invoice_id text; recipient jsonb; request_ids text[];
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception '운영자 전용 작업이에요.'; end if;
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

-- 이미 지급한 청구의 금액·배분을 사후 변경하여 장부와 은행 기록을 어긋나게 하지 않는다.
create function saip_private.guard_paid_invoice() returns trigger
language plpgsql set search_path='' as $$
begin
  if old.collection='invoices' and saip_private.b(old.data,'platformPayoutComplete') and
    (new.data->'adjustedTotalAmount' is distinct from old.data->'adjustedTotalAmount'
      or new.data->'fieldPaymentIds' is distinct from old.data->'fieldPaymentIds'
      or new.data->'allocationIds' is distinct from old.data->'allocationIds'
      or new.data->'payeeId' is distinct from old.data->'payeeId') then
    raise exception '지급 완료한 청구서는 금액이나 대상을 변경할 수 없어요. 운영자에게 문의해 주세요.';
  end if;
  return new;
end $$;
create trigger saip_guard_paid_invoice before update on public.saip_records
  for each row execute function saip_private.guard_paid_invoice();

revoke all on function public.saip_process_platform_payment(text,text,text,integer,text,integer) from public,anon,authenticated;
grant execute on function public.saip_process_platform_payment(text,text,text,integer,text,integer) to service_role;
revoke all on function saip_private.order_received(jsonb),saip_private.invoice_request_ids(text,jsonb),
  saip_private.order_payment_projection(text),saip_private.saip_snapshot(),saip_private.snapshot_before_order_payment(),
  saip_private.saip_command(text,jsonb,text),saip_private.command_before_order_payment(text,jsonb,text),
  saip_private.billing_request_accepted(text),saip_private.billing_command(text,jsonb,uuid),
  saip_private.billing_command_before_platform_payment(text,jsonb,uuid),saip_private.guard_paid_invoice()
  from public,anon,authenticated;
