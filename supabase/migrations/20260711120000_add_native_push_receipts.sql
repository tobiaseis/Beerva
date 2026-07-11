alter table public.native_push_delivery_attempts
  add column if not exists receipt_status text not null default 'not_requested',
  add column if not exists receipt_checked_at timestamp with time zone null,
  add column if not exists receipt_error_code text null,
  add column if not exists receipt_error_message text null;

update public.native_push_delivery_attempts
set receipt_status = 'pending'
where expo_ticket_id is not null
  and receipt_status = 'not_requested';

alter table public.native_push_delivery_attempts
  drop constraint if exists native_push_delivery_attempts_receipt_status_check;

alter table public.native_push_delivery_attempts
  add constraint native_push_delivery_attempts_receipt_status_check
  check (receipt_status in ('not_requested', 'pending', 'ok', 'error', 'missing'));

create index if not exists native_push_delivery_attempts_pending_receipt_idx
  on public.native_push_delivery_attempts(created_at)
  where receipt_status = 'pending' and expo_ticket_id is not null;

create or replace function public.invoke_native_push_receipt_checker()
returns void
language plpgsql
security definer
set search_path = public, extensions, net, vault
as $$
declare
  webhook_secret text;
  edge_function_jwt text;
  request_headers jsonb := '{"Content-Type": "application/json"}'::jsonb;
begin
  begin
    select decrypted_secret into webhook_secret
    from vault.decrypted_secrets
    where name = 'beerva_push_webhook_secret'
    limit 1;
  exception
    when invalid_schema_name or undefined_table or insufficient_privilege then
      webhook_secret := null;
  end;

  begin
    select decrypted_secret into edge_function_jwt
    from vault.decrypted_secrets
    where name = 'beerva_edge_function_jwt'
    limit 1;
  exception
    when invalid_schema_name or undefined_table or insufficient_privilege then
      edge_function_jwt := null;
  end;

  if nullif(btrim(coalesce(edge_function_jwt, '')), '') is not null then
    request_headers := request_headers || jsonb_build_object('Authorization', 'Bearer ' || edge_function_jwt);
  end if;
  if nullif(btrim(coalesce(webhook_secret, '')), '') is not null then
    request_headers := request_headers || jsonb_build_object('x-beerva-webhook-secret', webhook_secret);
  end if;

  perform net.http_post(
    url := 'https://yzrfihijpusvjypypnip.supabase.co/functions/v1/check-native-push-receipts',
    body := '{}'::jsonb,
    headers := request_headers,
    timeout_milliseconds := 10000
  );
end;
$$;

revoke execute on function public.invoke_native_push_receipt_checker() from public, anon, authenticated;
grant execute on function public.invoke_native_push_receipt_checker() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'beerva-check-native-push-receipts') then
    perform cron.unschedule('beerva-check-native-push-receipts');
  end if;

  perform cron.schedule(
    'beerva-check-native-push-receipts',
    '*/15 * * * *',
    $job$select public.invoke_native_push_receipt_checker();$job$
  );
end;
$$;
