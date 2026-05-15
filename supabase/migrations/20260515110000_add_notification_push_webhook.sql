create extension if not exists pg_net;
create extension if not exists supabase_vault with schema vault;

create or replace function public.enqueue_notification_push()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, net, vault
as $$
declare
  webhook_secret text;
  request_headers jsonb := '{"Content-Type": "application/json"}'::jsonb;
begin
  begin
    select decrypted_secret
    into webhook_secret
    from vault.decrypted_secrets
    where name = 'beerva_push_webhook_secret'
    limit 1;
  exception
    when invalid_schema_name or undefined_table or insufficient_privilege then
      webhook_secret := null;
  end;

  if nullif(btrim(coalesce(webhook_secret, '')), '') is not null then
    request_headers := request_headers || jsonb_build_object(
      'Authorization',
      'Bearer ' || webhook_secret
    );
  end if;

  perform net.http_post(
    url := 'https://yzrfihijpusvjypypnip.supabase.co/functions/v1/send-push',
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'notifications',
      'schema', 'public',
      'record', to_jsonb(new),
      'old_record', null
    ),
    headers := request_headers,
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

drop trigger if exists notifications_send_push_after_insert on public.notifications;
create trigger notifications_send_push_after_insert
  after insert on public.notifications
  for each row
  execute function public.enqueue_notification_push();

comment on function public.enqueue_notification_push() is 'Queues the send-push Edge Function after notifications are inserted. If WEBHOOK_SECRET is set on the Edge Function, store the same value in Vault as beerva_push_webhook_secret.';
